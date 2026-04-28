export const dynamic = 'force-dynamic'

import { createFeedbackHandler } from '@metis-ai-research/feedback/server'
import { linearAdapter } from '@metis-ai-research/feedback/adapters/linear'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Feedback intake endpoint. Posts to Linear when LINEAR_API_KEY +
 * LINEAR_TEAM_ID are set; returns 503 in dev so previews don't ping Linear.
 *
 * Auth context: we override client-supplied userId/email/name with the
 * authoritative session values so users can't impersonate via the form.
 */

const linearApiKey = process.env.LINEAR_API_KEY ?? ''
const linearTeamId = process.env.LINEAR_TEAM_ID ?? ''

const POST_HANDLER = linearApiKey && linearTeamId
  ? createFeedbackHandler({
      adapter: linearAdapter({
        apiKey: linearApiKey,
        teamId: linearTeamId,
        projectId: process.env.LINEAR_PROJECT_ID || undefined,
        labelMap: buildLabelMap(),
      }),
      enrichPayload: async (_payload, _request) => {
        const session = await getServerSession(authOptions)
        if (!session?.user) return {}
        return {
          userContext: {
            userId: session.user.id,
            userEmail: session.user.email ?? undefined,
            userName: session.user.name ?? undefined,
          },
          metadata: {
            // CUSTOMIZE: add any session fields useful for triage.
            sessionRole: session.user.role,
          },
        }
      },
    })
  : null

export async function POST(request: Request): Promise<Response> {
  if (!POST_HANDLER) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Feedback inbox is not configured in this environment.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return POST_HANDLER(request)
}

function buildLabelMap() {
  const map: Record<string, string[]> = {}
  if (process.env.LINEAR_LABEL_BUG) map.bug = [process.env.LINEAR_LABEL_BUG]
  if (process.env.LINEAR_LABEL_FEEDBACK) map.feedback = [process.env.LINEAR_LABEL_FEEDBACK]
  if (process.env.LINEAR_LABEL_FEATURE) map.feature = [process.env.LINEAR_LABEL_FEATURE]
  return Object.keys(map).length > 0
    ? (map as Partial<Record<'bug' | 'feedback' | 'feature', string[]>>)
    : undefined
}
