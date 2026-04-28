# Template — Vercel Cron Skeleton

A minimum-viable cron route with `CRON_SECRET` auth and an example `vercel.json` fragment. Customize the work inside the handler.

## Files copied

```
app/api/cron/_example/route.ts   # Cron handler skeleton — RENAME THE FOLDER
vercel.json                      # Cron config — MERGE with existing if present
```

## After copying

1. **Rename `app/api/cron/_example/`** to your job name (e.g. `daily-rollup`, `vesting-notifications`).
2. **Customize the handler body** — replace the example "work" with what your job actually does.
3. **Update `vercel.json`** — change the `path` and `schedule` to match. If your project already has a `vercel.json`, merge the `crons` array instead of overwriting.
4. **Generate `CRON_SECRET`:**
   ```bash
   openssl rand -base64 32
   ```
   Set on Vercel **Production scope** (and locally in `.env.local` for testing).
5. **Add to `.env.example`:**
   ```
   CRON_SECRET=
   ```
6. **Follow the recipe** at `~/src/recipes/recipes/vercel-cron-jobs.md` for cron-tier limits and gotchas.

## Test locally

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<your-job>
```
