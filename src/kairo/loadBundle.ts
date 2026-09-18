import type { KairoConversationListApi, KairoPanelApi, KairoWidgetApi } from './types'

/**
 * Nạp bundle Kairo một lần (theo URL) rồi dùng lại.
 *
 * Hai bundle, hai bộ global — và mỗi trang CHỈ đọc global của bản mình:
 *   - v1 `/kairo-widget.js`        → `KairoPanel` + `KairoWidget`             — trang `/`, `/gara`
 *   - v2 `/sdk/v2/kairo-widget.js` → `KairoPanelV2` + `KairoWidgetV2`
 *                                    + `KairoConversationListV2`             — trang `/v2/*`
 *     (v2 tự tải `kairo-call.js` cùng thư mục khi bắt đầu cuộc gọi).
 *
 * Bản trước ưu tiên global v2 rồi lùi về v1, nên env trỏ bundle v2 là `/` lặng lẽ chạy panel v2 —
 * trang kiểm thử v1 mất tác dụng. Nay tách hẳn: gọi nhầm bản là báo lỗi rõ thay vì chạy nhầm.
 *
 * Nạp động thay vì đặt sẵn trong layout để có một Promise rõ ràng: không đoạn mã nào chạm các
 * global trước khi bundle tải xong. Chuyển giữa trang v1 và v2 dùng thẻ <a> thường (tải lại
 * trang) — hai bundle đều giữ store singleton, không nên sống chung một document.
 */
const inflight = new Map<string, Promise<void>>()

function loadScript(url: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve()
  const pending = inflight.get(url)
  if (pending) return pending

  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Cho phép thử lại: hỏng mạng một lần không nên khoá vĩnh viễn.
      inflight.delete(url)
      script.remove()
      reject(new Error(`Không tải được bundle Kairo tại ${url}. Kiểm tra mạng hoặc chặn quảng cáo.`))
    }
    document.head.appendChild(script)
  })
  inflight.set(url, p)
  return p
}

function missing(url: string, name: string): Error {
  return new Error(`Tải được ${url} nhưng không thấy window.${name} — URL đang trỏ nhầm bản bundle?`)
}

// ─── v1 ───

export async function loadKairoPanel(url: string): Promise<KairoPanelApi> {
  await loadScript(url, () => Boolean(window.KairoPanel))
  if (!window.KairoPanel) throw missing(url, 'KairoPanel')
  return window.KairoPanel
}

export async function loadKairoWidget(url: string): Promise<KairoWidgetApi> {
  await loadScript(url, () => Boolean(window.KairoWidget))
  if (!window.KairoWidget) throw missing(url, 'KairoWidget')
  return window.KairoWidget
}

// ─── v2 ───

export type KairoV2 = {
  panel: KairoPanelApi
  widget: KairoWidgetApi
  list: KairoConversationListApi
}

export async function loadKairoV2(url: string): Promise<KairoV2> {
  await loadScript(url, () => Boolean(window.KairoPanelV2))
  const { KairoPanelV2, KairoWidgetV2, KairoConversationListV2 } = window
  if (!KairoPanelV2) throw missing(url, 'KairoPanelV2')
  if (!KairoWidgetV2) throw missing(url, 'KairoWidgetV2')
  if (!KairoConversationListV2) throw missing(url, 'KairoConversationListV2 (bundle chưa có vòng 25)')
  return { panel: KairoPanelV2, widget: KairoWidgetV2, list: KairoConversationListV2 }
}
