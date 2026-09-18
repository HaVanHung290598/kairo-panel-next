'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { KairoConfig } from '@/lib/config'
import { clearSession, getSession } from '@/lib/session'
import { absoluteHttp, absoluteWs } from './absoluteUrl'
import { loadKairoPanel } from './loadBundle'

export type PanelStatus = 'idle' | 'loading' | 'ready' | 'error'

type Params = {
  /** null = chưa chọn hồ sơ. Panel không được mount bằng hội thoại mặc định. */
  conversationId: string | null
  config: KairoConfig | null
}

/**
 * Vòng đời mount → switch → unmount của KairoPanel, gói trong một hook.
 *
 * Đóng hai lỗ mà mã mẫu tích hợp chính thức để hở:
 *
 *   1. ĐUA KHI ĐỔI HỒ SƠ. Mã mẫu `await` token rồi mới mount, nên bấm nhanh hồ sơ
 *      A → B có thể khiến panel của A mount SAU B: người dùng đang ở B mà nhìn
 *      thấy chat của A. Cờ `cancelled` vứt kết quả đến muộn.
 *   2. RÒ KẾT NỐI. Mã mẫu giữ hàm dọn trong một biến toàn cục, bị ghi đè là panel
 *      cũ sống mãi với WebSocket của nó. Ở đây hàm dọn thuộc về đúng một lần chạy
 *      effect, nên React gọi nó khi đổi conversationId và khi component bị huỷ.
 */
export function useKairoPanel({ conversationId, config }: Params) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    // Token hỏng là nguyên nhân hay gặp nhất, nên vứt luôn cái đang giữ.
    clearSession()
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!conversationId || !config) {
      setStatus('idle')
      setError(null)
      return
    }

    let dispose: (() => void) | null = null
    let cancelled = false

    setStatus('loading')
    setError(null)

    void (async () => {
      try {
        const [panel, session] = await Promise.all([loadKairoPanel(config.widgetUrl), getSession()])
        if (cancelled) return

        const host = hostRef.current
        if (!host) throw new Error('Không tìm thấy vùng chứa panel trên trang.')

        // Trang này là bản kiểm thử panel V1 (bundle `/kairo-widget.js`, xem loadBundle.ts):
        // chỉ truyền tham số của hợp đồng v1 — gọi thoại, livekitUrl, onSessionEnded là của v2
        // và nằm ở trang /v2/panel.
        dispose = panel.mount({
          target: host,
          conversationId,
          token: session.token,
          // Tuyệt đối hoá: ở runtime dev-machine config trả đường dẫn cùng origin (/kairo/api/…).
          graphqlUrl: absoluteHttp(config.graphqlUrl),
          wsUrl: absoluteWs(config.wsUrl),
          // Đường dẫn tương đối → luôn cùng origin với trang, kể cả lúc dev.
          // Route /kairo-sw.js lấy script thật từ CDN rồi phát lại.
          swPath: '/kairo-sw.js',
          appUrl: window.location.origin,
        })
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Không mở được kênh trao đổi.')
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
      dispose = null
    }
  }, [conversationId, config, attempt])

  return { hostRef, status, error, retry }
}
