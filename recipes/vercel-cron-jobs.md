# Integration — Vercel Cron Jobs

> **Status:** Stub. Reference implementation: `pieceful/app/api/cron/vesting-notifications/route.ts` + `vercel.json`.

---

## What you need

### Accounts
- **Vercel** — cron is a feature on the platform, no separate account.

### Env vars
| Var | Required | Notes |
|---|---|---|
| `CRON_SECRET` | yes | Random string. Generate with `openssl rand -base64 32`. Vercel sends `Authorization: Bearer <secret>` on cron invocations. |

### Code surface
- `vercel.json` — `crons` array with path + schedule.
- `app/api/cron/<job-name>/route.ts` — GET handler. Verifies `Authorization` header against `CRON_SECRET`.

---

## Setup

1. Generate `CRON_SECRET` and set on Vercel Production.
2. Add `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/<job>", "schedule": "0 8 * * *" }
     ]
   }
   ```
3. Implement the handler:
   ```ts
   export async function GET(req: NextRequest) {
     const auth = req.headers.get('authorization')
     if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
     // ... do the work ...
     return NextResponse.json({ ok: true })
   }
   ```
4. Deploy. Vercel will pick up the schedule on next deploy.

## Test the flow
- Locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<job>`.
- Production: Vercel dashboard → Cron Jobs tab → Run now.

---

## Gotchas

- **Cron schedules use UTC.** `0 8 * * *` is 8 AM UTC, not local time. Convert intentionally.
- **Hobby plan limits cron to once per day.** Pro plan unlocks per-minute. Check tier before assuming.
- **Cron POST vs GET.** Vercel sends GET. If you write a POST handler, it'll never fire.
- **Long-running jobs hit serverless function timeouts** (10s on Hobby, 60s on Pro, 300s with `maxDuration`). Break large work into batches or move to Vercel Queues / external scheduler.
- **Don't put the secret in the URL.** Vercel sends it as a header. Anyone who knows the URL can hit the endpoint, but without the header it'll 401.

---

## Go-Live Checklist

- [ ] `CRON_SECRET` set on Vercel Production
- [ ] `vercel.json` has the cron config (committed to repo)
- [ ] Handler verifies `Authorization` header
- [ ] First scheduled run completed successfully (check Vercel logs)
- [ ] Job is idempotent — replay-safe if Vercel retries
- [ ] Has a manual-trigger path for emergencies (gated by same auth)
