'use client'

import { useEffect, useState } from 'react'

import { primeSessionV2 } from '@/lib/v2/api'
import { useV2 } from '@/kairo/v2/context'
import { isDockMessage, postDock } from '@/kairo/v2/dockChannel'
import { panelExtras, serverOptions } from '@/kairo/v2/mountOptions'
import { useKairoMount } from '@/kairo/v2/useKairoMount'
import { SurfaceHost } from './SurfaceHost'

/*
  Nội dung iframe của dock chat — MỘT `KairoPanelV2`, không có khung trang, không tự chọn hội thoại.
  Trang cha (`ChatDock`) quyết hội thoại nào và đưa token phiên xuống qua `postMessage`
  (`dockChannel.ts`); đổi hội thoại là gỡ panel cũ, mount panel mới.
*/
export function DockFrame() {
  const { config, kairo, error } = useV2()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isDockMessage(e) || e.data.type !== 'kairo-dock:open') return
      if (e.data.session) primeSessionV2(e.data.session)
      setConversationId(e.data.conversationId)
      setOpened(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Báo sẵn sàng sau khi đã nghe — trang cha trả lời bằng `open`.
  useEffect(() => {
    if (config && kairo && window.parent !== window) postDock(window.parent, { type: 'kairo-dock:ready' })
  }, [config, kairo])

  const panel = useKairoMount({
    enabled: Boolean(config && kairo && conversationId),
    deps: [config, kairo, conversationId],
    mount: (host, session, onEnded) => {
      if (!config || !kairo || !conversationId) throw new Error('Chưa chọn hội thoại.')
      return kairo.panel.mount({
        target: host,
        conversationId,
        token: session.token,
        ...serverOptions(config),
        ...panelExtras(config),
        onSessionEnded: onEnded,
      })
    },
  })

  if (error) {
    return (
      <p className="v2-dock-frame-msg" role="alert">
        {error}
      </p>
    )
  }

  return (
    <SurfaceHost
      label="Dock chat Kairo"
      className="v2-dock-frame"
      {...panel}
      idleText={opened ? 'Chọn một hội thoại để chat ở đây.' : 'Đang mở dock…'}
      loadingText="Đang mở hội thoại…"
    />
  )
}
