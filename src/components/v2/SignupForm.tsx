'use client'

import { useState } from 'react'

import { useV2 } from '@/kairo/v2/context'
import { newRequestKey, signup, type SignupResult } from '@/lib/v2/api'

/*
  Người dùng tự tạo tài khoản Kairo từ phần mềm doanh nghiệp (REST `POST /sdk/v2/users`).

  Tài khoản vừa tạo:
    · đăng nhập được NGAY trên web-enduser của cùng tenant (email + mật khẩu Kairo trả về), vai member;
    · Kairo KHÔNG gửi mail — trang này hiện mật khẩu một lần, đúng vai "bên tích hợp tự phân phối";
    · nếu email đã có mật khẩu (tài khoản cũ) → `existing`, KHÔNG trả / KHÔNG đặt lại mật khẩu.

  Idempotency: `requestKey` sinh MỘT lần mỗi lượt điền form, bấm lại / mạng chập gửi lại đúng mã
  đó → Kairo trả lại đúng kết quả (kể cả mật khẩu, trong 24 giờ) chứ không tạo thêm. Sửa bất kỳ ô
  nào là một lượt mới (mã mới) — Kairo từ chối cùng mã khác dữ liệu (idempotency_mismatch).
*/

const RESULT_TEXT: Record<string, string> = {
  created: 'Đã tạo tài khoản mới.',
  initialized: 'Email này đã có trong tenant nhưng chưa có mật khẩu — đã cấp mật khẩu lần đầu.',
  existing: 'Email này đã có tài khoản và mật khẩu từ trước — Kairo không trả và không đặt lại mật khẩu.',
}

export function SignupForm() {
  const { config } = useV2()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [externalId, setExternalId] = useState('')
  const [openDirect, setOpenDirect] = useState(true)
  const [requestKey, setRequestKey] = useState(newRequestKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SignupResult | null>(null)

  // Đổi dữ liệu = lượt mới.
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setRequestKey(newRequestKey())
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setResult(await signup({ email, displayName: name, externalId, requestKey, openDirect }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function again() {
    setResult(null)
    setEmail('')
    setName('')
    setExternalId('')
    setRequestKey(newRequestKey())
  }

  if (result) return <SignupDone result={result} fixedName={config?.fixedUser.displayName} onAgain={again} />

  return (
    <form className="v2-card v2-form" onSubmit={submit}>
      <h1>Tạo tài khoản Kairo</h1>
      <p className="v2-muted">
        Tài khoản thuộc tenant <b>{config?.tenantSlug ?? '…'}</b> (tenant của app-key), vai thành viên. Tạo xong đăng
        nhập được ngay trên web-enduser.
      </p>

      <label className="v2-field">
        Email
        <input type="email" required value={email} onChange={edit(setEmail)} placeholder="ten.ban@cardoctor.vn" />
      </label>
      <label className="v2-field">
        Tên hiển thị
        <input required maxLength={120} value={name} onChange={edit(setName)} placeholder="Nguyễn Văn A" />
      </label>
      <div className="v2-field">
        <label htmlFor="signup-external">Mã nhân sự (tuỳ chọn)</label>
        <input
          id="signup-external"
          maxLength={200}
          value={externalId}
          onChange={edit(setExternalId)}
          placeholder="NV-0042"
          aria-describedby="signup-external-hint"
        />
        {/* Gợi ý nằm NGOÀI <label>: chữ trong label tính vào tên ô, có "email" là hai ô cùng tên "Email". */}
        <span id="signup-external-hint" className="v2-muted v2-hint">
          externalId bên phần mềm của bạn — để trống thì tự đặt <code>kpn:&lt;địa chỉ đăng nhập&gt;</code>.
        </span>
      </div>
      <label className="v2-check">
        <input type="checkbox" checked={openDirect} onChange={(e) => setOpenDirect(e.target.checked)} />
        Mở sẵn hội thoại 1-1 với <b>{config?.fixedUser.displayName ?? 'user của panel'}</b> để nhắn thử ngay
      </label>

      {error && (
        <p className="v2-error" role="alert">
          {error}
        </p>
      )}

      <div className="v2-actions">
        <button type="submit" className="v2-btn v2-btn-primary" disabled={busy}>
          {busy ? 'Đang tạo… (có thể tới vài chục giây)' : 'Tạo tài khoản'}
        </button>
      </div>
    </form>
  )
}

function SignupDone({
  result,
  fixedName,
  onAgain,
}: {
  result: SignupResult
  fixedName: string | undefined
  onAgain: () => void
}) {
  const [shown, setShown] = useState(false)
  const u = result.user

  return (
    <section className="v2-card v2-done" aria-live="polite">
      <h1>{result.result === 'existing' ? 'Tài khoản đã có sẵn' : 'Đã tạo tài khoản'}</h1>
      <p>
        {RESULT_TEXT[result.result] ?? `Kết quả: ${result.result}.`}
        {result.replayed && ' (Kairo trả lại kết quả của lượt gửi trước — không tạo thêm.)'}
      </p>

      <dl className="v2-kv">
        <dt>Tenant (không gian)</dt>
        <dd>
          <code>{result.tenantSlug}</code>
        </dd>
        <dt>Email đăng nhập</dt>
        <dd>
          <code>{u?.email}</code>
        </dd>
        <dt>Tên hiển thị</dt>
        <dd>{u?.displayName}</dd>
        <dt>Mật khẩu</dt>
        <dd>
          {result.password ? (
            <>
              <code className="v2-secret">{shown ? result.password : '•'.repeat(12)}</code>{' '}
              <button type="button" className="v2-btn" onClick={() => setShown((s) => !s)}>
                {shown ? 'Ẩn' : 'Hiện'}
              </button>{' '}
              <span className="v2-muted">Chỉ hiện ở đây — Kairo không gửi mail.</span>
            </>
          ) : (
            <span className="v2-muted">Không trả (tài khoản đã có mật khẩu từ trước).</span>
          )}
        </dd>
        <dt>userId</dt>
        <dd>
          <code>{u?.userId}</code>
        </dd>
      </dl>

      {result.loginUrl ? (
        <p>
          Đăng nhập:{' '}
          <a href={result.loginUrl} target="_blank" rel="noreferrer">
            {result.loginUrl}
          </a>{' '}
          — nếu được hỏi không gian, gõ <code>{result.tenantSlug}</code>.
        </p>
      ) : (
        <p className="v2-muted">Chưa khai KAIRO_ENDUSER_URL nên không có link đăng nhập.</p>
      )}

      {result.direct?.conversationId && (
        <p>
          Đã mở hội thoại 1-1 với <b>{fixedName}</b>.{' '}
          <a href={`/v2/panel?c=${encodeURIComponent(result.direct.conversationId)}`}>Mở trong panel →</a>
          <br />
          <span className="v2-muted">
            Web-enduser ẩn hội thoại 1-1 chưa có tin — gửi một tin từ panel trước, người mới sẽ thấy ngay.
          </span>
        </p>
      )}
      {result.direct?.error && (
        <p className="v2-error">Tài khoản đã tạo, nhưng chưa mở được hội thoại 1-1: {result.direct.error}</p>
      )}

      <div className="v2-actions">
        <button type="button" className="v2-btn" onClick={onAgain}>
          Tạo tài khoản khác
        </button>
      </div>
    </section>
  )
}
