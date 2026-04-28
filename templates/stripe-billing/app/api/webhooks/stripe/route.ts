export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'

/**
 * POST /api/webhooks/stripe
 *
 * Public endpoint — authenticates the caller via `stripe-signature` header
 * (HMAC of raw body using STRIPE_WEBHOOK_SECRET).
 *
 * Handles:
 *   - checkout.session.completed         → upsert Subscription as 'active'
 *   - customer.subscription.updated      → update Subscription.status
 *   - customer.subscription.deleted      → mark Subscription as 'canceled'
 *
 * Behavior contract:
 *   - **Never throws.** Webhook handlers always return 200 after processing
 *     or logging. Stripe retries on 5xx, which would amplify transient DB
 *     errors into duplicate writes. 200 with logged error is safer.
 *   - **Idempotent.** Each event has a unique `event.id`. Before applying
 *     a change, check if the matching Subscription row already has
 *     `lastEventId === event.id` and short-circuit.
 *   - **Unknown user → log + 200.** Don't throw or 4xx if metadata.userId
 *     points to a deleted user.
 *
 * Add this path to your auth middleware exclusion list.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !webhookSecret) {
    // Dev fallback — billing not configured. Acknowledge silently.
    console.log('[stripe webhook] dev fallback — billing not configured')
    return NextResponse.json({ received: true, devFallback: true })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.warn('[stripe webhook] missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Stripe requires the *raw* body for signature verification.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripe, event)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break
      default:
        // We don't subscribe to anything else, but ack if Stripe sends one.
        console.log(`[stripe webhook] unhandled event type: ${event.type}`)
    }
  } catch (err) {
    // Strict no-throw policy — log + 200.
    console.error('[stripe webhook] handler error:', err)
  }

  return NextResponse.json({ received: true })
}

// ─────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  stripe: Stripe,
  event: Stripe.Event
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session

  const userId =
    (session.metadata?.userId as string | undefined) ||
    (typeof session.customer === 'string'
      ? await lookupUserIdByStripeCustomerId(session.customer)
      : null)
  if (!userId) {
    console.warn('[stripe webhook] checkout.session.completed: no userId resolved')
    return
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id
  if (!subscriptionId) {
    console.warn('[stripe webhook] checkout.session.completed: no subscription id')
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await upsertSubscription(userId, subscription, event.id)
}

async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription
  const userId = await resolveUserIdFromSubscription(subscription)
  if (!userId) return
  await upsertSubscription(userId, subscription, event.id)
}

async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription
  const userId = await resolveUserIdFromSubscription(subscription)
  if (!userId) return
  await upsertSubscription(userId, subscription, event.id, /* canceled */ true)
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metaUserId = subscription.metadata?.userId as string | undefined
  if (metaUserId) return metaUserId
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  return lookupUserIdByStripeCustomerId(customerId)
}

async function lookupUserIdByStripeCustomerId(
  stripeCustomerId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId },
    select: { id: true },
  })
  return user?.id ?? null
}

/**
 * Stripe's API moved per-period fields onto subscription.items in newer
 * versions. Read from the first item if the top-level field isn't present;
 * fall back to "now + 30 days" if both are missing.
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date {
  type WithPeriodEnd = { current_period_end?: number }
  const top = (subscription as unknown as WithPeriodEnd).current_period_end
  if (typeof top === 'number') return new Date(top * 1000)

  const firstItem = subscription.items?.data?.[0] as
    | (WithPeriodEnd & Stripe.SubscriptionItem)
    | undefined
  if (firstItem && typeof firstItem.current_period_end === 'number') {
    return new Date(firstItem.current_period_end * 1000)
  }

  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

async function upsertSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  eventId: string,
  forceCanceled = false
): Promise<void> {
  // Idempotency: if this event was already applied, skip.
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { lastEventId: true },
  })
  if (existing && existing.lastEventId === eventId) {
    return
  }

  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const stripePriceId = subscription.items.data[0]?.price?.id ?? ''
  const currentPeriodEnd = getCurrentPeriodEnd(subscription)
  const status = forceCanceled ? 'canceled' : subscription.status

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastEventId: eventId,
    },
    update: {
      stripeCustomerId,
      stripePriceId,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastEventId: eventId,
    },
  })
}
