'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchRestConversations, getSessionV2, type RestConversation } from '@/lib/v2/api'
import { DOCK_PATH, isDockMessage, postDock } from '@/kairo/v2/dockChannel'

/*
  Dock chat nhỏ ở góc trái dưới — kiểu cửa sổ chat của Facebook web.

    · Mở     — cửa sổ 340×460: thanh tiêu đề (tên hội thoại, bấm để đổi hội thoại · thu nhỏ · đóng)
               + `KairoPanelV2` trong iframe `/v2/dock`.
    · Thu nhỏ — chỉ còn viên tròn tên hội thoại; iframe vẫn sống (ẩn) nên socket và nội dung đang
               gõ dở không mất, mở lại là thấy ngay.
    · Tắt    — gỡ hẳn iframe; bật lại ở thanh công cụ của trang.

  Hội thoại đang chọn dùng CHUNG với panel to của trang (`selected` ở `PanelWorkbench`): chọn ở
  danh sách to thì dock đổi theo, đổi ở thanh tiêu đề dock thì danh sách to + panel to đổi theo.
  Panel nhỏ phải ở iframe — lý do ở `src/kairo/v2/dockChannel.ts`.
*/

export type DockMode = 'open' | 'min' | 'off'

const KIND_LABEL: Record<string, string> = {
  direct: 'Hội thoại 1-1',
  group: 'Nhóm',
  channel: 'Kênh',
  business: 'Kênh nghiệp vụ',
  guest: 'Khách',
}

function titleOf(c: RestConversation | undefined): string {
  if (!c) return 'Hội thoại'
  return c.title.trim() || c.peerName?.trim() || KIND_LABEL[c.kind] || 'Hội thoại'
}

function initialOf(title: string): string {
  return (title.replace(/^#/, '').trim()[0] ?? '?').toUpperCase()
}

type Props = {
  mode: DockMode
  onModeChange: (m: DockMode) => void
  selected: string | null
  onSelect: (conversationId: string) => void
}

export function ChatDock({ mode, onModeChange, selected, onSelect }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [convs, setConvs] = useState<RestConversation[]>([])
  const [picking, setPicking] = useState(false)

  const current = convs.find((c) => c.id === selected)
  const title = selected ? titleOf(current) : 'Chat'

  // Tên hội thoại cho thanh tiêu đề: REST phía server (danh sách to nằm trong Shadow DOM của bundle,
  // trang không đọc được). Tải lại khi đang chọn một hội thoại chưa có trong bản đang giữ (vừa tạo).
  const needReload = Boolean(selected && !current)
  useEffect(() => {
    if (mode === 'off') return
    const ctrl = new AbortController()
    fetchRestConversations(ctrl.signal, { withNames: true })
      .then((list) => setConvs(list.filter((c) => !c.archived)))
      .catch(() => {
        /* Không có tên thì thanh tiêu đề hiện loại hội thoại — không chặn dock. */
      })
    return () => ctrl.abort()
  }, [mode, needReload])

  // Iframe gỡ khi tắt dock ⇒ lần bật sau phải chờ `ready` mới.
  useEffect(() => {
    if (mode === 'off') setFrameReady(false)
  }, [mode])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || !isDockMessage(e)) return
      if (e.data.type === 'kairo-dock:ready') setFrameReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Đưa hội thoại đang chọn + token phiên của trang xuống iframe.
  useEffect(() => {
    if (!frameReady) return
    let alive = true
    const send = (session: Awaited<ReturnType<typeof getSessionV2>> | null) => {
      if (alive) postDock(frameRef.current?.contentWindow, { type: 'kairo-dock:open', conversationId: selected, session })
    }
    // Không xin được token thì vẫn gửi hội thoại — iframe tự xin phiên, lỗi hiện ngay trong dock.
    getSessionV2().then(send, () => send(null))
    return () => {
      alive = false
    }
  }, [frameReady, selected])

  const pick = useCallback(
    (id: string) => {
      setPicking(false)
      if (id !== selected) onSelect(id)
    },
    [onSelect, selected],
  )

  if (mode === 'off') return null

  return (
    <div className={`v2-dock ${mode === 'min' ? 'is-min' : 'is-open'}`}>
      {mode === 'min' && (
        <div className="v2-dock-bubble">
          <button
            type="button"
            className="v2-dock-bubble-main"
            onClick={() => onModeChange('open')}
            title={`Mở chat: ${title}`}
            aria-label={`Mở dock chat: ${title}`}
          >
            <span className="v2-dock-avatar" aria-hidden>
              {initialOf(title)}
            </span>
            <span className="v2-dock-bubble-title">{title}</span>
          </button>
          <button type="button" className="v2-dock-icon" onClick={() => onModeChange('off')} aria-label="Đóng dock chat">
            ×
          </button>
        </div>
      )}

      <section className="v2-dock-window" aria-label="Dock chat" hidden={mode === 'min'}>
        <header className="v2-dock-head">
          <button
            type="button"
            className="v2-dock-title"
            aria-haspopup="listbox"
            aria-expanded={picking}
            onClick={() => setPicking((p) => !p)}
            title="Đổi hội thoại"
          >
            <span className="v2-dock-avatar" aria-hidden>
              {initialOf(title)}
            </span>
            <span className="v2-dock-title-text">{title}</span>
            <span className="v2-dock-caret" aria-hidden>
              ▾
            </span>
          </button>
          <button
            type="button"
            className="v2-dock-icon"
            onClick={() => {
              setPicking(false)
              onModeChange('min')
            }}
            aria-label="Thu nhỏ dock chat"
            title="Thu nhỏ"
          >
            –
          </button>
          <button
            type="button"
            className="v2-dock-icon"
            onClick={() => onModeChange('off')}
            aria-label="Đóng dock chat"
            title="Đóng"
          >
            ×
          </button>
        </header>

        {picking && (
          <ul className="v2-dock-picker" role="listbox" aria-label="Chọn hội thoại cho dock">
            {convs.length === 0 && <li className="v2-dock-picker-empty">Chưa có hội thoại.</li>}
            {convs.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selected}
                  className={c.id === selected ? 'on' : ''}
                  onClick={() => pick(c.id)}
                >
                  <span className="v2-dock-avatar small" aria-hidden>
                    {initialOf(titleOf(c))}
                  </span>
                  <span className="v2-dock-picker-title">{titleOf(c)}</span>
                  <span className="v2-dock-picker-kind">{KIND_LABEL[c.kind] ?? c.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <iframe ref={frameRef} className="v2-dock-frame-el" src={DOCK_PATH} title="Dock chat Kairo" allow="camera; microphone; display-capture; autoplay" />
      </section>
    </div>
  )
}
