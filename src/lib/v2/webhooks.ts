import { request } from '../client'

/** Khuôn trả về của `src/server/webhookLog.ts` — giữ khớp tay (file đó là server-only). */
export type SignatureStatus = 'valid' | 'invalid' | 'no-secret' | 'missing'

export type WebhookEntry = {
  seq: number
  id: string
  receivedAt: string
  channel: string
  source: 'network' | 'self-test'
  event: string | null
  headers: Record<string, string>
  remoteIp: string | null
  bodyBytes: number
  bodyText: string
  bodyTruncated: boolean
  json: unknown
  jsonError: string | null
  signature: {
    status: SignatureStatus
    matched: string | null
    mode: 'decoded' | 'literal' | null
    timestamp: number | null
    skewSec: number | null
    reverified?: boolean
  }
  duplicateOf: number | null
  response: { status: number; delayMs: number }
}

export type WebhookSettings = { respondStatus: number; respondDelayMs: number }
export type PublicSecret = { id: string; label: string; hint: string; format: string }

export type LogPage = {
  entries: WebhookEntry[]
  lastSeq: number
  rev: number
  total: number
  capacity: number
  startedAt: string
  settings: WebhookSettings
  secrets: PublicSecret[]
  publicUrl: string | null
}

export function fetchWebhookLog(after: number, signal?: AbortSignal): Promise<LogPage> {
  return request<LogPage>(`/api/webhooks/log?after=${after}`, { signal })
}

export function clearWebhookLog(): Promise<unknown> {
  return request('/api/webhooks/log', { method: 'DELETE' })
}

export function saveWebhookSettings(patch: Partial<WebhookSettings>): Promise<{ settings: WebhookSettings }> {
  return request('/api/webhooks/settings', { method: 'PATCH', body: JSON.stringify(patch) })
}

export function addWebhookSecret(label: string, value: string): Promise<{ secrets: PublicSecret[] }> {
  return request('/api/webhooks/settings', { method: 'POST', body: JSON.stringify({ label, value }) })
}

export function removeWebhookSecret(id: string): Promise<{ secrets: PublicSecret[] }> {
  return request(`/api/webhooks/settings?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function fireSelfTest(input: {
  event: string
  secretId: string | null
  tamper: boolean
  channel: string
}): Promise<{ seq: number; signature: SignatureStatus }> {
  return request('/api/webhooks/test', { method: 'POST', body: JSON.stringify(input) })
}

/** Chín sự kiện màn "Đăng ký webhook" cho tick — thứ tự và nhóm như bên web-tenant-admin. */
export const WEBHOOK_EVENTS: { value: string; group: string; label: string }[] = [
  { value: 'message.received', group: 'Tin nhắn', label: 'Có tin nhắn mới' },
  { value: 'conversation.started', group: 'Tin nhắn', label: 'Hội thoại mới mở' },
  { value: 'partner.message', group: 'Tin nhắn', label: 'Kênh nghiệp vụ có tin từ đối tác' },
  { value: 'conversation.created', group: 'Thành viên', label: 'Hội thoại mới tạo' },
  { value: 'conversation.member_added', group: 'Thành viên', label: 'Có người được thêm' },
  { value: 'conversation.member_removed', group: 'Thành viên', label: 'Có người bị gỡ hoặc rời' },
  { value: 'notification.message', group: 'Thông báo', label: 'Tin nhắn mới cần báo' },
  { value: 'notification.call', group: 'Thông báo', label: 'Cuộc gọi đến' },
  { value: 'notification.activity', group: 'Thông báo', label: 'Hoạt động: nhắc tên, trả lời, gọi nhỡ…' },
]
