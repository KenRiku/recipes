# Learning — `@prisma/adapter-neon` (6.x) Takes a Config, Not a Pool

## Symptom

Production (Vercel serverless) crashes on every DB query with:

```
Error: No database host or connection string was set, and key parameters
have default values (host: localhost, user: undefined, db: undefined,
password: null). Is an environment variable missing?
```

The stack runs through `PrismaNeon` → `pg.Pool.query` → `Client.connect`. `DATABASE_URL` *is* set in Vercel, the value is a valid `postgresql://...` string, and a runtime log confirms `process.env.DATABASE_URL` is present at module load. Locally, everything works.

## Root cause

`@prisma/adapter-neon` changed its constructor signature in the 6.x line. The old pattern was to build a `Pool` yourself and hand it to the adapter:

```ts
// OLD — works on adapter-neon 5.x and very early 6.x
const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);
```

In 6.x (verified on 6.19.3) the signature is:

```ts
constructor(config: neon.PoolConfig, options?: PrismaNeonOptions);
```

It now takes a **`PoolConfig`** — i.e. the options object you'd normally pass *into* `new Pool(...)`. The adapter constructs its own internal Pool from that config.

When you pass a `Pool` instance into the `PoolConfig` slot, TypeScript doesn't catch it (the call site often has `as any` to dodge an unrelated `PrismaClient({ adapter })` type complaint, and a `Pool` is a plain object with enumerable properties so it's structurally close enough to slip through). At runtime the adapter walks the "config" looking for `connectionString`, `host`, `user`, etc. — none of which are own-enumerables on a `Pool` — so the internal Pool gets built with no connection info and falls back to libpq defaults: `localhost`, undefined user, no password. Hence the misleading error.

The mismatch only blows up in production because the local dev path may be using cached connections, the Prisma CLI's own engine, or just hitting it less often during development.

## Fix

Pass the config object directly. Don't create a Pool yourself.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

if (typeof window === "undefined") {
  neonConfig.webSocketConstructor = ws as any;
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter } as any);
```

That's it. The adapter manages its own pool internally.

## Gotchas

- **The error message is a red herring.** It points at "missing env var" but `DATABASE_URL` is actually set. Don't waste time auditing Vercel env scopes before you've ruled out the adapter API.
- **TypeScript won't catch it.** `as any` on the `PrismaClient({ adapter })` line is common (Prisma's types lag behind the driver-adapters API). The cast hides the upstream `PrismaNeon(pool)` mismatch too.
- **Silent fallback to localhost is a libpq behavior**, not Prisma's — it inherits from `pg`. Any time you see `host: localhost, password: null` in production, suspect "the connection string never reached the Pool," not "DATABASE_URL is unset."
- **Diagnostic that actually narrows it down**: log `len=N scheme=postgresql` for `process.env.DATABASE_URL` at module init. If that prints but you still get the localhost error, the env var is fine — look at the adapter wiring.
- **Don't use a build-time stub like `if (!url) return new PrismaClient()`** without a runtime guard. It masks the real failure mode (missing/wrong URL) behind a vague Prisma error later. Prefer a hard throw at boot in production paths.
- **Pooler vs. non-pooler URL is unrelated** to this error. Both `ep-xxx.neon.tech` and `ep-xxx-pooler.neon.tech` work with `@neondatabase/serverless`. (Pooler is still recommended for serverless deployments — just for a different reason.)
- The breaking constructor change isn't called out loudly in the adapter changelog; it's easy to upgrade past it via a `^` semver bump and not notice until production.

## Reference

- Adapter types: `node_modules/@prisma/adapter-neon/dist/index.d.ts` —
  `class PrismaNeon { constructor(config: neon.PoolConfig, options?: PrismaNeonOptions); }`
- Prisma driver adapters docs: https://www.prisma.io/docs/orm/overview/databases/neon#using-the-neon-serverless-driver-with-prisma
- `@neondatabase/serverless` `PoolConfig` accepts `{ connectionString }` (or individual `host`/`user`/`database`/`password`/`port` fields).
