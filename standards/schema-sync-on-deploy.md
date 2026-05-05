# Standard — Sync Database Schema on Every Deploy

## The rule

Every deploy must run the schema sync command for the project's ORM as part of the build script. Never rely on a human remembering to push schema before deploying.

For Prisma:

```json
{
  "scripts": {
    "build": "prisma db push --accept-data-loss && next build",
    "postinstall": "prisma generate"
  }
}
```

`prisma db push` is idempotent — running it on every deploy is safe. `--accept-data-loss` is required because `db push` is conservative by default; for additive-only schema work it's a no-op.

> **Prisma 7 note:** the `--skip-generate` flag was removed in Prisma 7 (`prisma db push` no longer accepts it and fails with `unknown or unexpected option: --skip-generate`). The `postinstall: prisma generate` script still handles client generation independently, so dropping the flag is the right answer — not pinning to Prisma 6.

For other ORMs:
- **Drizzle**: `drizzle-kit push` in build.
- **Rails**: `bundle exec rails db:migrate` in release/build.
- **Django**: `python manage.py migrate` in release/build.
- **TypeORM / Sequelize / etc.**: equivalent migrate-on-deploy command.

## Why

The whole "manually push schema after deploy" workflow is a footgun. The failure mode is always the same:

1. You add a column to the schema locally.
2. You run `prisma db push` against your local `DATABASE_URL`.
3. You deploy to Vercel/Fly/Render.
4. The deploy succeeds. The build's generated Prisma client expects the new column.
5. **First production request hits a 500** with `P2022: column "X" does not exist`.

This bites every time the deploy DB is different from the local DB — which is almost always (different Neon branch, different Supabase project, separate prod connection string, etc). The fix is to remove the human from the loop.

## Hit list — when this rule was learned

- **VibeCheck (2026-04-28)**: schema pushed locally to a Neon pooler URL; Vercel's `DATABASE_URL` pointed at a different branch via the Vercel-Neon integration. Dashboard threw `P2022 column "(not available)" does not exist` on first request post-deploy. Resolved by aligning `DATABASE_URL` and adding `prisma db push` to build. The "(not available)" is what Prisma returns when it can't disambiguate which missing column triggered the error — when you see it, don't bother debugging which column; the answer is that the schema is behind.

## Caveats

- **Destructive changes need explicit handling.** `prisma db push --accept-data-loss` will drop columns that no longer exist in the schema. For Postgres specifically, dropping a column is irreversible without a backup. If you're renaming or removing fields, do a phased migration: first deploy the schema with both old and new columns, backfill, then a follow-up deploy that drops the old.
- **`db push` is for Prisma's "no migrations" mode.** If you've adopted `prisma migrate` with versioned migrations, replace `db push` with `prisma migrate deploy` — same principle, applies pending migration files at deploy time.
- **Cold start cost.** `db push` adds ~1–3s to every build. Worth it.

## Related

- `recipes/neon-postgres-prisma.md` — Neon + Prisma integration recipe; the gotchas section covers the `.env.local` vs Prisma CLI mismatch.
- `recipes/_template.md` — when adding any new ORM/DB stack to a project, update the recipe to point at this standard.
