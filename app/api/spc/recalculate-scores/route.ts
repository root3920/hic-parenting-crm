import { NextRequest, NextResponse } from 'next/server'
import { recalculateAllScores } from '../_scoring'

const SYNC_SECRET = 'hic_sync_2026'

// GET /api/spc/recalculate-scores
// Header: x-sync-secret: hic_sync_2026
export async function GET(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await recalculateAllScores()
  return NextResponse.json(result)
}

// POST /api/spc/recalculate-scores
export async function POST() {
  const result = await recalculateAllScores()
  return NextResponse.json(result)
}
