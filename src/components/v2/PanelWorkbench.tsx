'use client'

import { useCallback, useEffect, useState } from 'react'

import { useV2 } from '@/kairo/v2/context'
import { panelExtras, serverOptions } from '@/kairo/v2/mountOptions'
import { useKairoMount } from '@/kairo/v2/useKairoMount'
import type { KairoConversationKind } from '@/kairo/types'
import { ChatDock, type DockMode } from './ChatDock'
import { CreateConversation } from './CreateConversation'
import { SurfaceHost } from './SurfaceHost'

/*
  Trang kiểm thử "panel nội bộ" v2 cho nhân viên (user cố định):

    · Gói sẵn (split)  — MỘT lời gọi `KairoConversationListV2.mount({layout:'split'})`: danh sách
      320px + panel KairoPanelV2 bên phải (≥720px), xếp chồng khi khung hẹp.
    · Tự ghép (list)   — `KairoConversationListV2` (layout 'list') ở cột trái, trang tự mount
      `KairoPanelV2` ở cột phải khi chọn hàng — cách bên tích hợp đặt hai bề mặt vào hai chỗ khác
      nhau trên trang của họ.

  Lọc loại (`kinds`) và kiểu nhúng đổi được ngay trên trang; đổi là gỡ bề mặt cũ, mount lại.
  Hội thoại đang chọn nằm trên URL (`?c=<id>`) để mở thẳng từ trang tự tạo tài khoản.

  Dock chat nhỏ góc trái dưới (`ChatDock`, kiểu Facebook web) mở CÙNG hội thoại đang chọn — một
  `selected` cho cả hai: chọn ở danh sách to thì dock đổi theo, đổi ở dock thì danh sách + panel to
  đổi theo. Trạng thái mở / thu nhỏ / tắt của dock nhớ trong localStorage của trình duyệt.
*/

const DOCK_KEY = 'kpn.v2.dock'

function readDockMode(): DockMode {
  try {
    const v = window.localStorage.getItem(DOCK_KEY)
    return v === 'min' || v === 'off' ? v : 'open'
  } catch {
    return 'open'
  }
}

const KINDS: { value: KairoConversationKind; label: string }[] = [
  { value: 'direct', label: '1-1' },
  { value: 'group', label: 'Nhóm' },
  { value: 'channel', label: 'Kênh' },
  { value: 'business', label: 'Nghiệp vụ (đối tác)' },
  { value: 'guest', label: 'Khách (widget)' },
]

type Layout = 'split' | 'list'

function readUrl(): { layout: Layout; selected: string | null } {
  const q = new URLSearchParams(window.location.search)
  return { layout: q.get('layout') === 'list' ? 'list' : 'split', selected: q.get('c') }
}

function writeUrl(layout: Layout, selected: string | null) {
  const q = new URLSearchParams(window.location.search)
  q.set('layout', layout)
  if (selected) q.set('c', selected)
  else q.delete('c')
  window.history.replaceState(null, '', `${window.location.pathname}?${q}`)
}

export function PanelWorkbench() {
  const { config, kairo } = useV2()
  const [layout, setLayout] = useState<Layout>('split')
  const [kinds, setKinds] = useState<KairoConversationKind[]>(KINDS.map((k) => k.value))
  const [selected, setSelected] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [creating, setCreating] = useState(false)
  const [dock, setDock] = useState<DockMode>('off')

  // URL chỉ đọc sau khi hydrate — trang được prerender nên không đọc được lúc render.
  useEffect(() => {
    const u = readUrl()
    setLayout(u.layout)
    setSelected(u.selected)
    setDock(readDockMode())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(DOCK_KEY, dock)
    } catch {
      /* Không nhớ được thì lần sau dock mở mặc định. */
    }
  }, [ready, dock])

  useEffect(() => {
    if (ready) writeUrl(layout, selected)
  }, [ready, layout, selected])

  const kindsKey = kinds.join(',')
  const listReady = Boolean(ready && config && kairo && kinds.length > 0)

  // ── danh sách (cả hai kiểu nhúng) ──
  const list = useKairoMount({
    enabled: listReady,
    deps: [config, kairo, layout, kindsKey],
    mount: (host, session, onEnded) => {
      if (!config || !kairo) throw new Error('Chưa nạp xong cấu hình.')
      const common = serverOptions(config)
      return kairo.list.mount({
        target: host,
        token: session.token,
        ...common,
        // Tích đủ mọi ô thì không truyền `kinds`: bundle tự hiện cả loại nó thêm về sau.
        ...(kinds.length === KINDS.length ? {} : { kinds }),
        layout,
        // Mount lại (đổi kiểu/lọc) giữ nguyên hàng đang chọn — đọc từ URL, không từ state cũ.
        ...(readUrl().selected ? { selectedId: readUrl().selected! } : {}),
        onSelect: (id) => setSelected(id),
        onSessionEnded: onEnded,
        ...(layout === 'split' ? { panel: panelExtras(config) } : {}),
      })
    },
  })

  // ── panel riêng — chỉ ở kiểu 'list' ──
  const panel = useKairoMount({
    enabled: Boolean(listReady && layout === 'list' && selected),
    deps: [config, kairo, layout, selected],
    mount: (host, session, onEnded) => {
      if (!config || !kairo || !selected) throw new Error('Chưa chọn hội thoại.')
      return kairo.panel.mount({
        target: host,
        conversationId: selected,
        token: session.token,
        ...serverOptions(config),
        ...panelExtras(config),
        onSessionEnded: onEnded,
      })
    },
  })

  const toggleKind = (k: KairoConversationKind) =>
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  // Đổi hội thoại từ NGOÀI danh sách to (vừa tạo, hoặc chọn ở dock).
  const selectFromOutside = useCallback(
    (conversationId: string) => {
      setSelected(conversationId)
      const host = list.hostRef.current
      // Danh sách tự tải lại khi có hội thoại mới (realtime); select() đổi hàng (split: mở luôn
      // panel) mà không mount lại. Bundle tra controller theo ĐÚNG phần tử `target` lúc mount.
      if (host && kairo) kairo.list.select(host, conversationId)
    },
    [kairo, list.hostRef],
  )

  return (
    <section className="v2-workbench">
      <div className="v2-toolbar">
        <div className="v2-seg" role="radiogroup" aria-label="Kiểu nhúng">
          {(['split', 'list'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              className={layout === l ? 'on' : ''}
              onClick={() => setLayout(l)}
            >
              {l === 'split' ? 'Gói sẵn (split)' : 'Tự ghép (list + panel)'}
            </button>
          ))}
        </div>

        <fieldset className="v2-kinds">
          <legend>Loại hiện</legend>
          {KINDS.map((k) => (
            <label key={k.value}>
              <input type="checkbox" checked={kinds.includes(k.value)} onChange={() => toggleKind(k.value)} />
              {k.label}
            </label>
          ))}
        </fieldset>

        <label className="v2-dock-toggle">
          <input
            type="checkbox"
            checked={dock !== 'off'}
            onChange={(e) => setDock(e.target.checked ? 'open' : 'off')}
          />
          Dock chat góc trái
        </label>

        <button type="button" className="v2-btn v2-btn-primary" onClick={() => setCreating(true)} disabled={!config}>
          ＋ Tạo hội thoại
        </button>
      </div>

      {kinds.length === 0 && <p className="v2-banner">Chọn ít nhất một loại hội thoại để hiện danh sách.</p>}

      {layout === 'split' ? (
        <SurfaceHost
          key="split"
          label="Hộp thư Kairo (split)"
          className="v2-surface-split"
          {...list}
          loadingText="Đang mở hộp thư…"
        />
      ) : (
        <div className="v2-compose" key="list">
          <SurfaceHost label="Danh sách hội thoại Kairo" className="v2-surface-list" {...list} loadingText="Đang tải danh sách…" />
          <SurfaceHost
            label="Panel Kairo"
            className="v2-surface-panel"
            {...panel}
            idleText="Chọn một hội thoại ở danh sách bên trái — trang sẽ tự mount KairoPanelV2 vào ô này."
            loadingText="Đang mở hội thoại…"
          />
        </div>
      )}

      {selected && (
        <p className="v2-foot v2-muted">
          Đang chọn: <code>{selected}</code>
        </p>
      )}

      {creating && config && (
        <CreateConversation config={config} onClose={() => setCreating(false)} onCreated={selectFromOutside} />
      )}

      {listReady && <ChatDock mode={dock} onModeChange={setDock} selected={selected} onSelect={selectFromOutside} />}
    </section>
  )
}
