/**
 * Bàn thử NHẬN webhook của Kairo — sổ log trong bộ nhớ + kiểm chữ ký.
 *
 * Hợp đồng phía gửi (service `sdk` của kairos-viper, `internal/webhook/worker.go`):
 *   POST <url>  Content-Type: application/json
 *   X-Kairo-Event:     tên sự kiện (message.received, conversation.member_added, notification.call…)
 *   X-Kairo-Timestamp: giây Unix lúc ký
 *   X-Kairo-Signature: hex(HMAC-SHA256(khoá, ts + "." + body))
 * Khoá là 32 byte THÔ; màn "SDK & Tích hợp" chỉ hiện `whsec_<base64url(khoá)>` một lần lúc đăng ký,
 * nên người nhận phải giải base64url phần sau `whsec_` rồi mới ký — ký thẳng bằng cả chuỗi là sai.
 * Bàn này thử cả hai cách và ghi rõ cách nào khớp, để người tích hợp nhìn là biết mình sai ở đâu.
 *
 * Giao at-least-once, retry 1m → 5m → 30m khi không nhận 2xx (hoặc quá 10s) — nên có sẵn chế độ
 * trả 500 / trả chậm để xem lịch retry chạy thật.
 *
 * Sổ nằm trong bộ nhớ tiến trình (restart container là mất) — đủ cho bàn thử, không phải kho.
 */
import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const MAX_ENTRIES = 1000
/** Thân lớn hơn ngần này thì cắt khi lưu (vẫn ký trên thân đầy đủ). Payload thật chỉ vài trăm byte. */
const MAX_STORED_BODY = 64 * 1024
/** Lệch giờ quá ngần này thì đánh dấu — consumer thật nên từ chối để chống replay. */
export const SKEW_WARN_SEC = 300

export type SignatureStatus =
  | 'valid' // khớp một secret đã khai
  | 'invalid' // có chữ ký nhưng không khớp secret nào
  | 'no-secret' // chưa khai secret nào để kiểm
  | 'missing' // request không có X-Kairo-Signature/Timestamp

export type WebhookEntry = {
  seq: number
  id: string
  receivedAt: string
  /** Nhãn kênh lấy từ đường dẫn `/api/webhooks/kairo/<kênh>` — đăng ký nhiều endpoint thì tách được. */
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
    /** Nhãn secret khớp (status=valid). */
    matched: string | null
    /** `decoded` = đúng cách (giải whsec_), `literal` = ký bằng nguyên chuỗi — chỉ để chẩn đoán. */
    mode: 'decoded' | 'literal' | null
    timestamp: number | null
    skewSec: number | null
    /** Khớp khi kiểm LẠI lúc thêm secret (webhook tới trước khi có secret). */
    reverified?: boolean
  }
  /** Cùng chữ ký đã tới trước đó — giao lặp (retry, hoặc hai pod quét sát nhau). */
  duplicateOf: number | null
  response: { status: number; delayMs: number }
}

type Secret = { id: string; label: string; decoded: Buffer | null; literal: Buffer; hint: string }

export type WebhookSettings = {
  /** Mã trả cho bên gửi — khác 2xx là Kairo ghi thất bại và hẹn retry. */
  respondStatus: number
  /** Trả chậm — quá 10s là Kairo tính timeout. */
  respondDelayMs: number
}

type Store = {
  seq: number
  /** Tăng khi bản ghi CŨ bị sửa (kiểm lại chữ ký, xoá sổ) — trình duyệt thấy đổi thì đọc lại từ đầu. */
  rev: number
  entries: WebhookEntry[]
  secrets: Secret[]
  settings: WebhookSettings
  bySignature: Map<string, number>
  startedAt: string
}

// globalThis: `next dev` nạp lại module mỗi lần sửa file — không giữ ở đây là mất sổ mỗi lần lưu.
const g = globalThis as typeof globalThis & { __kairoWebhookStore?: Store }

function store(): Store {
  if (!g.__kairoWebhookStore) {
    g.__kairoWebhookStore = {
      seq: 0,
      rev: 0,
      entries: [],
      secrets: envSecrets(),
      settings: { respondStatus: 200, respondDelayMs: 0 },
      bySignature: new Map(),
      startedAt: new Date().toISOString(),
    }
  }
  return g.__kairoWebhookStore
}

/** `KAIRO_WEBHOOK_SECRETS=nhãn=whsec_…,nhãn2=whsec_…` — nạp sẵn lúc khởi động (không bắt buộc). */
function envSecrets(): Secret[] {
  const raw = process.env['KAIRO_WEBHOOK_SECRETS'] ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item, i) => {
      const eq = item.indexOf('=')
      const hasLabel = eq > 0 && !item.startsWith('whsec_')
      return makeSecret(hasLabel ? item.slice(0, eq) : `env-${i + 1}`, hasLabel ? item.slice(eq + 1) : item)
    })
}

function makeSecret(label: string, value: string): Secret {
  const v = value.trim()
  let decoded: Buffer | null = null
  if (v.startsWith('whsec_')) {
    const b = Buffer.from(v.slice('whsec_'.length), 'base64url')
    if (b.length > 0) decoded = b
  }
  return {
    id: randomUUID(),
    label: label.trim().slice(0, 60) || 'secret',
    decoded,
    literal: Buffer.from(v, 'utf8'),
    hint: v.length > 14 ? `${v.slice(0, 10)}…${v.slice(-4)}` : '…',
  }
}

export class WebhookInputError extends Error {}

// ───────────────────────── secret + cấu hình ─────────────────────────

export type PublicSecret = { id: string; label: string; hint: string; format: 'whsec' | 'chuỗi thường' }

/** Không bao giờ trả secret xuống trình duyệt — chỉ nhãn + gợi ý đầu/cuối. */
export function listSecrets(): PublicSecret[] {
  return store().secrets.map((s) => ({
    id: s.id,
    label: s.label,
    hint: s.hint,
    format: s.decoded ? 'whsec' : 'chuỗi thường',
  }))
}

export function addSecret(label: unknown, value: unknown): PublicSecret {
  const v = typeof value === 'string' ? value.trim() : ''
  if (v.length < 8) throw new WebhookInputError('Secret quá ngắn — dán nguyên chuỗi whsec_… lúc đăng ký webhook.')
  if (v.length > 400) throw new WebhookInputError('Secret quá dài.')
  if (/\s/.test(v)) throw new WebhookInputError('Secret không được chứa khoảng trắng.')
  const s = store()
  if (s.secrets.length >= 20) throw new WebhookInputError('Tối đa 20 secret — xoá bớt cái cũ.')
  const secret = makeSecret(typeof label === 'string' && label.trim() ? label : `secret-${s.secrets.length + 1}`, v)
  s.secrets.push(secret)
  reverifyPending()
  return listSecrets().find((x) => x.id === secret.id)!
}

/**
 * Webhook tới TRƯỚC khi dán secret (hoặc ký bằng secret chưa khai) được kiểm lại khi có secret mới —
 * nhờ vậy biết ngay nó thuộc môi trường nào. Chữ ký tính trên byte thân gốc; `bodyText` là bản giải
 * UTF-8 của đúng byte đó (Kairo gửi JSON UTF-8) nên mã hoá lại ra y nguyên. Thân bị cắt thì bỏ qua.
 */
function reverifyPending(): void {
  const s = store()
  let changed = false
  for (const e of s.entries) {
    if (e.bodyTruncated || (e.signature.status !== 'no-secret' && e.signature.status !== 'invalid')) continue
    const next = verify(
      e.headers['x-kairo-timestamp'] ?? null,
      e.headers['x-kairo-signature'] ?? null,
      Buffer.from(e.bodyText, 'utf8'),
    )
    if (next.status === 'valid') {
      // Giữ độ lệch giờ lúc NHẬN, không tính lại theo giờ bây giờ.
      e.signature = { ...next, skewSec: e.signature.skewSec, reverified: true }
      changed = true
    }
  }
  if (changed) s.rev++
}

export function removeSecret(id: string): boolean {
  const s = store()
  const before = s.secrets.length
  s.secrets = s.secrets.filter((x) => x.id !== id)
  return s.secrets.length < before
}

export function getSettings(): WebhookSettings {
  return { ...store().settings }
}

const ALLOWED_STATUS = new Set([200, 204, 400, 401, 404, 410, 500, 503])

export function updateSettings(patch: Partial<Record<keyof WebhookSettings, unknown>>): WebhookSettings {
  const cur = store().settings
  if (patch.respondStatus !== undefined) {
    const n = Number(patch.respondStatus)
    if (!ALLOWED_STATUS.has(n)) throw new WebhookInputError('Mã trả về không nằm trong danh sách cho phép.')
    cur.respondStatus = n
  }
  if (patch.respondDelayMs !== undefined) {
    const n = Number(patch.respondDelayMs)
    if (!Number.isInteger(n) || n < 0 || n > 15_000) throw new WebhookInputError('Độ trễ phải từ 0 đến 15000 ms.')
    cur.respondDelayMs = n
  }
  return { ...cur }
}

// ───────────────────────── nhận ─────────────────────────

function sign(key: Buffer, ts: string, body: Buffer): string {
  return createHmac('sha256', key).update(ts).update('.').update(body).digest('hex')
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) return false
  return timingSafeEqual(Buffer.from(a.toLowerCase(), 'hex'), Buffer.from(b, 'hex'))
}

function verify(ts: string | null, sig: string | null, body: Buffer): WebhookEntry['signature'] {
  const tsNum = ts && /^\d{1,12}$/.test(ts) ? Number(ts) : null
  const skewSec = tsNum === null ? null : Math.round(Date.now() / 1000 - tsNum)
  const base = { timestamp: tsNum, skewSec, matched: null, mode: null }
  if (!ts || !sig) return { ...base, status: 'missing' }
  const secrets = store().secrets
  if (secrets.length === 0) return { ...base, status: 'no-secret' }
  for (const s of secrets) {
    if (s.decoded && sameHex(sig.trim(), sign(s.decoded, ts, body))) {
      return { ...base, status: 'valid', matched: s.label, mode: 'decoded' }
    }
  }
  for (const s of secrets) {
    if (sameHex(sig.trim(), sign(s.literal, ts, body))) {
      return { ...base, status: 'valid', matched: s.label, mode: 'literal' }
    }
  }
  return { ...base, status: 'invalid' }
}

/** Header đáng xem — bỏ cookie/authorization nếu lỡ có, để log không thành chỗ rò. */
const HIDDEN_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization'])

export type IncomingWebhook = {
  channel: string
  source: WebhookEntry['source']
  headers: Headers
  body: Buffer
  /** Thân vượt trần của route — `body` chỉ là phần đầu, chữ ký chắc chắn không kiểm được. */
  oversize?: boolean
  remoteIp: string | null
}

export function record(input: IncomingWebhook): WebhookEntry {
  const s = store()
  const headers: Record<string, string> = {}
  input.headers.forEach((value, key) => {
    headers[key] = HIDDEN_HEADERS.has(key) ? '(ẩn)' : value.slice(0, 500)
  })

  const truncated = input.body.length > MAX_STORED_BODY
  const bodyText = input.body.subarray(0, MAX_STORED_BODY).toString('utf8')
  let json: unknown = null
  let jsonError: string | null = null
  if (input.oversize) jsonError = 'thân vượt 1 MB — đã cắt, trả 413'
  else if (input.body.length === 0) jsonError = 'thân rỗng'
  else if (truncated) jsonError = 'thân quá lớn, không phân tích'
  else {
    try {
      json = JSON.parse(bodyText)
    } catch (e) {
      jsonError = e instanceof Error ? e.message : 'không phải JSON'
    }
  }

  const ts = input.headers.get('x-kairo-timestamp')
  const sig = input.headers.get('x-kairo-signature')
  const signature = verify(ts, sig, input.body)
  const sigKey = ts && sig ? `${ts}.${sig.trim().toLowerCase()}` : null
  const duplicateOf = sigKey ? (s.bySignature.get(sigKey) ?? null) : null

  const jsonEvent =
    json && typeof json === 'object' && typeof (json as Record<string, unknown>).event === 'string'
      ? ((json as Record<string, unknown>).event as string)
      : null

  const entry: WebhookEntry = {
    seq: ++s.seq,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    channel: input.channel,
    source: input.source,
    event: input.headers.get('x-kairo-event')?.slice(0, 100) ?? jsonEvent,
    headers,
    remoteIp: input.remoteIp,
    bodyBytes: input.body.length,
    bodyText,
    bodyTruncated: truncated,
    json,
    jsonError,
    signature,
    duplicateOf,
    response: input.oversize
      ? { status: 413, delayMs: 0 }
      : { status: s.settings.respondStatus, delayMs: s.settings.respondDelayMs },
  }

  if (sigKey && duplicateOf === null) s.bySignature.set(sigKey, entry.seq)
  s.entries.push(entry)
  if (s.entries.length > MAX_ENTRIES) {
    s.entries.splice(0, s.entries.length - MAX_ENTRIES)
    const firstKept = s.entries[0].seq
    for (const [k, v] of s.bySignature) if (v < firstKept) s.bySignature.delete(k)
  }
  return entry
}

// ───────────────────────── đọc sổ ─────────────────────────

export type LogPage = {
  entries: WebhookEntry[]
  lastSeq: number
  rev: number
  total: number
  capacity: number
  startedAt: string
  settings: WebhookSettings
  secrets: PublicSecret[]
  /** URL https công khai để dán vào web-tenant-admin (`KAIRO_WEBHOOK_PUBLIC_URL`); null = trang tự đoán. */
  publicUrl: string | null
}

/** `after` = seq cuối trình duyệt đã có — chỉ trả phần mới (poll nhẹ). */
export function readLog(after: number): LogPage {
  const s = store()
  return {
    entries: s.entries.filter((e) => e.seq > after),
    lastSeq: s.seq,
    rev: s.rev,
    total: s.entries.length,
    capacity: MAX_ENTRIES,
    startedAt: s.startedAt,
    settings: { ...s.settings },
    secrets: listSecrets(),
    publicUrl: process.env['KAIRO_WEBHOOK_PUBLIC_URL']?.trim() || null,
  }
}

export function clearLog(): void {
  const s = store()
  s.entries = []
  s.bySignature.clear()
  s.rev++
}

// ───────────────────────── tự bắn thử ─────────────────────────

/** Mẫu payload đúng khuôn từng nhóm sự kiện của worker (id-only, không tên, không thân tin). */
export function samplePayload(event: string, tenantId: string): Record<string, unknown> {
  const at = new Date().toISOString()
  const conversationId = randomUUID()
  const userA = randomUUID()
  const userB = randomUUID()
  if (event.startsWith('notification.')) {
    const body: Record<string, unknown> = {
      v: 1,
      event,
      tenantId,
      type: event.slice('notification.'.length),
      recipientUserIds: [userA],
      recipientCount: 1,
      truncated: false,
      at,
      conversationId,
    }
    if (event === 'notification.call') {
      body.callId = randomUUID()
      body.callKind = 'video'
    } else body.messageId = randomUUID()
    return body
  }
  if (event.startsWith('conversation.') && event !== 'conversation.started') {
    const body: Record<string, unknown> = {
      v: 1,
      event,
      tenantId,
      conversationId,
      kind: 'group',
      memberUserIds: [userA, userB],
      memberCount: 2,
      truncated: false,
      at,
    }
    if (event !== 'conversation.created') body.changedUserIds = [userB]
    return body
  }
  return {
    v: 1,
    event,
    tenantId,
    conversationId,
    messageId: event === 'conversation.started' ? null : randomUUID(),
    kind: 'business',
    at,
  }
}

/** Ký mẫu bằng secret đã khai (đúng cách: khoá giải từ whsec_) — không có secret thì gửi không ký. */
export function signSample(secretId: string | null, body: Buffer): { ts: string; sig: string | null } {
  const ts = String(Math.floor(Date.now() / 1000))
  const secret = store().secrets.find((x) => x.id === secretId) ?? null
  if (!secret) return { ts, sig: null }
  return { ts, sig: sign(secret.decoded ?? secret.literal, ts, body) }
}
