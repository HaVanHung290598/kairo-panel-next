'use client'

import { useEffect } from 'react'

import { fetchConfig } from '@/lib/config'
import { fetchConfigV2 } from '@/lib/v2/api'
import { guestApiBase } from './absoluteUrl'
import { loadKairoV2, loadKairoWidget } from './loadBundle'

/*
  Bubble chat cho khách vãng lai, dựng trên website công khai của tenant.

  ĐỪNG nhầm với KairoPanel. Panel là kênh của nhân viên: cần token do server mint,
  mount vào đúng vùng của hồ sơ đang chọn, sống theo vòng đời màn hình (xem
  useKairoPanel.ts). Widget này là kênh của khách chưa đăng nhập: chỉ cần tenant
  slug, không có token, và tự gắn mình vào cuối <body> nên không nhận target.

  Không dùng <script> inline như đoạn nhúng mẫu: script inline chạy ngay sau hydrate,
  lúc đó bundle chưa tải xong nên `KairoWidget` còn undefined và mount() ném
  ReferenceError trong im lặng. Qua loadKairoWidget thì thứ tự luôn đúng.

  CẢ BA tham số đều lấy từ /api/config, không nhận qua prop và không đọc process.env:
  trang /gara được prerender tĩnh, nên đọc env ngay trong page sẽ nướng cứng giá trị
  vào lúc build — đổi .env.local trên server rồi restart cũng không ăn.
*/

/*
  Base URL Tenant API cho widget: bundle tự nối `/graphql` và `/ws/guest` vào sau, mà
  `graphqlUrl` trong config chính là `<base>/graphql` — nên cắt đuôi là ra base (guestApiBase,
  đã tuyệt đối hoá vì widget dựng socket bằng `api.replace('http', 'ws')`).

  Cùng component phục vụ HAI trang: `/gara` (v1, /api/config) và `/v2/gara` (v2,
  /api/v2/config). Chỉ khác bundle nạp và cửa lấy config; `KairoWidgetV2` vốn chính là
  `KairoWidget` (INTEGRATION §0 của widget-embed) nên hợp đồng mount giữ nguyên.
*/

type Props = {
  /** Mặc định v1 — trang `/gara`. */
  version?: 'v1' | 'v2'
}

async function loadFor(version: 'v1' | 'v2', signal: AbortSignal) {
  if (version === 'v2') {
    const config = await fetchConfigV2(signal)
    const { widget } = await loadKairoV2(config.widgetUrl)
    return { widget, tenant: config.guestTenant, graphqlUrl: config.graphqlUrl }
  }
  const config = await fetchConfig(signal)
  const widget = await loadKairoWidget(config.widgetUrl)
  return { widget, tenant: config.guestTenant, graphqlUrl: config.graphqlUrl }
}

export function KairoGuestWidget({ version = 'v1' }: Props) {
  useEffect(() => {
    const ctrl = new AbortController()
    let dispose: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const { widget, tenant, graphqlUrl } = await loadFor(version, ctrl.signal)
        // StrictMode gọi effect hai lần: lượt đầu đã bị dọn thì bỏ, tránh hai bubble.
        if (cancelled) return
        dispose = widget.mount({ tenant, api: guestApiBase(graphqlUrl) })
        console.info(`[kairo-panel-next] widget khách ${version} đã mount (tenant=${tenant})`)
      } catch (err) {
        if (cancelled) return
        // Kênh của khách là phụ trợ: hỏng thì ghi log, không chặn phần còn lại của trang.
        console.warn('[kairo] không dựng được widget khách:', err)
      }
    })()

    return () => {
      cancelled = true
      ctrl.abort()
      dispose?.()
      dispose = null
    }
  }, [version])

  return null
}
