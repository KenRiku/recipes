export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, isBillingConfigured } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/base-url'

/**
 * POST /api/billing/portal
 *
 * Authenticated. Creates a Stripe Billing Portal session for the user's
 * Stripe customer and returns the hosted URL. The portal handles card
 * updates, plan cancellation, invoices — everything past initial signup.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: 'Billing not enabled in this environment.' },
      { status: 503 }
    )
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe unavailable' }, { status: 503 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No subscription to manage. Upgrade to Paid first.' },
      { status: 404 }
    )
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      // CUSTOMIZE: where the user lands after using the portal.
      return_url: `${getBaseUrl()}/settings`,
    })
    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('[billing/portal] Stripe error:', err)
    return NextResponse.json(
      { error: 'Failed to open billing portal. Please try again.' },
      { status: 502 }
    )
  }
}
