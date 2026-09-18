import { request } from './client'

/**
 * Một hồ sơ nghiệp vụ của phần mềm doanh nghiệp, đã nối với một kênh Kairo.
 *
 * `id` là khoá bản ghi bên doanh nghiệp (đơn sửa chữa, hợp đồng…);
 * `kairoConversationId` là kênh Kairo tương ứng — hai giá trị độc lập.
 */
export type ConversationRecord = {
  id: string
  title: string
  kairoConversationId: string
  lastMessageAt: string | null
  partnerTenantNames: string[]
}

export async function fetchRecords(signal: AbortSignal): Promise<ConversationRecord[]> {
  const body = await request<{ records?: ConversationRecord[] }>('/api/records', { signal })
  return body.records ?? []
}
