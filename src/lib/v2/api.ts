import { request } from '../client'

/** Cấu hình runtime của các trang `/v2/*` — xem `src/app/api/v2/config/route.ts`. */
export type KairoConfigV2 = {
  runtime: 'server' | 'dev-machine'
  graphqlUrl: string
  wsUrl: string
  livekitUrl: string | null
  /** Bundle v2: `…/sdk/v2/kairo-widget.js`. */
  widgetUrl: string
  /** Slug tenant cho widget khách (KAIRO_GUEST_TENANT). */
  guestTenant: string
  /** Slug tenant của app-key (KAIRO_TENANT_SLUG, mặc định = guestTenant) — panel, danh sách, đăng ký. */
  tenantSlug: string
  /** Web-enduser cùng cụm; null = không in link. */
  enduserUrl: string | null
  fixedUser: { userId: string; email: string; displayName: string; roles: string[] }
}

export function fetchConfigV2(signal: AbortSignal): Promise<KairoConfigV2> {
  return request<KairoConfigV2>('/api/v2/config', { signal })
}

// ───────────────────────── token phiên ─────────────────────────

export type SessionV2 = {
  token: string
  expiresAt: string
  user: { userId: string; email: string; displayName: string }
}

/** Xin token mới khi hạn còn dưới ngần này, để không đứt giữa chừng. */
const RENEW_BEFORE_MS = 120_000

let cached: SessionV2 | null = null
let inflight: Promise<SessionV2> | null = null

function stillFresh(s: SessionV2): boolean {
  const at = Date.parse(s.expiresAt)
  return Number.isFinite(at) && at > Date.now() + RENEW_BEFORE_MS
}

/**
 * Một token cho cả trang — danh sách, panel và panel trong `split` dùng CHUNG, đúng như bên tích
 * hợp thật đúc một phiên cho một lần đăng nhập. Mỗi lời gọi `/api/v2/session` là một phiên mới
 * ở Kairo nên không được xin lại mỗi lần đổi hội thoại.
 */
export function getSessionV2(): Promise<SessionV2> {
  if (cached && stillFresh(cached)) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = request<SessionV2>('/api/v2/session', { method: 'POST' })
    .then((s) => {
      cached = s
      return s
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Vứt token đang giữ — gọi khi bundle báo `onSessionEnded` hoặc trước khi thử lại. */
export function clearSessionV2(): void {
  cached = null
}

// ───────────────────────── hội thoại (REST phía server) ─────────────────────────

export type RestConversation = {
  id: string
  kind: string
  title: string
  createdAt: string
  archived: boolean
  memberCount: number
  memberRole: string
}

export async function fetchRestConversations(signal: AbortSignal): Promise<RestConversation[]> {
  const body = await request<{ conversations?: RestConversation[] }>('/api/v2/conversations', { signal })
  return body.conversations ?? []
}

export type IssuedInvitation = { invitationId: string; expiresAt: string; link: string | null; token: string | null }

export type CreateResult = { conversationId: string; kind: string; invitations: IssuedInvitation[] }

export type CreateInput =
  | { kind: 'direct'; peerEmail: string }
  | { kind: 'group'; title: string; memberEmails: string[] }
  | { kind: 'business'; title: string; memberEmails: string[]; invitationCount: number }

export function createConversation(input: CreateInput): Promise<CreateResult> {
  return request<CreateResult>('/api/v2/conversations', { method: 'POST', body: JSON.stringify(input) })
}

export function issueInvitations(conversationId: string, invitationCount: number): Promise<CreateResult> {
  return request<CreateResult>(`/api/v2/conversations/${encodeURIComponent(conversationId)}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ invitationCount }),
  })
}

// ───────────────────────── tự tạo tài khoản ─────────────────────────

export type SignupInput = {
  email: string
  displayName: string
  externalId?: string
  requestKey: string
  openDirect: boolean
}

export type SignupResult = {
  /** created · existing · initialized */
  result: string
  replayed: boolean
  password: string | null
  credentialsReady: boolean
  issuedAt: string | null
  user: { userId: string; email: string; displayName: string; roles: string[] } | null
  loginUrl: string | null
  tenantSlug: string
  direct: { conversationId: string | null; error: string | null } | null
}

export function signup(input: SignupInput): Promise<SignupResult> {
  return request<SignupResult>('/api/v2/signup', { method: 'POST', body: JSON.stringify(input) })
}

/** Mã lượt gửi: sinh MỘT lần mỗi lượt điền form, gửi lại y nguyên khi bấm lại (idempotency). */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
