# Integration — Dropbox Sign (E-Signatures)

> **Status:** Stub — to be filled in next time you wire Dropbox Sign. Reference implementation: `pieceful/lib/esign.ts`, `pieceful/app/api/webhooks/dropbox-sign/route.ts`.

---

## What you need

### Accounts
- **Dropbox Sign** (formerly HelloSign) — sign up at https://app.hellosign.com.
- API app + API key from the dashboard.

### Env vars
| Var | Source | Notes |
|---|---|---|
| `DROPBOX_SIGN_API_KEY` | Dropbox Sign → My Account → API | Production only |
| `DROPBOX_SIGN_WEBHOOK_SECRET` | Optional — falls back to API key for HMAC | |

### Code surface
- `lib/esign.ts` — client wrapper, follows [`dev-fallback-pattern`](../standards/dev-fallback-pattern.md). Returns null when key absent → callers either return 503 or use a fake `dev_sig_*` ID for local testing.
- `app/api/documents/[id]/send-for-signature/route.ts` — owner action.
- `app/api/webhooks/dropbox-sign/route.ts` — follows [`webhook-contract`](../standards/webhook-contract.md).
- DB: per-document signing fields — `signingStatus`, `signatureRequestId`, `signedAt`, `signedDocumentUrl`.

---

## Setup

1. Sign up at https://app.hellosign.com → create an API app.
2. Get API key: My Account → API.
3. Register webhook URL in Dropbox Sign dashboard:
   - URL: `https://<prod-domain>/api/webhooks/dropbox-sign`
   - Dropbox Sign fires a `callback_test` immediately. Endpoint must return the literal string `Hello API Event Received` to pass.
4. Set `DROPBOX_SIGN_API_KEY` on Vercel **Production**.
5. Add webhook path to middleware exclusion list (no auth required).

## Test the flow
- Production: `NODE_ENV=production` triggers real signature flow. Otherwise SDK runs in test mode (signed PDFs are watermarked).
- Local dev: leave `DROPBOX_SIGN_API_KEY` unset → wrapper returns null → handler returns a fake `dev_sig_*` ID and skips network call.

---

## Gotchas

- **Callback test response must be exactly `Hello API Event Received`** as plain text, not JSON. Otherwise Dropbox Sign won't enable the webhook.
- **Test mode signed PDFs have a watermark.** Don't ship them to real signers.
- **Embedded vs hosted signing.** Hosted (signers leave your app, sign on Dropbox Sign's domain, return via webhook) is far simpler than embedded (iframe). Stick with hosted unless there's a strong reason.
- **Signed document URL is short-lived.** Download and store immediately on `signed` webhook event, or proxy through an authenticated endpoint.

---

## Go-Live Checklist

- [ ] Account approved (no longer in test-only mode)
- [ ] `DROPBOX_SIGN_API_KEY` set on Vercel Production
- [ ] Webhook URL registered in Dropbox Sign dashboard
- [ ] Webhook path excluded from auth middleware
- [ ] `callback_test` succeeded (status green in Dropbox Sign dashboard)
- [ ] Send a real signature request end-to-end as smoke test
