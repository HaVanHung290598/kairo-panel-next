import { NextResponse } from 'next/server'

import { CURRENT_USER, callSdk, describeSdkError } from '@/server/kairo'

export const dynamic = 'force-dynamic'

type MintedToken = { token: string; expiresAt: string }

/**
 * Cấp browser user-session ngắn hạn cho nhân viên đang đăng nhập.
 *
 * Hai bước theo đúng REST SDK của Kairo: bảo đảm user tồn tại, rồi mint token.
 * App-key nằm lại ở server, response chỉ có token của chính user đó.
 */
export async function POST() {
  const provision = await callSdk('/v1/users', {
    method: 'POST',
    body: JSON.stringify({ externalId: CURRENT_USER.id, displayName: CURRENT_USER.displayName }),
  })
  if (!provision.ok) {
    return NextResponse.json({ error: `Tạo user trên Kairo thất bại: ${describeSdkError(provision)}` }, { status: 502 })
  }

  const minted = await callSdk<MintedToken>('/v1/tokens', {
    method: 'POST',
    body: JSON.stringify({ externalId: CURRENT_USER.id }),
  })
  if (!minted.ok || !minted.body) {
    return NextResponse.json({ error: `Xin token thất bại: ${describeSdkError(minted)}` }, { status: 502 })
  }

  return NextResponse.json({
    token: minted.body.token,
    expiresAt: minted.body.expiresAt,
    user: CURRENT_USER,
  })
}
