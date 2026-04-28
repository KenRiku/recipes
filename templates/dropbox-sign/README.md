# Template — Dropbox Sign E-Signatures

Dropbox Sign client wrapper + webhook. Hosted signing flow (signers leave the app, sign on Dropbox Sign's domain, return via webhook). Dev fallback returns fake `dev_sig_*` IDs so local dev / CI runs without real API calls.

## Files copied

```
lib/esign.ts                              # createSignatureRequest + HMAC verify + dev fallback
app/api/webhooks/dropbox-sign/route.ts    # Webhook — handles all_signed, declined
```

## After copying

1. **Customize DB fields.** The webhook references `prisma.generatedDocument` with fields `signatureRequestId`, `signingStatus`, `signedAt`, `signedDocumentUrl`. CUSTOMIZE: rename to your project's model, or remove the DB writes if you don't need to track signing state.
2. **Add the webhook path to your auth-middleware exclusion list** — Dropbox Sign POSTs publicly.
3. **Add to `.env.example`:**
   ```
   DROPBOX_SIGN_API_KEY=
   DROPBOX_SIGN_WEBHOOK_SECRET=     # optional — falls back to API key
   ```
4. **Follow the recipe** at `~/src/recipes/recipes/dropbox-sign-esignatures.md` for account setup, webhook registration (must respond `Hello API Event Received`), and go-live.

## Required dependencies

```bash
npm install @dropbox/sign
```
