'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { clearSessionV2, getSessionV2, type SessionV2 } from '@/lib/v2/api'

export type MountStatus = 'idle' | 'loading' | 'ready' | 'error' | 'ended'

type Params = {
  /** false = chưa đủ điều kiện mount (chưa có bundle/config/hội thoại) → trạng thái `idle`. */
  enabled: boolean
  /**
   * Mount vào `host` bằng token phiên. Trả hàm dọn của bundle. `onEnded` phải được nối vào
   * `onSessionEnded` của bundle để hook biết phiên đã hết.
   */
  mount: (host: HTMLDivElement, session: SessionV2, onEnded: (reason: string) => void) => () => void
  /** Đổi giá trị nào trong đây là gỡ bề mặt cũ, mount bề mặt mới. */
  deps: unknown[]
}

/**
 * Vòng đời mount → đổi → gỡ của MỘT bề mặt Kairo v2 (panel, danh sách, split).
 *
 * Giữ hai lá chắn của hook v1 (`useKairoPanel.ts`):
 *   1. Kết quả đến muộn bị vứt (cờ `cancelled`) — bấm nhanh A → B không bao giờ để panel A mount
 *      sau B.
 *   2. Hàm dọn thuộc về đúng một lượt effect — React gọi nó khi đổi deps và khi rời trang, không
 *      rò WebSocket.
 * Thêm một trạng thái của v2: `ended` — bundle báo `onSessionEnded` (token hết hạn / bị thu hồi /
 * tài khoản khoá). Bundle KHÔNG tự phục hồi token cũ (INTEGRATION §5), nên hook vứt token và để
 * người dùng bấm "Xin phiên mới" → mount lại bằng token mới.
 */
export function useKairoMount({ enabled, mount, deps }: Params) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mountRef = useRef(mount)
  mountRef.current = mount

  const [status, setStatus] = useState<MountStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    clearSessionV2()
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
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
        const session = await getSessionV2()
        if (cancelled) return
        const host = hostRef.current
        if (!host) throw new Error('Không tìm thấy vùng chứa trên trang.')
        dispose = mountRef.current(host, session, (reason) => {
          if (cancelled) return
          clearSessionV2()
          setError(reason === 'locked' ? 'Tài khoản đang bị khoá.' : `Phiên đã kết thúc (${reason}).`)
          setStatus('ended')
        })
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
      dispose = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt, ...deps])

  return { hostRef, status, error, retry }
}
