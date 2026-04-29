# Integration — Neon Postgres + Prisma on Vercel

> **Status:** Stub. Reference implementation: `pieceful/lib/prisma.ts`, `pieceful/prisma/schema.prisma`.

---

## What you need

### Accounts
- **Neon** — https://neon.tech

### Env vars
| Var | Notes |
|---|---|
| `DATABASE_URL` | Neon connection string. Must include `?sslmode=require`. |

### Dependencies
- `prisma` (CLI + types)
- `@prisma/client`
- `@neondatabase/serverless` + `@prisma/adapter-neon` (required for Vercel serverless)

---

## Setup

1. Neon → New project → copy pooled connection string.
2. `.env.local`:
   ```
   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
   ```
3. `prisma/schema.prisma`:
   ```prisma
   generator client {
     provider        = "prisma-client-js"
     previewFeatures = ["driverAdapters"]
   }
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. `lib/prisma.ts` — singleton with Neon adapter:
   ```ts
   import { Pool, neonConfig } from '@neondatabase/serverless'
   import { PrismaNeon } from '@prisma/adapter-neon'
   import { PrismaClient } from '@prisma/client'
   import ws from 'ws'

   neonConfig.webSocketConstructor = ws

   const adapter = new PrismaNeon(new Pool({ connectionString: process.env.DATABASE_URL }))
   export const prisma = new PrismaClient({ adapter })
   ```
5. `package.json` — **schema must sync on every deploy** (see `standards/schema-sync-on-deploy.md`):
   - `"postinstall": "prisma generate"` — Vercel runs this, generates client during build.
   - `"build": "prisma db push --accept-data-loss --skip-generate && next build"` — pushes schema before building. (Use `prisma migrate deploy` instead if you've adopted versioned migrations.)
   - **Never rely on manually running `prisma db push` after deploy.** The failure mode is `P2022: column "(not available)" does not exist` on the first prod request, and it bites every project until the build script does this automatically.

## Test the flow
- `npx prisma migrate dev --name init` — creates migration + applies locally.
- Production: `prisma migrate deploy` runs in Vercel build (idempotent).

---

## Gotchas

- **`prisma migrate deploy` only applies pending migrations.** Idempotent — safe to run on every build.
- **`prisma migrate dev` is local-only.** It can reset your DB. Never run against prod.
- **Neon free tier auto-suspends after inactivity.** First request after suspend takes 1–3s. Plan for a warmup or set up keepalive.
- **Connection pooling: use the *pooled* connection string** (the one with `-pooler` in the host). Direct connections will exhaust quickly under serverless.
- **Schema drift in PRs.** When two PRs both modify `schema.prisma`, the rebuilt `schema.prisma` can pick up changes from the other PR. Always re-run `prisma migrate dev` on rebase.
- **`force-dynamic` on every page that hits the DB.** Otherwise Next.js tries to pre-render at build time without a DB and fails:
  ```ts
  export const dynamic = 'force-dynamic'
  ```
- **Prisma CLI doesn't read `.env.local`.** Next.js reads `.env.local` (gitignored) but the Prisma CLI only loads `.env`. Running `npx prisma db push` / `migrate` against a `DATABASE_URL` that lives in `.env.local` fails with `P1012 Environment variable not found: DATABASE_URL`. Worse: in a running Next.js dev server the same misconfiguration manifests at request time as a Prisma connection error — and if you have a fail-closed rate limiter or middleware in front, that surfaces as a confusing **503** on every API route instead of a clear "DB not connected" message. Fixes (in order of preference):
  1. **One-shot in current shell:** `set -a; source .env.local; set +a; npx prisma db push`
  2. **Durable, no new dep:** symlink `ln -s .env.local .env` (still gitignored).
  3. **Durable, explicit:** `npm i -D dotenv-cli` and call `npx dotenv -e .env.local -- prisma <cmd>`. Worth it if multiple env files (e.g. `.env.local`, `.env.production.local`) are in play.

  Do **not** "fix" this by moving `DATABASE_URL` into `.env` — that file is typically committed and the URL belongs in the gitignored `.env.local`.

---

## Go-Live Checklist

- [ ] Production project on Neon (separate from dev)
- [ ] `DATABASE_URL` set on Vercel Production with pooled connection string
- [ ] `?sslmode=require` in the connection string
- [ ] `build` script includes `prisma migrate deploy`
- [ ] First production migration applied successfully
- [ ] Backups enabled (Neon offers point-in-time restore on paid tiers)
- [ ] Connection limit understood — match to expected serverless concurrency
