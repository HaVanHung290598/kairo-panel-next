'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Đã có lỗi không xác định.'
}

/**
 * Tải dữ liệu bất đồng bộ với huỷ đúng cách. Đủ cho ba lời gọi của bản demo —
 * chưa cần thư viện quản lý dữ liệu nào.
 *
 * Lần tải lại (polling, bấm thử lại) KHÔNG bật cờ loading nếu đã có dữ liệu cũ,
 * để danh sách không nháy trắng mỗi 5 giây.
 */
export function useAsync<T>(run: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  // Giữ hàm trong ref: người gọi truyền hàm inline mà effect vẫn không chạy lại.
  const runRef = useRef(run)
  runRef.current = run

  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true

    setState((s) => ({ ...s, loading: s.data === null, error: null }))

    runRef.current(ctrl.signal).then(
      (data) => {
        if (alive) setState({ data, error: null, loading: false })
      },
      (err: unknown) => {
        if (!alive || ctrl.signal.aborted) return
        setState((s) => ({ data: s.data, error: toMessage(err), loading: false }))
      },
    )

    return () => {
      alive = false
      ctrl.abort()
    }
  }, [nonce])

  return { ...state, reload }
}
