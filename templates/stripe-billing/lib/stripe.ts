/**
 * Stripe client wrapper with dev fallback.
 *
 * Pattern: `getStripe()` returns null when STRIPE_SECRET_KEY is missing.
 * Routes that need a real charge surface should bail with HTTP 503 (not 500).
 * Local dev, preview deploys, and CI all stay free of accidental real charges.
 *
 * Test mode vs. live mode is determined entirely by which key you set
 * (`sk_test_*` vs `sk_live_*`) — Stripe routes the call accordingly.
 */

import Stripe from 'stripe'

let cached: Stripe | null = null

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!cached) {
    cached = new Stripe(key, {
      // CUSTOMIZE: Pin to a current Stripe API version. Don't change without
      // re-testing webhook payload shapes.
      apiVersion: '2026-04-22.dahlia',
      // CUSTOMIZE: app name and version for Stripe's request logs.
      appInfo: { name: 'MyApp', version: '0.1.0' },
    })
  }
  return cached
}

/**
 * Whether billing is fully configured for real (production) use.
 * False on local dev / preview unless all three env vars are set.
 */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_ID_PAID_MONTHLY
  )
}

export const STRIPE_PRICE_ID_PAID_MONTHLY =
  process.env.STRIPE_PRICE_ID_PAID_MONTHLY || ''

/**
 * Fetch the configured paid-plan price from Stripe and return a display
 * snapshot. Returns null when Stripe isn't configured, the price id is
 * missing, or the live lookup fails.
 *
 * Cached briefly so we don't hit Stripe on every page render.
 */
export interface PaidPlanPrice {
  amount: number
  currency: string
  interval: 'day' | 'week' | 'month' | 'year' | null
  intervalCount: number
  formatted: string
}

let cachedPrice: { value: PaidPlanPrice | null; expiresAt: number } | null = null
const PRICE_TTL_MS = 5 * 60 * 1000

export async function getPaidPlanPrice(): Promise<PaidPlanPrice | null> {
  if (cachedPrice && cachedPrice.expiresAt > Date.now()) {
    return cachedPrice.value
  }

  const stripe = getStripe()
  if (!stripe || !STRIPE_PRICE_ID_PAID_MONTHLY) {
    cachedPrice = { value: null, expiresAt: Date.now() + PRICE_TTL_MS }
    return null
  }

  try {
    const price = await stripe.prices.retrieve(STRIPE_PRICE_ID_PAID_MONTHLY)
    if (!price.unit_amount) {
      cachedPrice = { value: null, expiresAt: Date.now() + PRICE_TTL_MS }
      return null
    }
    const amount = price.unit_amount / 100
    const currency = price.currency.toUpperCase()
    const interval = price.recurring?.interval ?? null
    const intervalCount = price.recurring?.interval_count ?? 1
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
    const value: PaidPlanPrice = {
      amount,
      currency,
      interval,
      intervalCount,
      formatted,
    }
    cachedPrice = { value, expiresAt: Date.now() + PRICE_TTL_MS }
    return value
  } catch (err) {
    console.error('[stripe] failed to retrieve paid plan price:', err)
    cachedPrice = { value: null, expiresAt: Date.now() + PRICE_TTL_MS }
    return null
  }
}
