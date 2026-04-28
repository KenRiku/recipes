# Standard — Dev Fallback Pattern for External Integrations

Every external service client (Stripe, Resend, Dropbox Sign, Linear, Google OAuth, etc.) follows the same shape: it returns `null` when the env key is missing, and callers gracefully no-op or 503. Local dev, preview deploys, and CI runs stay safe by default — no real charges, no real emails sent, no live API hits — without code changes.

## The pattern

```ts
// lib/<service>.ts
import { ServiceSDK } from 'service-sdk'

let cached: ServiceSDK | null = null

export function getService(): ServiceSDK | null {
  const key = process.env.SERVICE_API_KEY
  if (!key) return null
  if (!cached) {
    cached = new ServiceSDK(key, {
      apiVersion: 'X.Y.Z',           // PIN the version
      appInfo: { name: 'MyApp', version: '0.1.0' },
    })
  }
  return cached
}

export function isServiceConfigured(): boolean {
  return Boolean(process.env.SERVICE_API_KEY /* + any other required vars */)
}
```

## Caller patterns

### Write boundary (e.g. send email, create checkout)
Return a 503 with a friendly message — NOT a 500. UI can render "billing not yet enabled" copy instead of an error.
```ts
const service = getService()
if (!service) {
  return NextResponse.json(
    { error: 'Service not enabled in this environment.' },
    { status: 503 }
  )
}
```

### Webhook (e.g. Stripe events, Dropbox Sign callbacks)
Ack 200 silently. The webhook test endpoint in the dashboard shouldn't show red just because dev keys aren't set.
```ts
const service = getService()
if (!service) {
  console.log('[webhook] dev fallback — service not configured')
  return NextResponse.json({ received: true, devFallback: true })
}
```

### Read query (e.g. fetch price for upgrade page)
Return `null` and let the UI fall back to neutral copy.
```ts
export async function getPriceLabel(): Promise<string | null> {
  const service = getService()
  if (!service) return null
  // ...
}
```

## What this buys you

- Local dev needs zero secrets — can run the whole app without paying for accounts.
- CI/Playwright tests run green without real keys.
- Preview deploys are safe — even if production env vars leak, preview scopes stay unset.
- New developer onboarding is instant: clone, `npm install`, `npm run dev`. Integrations come online as keys are added.

## Required ingredients in every integration

1. `getService(): SDK | null` — lazy singleton, returns null when unconfigured.
2. `isServiceConfigured(): boolean` — used by UI gates.
3. **Pinned API version** in the SDK constructor (so the service can't silently change shape under you).
4. **App info / user-agent** so dashboard request logs identify your app.
5. Routes call `getService()` and handle null; never throw on missing config.

## Anti-patterns

- ❌ Throwing if env var is missing at module load. Crashes the whole app for every developer.
- ❌ Defaulting `process.env.SERVICE_API_KEY ?? 'fake_key'`. Leads to surprising 4xx from the real service.
- ❌ Mocking the client in dev. Drift from prod = bugs. Use the real SDK with no key, return null.
- ❌ Letting webhook handlers throw 5xx on missing config. Service retries → log spam.

## Reference implementations

- `pieceful/lib/stripe.ts` — Stripe (subscriptions)
- `pieceful/lib/email.ts` — Resend
- `pieceful/lib/esign.ts` — Dropbox Sign
