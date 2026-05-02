# Selling one-time credit packs alongside a Stripe subscription

The recipe template covers subscriptions. Adding one-time "credit pack" purchases on the same checkout endpoint is straightforward but has three non-obvious bits.

## 1. Stripe `mode: "payment"` for one-offs

```ts
const checkoutSession = await stripe.checkout.sessions.create({
  mode: isSubscription ? "subscription" : "payment",
  customer: stripeCustomerId,
  line_items: [{ price: priceId, quantity: 1 }],
  metadata: {
    userId,
    purchaseType: isSubscription ? "pro" : "credits",
    credits: isSubscription ? "0" : String(SCAN_PACK_CREDITS),
  },
  ...(isSubscription
    ? { subscription_data: { metadata: { userId } } }
    : {}),
  // success_url, cancel_url same for both
})
```

The webhook sees `session.mode === "payment"` on the same `checkout.session.completed` event — branch on it.

## 2. Webhook idempotency for credit grants

Subscriptions get idempotency from `Subscription.lastEventId`. One-time purchases need their own audit table:

```prisma
model CreditPurchase {
  stripeSessionId String   @unique
  stripeEventId   String   @unique
  credits         Int
  // ...
}
```

The dual-uniqueness lets you short-circuit duplicate webhook deliveries without a "find then create" race:

```ts
const existing = await prisma.creditPurchase.findFirst({
  where: { OR: [{ stripeSessionId: session.id }, { stripeEventId: event.id }] },
})
if (existing) return

await prisma.$transaction([
  prisma.creditPurchase.create({ data: { ... } }),
  prisma.user.update({
    where: { id: userId },
    data: { scanCredits: { increment: credits } },
  }),
])
```

## 3. Atomic credit decrement (avoid going negative)

When *consuming* a credit, use a where-guarded `updateMany` and check `result.count`:

```ts
const result = await prisma.user.updateMany({
  where: { id: userId, scanCredits: { gt: 0 } },
  data: { scanCredits: { decrement: 1 } },
})
return result.count > 0
```

The `scanCredits: { gt: 0 }` guard prevents two concurrent scans from both reading "1 credit available" and decrementing past zero. If `count === 0`, you lost the race — roll back the dependent row.

## 4. Pro subscribers ignore credits

Don't silently consume credits while a user is on Pro. They paid for unlimited scans; their credit balance should stay frozen until they downgrade.

```ts
async function assertCanScan(userId: string) {
  const plan = await getUserPlan(userId)
  if (plan === "pro") return { ok: true, consumeCreditFor: null }
  // ...check daily cap, then credits, then throw PaywallError
}
```

Caller sees `consumeCreditFor: null` for Pro and skips the decrement. Otherwise the credit balance drifts under Pro users in confusing ways.

## 5. Spend the credit *after* the dependent row commits

Tempting to decrement-then-create-row, but if row creation fails you've burned the user's credit for nothing. Order is:

1. `assertCanScan(userId)` returns a verdict including `consumeCreditFor`.
2. Create the dependent row (e.g. `prisma.scan.create()`).
3. *Now* call `consumeCredit(userId)`. If it fails (lost the race), delete the dependent row and return 402.

## Verified in

- `fully-baked-vibe-security` — `lib/plan.ts`, `app/api/scans/route.ts`, `app/api/webhooks/stripe/route.ts` (2026-04-28).
