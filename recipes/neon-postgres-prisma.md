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
5. `package.json`:
   - `"postinstall": "prisma generate"` — Vercel runs this, generates client during build.
   - `"build": "prisma migrate deploy && next build"` — applies pending migrations on every deploy.

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

---

## Go-Live Checklist

- [ ] Production project on Neon (separate from dev)
- [ ] `DATABASE_URL` set on Vercel Production with pooled connection string
- [ ] `?sslmode=require` in the connection string
- [ ] `build` script includes `prisma migrate deploy`
- [ ] First production migration applied successfully
- [ ] Backups enabled (Neon offers point-in-time restore on paid tiers)
- [ ] Connection limit understood — match to expected serverless concurrency
