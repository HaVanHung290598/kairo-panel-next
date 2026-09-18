'use client'

import { useEffect, useRef, useState } from 'react'

import { createConversation, type CreateResult, type KairoConfigV2 } from '@/lib/v2/api'

/*
  Tạo hội thoại nhân danh user cố định — qua REST `/sdk/v2/conversations/*` ở server của trang.

  Danh sách nhúng của Kairo CỐ Ý không có nút tạo hội thoại (INTEGRATION §0): tạo là việc của bên
  tích hợp. Ba loại:
    · 1-1        — với một người CÙNG tenant (vd tài khoản vừa tự tạo ở /v2/dang-ky).
    · Nhóm       — ≥2 người khác cùng tenant.
    · Nghiệp vụ  — kênh có ĐỐI TÁC tenant khác: Kairo trả link mời; người bên tenant kia mở link
                   trên web-enduser, đăng nhập tenant của họ rồi chấp nhận → vào kênh, nói chuyện
                   được với panel này.
*/

type Kind = 'direct' | 'group' | 'business'

const TABS: { value: Kind; label: string }[] = [
  { value: 'direct', label: '1-1 nội bộ' },
  { value: 'group', label: 'Nhóm nội bộ' },
  { value: 'business', label: 'Nghiệp vụ + đối tác' },
]

function emails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

type Props = {
  config: KairoConfigV2
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export function CreateConversation({ config, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<Kind>('direct')
  const [peer, setPeer] = useState('')
  const [title, setTitle] = useState('')
  const [members, setMembers] = useState('')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<CreateResult | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const input =
        kind === 'direct'
          ? { kind, peerEmail: peer }
          : kind === 'group'
            ? { kind, title, memberEmails: emails(members) }
            : { kind, title, memberEmails: emails(members), invitationCount: count }
      const res = await createConversation(input)
      setDone(res)
      onCreated(res.conversationId)
      if (res.kind !== 'business') onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="v2-dialog" onClose={onClose} aria-labelledby="create-title">
      <form onSubmit={submit} className="v2-form">
        <header className="v2-dialog-head">
          <h2 id="create-title">Tạo hội thoại</h2>
          <button type="button" className="v2-x" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>

        <p className="v2-muted">
          Nhân danh <b>{config.fixedUser.displayName}</b> ({config.fixedUser.email}). Người được thêm phải là thành
          viên đang hoạt động của cùng tenant — nhập email.
        </p>

        <div className="v2-seg" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={kind === t.value}
              className={kind === t.value ? 'on' : ''}
              onClick={() => {
                setKind(t.value)
                setError(null)
                setDone(null)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {done?.kind === 'business' ? (
          <div className="v2-result">
            <p>
              Đã tạo kênh nghiệp vụ và mở nó trong panel. Gửi link dưới đây cho người bên <b>tenant khác</b>: họ mở link,
              đăng nhập web-enduser bằng tài khoản tenant của họ rồi bấm chấp nhận.
            </p>
            <InvitationList invitations={done.invitations} />
            <div className="v2-actions">
              <button type="button" className="v2-btn" onClick={onClose}>
                Xong
              </button>
            </div>
          </div>
        ) : (
          <>
            {kind === 'direct' && (
              <label className="v2-field">
                Email người nhận (cùng tenant)
                <input
                  type="email"
                  required
                  value={peer}
                  onChange={(e) => setPeer(e.target.value)}
                  placeholder="lan@cardoctor.vn"
                  autoFocus
                />
              </label>
            )}

            {kind !== 'direct' && (
              <>
                <label className="v2-field">
                  Tiêu đề
                  <input
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={kind === 'group' ? 'Tổ máy gầm' : 'Hồ sơ xe 30A-123.45'}
                    autoFocus
                  />
                </label>
                <label className="v2-field">
                  Email thành viên nội bộ {kind === 'group' ? '(ít nhất 2, cách nhau bởi dấu phẩy)' : '(tuỳ chọn)'}
                  <textarea
                    rows={2}
                    required={kind === 'group'}
                    value={members}
                    onChange={(e) => setMembers(e.target.value)}
                    placeholder="lan@cardoctor.vn, duc@cardoctor.vn"
                  />
                </label>
              </>
            )}

            {kind === 'business' && (
              <label className="v2-field v2-field-inline">
                Số link mời đối tác
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                />
              </label>
            )}

            {error && (
              <p className="v2-error" role="alert">
                {error}
              </p>
            )}

            <div className="v2-actions">
              <button type="button" className="v2-btn" onClick={onClose}>
                Huỷ
              </button>
              <button type="submit" className="v2-btn v2-btn-primary" disabled={busy}>
                {busy ? 'Đang tạo…' : 'Tạo'}
              </button>
            </div>
          </>
        )}
      </form>
    </dialog>
  )
}

function InvitationList({ invitations }: { invitations: CreateResult['invitations'] }) {
  const [copied, setCopied] = useState<string | null>(null)
  return (
    <ul className="v2-invites">
      {invitations.map((i) => {
        const value = i.link ?? i.token ?? ''
        return (
          <li key={i.invitationId}>
            <code>{value}</code>
            <button
              type="button"
              className="v2-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(value).then(() => setCopied(i.invitationId))
              }}
            >
              {copied === i.invitationId ? 'Đã chép' : 'Chép'}
            </button>
            <span className="v2-muted">hết hạn {new Date(i.expiresAt).toLocaleString('vi-VN')}</span>
          </li>
        )
      })}
      {invitations.some((i) => !i.link) && (
        <li className="v2-muted">Chưa khai KAIRO_ENDUSER_URL nên chỉ hiện token — ghép vào /doi-tac/moi?token=…</li>
      )}
    </ul>
  )
}
