/**
 * Plan resolution + paywall enforcement.
 *
 * `getUserPlan(userId)` is the single source of truth: a User is 'paid' iff
 * their Subscription row has status 'active' or 'trialing'. Every other
 * status (past_due, canceled, unpaid, incomplete, no row at all) → 'free'.
 *
 * Write-boundary enforcement uses `assertCan*` helpers — they throw
 * PaywallError, which the route catches and turns into HTTP 402 via
 * `handlePaywallError()`. Reads are never gated; downgraded users keep
 * existing rows but cannot create new ones above the free limits.
 *
 * CUSTOMIZE: replace the example assertCan* helpers with the gates your
 * project actually needs. Free-tier limits below are starting placeholders.
 */

import { prisma } from '@/lib/prisma'
import { PaywallError } from '@/lib/paywall-error'

export type Plan = 'free' | 'paid'

// CUSTOMIZE: Free-tier caps for your app. Reflect these in your /upgrade
// page copy and any docs that describe the plan.
export const FREE_TIER_LIMITS = {
  // Examples — replace with what makes sense:
  // resourcesPerUser: 1,
  // membersPerResource: 5,
} as const

const PAID_STATUSES = new Set(['active', 'trialing'])

/**
 * Reads Subscription state for a user and returns the derived plan.
 * Cheap — single indexed lookup. Called once per session callback hit.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  if (!userId) return 'free'
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true },
  })
  if (!sub) return 'free'
  return PAID_STATUSES.has(sub.status) ? 'paid' : 'free'
}

interface PlanUser {
  id: string
  plan?: Plan
}

async function resolvePlan(user: PlanUser): Promise<Plan> {
  return user.plan ?? (await getUserPlan(user.id))
}

/**
 * EXAMPLE assertCan* helper — gates a paid-only feature with no quantity.
 * CUSTOMIZE: rename, adapt, or delete based on your real gates.
 */
export async function assertCanUsePremiumFeature(user: PlanUser): Promise<void> {
  const plan = await resolvePlan(user)
  if (plan === 'paid') return
  throw new PaywallError(
    'example_premium_feature',
    'This feature requires a paid plan.'
  )
}

/**
 * EXAMPLE assertCan* helper — gates a per-resource quantity limit.
 * CUSTOMIZE: replace `prisma.resource.count` with your actual model.
 */
// export async function assertCanCreateResource(user: PlanUser): Promise<void> {
//   const plan = await resolvePlan(user)
//   if (plan === 'paid') return
//   const count = await prisma.resource.count({ where: { ownerId: user.id } })
//   if (count >= FREE_TIER_LIMITS.resourcesPerUser) {
//     throw new PaywallError(
//       'example_per_resource_limit',
//       `Free plan supports ${FREE_TIER_LIMITS.resourcesPerUser} resource. Upgrade for more.`
//     )
//   }
// }
