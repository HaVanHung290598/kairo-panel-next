/**
 * Đổi URL cấu hình sang tuyệt đối theo trang đang mở.
 *
 * Ở runtime `dev-machine` server trả đường dẫn cùng origin (`/kairo/api/graphql`…, xem
 * `browserEndpoints()`), còn trên server thì trả URL đầy đủ — hàm này để nguyên URL đầy đủ.
 *
 * Bắt buộc cho hai chỗ: widget khách dựng socket bằng `api.replace('http', 'ws') + '/ws/guest'`
 * (đường dẫn tương đối ra `/kairo/api/ws/guest` — không có scheme, `new WebSocket` hỏng), và
 * panel v1 mở `new WebSocket(wsUrl)` thẳng.
 */
export function absoluteHttp(url: string): string {
  return new URL(url, window.location.href).href
}

export function absoluteWs(url: string): string {
  const u = new URL(url, window.location.href)
  if (u.protocol === 'http:') u.protocol = 'ws:'
  if (u.protocol === 'https:') u.protocol = 'wss:'
  return u.href
}

/** Base Tenant API cho widget khách: bundle tự nối `/graphql` và `/ws/guest` vào sau. */
export function guestApiBase(graphqlUrl: string): string {
  return absoluteHttp(graphqlUrl).replace(/\/graphql\/*$/, '')
}
