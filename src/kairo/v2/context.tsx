'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { fetchConfigV2, type KairoConfigV2 } from '@/lib/v2/api'
import { loadKairoV2, type KairoV2 } from '../loadBundle'

type V2State = {
  config: KairoConfigV2 | null
  /** null khi trang không cần bundle (`needBundle=false`) hoặc bundle chưa tải xong. */
  kairo: KairoV2 | null
  error: string | null
  loading: boolean
  reload: () => void
}

const Ctx = createContext<V2State | null>(null)

/**
 * Nạp MỘT lần cho cả trang v2: cấu hình (`/api/v2/config`) và — nếu trang nhúng Kairo — bundle v2.
 * Mọi bề mặt trên trang (danh sách, panel, split) đọc chung từ đây.
 */
export function V2Provider({ needBundle = true, children }: { needBundle?: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<Omit<V2State, 'reload'>>({
    config: null,
    kairo: null,
    error: null,
    loading: true,
  })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))

    void (async () => {
      try {
        const config = await fetchConfigV2(ctrl.signal)
        if (!alive) return
        setState((s) => ({ ...s, config }))
        const kairo = needBundle ? await loadKairoV2(config.widgetUrl) : null
        if (alive) setState({ config, kairo, error: null, loading: false })
      } catch (err) {
        if (!alive || ctrl.signal.aborted) return
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err), loading: false }))
      }
    })()

    return () => {
      alive = false
      ctrl.abort()
    }
  }, [needBundle, nonce])

  return <Ctx.Provider value={{ ...state, reload: () => setNonce((n) => n + 1) }}>{children}</Ctx.Provider>
}

export function useV2(): V2State {
  const v = useContext(Ctx)
  if (!v) throw new Error('useV2 phải nằm trong <V2Provider>.')
  return v
}
