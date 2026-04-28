export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/<job-name>
 *
 * CUSTOMIZE: rename the parent folder, replace the work block, and
 * update vercel.json's `path` and `schedule` fields.
 *
 * Vercel sets `Authorization: Bearer ${CRON_SECRET}` on cron invocations.
 * We require it — without the header, the endpoint 401s.
 *
 * Make jobs idempotent — Vercel may retry. Tracking what's been processed
 * (via DB row state, last-run timestamp, etc.) keeps re-runs safe.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // CUSTOMIZE: do the work. Examples:
  //   - Send daily digest emails
  //   - Aggregate yesterday's metrics
  //   - Clean up expired tokens
  //   - Sync data from a partner API
  const processed = 0
  const failed = 0

  return NextResponse.json({
    ok: true,
    processed,
    failed,
  })
}
