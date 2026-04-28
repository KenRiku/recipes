export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getStripe,
  isBillingConfigured,
  STRIPE_PRICE_ID_PAID_MONTHLY,
} from '@/lib/stripe'
import { getBaseUrl } from '@/lib/base-url'

/**
 * POST /api/billing/checkout
 *
 * Authenticated. Creates a Stripe Checkout Session and returns its hosted
 * URL for the browser to follow. Reuses an existing `User.stripeCustomerId`
 * when present so the same customer isn't recreated on retry.
 *
 * Returns 503 when Stripe env vars are unset (preview deploys, local dev) —
 * lets the upgrade page render "billing not yet enabled" copy instead of 500.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBillingConfigured()) {
    return NextResponse.json(
      {
        error:
          'Billing is not yet enabled in this environment. Please try again later.',
        configured: false,
      },
      { status: 503 }
    )
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe client unavailable', configured: false },
      { status: 503 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Lazily create the Stripe customer the first time we charge. Persisting
  // the id lets the webhook correlate events back to the user, and lets the
  // billing portal route find it.
  let stripeCustomerId = user.stripeCustomerId
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    })
    stripeCustomerId = customer.id
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId },
    })
  }

  const baseUrl = getBaseUrl()

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: STRIPE_PRICE_ID_PAID_MONTHLY, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing/cancel`,
      // Metadata flows through to webhook events so we don't need to look up
      // the customer → user mapping there.
      metadata: { userId: user.id },
      subscription_data: {
        metadata: { userId: user.id },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('[billing/checkout] Stripe error:', err)
    return NextResponse.json(
      { error: 'Failed to start checkout. Please try again.' },
      { status: 502 }
    )
  }
}
