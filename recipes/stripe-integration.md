# Stripe Integration — Repeatable Setup Guide

A standardized recipe for adding Stripe subscriptions to a Next.js app. Captures what worked, what tripped us up, and the exact steps to repeat the integration in future projects.

---

## What you need

### Accounts
- **Stripe account** — sign up at https://dashboard.stripe.com/register. Free; no activation required for Test mode.
- **Vercel (or other host)** — for setting prod env vars and serving the webhook URL.

### Env vars (3)
| Var | Source | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Developers → API keys → Secret key | `sk_test_...` for dev, `sk_live_...` for prod. Server-side only. |
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI (local) or Webhook endpoint (prod) | `whsec_...` Different value for local vs prod. |
| `STRIPE_PRICE_ID_PAID_MONTHLY` | Product catalog → product → Pricing row | **Must be `price_...`, NOT `prod_...`** (see Gotchas). |

### Code surface (Next.js App Router)
- `lib/stripe.ts` — `getStripe()` returns `Stripe` client or `null` if no key (dev fallback).
- `app/api/billing/checkout/route.ts` — POST creates Checkout Session, returns hosted URL. Takes `mode: "subscription" | "credits"` (or your project's discriminator) when supporting both products.
- `app/api/webhooks/stripe/route.ts` — POST receives events, verifies signature, branches on `session.mode` to upsert subscription OR grant credits.
- `app/(app)/upgrade/page.tsx` — pricing table; calls checkout endpoint.
- DB: `Subscription` table (userId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd, lastEventId for idempotency) + `User.stripeCustomerId`. **Optional**: `User.scanCredits` (int) + `CreditPurchase` audit table when shipping one-off credit packs alongside the subscription.

---

## Setup — Test mode (local dev)

1. Sign up at Stripe. Keep "Test mode" toggle ON.
2. **Product catalog → Add product** → set name, recurring monthly price, currency. Save.
3. Click into the product → **Pricing** row → copy the `price_...` ID.
4. **Developers → API keys** → reveal Secret key → copy `sk_test_...`.
5. Install Stripe CLI: `scoop install stripe` (Windows) or download from https://docs.stripe.com/stripe-cli.
6. `stripe login` → approve in browser.
7. Run forwarder (leave open in own terminal):
   ```
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   CLI prints `whsec_...` — that's `STRIPE_WEBHOOK_SECRET` for local dev.
8. Add all 3 vars to `.env.local`. Restart `npm run dev`.
9. Run any pending DB migrations (`npx prisma migrate deploy`).

## Test the flow
- Trigger paywall in app → click upgrade → land on Stripe hosted Checkout.
- Card: `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
- Other test cards: https://docs.stripe.com/testing#cards
- Verify webhook events fire in `stripe listen` window and DB `Subscription` row is created.

---

## Gotchas (what didn't work)

- **`prod_...` vs `price_...`** — copying the Product ID into `STRIPE_PRICE_ID_PAID_MONTHLY` fails with `No such price`. Always copy the `price_` ID from the Pricing row inside the product, not the product header.
- **Webhook needs RAW body for signature verification.** In Next.js use `req.text()` before any JSON parsing. `req.json()` will break signature checks.
- **Test mode and Live mode are separate datastores.** Products, prices, customers, webhook endpoints — all duplicated. Recreate everything when going live; nothing carries over.
- **Webhook secret differs per environment.** Stripe CLI gives one for local; Stripe Dashboard webhook endpoint gives a different one for prod. Don't reuse.
- **Pin API version** in the Stripe client constructor (`apiVersion: '2026-04-22.dahlia'`) so future Stripe defaults don't change webhook payload shapes underneath you.
- **Webhook handler must be no-throw + idempotent.** Stripe retries on 5xx → duplicate writes. Always 200, log internally on failure. Track `lastEventId` per subscription row and short-circuit if seen.
- **`current_period_end` moved to subscription items** in newer Stripe API versions. Read from `subscription.items.data[0].current_period_end` if top-level is undefined.
- **Currency is set on the Price**, not in code. `Intl.NumberFormat` with the currency from `stripe.prices.retrieve()` handles display automatically.
- **Custom JWT auth (no NextAuth) — adapt the template.** The template imports `getServerSession(authOptions)` everywhere. If your project uses a custom JWT cookie + `requireUser()` helper, swap every server-session call for `requireUser()` (which returns `{ id, email, name }` directly). Side effects: skip the "augment NextAuth session types" + "wire `getUserPlan` into session callback" steps from the template README — `getUserPlan(userId)` becomes a direct helper call inside the route or server component instead. *(Pattern verified in vibecheck, 2026-04-28.)*
- **One-time credit purchases need `mode: "payment"`, not `"subscription"`.** `stripe.checkout.sessions.create({ mode: "payment", ... })` issues a single charge. The webhook then sees `session.mode === "payment"` on the same `checkout.session.completed` event — branch on it to credit a `User.scanCredits` field instead of upserting a Subscription. Pass `metadata.credits` on the session so the webhook knows how much to grant; idempotency keys to a separate `CreditPurchase` table uniquely indexed on `(stripeSessionId, stripeEventId)`.
- **Mixing subscription + one-time payment on the same checkout endpoint** is fine. Take a `mode: "pro" | "credits"` discriminator on the request body, branch the Stripe `mode` and `line_items` accordingly. Both products share the same `customer`, the same metadata convention, and the same webhook — only the `Subscription` upsert vs `User.scanCredits` increment differs server-side.
- **Pro subscribers should ignore credits.** A user who subscribes to Pro shouldn't have their credit balance silently consumed by gated scans. Plan-resolution logic: `if (plan === 'pro') skip credit lookup entirely`. Otherwise users on Pro who previously bought credits will see the balance drift weirdly.

---

## Patterns worth keeping

- **Dev fallback pattern**: `getStripe()` returns `null` when key absent → checkout endpoint returns 503, webhook acks 200 silently. Local dev and previews never charge real cards.
- **`isBillingConfigured()` helper** — gates UI so the upgrade page shows "billing not enabled" instead of 500 in unconfigured environments.
- **Lazy customer creation**: create `stripe.customers.create()` only on first checkout, persist `stripeCustomerId` on User. Lets webhooks reverse-lookup user from customer ID.
- **Pass `metadata: { userId }`** on both Checkout Session AND `subscription_data` so webhooks can resolve user without a customer-id lookup.
- **Display real price on upgrade page** via server-side `stripe.prices.retrieve()` with short in-memory cache (5 min). Keeps marketing copy in sync with whatever you set in the dashboard.
- **Atomic credit decrement.** When consuming a scan credit, use `prisma.user.updateMany({ where: { id, scanCredits: { gt: 0 } }, data: { scanCredits: { decrement: 1 } } })` and check `result.count > 0`. The where-clause guard prevents two concurrent scans from racing past zero. Spend the credit *after* the dependent row commits, so failed inserts don't burn balance.
- **`CreditPurchase` audit table.** One row per scan-pack purchase keyed on `stripeSessionId @unique` and `stripeEventId @unique`. Lets you reconstruct credit balance from Stripe history if `User.scanCredits` ever drifts, and the dual-uniqueness gives webhook idempotency without a "find then create" race.
- **Multi-axis plan resolution.** Real apps gate on more than just `plan === 'paid'`. Wrap the policy in an `assertCanX(userId)` that returns a verdict object explaining *which* of the available passes was used (subscription, credit, daily-cap, BYO). Caller handles the verdict (e.g. spend a credit when verdict says "credit"). Better than booleans for debug logs and for surfacing the right copy on the upgrade page (`?reason=scan_quota`).

---

## Going Live

1. **Activate Stripe account.** Dashboard → Activate payments → provide legal business name, EIN/SSN, bank account, business address.
2. **Toggle Test mode OFF** in dashboard.
3. **Recreate Product + Price** in Live mode. Copy new live `price_...` ID.
4. **Reveal live Secret key** → `sk_live_...`.
5. **Add live webhook endpoint** at `https://<prod-domain>/api/webhooks/stripe`. Subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   Reveal signing secret → live `whsec_...`.
6. **Vercel → Production env only:**
   - `STRIPE_SECRET_KEY` = `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` = live `whsec_...`
   - `STRIPE_PRICE_ID_PAID_MONTHLY` = live `price_...`
7. Redeploy.
8. Smoke test with a real card on a small amount → refund yourself from dashboard.

Leave Preview/Development env vars **unset** so dev fallback keeps non-prod safe.

---

## Go-Live Checklist

Run through this before flipping the switch in production.

### Stripe account
- [ ] Stripe account created and email verified
- [ ] Account fully activated (legal name, EIN/SSN, bank account, address submitted and approved)
- [ ] Tax settings configured if applicable (Stripe Tax / manual)
- [ ] Business branding set (logo, brand color, statement descriptor)

### Live-mode resources
- [ ] Toggle is on **Live mode** (not Test mode) when creating these
- [ ] Product created in Live mode with correct name
- [ ] Recurring Price created with correct amount, currency, interval
- [ ] Live `price_...` ID copied (NOT `prod_...`)
- [ ] Live `sk_live_...` Secret key copied
- [ ] Live webhook endpoint added at `https://<prod-domain>/api/webhooks/stripe`
- [ ] Webhook subscribed to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Live webhook signing secret (`whsec_...`) copied

### Code & deployment
- [ ] Stripe API version pinned in code matches a current/supported version
- [ ] Webhook handler is no-throw, returns 200 on handler errors
- [ ] Webhook handler is idempotent (checks `lastEventId` before write)
- [ ] DB migration for `Subscription` + `User.stripeCustomerId` deployed to prod
- [ ] `isBillingConfigured()` gate present on upgrade UI
- [ ] Success URL (`/billing/success`) and cancel URL (`/billing/cancel`) routes exist and render properly
- [ ] Customer portal route (`/api/billing/portal`) wired for cancel/update payment

### Vercel (or host) env vars
- [ ] `STRIPE_SECRET_KEY` set on **Production** scope only (live key)
- [ ] `STRIPE_WEBHOOK_SECRET` set on **Production** scope only (live secret)
- [ ] `STRIPE_PRICE_ID_PAID_MONTHLY` set on **Production** scope only (live price)
- [ ] Preview / Development scopes left UNSET (or set to test keys deliberately)
- [ ] Production redeploy triggered after env vars added

### Smoke test in production
- [ ] Real card subscription succeeds end-to-end
- [ ] Webhook delivery shows green in Stripe Dashboard (Developers → Webhooks → endpoint)
- [ ] DB `Subscription` row created with `status: active`
- [ ] User's plan flips to paid in app
- [ ] Cancel via customer portal works; webhook updates `status: canceled`
- [ ] Self-refund issued for the test charge

### Operational
- [ ] Stripe Dashboard email alerts enabled for failed webhooks / disputes
- [ ] Receipt emails enabled in Stripe (Settings → Customer emails)
- [ ] Documented support flow for billing disputes / refund requests
