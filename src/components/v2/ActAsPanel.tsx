'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { V2Provider, useV2 } from '@/kairo/v2/context'
import { forgetRecentActAs, readLastActAs, readRecentActAs, rememberActAs, setActAs } from '@/lib/v2/actAs'
import { clearSessionV2, lookupUser, type LookedUpUser } from '@/lib/v2/api'
import { PanelWorkbench } from './PanelWorkbench'
import { V2Shell } from './Shell'

/*
  Trang `/v2/panel-nguoi-dung`: cùng panel nhúng như `/v2/panel`, nhưng người "đang đăng nhập" do
  người thử CHỌN trên trang (nhập email) thay vì đọc từ env (`DEMO_V2_USER_EMAIL`).

  Chọn xong: đặt `setActAs(email)` → mọi lời gọi `/api/v2/*` mang header `x-kpn-act-as`
  (src/lib/client.ts) → server xin token phiên, tra hội thoại, tạo hội thoại… nhân danh người đó.
  Đổi người = dựng lại V2Provider (key theo email) và vứt token cũ — panel mount lại từ đầu, không
  bao giờ lẫn phiên của hai người. Người đang chọn nằm trên URL (`?as=`) để gửi link cho nhau.
*/

type Picked = { email: string; user: LookedUpUser }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readAsParam(): string | null {
  const v = new URLSearchParams(window.location.search).get('as')
  return v ? v.trim().toLowerCase() : null
}

function writeAsParam(email: string | null) {
  const q = new URLSearchParams(window.location.search)
  if (email) q.set('as', email)
  else {
    q.delete('as')
    // Hội thoại đang chọn là của người cũ — không mang sang người mới.
    q.delete('c')
  }
  const qs = q.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
}

export function ActAsPanel() {
  // undefined = đang đọc URL/localStorage lúc vào trang; null = chưa chọn ai.
  const [picked, setPicked] = useState<Picked | null | undefined>(undefined)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootEmail, setBootEmail] = useState('')

  const apply = useCallback((next: Picked | null) => {
    // Đặt danh tính TRƯỚC khi đổi state: V2Provider mới (key đổi) nạp config ngay ở lần commit tới.
    setActAs(next?.email ?? null)
    clearSessionV2()
    writeAsParam(next?.email ?? null)
    // Bấm "Đổi người dùng" = quên luôn người vừa dùng (vẫn giữ trong danh sách gần đây), để tải lại
    // trang không tự quay về người đó.
    rememberActAs(next?.email ?? null)
    setPicked(next)
  }, [])

  // Vào trang: ?as= trên URL thắng người dùng lần trước.
  useEffect(() => {
    const email = readAsParam() ?? readLastActAs()
    if (!email) {
      setActAs(null)
      setPicked(null)
      return
    }
    const ctrl = new AbortController()
    setActAs(null)
    lookupUser(email, ctrl.signal).then(
      (user) => apply({ email: user.email.toLowerCase(), user }),
      (err: unknown) => {
        if (ctrl.signal.aborted) return
        setBootEmail(email)
        setBootError(err instanceof Error ? err.message : String(err))
        writeAsParam(null)
        rememberActAs(null)
        setPicked(null)
      },
    )
    return () => ctrl.abort()
  }, [apply])

  // Rời trang (điều hướng trong app) thì trả lại danh tính env cho các trang khác.
  useEffect(() => () => setActAs(null), [])

  return (
    <V2Provider key={picked?.email ?? 'env'} needBundle={Boolean(picked)}>
      <V2Shell>
        {picked === undefined ? (
          <p className="v2-muted ap-boot">Đang kiểm tra người dùng lần trước…</p>
        ) : picked ? (
          <>
            <ActingBar picked={picked} onChange={() => apply(null)} />
            <PanelWorkbench key={picked.email} allowDock={false} />
          </>
        ) : (
          <Chooser initialEmail={bootEmail} initialError={bootError} onPicked={apply} />
        )}
      </V2Shell>
    </V2Provider>
  )
}

function ActingBar({ picked, onChange }: { picked: Picked; onChange: () => void }) {
  const { config } = useV2()
  const { user } = picked
  return (
    <div className="ap-bar" role="status">
      <span className="ap-avatar" aria-hidden="true">
        {(user.displayName || user.email).trim().charAt(0).toUpperCase()}
      </span>
      <div className="ap-who">
        <span className="ap-label">Panel đang chạy dưới danh tính</span>
        <span>
          <b>{user.displayName || '(chưa đặt tên)'}</b> · <code>{user.email}</code>
          {user.roles.length > 0 && <span className="v2-muted"> · {user.roles.join(', ')}</span>}
          {config && <span className="v2-muted"> · tenant {config.tenantSlug}</span>}
        </span>
      </div>
      <button type="button" className="v2-btn" onClick={onChange}>
        Đổi người dùng
      </button>
    </div>
  )
}

function Chooser({
  initialEmail,
  initialError,
  onPicked,
}: {
  initialEmail: string
  initialError: string | null
  onPicked: (p: Picked) => void
}) {
  const { config } = useV2()
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setRecent(readRecentActAs())
    inputRef.current?.focus()
    return () => ctrlRef.current?.abort()
  }, [])

  const pick = async (raw: string) => {
    const value = raw.trim().toLowerCase()
    if (!EMAIL.test(value)) {
      setError('Nhập một email hợp lệ, ví dụ ten@congty.vn.')
      inputRef.current?.focus()
      return
    }
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setBusy(true)
    setError(null)
    setEmail(value)
    try {
      const user = await lookupUser(value, ctrl.signal)
      onPicked({ email: user.email.toLowerCase(), user })
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="ap-choose">
      <form
        className="v2-card v2-form ap-card"
        onSubmit={(e) => {
          e.preventDefault()
          void pick(email)
        }}
        noValidate
      >
        <div>
          <h1>Chọn người dùng cho panel</h1>
          <p className="v2-muted">
            Panel và danh sách hội thoại sẽ nhúng dưới danh tính người này — thay cho user cố định của env
            {config && (
              <>
                {' '}
                (<code>{config.fixedUser.email}</code>)
              </>
            )}
            . Người được chọn phải là thành viên đang hoạt động của tenant
            {config ? (
              <>
                {' '}
                <b>{config.tenantSlug}</b>
              </>
            ) : null}
            .
          </p>
        </div>

        <label className="v2-field">
          <span>Email người dùng</span>
          <input
            ref={inputRef}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="ten@congty.vn"
            value={email}
            maxLength={254}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'ap-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
          />
        </label>

        {error && (
          <p className="v2-error" id="ap-error" role="alert">
            {error}
          </p>
        )}

        <div className="v2-actions">
          <button type="submit" className="v2-btn v2-btn-primary" disabled={busy || !email.trim()}>
            {busy ? 'Đang kiểm tra…' : 'Mở panel'}
          </button>
        </div>

        {recent.length > 0 && (
          <div className="ap-recent">
            <span className="v2-muted">Dùng gần đây</span>
            <ul>
              {recent.map((r) => (
                <li key={r}>
                  <button type="button" className="ap-chip" disabled={busy} onClick={() => void pick(r)}>
                    {r}
                  </button>
                  <button
                    type="button"
                    className="ap-chip-x"
                    aria-label={`Bỏ ${r} khỏi danh sách gần đây`}
                    disabled={busy}
                    onClick={() => setRecent(forgetRecentActAs(r))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  )
}
