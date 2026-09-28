import { NextResponse } from 'next/server'

import { readJson } from '@/server/route'
import {
  addSecret,
  getSettings,
  listSecrets,
  removeSecret,
  updateSettings,
  WebhookInputError,
} from '@/server/webhookLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function fail(err: unknown) {
  if (err instanceof WebhookInputError) return NextResponse.json({ error: err.message }, { status: 400 })
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({ settings: getSettings(), secrets: listSecrets() })
}

/** Đổi mã trả về / độ trễ. */
export async function PATCH(req: Request) {
  try {
    const body = await readJson<{ respondStatus?: unknown; respondDelayMs?: unknown }>(req)
    return NextResponse.json({ settings: updateSettings(body) })
  } catch (err) {
    return fail(err)
  }
}

/** Thêm secret `{label, value}` — value là chuỗi whsec_… hiện một lần lúc đăng ký. */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ label?: unknown; value?: unknown }>(req)
    return NextResponse.json({ secret: addSecret(body.label, body.value), secrets: listSecrets() })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const removed = removeSecret(id)
  return NextResponse.json({ removed, secrets: listSecrets() }, { status: removed ? 200 : 404 })
}
