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

5. **Wire `getUserPlan` into your session callback** so `session.user.plan` is populated. Pattern:
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

6. **Augment NextAuth session types.** In `types/next-auth.d.ts`:
   ```ts
   import 'next-auth'
   declare module 'next-auth' {
     interface Session { user: { id: string; plan?: 'free' | 'paid'; ... } }
   }
   ```

7. **Add `getBaseUrl()` helper** if you don't have one — used by checkout/portal for return URLs:
   ```ts
   // lib/base-url.ts
   export function getBaseUrl() {
     if (typeof window !== 'undefined') return window.location.origin
     return process.env.NEXTAUTH_URL ?? `http://localhost:3000`
   }
   ```

8. **Follow the recipe** at `~/src/recipes/recipes/stripe-integration.md` for Stripe account setup, env-var sourcing, local-dev webhook forwarding, and the production go-live checklist.

## Required dependencies

```bash
npm install stripe
```
