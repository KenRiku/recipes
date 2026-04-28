import { NextResponse } from 'next/server'

/**
 * Paid-tier capability codes. Each one maps to a specific blocked write
 * action. Your /upgrade page can tailor copy off `?feature=<code>` so the
 * user lands looking at the exact capability they tried to use.
 *
 * CUSTOMIZE: replace these example codes with the actual paid features
 * your app gates on.
 */
export type PaywallFeature =
  | 'example_premium_feature'
  | 'example_per_resource_limit'

/**
 * Thrown by `assertCan*` helpers in `lib/plan.ts` when a free user tries
 * a paid-tier action. Caught by API route handlers via
 * `handlePaywallError(err)` → HTTP 402 with a `feature` code the client
 * uses to redirect to /upgrade.
 */
export class PaywallError extends Error {
  readonly feature: PaywallFeature

  constructor(feature: PaywallFeature, message?: string) {
    super(message ?? `Paid tier required for ${feature}`)
    this.name = 'PaywallError'
    this.feature = feature
  }
}

/**
 * Returns a 402 response if the error is a PaywallError; otherwise null
 * so the caller can re-throw or handle differently.
 *
 * Standard route shape:
 *   try { ...; assertCan*(user); ... }
 *   catch (err) {
 *     const r = handlePaywallError(err); if (r) return r;
 *     throw err
 *   }
 */
export function handlePaywallError(err: unknown): NextResponse | null {
  if (err instanceof PaywallError) {
    return NextResponse.json(
      { error: err.message, feature: err.feature },
      { status: 402 }
    )
  }
  return null
}
