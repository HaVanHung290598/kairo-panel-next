import { NextResponse } from 'next/server'

import { record } from '@/server/webhookLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Trần thân request — payload thật chỉ vài trăm byte; lớn hơn là rác, cắt để khỏi đầy bộ nhớ. */
const MAX_BODY = 1024 * 1024

type Ctx = { params: Promise<{ channel?: string[] }> }

/** `/api/webhooks/kairo/<kênh>` — kênh là nhãn tuỳ chọn để tách nhiều endpoint đăng ký cùng lúc. */
async function channelOf(ctx: Ctx): Promise<string> {
  const { channel } = await ctx.params
  const joined = (channel ?? []).join('-')
  let raw = joined
  try {
    raw = decodeURIComponent(joined)
  } catch {
    // %xx hỏng — giữ nguyên, bước lọc dưới tự bỏ ký tự lạ
  }
  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40)
  return clean || 'mac-dinh'
}

function remoteIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip') || null
}

async function readCapped(req: Request): Promise<{ body: Buffer; oversize: boolean }> {
  if (!req.body) return { body: Buffer.alloc(0), oversize: false }
  const reader = req.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      await reader.cancel()
      return { body: Buffer.concat(chunks), oversize: true }
    }
    chunks.push(Buffer.from(value))
  }
  return { body: Buffer.concat(chunks), oversize: false }
}

/**
 * Điểm NHẬN webhook — dán URL này vào "Đăng ký webhook" ở web-tenant-admin (SDK & Tích hợp).
 * Mọi request đều được ghi sổ (kể cả chữ ký sai), rồi trả mã/độ trễ đang cài ở trang /v2/webhook.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { body, oversize } = await readCapped(req)
  const entry = record({
    channel: await channelOf(ctx),
    source: 'network',
    headers: req.headers,
    body,
    oversize,
    remoteIp: remoteIp(req),
  })
  if (oversize) return NextResponse.json({ error: 'Thân vượt 1 MB.' }, { status: 413 })
  const { status, delayMs } = entry.response
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  if (status === 204) return new NextResponse(null, { status })
  return NextResponse.json({ received: true, seq: entry.seq, signature: entry.signature.status }, { status })
}

/** Mở bằng trình duyệt để kiểm đường thông — Kairo chỉ POST. */
export async function GET(_req: Request, ctx: Ctx) {
  return NextResponse.json({
    ok: true,
    channel: await channelOf(ctx),
    hint: 'Điểm nhận webhook Kairo — gửi bằng POST. Xem log ở /v2/webhook.',
  })
}
