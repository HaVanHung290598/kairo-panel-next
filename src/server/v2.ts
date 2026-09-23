/**
 * Nghiệp vụ REST SDK v2 dùng cho các trang `/v2/*` — vẫn chỉ chạy ở server (app-key).
 *
 * Hợp đồng gốc ở repo kairos-viper: `deployment/local/loop24/PROVISION-API.md`,
 * `deployment/local/loop24/CONVERSATION-API.md`, `deployment/local/loop25/SDK-V21-WEBHOOK.md`.
 */
import 'server-only'

import { randomUUID } from 'node:crypto'

import { callSdkV2, describeSdkError, sdkErrorCode, type SdkResult } from './kairo'

/** Lỗi nghiệp vụ trả thẳng cho trang: `status` là HTTP của route này, `message` là câu cho người. */
export class V2Error extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'V2Error'
    this.status = status
    this.code = code
  }
}

function fail(what: string, result: SdkResult<unknown>): never {
  // 4xx của SDK là lỗi của người dùng (email sai, không có quyền…) → giữ 4xx; còn lại là 502.
  const status = result.status >= 400 && result.status < 500 ? result.status : 502
  throw new V2Error(`${what}: ${describeSdkError(result)}`, status, sdkErrorCode(result))
}

// ───────────────────────── danh tính ─────────────────────────

export type V2User = {
  userId: string
  externalId: string
  email: string
  displayName: string
  status: string
  member: boolean
  roles: string[]
}

type Selector = { userId: string } | { email: string } | { externalId: string }

type ResolveBody = { found: boolean; locked?: boolean; member?: boolean; origin?: string; user?: V2User }

export async function resolveUser(selector: Selector): Promise<V2User | null> {
  const r = await callSdkV2<ResolveBody>('/users/resolve', { method: 'POST', body: JSON.stringify(selector) })
  if (!r.ok || !r.body) fail('Tra người dùng thất bại', r)
  if (!r.body.found || !r.body.user) return null
  return r.body.user
}

export async function requireUserByEmail(email: string): Promise<V2User> {
  const user = await resolveUser({ email: email.trim().toLowerCase() })
  if (!user) throw new V2Error(`Không có người dùng ${email} trong tenant này.`, 404, 'not_found')
  if (!user.member || user.status !== 'active') {
    throw new V2Error(`${email} không còn là thành viên đang hoạt động của tenant.`, 409, 'member_removed')
  }
  return user
}

/**
 * Người "đang đăng nhập" của phần mềm doanh nghiệp ở các trang v2 — một user CÓ SẴN của tenant
 * (khác v1: v1 tự đẻ user bằng externalId qua `/v1/users`). Chọn bằng `DEMO_V2_USER_EMAIL`
 * hoặc `DEMO_V2_USER_ID`, BẮT BUỘC khai theo từng môi trường — không có mặc định, vì mỗi cụm
 * một tenant, một bộ người (cụm .33: huy@cardoctor.vn).
 */
export async function fixedUser(): Promise<V2User> {
  const id = process.env['DEMO_V2_USER_ID']
  const email = process.env['DEMO_V2_USER_EMAIL']
  if (!id && !email) {
    throw new V2Error('Chưa khai DEMO_V2_USER_EMAIL (hoặc DEMO_V2_USER_ID) — user cố định của các trang v2.', 500)
  }
  const user = id ? await resolveUser({ userId: id }) : await resolveUser({ email: email! })
  if (!user) {
    throw new V2Error(
      `User cố định của trang v2 (${id ?? email}) không có trong tenant của app-key — sửa DEMO_V2_USER_EMAIL.`,
      500,
    )
  }
  return user
}

export type V2Token = { token: string; sessionId: string; expiresAt: string; userId: string }

export async function mintToken(userId: string): Promise<V2Token> {
  const r = await callSdkV2<V2Token>('/tokens', {
    method: 'POST',
    body: JSON.stringify({ userId, deviceLabel: 'kairo-panel-next' }),
  })
  if (!r.ok || !r.body) fail('Xin token phiên v2 thất bại', r)
  return r.body
}

// ───────────────────────── tự tạo tài khoản ─────────────────────────

/** `externalId` bắt buộc ở SDK (≤255 ký tự) — route signup tự đặt khi người dùng bỏ trống. */
export type ProvisionInput = { email: string; displayName: string; externalId: string }

export type ProvisionOutcome = {
  requestId: string
  replayed: boolean
  /** created · existing · initialized · error */
  result: string
  user: V2User | null
  password: string | null
  credentialsReady: boolean
  issuedAt: string | null
  flags: Record<string, boolean>
}

type ProvisionItem = {
  result?: string
  user?: V2User | null
  password?: string | null
  credentialsReady?: boolean
  flags?: Record<string, boolean>
  error?: { code?: string; message?: string } | string
}

type ProvisionReport = ProvisionItem & {
  requestId?: string
  state?: string
  replayed?: boolean
  issuedAt?: string
  results?: ProvisionItem[]
}

function outcomeOf(report: ProvisionReport): ProvisionOutcome {
  // Route đơn trả các trường ở gốc; poll trả `results[]` kể cả khi chỉ một người.
  const item: ProvisionItem = report.results?.[0] ?? report
  if (item.result === 'error') {
    const err = item.error
    const message = typeof err === 'object' ? (err?.message ?? err?.code) : err
    const code = typeof err === 'object' ? (err?.code ?? null) : null
    throw new V2Error(`Không tạo được tài khoản: ${message ?? 'lỗi không rõ'}`, 409, code)
  }
  return {
    requestId: report.requestId ?? '',
    replayed: Boolean(report.replayed),
    result: item.result ?? 'unknown',
    user: item.user ?? null,
    password: item.password ?? null,
    credentialsReady: Boolean(item.credentialsReady),
    issuedAt: report.issuedAt ?? null,
    flags: item.flags ?? {},
  }
}

const POLL_BUDGET_MS = 90_000

/**
 * Cấp một tài khoản đăng nhập được ngay trên web-enduser (`POST /sdk/v2/users`).
 *
 * `idempotencyKey` do TRÌNH DUYỆT sinh một lần cho mỗi lượt điền form: bấm lại / mạng chập thì
 * SDK trả đúng kết quả cũ (kể cả mật khẩu, trong 24 giờ) thay vì tạo thêm hay đặt lại.
 * SDK chờ tối đa 120 giây rồi trả 202 + Location → hỏi lại tới khi xong.
 */
export async function provisionUser(input: ProvisionInput, idempotencyKey: string): Promise<ProvisionOutcome> {
  const body = {
    externalId: input.externalId.trim(),
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
  }

  const r = await callSdkV2<ProvisionReport>('/users', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
    timeoutMs: 130_000,
  })
  if (r.status === 202) return pollProvision(r)
  if (r.body && (r.ok || r.body.result === 'error')) return outcomeOf(r.body)
  fail('Không tạo được tài khoản', r)
}

async function pollProvision(first: SdkResult<ProvisionReport>): Promise<ProvisionOutcome> {
  const location = first.headers?.get('location') ?? ''
  const requestId = first.body?.requestId ?? location.split('/').pop() ?? ''
  if (!requestId) throw new V2Error('SDK trả 202 nhưng không có mã yêu cầu để hỏi lại.', 502)

  const deadline = Date.now() + POLL_BUDGET_MS
  while (Date.now() < deadline) {
    const wait = Number(first.headers?.get('retry-after') ?? '2')
    await new Promise((ok) => setTimeout(ok, Math.max(1, Math.min(wait, 10)) * 1000))
    const r = await callSdkV2<ProvisionReport>(`/provisioning/${encodeURIComponent(requestId)}`)
    if (r.status === 202) continue
    if (r.ok && r.body) return outcomeOf(r.body)
    fail('Hỏi lại kết quả tạo tài khoản thất bại', r)
  }
  throw new V2Error(
    `Kairo vẫn đang tạo tài khoản (mã yêu cầu ${requestId}). Bấm "Tạo tài khoản" lần nữa — cùng form sẽ nhận lại đúng kết quả.`,
    504,
  )
}

// ───────────────────────── hội thoại ─────────────────────────

export type V2Conversation = {
  id: string
  kind: string
  title: string
  createdAt: string
  archived: boolean
  memberCount: number
  memberRole: string
  memberUserIds?: string[]
  truncated?: boolean
}

export async function listConversations(userId: string): Promise<V2Conversation[]> {
  const all: V2Conversation[] = []
  let cursor = ''
  // Tối đa 5 trang × 200 — đủ cho người dùng demo; trang thật nên phân trang ở UI.
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: '200' })
    if (cursor) qs.set('cursor', cursor)
    const r = await callSdkV2<{ conversations?: V2Conversation[]; nextCursor?: string }>(
      `/users/${encodeURIComponent(userId)}/conversations?${qs}`,
    )
    if (!r.ok || !r.body) fail('Không lấy được danh sách hội thoại', r)
    all.push(...(r.body.conversations ?? []))
    cursor = r.body.nextCursor ?? ''
    if (!cursor) break
  }
  return all
}

/** Tên người dùng theo id — sống cả vòng đời tiến trình; tên người trong tenant hiếm khi đổi. */
const displayNameCache = new Map<string, string>()

/**
 * Tên người kia của mỗi hội thoại 1-1 (id hội thoại → tên). Tra song song từng nhóm nhỏ để không
 * dội SDK; người không tra được thì bỏ qua (thanh tiêu đề tự lùi về "Hội thoại 1-1").
 */
export async function peerNames(meId: string, conversations: V2Conversation[]): Promise<Map<string, string>> {
  const peerOf = new Map<string, string>()
  for (const c of conversations) {
    const peer = c.kind === 'direct' ? c.memberUserIds?.find((id) => id !== meId) : undefined
    if (peer) peerOf.set(c.id, peer)
  }
  const missing = [...new Set(peerOf.values())].filter((id) => !displayNameCache.has(id))
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(
      missing.slice(i, i + 8).map(async (userId) => {
        try {
          const u = await resolveUser({ userId })
          if (u?.displayName) displayNameCache.set(userId, u.displayName)
        } catch {
          /* Một người tra lỗi không làm hỏng cả danh sách. */
        }
      }),
    )
  }
  const out = new Map<string, string>()
  for (const [cid, uid] of peerOf) {
    const name = displayNameCache.get(uid)
    if (name) out.set(cid, name)
  }
  return out
}

export async function createDirect(actorUserId: string, peerUserId: string): Promise<{ conversationId: string }> {
  const r = await callSdkV2<{ conversationId: string }>('/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ actorUserId, peerUserId }),
  })
  if (!r.ok || !r.body) fail('Không mở được hội thoại 1-1', r)
  return r.body
}

export type Issued = {
  conversationId: string
  clientRequestId?: string
  issuedAt?: string
  replayed?: boolean
  invitations: { invitationId: string; token: string; expiresAt: string }[]
}

export async function createGroup(actorUserId: string, title: string, memberUserIds: string[]): Promise<Issued> {
  const r = await callSdkV2<Issued>('/conversations/groups', {
    method: 'POST',
    body: JSON.stringify({ actorUserId, clientRequestId: randomUUID(), title, memberUserIds }),
  })
  if (!r.ok || !r.body) fail('Không tạo được nhóm', r)
  return r.body
}

export async function createBusiness(
  actorUserId: string,
  title: string,
  memberUserIds: string[],
  invitationCount: number,
): Promise<Issued> {
  const r = await callSdkV2<Issued>('/conversations/business', {
    method: 'POST',
    body: JSON.stringify({ actorUserId, clientRequestId: randomUUID(), title, memberUserIds, invitationCount }),
  })
  if (!r.ok || !r.body) fail('Không tạo được kênh nghiệp vụ', r)
  return r.body
}

export async function issueInvitations(
  actorUserId: string,
  conversationId: string,
  invitationCount: number,
): Promise<Issued> {
  const r = await callSdkV2<Issued>(`/conversations/${encodeURIComponent(conversationId)}/partner-invitations`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId, clientRequestId: randomUUID(), invitationCount }),
  })
  if (!r.ok || !r.body) fail('Không cấp được link mời đối tác', r)
  return r.body
}

/** Link đối tác mở trên web-enduser để chấp nhận lời mời — đúng khuôn của hợp đồng v2. */
export function invitationLink(enduserUrl: string | null, token: string): string | null {
  return enduserUrl ? `${enduserUrl}/doi-tac/moi?token=${encodeURIComponent(token)}` : null
}
