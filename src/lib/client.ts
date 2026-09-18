/**
 * Lớp gọi API của chính ứng dụng này — ranh giới DUY NHẤT của client với server,
 * không component nào được gọi fetch thẳng.
 *
 * FE không bao giờ chạm app-key: nó chỉ nói chuyện với route handler cùng origin,
 * còn route handler mới cầm app-key để làm việc với Kairo. Cùng origin nên đường
 * dẫn luôn tương đối, không cần base URL hay CORS.
 */

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function parse(text: string): { error?: string } | null {
  if (!text) return null
  try {
    return JSON.parse(text) as { error?: string }
  } catch {
    return null
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    // no-store ở cả hai đầu: next.config.ts gắn header lên response để chặn proxy
    // trung gian, còn dòng này chặn chính HTTP cache của browser. Đặt trước ...init
    // nên vẫn ghi đè được nếu sau này có lời gọi thật sự muốn cache.
    res = await fetch(path, {
      cache: 'no-store',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Không kết nối được máy chủ (${path}).`, 0)
  }

  const body = parse(await res.text())
  if (!res.ok) throw new ApiError(body?.error ?? `Máy chủ trả lỗi ${res.status}.`, res.status)
  return body as T
}
