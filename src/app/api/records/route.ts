import { NextResponse } from 'next/server'

import { callSdk, describeSdkError } from '@/server/kairo'

export const dynamic = 'force-dynamic'

type SdkConversation = {
  id: string
  title: string
  lastMessageAt?: string | null
  partnerTenantNames?: string[]
}

/** Danh sách hội thoại nghiệp vụ thật của tenant gắn với app-key này. */
export async function GET() {
  const list = await callSdk<{ conversations?: SdkConversation[] }>('/v1/business-conversations')
  if (!list.ok || !list.body) {
    return NextResponse.json({ error: `Lấy danh sách hồ sơ thất bại: ${describeSdkError(list)}` }, { status: 502 })
  }

  const records = (list.body.conversations ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    kairoConversationId: c.id,
    lastMessageAt: c.lastMessageAt ?? null,
    partnerTenantNames: c.partnerTenantNames ?? [],
  }))

  return NextResponse.json({ records })
}
