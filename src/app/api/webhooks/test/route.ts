import { NextResponse } from 'next/server'

import { readJson } from '@/server/route'
import { record, samplePayload, signSample } from '@/server/webhookLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EVENTS = new Set([
  'message.received',
  'conversation.started',
  'partner.message',
  'conversation.created',
  'conversation.member_added',
  'conversation.member_removed',
  'notification.message',
  'notification.call',
  'notification.activity',
])

/**
 * Tự bắn một webhook mẫu vào chính bàn này (không đi qua Kairo) — để kiểm secret đã dán đúng
 * chưa và xem khuôn payload từng sự kiện trước khi có sự kiện thật. Bản ghi mang nhãn "tự thử".
 * `tamper=true` sửa thân sau khi ký — phải ra "chữ ký sai".
 */
export async function POST(req: Request) {
  let input: { event?: unknown; secretId?: unknown; tamper?: unknown; channel?: unknown }
  try {
    input = await readJson(req)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
  const event = typeof input.event === 'string' && EVENTS.has(input.event) ? input.event : null
  if (!event) return NextResponse.json({ error: 'Sự kiện ngoài danh sách.' }, { status: 400 })

  const payload = samplePayload(event, '00000000-0000-0000-0000-000000000000')
  const signedBody = Buffer.from(JSON.stringify(payload))
  const { ts, sig } = signSample(typeof input.secretId === 'string' ? input.secretId : null, signedBody)
  const body = input.tamper === true ? Buffer.from(JSON.stringify({ ...payload, tampered: true })) : signedBody

  const headers = new Headers({
    'content-type': 'application/json',
    'x-kairo-event': event,
    'x-kairo-timestamp': ts,
    'user-agent': 'kairo-panel-next/self-test',
  })
  if (sig) headers.set('x-kairo-signature', sig)

  const channel =
    typeof input.channel === 'string'
      ? input.channel
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '')
          .slice(0, 40)
      : ''
  const entry = record({ channel: channel || 'mac-dinh', source: 'self-test', headers, body, remoteIp: null })
  return NextResponse.json({ seq: entry.seq, signature: entry.signature.status })
}
