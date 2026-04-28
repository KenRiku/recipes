# Standard — Webhook Handler Contract

Every webhook endpoint (Stripe, Dropbox Sign, GitHub, Slack, etc.) follows the same contract. Inconsistencies cause duplicate writes, retry storms, and hard-to-debug state drift.

## Rules

### 1. Strict no-throw
Webhook handlers **never return 5xx** after they've validated the signature. If your DB is down or your logic has a bug, log it and return 200. The provider's dashboard becomes the authoritative state — you reconcile on the next event.

**Why:** Most webhook providers retry on 5xx with exponential backoff. A transient 500 turns into 3–10 duplicate event deliveries, which without idempotency turns into 3–10 duplicate DB writes. Better to log + ack.

### 2. Verify the signature on raw body
Never use `req.json()` before verification. The signature is computed on the raw body string; once Next.js parses JSON, the bytes change and verification fails.

```ts
const rawBody = await req.text()                 // Next 14 — raw text, no parse
const event = sdk.webhooks.constructEvent(rawBody, signature, webhookSecret)
```

### 3. Idempotent on event id
Every webhook delivery has a unique event id. Before applying any change, check whether you've already processed it. Persist `lastEventId` on the affected row and short-circuit when it matches.

```ts
const existing = await prisma.subscription.findUnique({
  where: { stripeSubscriptionId: subscription.id },
  select: { lastEventId: true },
})
if (existing?.lastEventId === event.id) return  // already processed
// ... apply change ...
await prisma.subscription.upsert({ ..., lastEventId: event.id })
```

### 4. Unknown referent → log + 200
If the webhook references a user/customer that doesn't exist in your DB (e.g. deleted account, mistargeted webhook), don't 4xx. Log a warning and ack 200.

### 5. Public — exclude from auth middleware
Add the webhook path to your auth-middleware exclusion list. Otherwise NextAuth redirects the provider's POST to `/login` and the webhook fails verification.

### 6. Env-driven config — see `dev-fallback-pattern.md`
When the SDK key or webhook secret is missing, ack 200 with `{ devFallback: true }`. Don't let dev environments accidentally process real events.

## Skeleton

```ts
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sdk = getService()
  const webhookSecret = process.env.SERVICE_WEBHOOK_SECRET

  if (!sdk || !webhookSecret) {
    console.log('[webhook] dev fallback — service not configured')
    return NextResponse.json({ received: true, devFallback: true })
  }

  const signature = req.headers.get('service-signature')
  if (!signature) {
    console.warn('[webhook] missing signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event
  try {
    event = sdk.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'thing.happened':
        await handleThing(event)
        break
      default:
        console.log(`[webhook] unhandled event type: ${event.type}`)
    }
  } catch (err) {
    // Strict no-throw — log + 200
    console.error('[webhook] handler error:', err)
  }

  return NextResponse.json({ received: true })
}
```

## Anti-patterns

- ❌ Throwing inside the handler — triggers provider retries → duplicate writes.
- ❌ Using `req.json()` before signature check.
- ❌ Forgetting to add the webhook path to the auth-middleware exclusion list.
- ❌ Using the same webhook secret across local dev and production. Local CLI and dashboard endpoints sign with different secrets.
- ❌ Trusting the event payload — the only authoritative source is what you fetched from the provider after verification.

## Reference implementations

- `pieceful/app/api/webhooks/stripe/route.ts`
- `pieceful/app/api/webhooks/dropbox-sign/route.ts`
