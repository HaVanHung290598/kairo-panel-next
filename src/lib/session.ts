import { request } from './client'

/** Token phiên của nhân viên đang đăng nhập, do server xin hộ từ Kairo. */
export type Session = {
  token: string
  expiresAt: string
  user?: { id: string; displayName: string }
}

/** Xin token mới khi hạn còn dưới ngần này, để không đứt giữa chừng. */
const RENEW_BEFORE_MS = 120_000

let cached: Session | null = null
let inflight: Promise<Session> | null = null

function stillFresh(s: Session): boolean {
  const at = Date.parse(s.expiresAt)
  // expiresAt thiếu hoặc sai định dạng → NaN → coi như hết hạn, xin lại cho chắc.
  return Number.isFinite(at) && at > Date.now() + RENEW_BEFORE_MS
}

/**
 * Một token dùng chung cho cả phiên làm việc, KHÔNG xin lại mỗi lần mở hồ sơ.
 * Nhiều hồ sơ mở cùng lúc cũng chỉ tạo đúng một lời gọi nhờ `inflight`.
 */
export function getSession(): Promise<Session> {
  if (cached && stillFresh(cached)) return Promise.resolve(cached)
  if (inflight) return inflight

  inflight = request<Session>('/api/session', { method: 'POST' })
    .then((s) => {
      cached = s
      return s
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/** Vứt token đang giữ — gọi trước khi thử lại một panel hỏng vì xác thực. */
export function clearSession(): void {
  cached = null
}
