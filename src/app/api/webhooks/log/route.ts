import { NextResponse } from 'next/server'

import { clearLog, readLog } from '@/server/webhookLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** `?after=<seq>` — chỉ trả các bản ghi mới hơn seq đó (trang poll mỗi vài giây). */
export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get('after') ?? '0')
  return NextResponse.json(readLog(Number.isFinite(after) && after > 0 ? after : 0))
}

export async function DELETE() {
  clearLog()
  return NextResponse.json({ cleared: true })
}
