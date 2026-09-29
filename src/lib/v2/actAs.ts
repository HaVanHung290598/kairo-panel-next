/**
 * User chọn tay ở trang `/v2/panel-nguoi-dung` — thay cho user cố định của env.
 *
 * Giữ ở biến module (một trang = một người): `request()` (src/lib/client.ts) đọc biến này và gắn
 * header `x-kpn-act-as` vào mọi lời gọi `/api/v2/*`, nên config, token phiên, danh sách REST, tạo
 * hội thoại… đều chạy dưới cùng một danh tính. Các trang v2 khác không đặt biến → hành vi cũ.
 *
 * localStorage chỉ để trình duyệt nhớ người vừa dùng + vài người gần đây (tiện đổi qua lại) — hỏng
 * hoặc bị chặn thì trang vẫn chạy, chỉ là không nhớ.
 */

export const ACT_AS_HEADER = 'x-kpn-act-as'

const LAST_KEY = 'kpn.v2.actAs'
const RECENT_KEY = 'kpn.v2.actAs.recent'
const RECENT_MAX = 8

let current: string | null = null

export function getActAs(): string | null {
  return current
}

export function setActAs(email: string | null): void {
  current = email ? email.trim().toLowerCase() : null
}

export function readLastActAs(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function readRecentActAs(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

/** Ghi người vừa dùng lên đầu danh sách gần đây; `null` = quên người đang dùng (giữ danh sách). */
export function rememberActAs(email: string | null): string[] {
  const recent = readRecentActAs()
  try {
    if (!email) {
      window.localStorage.removeItem(LAST_KEY)
      return recent
    }
    const next = [email, ...recent.filter((x) => x !== email)].slice(0, RECENT_MAX)
    window.localStorage.setItem(LAST_KEY, email)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    return next
  } catch {
    return recent
  }
}

export function forgetRecentActAs(email: string): string[] {
  const next = readRecentActAs().filter((x) => x !== email)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* không ghi được thì thôi */
  }
  return next
}
