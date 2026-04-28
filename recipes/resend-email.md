# Integration — Resend (Transactional Email)

> **Status:** Stub — to be filled in next time you wire Resend into a project. Reference implementation: `pieceful/lib/email.ts`.

---

## What you need

### Accounts
- **Resend** — sign up at https://resend.com

### Env vars
| Var | Source | Notes |
|---|---|---|
| `RESEND_API_KEY` | Resend → API Keys | `re_...`. Set on Vercel **Production only** to keep dev fallback active in preview. |

### Code surface
- `lib/email.ts` — client wrapper following [`dev-fallback-pattern`](../standards/dev-fallback-pattern.md). When `RESEND_API_KEY` is missing, log to console instead of sending.
- `lib/email-templates/` — pure-function templates returning `{ subject, html, text }`.
- Per-feature: call `sendEmail(...)` from API routes after successful writes.

---

## Setup

1. Sign up at https://resend.com.
2. **Verify the sending domain.** Resend → Domains → Add domain. Add the 4 DNS records at your DNS provider:
   - SPF (TXT)
   - DKIM (2 × CNAME)
   - DMARC (TXT)
3. Wait for Resend to flip the domain to "Verified" (usually minutes; can be hours).
4. **API Keys → Create API Key.** Copy `re_...`.
5. Set `RESEND_API_KEY` in `.env.local` for testing real sends. Or leave unset to use the dev-fallback (logs the email payload to console).

## Test the flow
- Trigger any email-sending action in the app.
- Console output (dev fallback) shows `[email] would send to <addr>: <subject>`.
- Real send: check Resend dashboard → Logs.

---

## Gotchas

- **Domain not verified yet → 403 from `resend.emails.send`.** Either wait, or stay in dev fallback.
- **DKIM CNAME records often get a stray prefix added by DNS providers (e.g. Cloudflare appending `.yourdomain.com`).** Double-check by copying the FROM-resend value into a DNS lookup tool.
- **Resend's `from` must match the verified domain.** `noreply@unverified.com` silently fails.
- **Test API key** (no domain required) is fine for first wiring, but only sends to the address you signed up with.

---

## Patterns worth keeping

- Templates as pure functions — no JSX/MJML coupling. Keeps server bundles lean.
- One `FROM_ADDRESS` constant in `lib/email.ts` — easy to change globally.
- Dev fallback logs `to`, `subject`, and a short body excerpt — enough to verify the flow without rendering full HTML in the terminal.

---

## Go-Live Checklist

- [ ] Domain verified in Resend
- [ ] DNS records propagated (use `dig TXT yourdomain.com` to confirm)
- [ ] `RESEND_API_KEY` set on Vercel **Production scope only**
- [ ] Preview/Development scopes left UNSET (dev fallback stays on)
- [ ] FROM_ADDRESS in code matches verified domain
- [ ] Production redeploy after env var set
- [ ] Send a real email end-to-end as smoke test
