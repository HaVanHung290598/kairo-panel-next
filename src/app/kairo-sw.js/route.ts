import { kairoEnv } from '@/server/kairo'

export const dynamic = 'force-dynamic'

/**
 * Phục vụ kairo-sw.js từ CHÍNH origin này.
 *
 * Service worker bắt buộc same-origin với trang, mà bundle gốc nằm trên CDN —
 * nên server lấy về rồi phát lại. Đây là lý do lớn nhất khiến FE và BE nên nằm
 * chung một ứng dụng Next.
 */
let cached: string | null = null

export async function GET() {
  try {
    if (cached === null) {
      const res = await fetch(kairoEnv().swJsUrl, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
      if (!res.ok) throw new Error(`CDN trả HTTP ${res.status}`)
      cached = await res.text()
    }

    return new Response(cached, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(`Không tải được kairo-sw.js từ CDN: ${message}`, { status: 502 })
  }
}
