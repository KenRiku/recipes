# Template — Stripe Billing + Paywall

Subscription billing with paywall gates, dev fallback, idempotent webhooks, and a customer portal route.

## Files copied into the target project

```
lib/stripe.ts                            # Stripe client wrapper + getPaidPlanPrice
lib/plan.ts                              # getUserPlan + assertCan* paywall gates
lib/paywall-error.ts                     # PaywallError class + handlePaywallError
app/api/billing/checkout/route.ts        # Creates Checkout Session
app/api/billing/portal/route.ts          # Customer Portal session
app/api/webhooks/stripe/route.ts         # Webhook — no-throw + idempotent
prisma/_subscription-fragment.prisma     # Add to your schema.prisma
```

## After copying

1. **Schema.** Append the `Subscription` model from `prisma/_subscription-fragment.prisma` to your `prisma/schema.prisma`. Also add `stripeCustomerId String? @unique` to your `User` model and `subscription Subscription?` reverse relation. Run `prisma migrate dev --name add_subscriptions`.

2. **Customize paywall features in `lib/paywall-error.ts`.** Replace the example `PaywallFeature` codes (`example_premium_feature`) with your project's actual paid features.

3. **Customize free-tier limits in `lib/plan.ts`.** Edit `FREE_TIER_LIMITS` and the `assertCan*` helpers to match your business rules. Delete helpers you don't need.

4. **Add env vars to `.env.example`:**
   ```
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   STRIPE_PRICE_ID_PAID_MONTHLY=
   ```

5. **Wire `getUserPlan` into auth.**
   - **NextAuth projects:** populate `session.user.plan` in the `session` callback:
     ```ts
     // lib/auth.ts
     async session({ session, token }) {
       if (session.user) {
         session.user.id = token.id as string
         try { session.user.plan = await getUserPlan(session.user.id) }
         catch { session.user.plan = 'free' }
       }
       return session
     }
     ```
     Then augment session types in `types/next-auth.d.ts`:
     ```ts
     import 'next-auth'
     declare module 'next-auth' {
       interface Session { user: { id: string; plan?: 'free' | 'paid'; ... } }
     }
     ```
   - **Custom JWT auth (no NextAuth):** skip the session callback entirely. Replace every `getServerSession(authOptions)` import in the copied routes with your project's `requireUser()` helper, and call `await getUserPlan(user.id)` directly inside any server component or route that needs the plan. Delete the `next-auth.d.ts` augmentation step.

6. **Add `getBaseUrl()` helper** if you don't have one — used by checkout/portal for return URLs:
   ```ts
   // lib/base-url.ts
   export function getBaseUrl() {
     if (typeof window !== 'undefined') return window.location.origin
     if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
     if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
     return `http://localhost:3000`
   }
   ```

7. **Follow the recipe** at `~/src/recipes/recipes/stripe-integration.md` for Stripe account setup, env-var sourcing, local-dev webhook forwarding, and the production go-live checklist.

## Optional add-on: one-time credit packs

To sell one-off credit packs alongside the subscription (e.g. `$5 / 1 scan` or `$30 / 120 scans`) without a second checkout endpoint:

- Add `scanCredits Int @default(0)` to `User` and a `CreditPurchase` audit table (see `prisma/_credit-pack-fragment.prisma`).
- Take a `mode: "pro" | "credits"` discriminator on the request body of `app/api/billing/checkout/route.ts`. Branch the Stripe `mode` (`subscription` vs `payment`) and `line_items` accordingly.
- In the webhook, branch on `session.mode === "payment"` to grant credits instead of upserting a Subscription. Idempotency keys to `(stripeSessionId, stripeEventId)` on `CreditPurchase`.
- In `lib/plan.ts`, have your `assertCan*` helper consult `User.scanCredits` *only* when the user is on the free plan — Pro subscribers should ignore credits.
- Spend the credit *after* the dependent row commits (so a failed scan insert doesn't burn balance):
   ```ts
   const result = await prisma.user.updateMany({
     where: { id: userId, scanCredits: { gt: 0 } },
     data: { scanCredits: { decrement: 1 } },
   })
   if (result.count === 0) { /* lost a race; roll back */ }
   ```

See `~/src/fully-baked-projects/fully-baked-vibe-security/lib/plan.ts` and `app/api/webhooks/stripe/route.ts` for a full implementation.

## Required dependencies

```bash
npm install stripe
```
