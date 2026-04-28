# Integration — [SERVICE NAME]

A standardized recipe for adding [service] to a Next.js (or whatever) app. Copy this file when starting a new integration recipe.

---

## What you need

### Accounts
- **[Service]** — sign up at https://...
- **[Other dependency]** — ...

### Env vars
| Var | Source | Notes |
|---|---|---|
| `SERVICE_API_KEY` | Dashboard → ... | Test/live separation |
| `SERVICE_WEBHOOK_SECRET` | CLI (local) / endpoint (prod) | Different per env |

### Code surface
- `lib/<service>.ts` — client wrapper following [`dev-fallback-pattern`](../standards/dev-fallback-pattern.md)
- `app/api/<service>/...` — endpoints calling the service
- `app/api/webhooks/<service>/route.ts` — webhook following [`webhook-contract`](../standards/webhook-contract.md)
- DB: any new tables / fields

---

## Setup — Test mode (local dev)

1. ...
2. ...
3. ...

## Test the flow
- ...

---

## Gotchas (what didn't work)

- **[Trap]** — symptom, cause, fix.

---

## Patterns worth keeping

- ...

---

## Going Live

1. ...

---

## Go-Live Checklist

### Service account
- [ ] Account verified
- [ ] Live mode enabled

### Live-mode resources
- [ ] ...

### Code & deployment
- [ ] ...

### Env vars (Production scope only)
- [ ] `SERVICE_API_KEY`
- [ ] `SERVICE_WEBHOOK_SECRET`

### Smoke test in production
- [ ] ...

### Operational
- [ ] Dashboard alerts enabled
- [ ] Documented support flow
