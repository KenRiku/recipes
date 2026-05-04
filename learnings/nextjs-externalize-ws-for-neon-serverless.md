# Learning — Externalize `ws` (and Neon/Prisma) in Next.js for Vercel

## Symptom

In production on Vercel (Node serverless functions), the first DB query through `@neondatabase/serverless` crashes with:

```
Uncaught Exception: TypeError: t.mask is not a function
    at e.exports.mask (/var/task/.next/server/chunks/120.js:1:28258)
    at m.frame (...)
    at m.dispatch (...)
    at m.send (...)
[…] Error: Connection terminated unexpectedly
    at async ev.performIO (.../@prisma/adapter-neon)
```

Locally everything works. The route uses `runtime = "nodejs"` (not Edge). `DATABASE_URL` is set correctly. The Prisma adapter is wired up correctly.

## Root cause

`ws` (the WebSocket library Neon's serverless driver depends on) picks between a native C++ implementation of `mask()` and a pure-JS fallback at load time:

```js
// inside ws's buffer-util.js (paraphrased)
try {
  const bufferutil = require('bufferutil');
  module.exports.mask = bufferutil.mask;
} catch {
  module.exports.mask = jsFallbackMask;
}
```

When Next.js's webpack bundles `ws` into the server chunks, it walks/transforms that conditional `require` statically. Depending on resolver config, the chosen branch can end up with `mask` *undefined* on the exports object — even though the file looks fine on disk. The first WebSocket frame the Neon driver sends triggers `mask()` and you get `t.mask is not a function`.

The same bundler hostility shows up for other native-addon-loading or runtime-detecting CJS packages — `@neondatabase/serverless` and `@prisma/client` are in the same boat (Prisma's engine binaries, Neon's runtime feature detection).

## Fix

Tell Next.js to leave these packages alone and let Node `require()` them from `node_modules` at runtime. In `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@neondatabase/serverless",
      "@prisma/adapter-neon",
      "@prisma/client",
      "ws",
    ],
  },
};
export default nextConfig;
```

(In Next.js 15+ this option is promoted to top-level `serverExternalPackages`. Same effect.)

Vercel deploys `node_modules` alongside the function bundle, so plain CommonJS resolution works at runtime and the conditional `require('bufferutil')` resolves correctly.

## Gotchas

- **Looks like a transport/network bug, isn't.** "Connection terminated unexpectedly" and `t.mask is not a function` read like flaky networking or a Neon outage. They aren't — the WebSocket never actually got off the ground because the masking function was undefined inside Vercel's bundled output.
- **`runtime = "nodejs"` is necessary but not sufficient.** Setting it stops the route from running on Edge, but the *bundler* still mangles `ws` regardless of target runtime. The external-packages config is what fixes the bundling step itself.
- **Always works locally.** `next dev` doesn't apply the same minification/transformation pipeline as production builds, so the conditional require resolves correctly in dev. Don't trust local success.
- **Add Prisma packages to the list too**, not just `ws`. Prisma's client loads engine binaries that webpack will happily try to inline — same bundle-mangling failure mode, different surface error.
- **Don't use `serverExternalPackages` and `experimental.serverComponentsExternalPackages` together.** Pick the one matching your Next.js major. On Next 14.x use `experimental.serverComponentsExternalPackages`.
- **HTTP fallback exists if you hit a wall.** `@prisma/adapter-neon` also exports `PrismaNeonHTTP` which uses `fetch` instead of WebSockets — no `ws` dependency, no bundling problem. Trade-off: HTTP mode doesn't support multi-statement transactions across queries. Fine for most CRUD; not fine if you need long-lived sessions or interactive transactions.

## Reference

- Next.js docs: `serverComponentsExternalPackages` — https://nextjs.org/docs/app/api-reference/next-config-js/serverComponentsExternalPackages
- Neon + Prisma + Vercel guide: https://www.prisma.io/docs/orm/overview/databases/neon
- `ws` package's `bufferutil` optional-dep behavior: https://github.com/websockets/ws#opt-in-for-performance
