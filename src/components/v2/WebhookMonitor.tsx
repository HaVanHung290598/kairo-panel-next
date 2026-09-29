'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addWebhookSecret,
  clearWebhookLog,
  fetchWebhookLog,
  fireSelfTest,
  removeWebhookSecret,
  saveWebhookSettings,
  WEBHOOK_EVENTS,
  type PublicSecret,
  type SignatureStatus,
  type WebhookEntry,
  type WebhookSettings,
} from '@/lib/v2/webhooks'

/*
  Bàn NHẬN webhook của Kairo (màn "SDK & Tích hợp → Đăng ký webhook" của web-tenant-admin).

  Trang chỉ đọc sổ trong bộ nhớ của server (`src/server/webhookLog.ts`) bằng poll nhẹ `?after=<seq>`;
  điểm nhận thật là `/api/webhooks/kairo[/<kênh>]`. Không bundle Kairo nào được nạp ở đây.
*/

const POLL_MS = 2000

const SIG_LABEL: Record<SignatureStatus, string> = {
  valid: 'Chữ ký đúng',
  invalid: 'Chữ ký sai',
  'no-secret': 'Chưa có secret',
  missing: 'Không ký',
}

const STATUS_OPTIONS = [
  { value: 200, label: '200 — nhận (mặc định)' },
  { value: 204, label: '204 — nhận, không thân' },
  { value: 400, label: '400 — từ chối' },
  { value: 401, label: '401 — sai xác thực' },
  { value: 404, label: '404 — không có' },
  { value: 410, label: '410 — đã gỡ' },
  { value: 500, label: '500 — lỗi (Kairo sẽ retry)' },
  { value: 503, label: '503 — bận (Kairo sẽ retry)' },
]

const DELAY_OPTIONS = [
  { value: 0, label: 'Trả ngay' },
  { value: 3000, label: 'Chậm 3 giây' },
  { value: 12000, label: 'Chậm 12 giây (quá hạn 10s của Kairo)' },
]

const EVENT_LABEL = new Map(WEBHOOK_EVENTS.map((e) => [e.value, e.label]))

function time(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN')
}

function short(id: unknown): string {
  return typeof id === 'string' && id.length > 12 ? `${id.slice(0, 8)}…` : typeof id === 'string' ? id : ''
}

function field(e: WebhookEntry, key: string): unknown {
  return e.json && typeof e.json === 'object' ? (e.json as Record<string, unknown>)[key] : undefined
}

/** Tóm tắt một dòng: các id quan trọng nhất theo nhóm sự kiện. */
function summary(e: WebhookEntry): string {
  const parts: string[] = []
  const kind = field(e, 'kind')
  if (typeof kind === 'string') parts.push(kind)
  const conv = field(e, 'conversationId')
  if (conv) parts.push(`hội thoại ${short(conv)}`)
  const msg = field(e, 'messageId')
  if (msg) parts.push(`tin ${short(msg)}`)
  const call = field(e, 'callId')
  if (call) parts.push(`cuộc gọi ${short(call)}`)
  const changed = field(e, 'changedUserIds')
  if (Array.isArray(changed)) parts.push(`đổi ${changed.length} người`)
  const members = field(e, 'memberCount')
  if (typeof members === 'number') parts.push(`${members} thành viên`)
  const rc = field(e, 'recipientCount')
  if (typeof rc === 'number') parts.push(`báo ${rc} người`)
  if (e.jsonError) parts.push(e.jsonError)
  return parts.join(' · ')
}

/** Môi trường = nhãn secret đã khớp chữ ký (mỗi lần đăng ký ở SIT/UAT, Kairo sinh một secret riêng). */
const NO_ENV = '__khong-xac-dinh__'
function envOf(e: WebhookEntry): string {
  return e.signature.status === 'valid' && e.signature.matched ? e.signature.matched : NO_ENV
}

function skewText(sec: number | null): string {
  if (sec === null) return '—'
  if (Math.abs(sec) < 2) return 'khớp giờ'
  return sec > 0 ? `trễ ${sec}s` : `sớm ${-sec}s`
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

type Filters = {
  env: string
  event: string
  sig: string
  channel: string
  source: string
  q: string
  dupOnly: boolean
}
const NO_FILTER: Filters = { env: '', event: '', sig: '', channel: '', source: '', q: '', dupOnly: false }

export function WebhookMonitor() {
  const [entries, setEntries] = useState<WebhookEntry[]>([])
  const [meta, setMeta] = useState<{ total: number; capacity: number; startedAt: string; publicUrl: string | null }>()
  const [settings, setSettings] = useState<WebhookSettings | null>(null)
  const [secrets, setSecrets] = useState<PublicSecret[]>([])
  const [pollError, setPollError] = useState<string | null>(null)
  const [live, setLive] = useState(true)
  const [filters, setFilters] = useState<Filters>(NO_FILTER)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const lastSeq = useRef(0)
  const lastRev = useRef<number | null>(null)

  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  // ── poll ──
  const pull = useCallback(async function pull(signal?: AbortSignal): Promise<void> {
    const page = await fetchWebhookLog(lastSeq.current, signal)
    // Server restart (seq tụt) hoặc bản ghi cũ bị sửa (rev đổi: kiểm lại chữ ký, xoá sổ) → đọc lại từ đầu.
    const revChanged = lastRev.current !== null && page.rev !== lastRev.current
    lastRev.current = page.rev
    if (page.lastSeq < lastSeq.current || revChanged) {
      lastSeq.current = 0
      setEntries([])
      return pull(signal)
    }
    setMeta({ total: page.total, capacity: page.capacity, startedAt: page.startedAt, publicUrl: page.publicUrl })
    setSettings(page.settings)
    setSecrets(page.secrets)
    if (page.entries.length) {
      const first = lastSeq.current === 0
      lastSeq.current = page.lastSeq
      setEntries((cur) => {
        const merged = [...cur, ...page.entries]
        return merged.length > page.capacity ? merged.slice(merged.length - page.capacity) : merged
      })
      if (!first) {
        const seqs = new Set(page.entries.map((e) => e.seq))
        setFresh(seqs)
      }
    } else {
      lastSeq.current = Math.max(lastSeq.current, page.lastSeq)
    }
    setPollError(null)
  }, [])

  useEffect(() => {
    if (!live) return
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        await pull(ctrl.signal)
      } catch (err) {
        if (!ctrl.signal.aborted) setPollError(err instanceof Error ? err.message : String(err))
      }
      if (!ctrl.signal.aborted) timer = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [live, pull])

  useEffect(() => {
    if (fresh.size === 0) return
    const t = setTimeout(() => setFresh(new Set()), 2500)
    return () => clearTimeout(t)
  }, [fresh])

  // ── lọc ──
  const channels = useMemo(() => [...new Set(entries.map((e) => e.channel))].sort(), [entries])
  const envCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(envOf(e), (m.get(envOf(e)) ?? 0) + 1)
    return m
  }, [entries])
  // Màu cố định theo thứ tự secret đã khai (secret đã xoá nhưng còn trong log thì xếp sau).
  const envColor = useMemo(() => {
    const names = secrets.map((x) => x.label)
    for (const k of envCounts.keys()) if (k !== NO_ENV && !names.includes(k)) names.push(k)
    return new Map(names.map((n, i) => [n, i % 4]))
  }, [secrets, envCounts])
  const envList = useMemo(() => [...envColor.keys()], [envColor])
  const eventCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(e.event ?? '(không rõ)', (m.get(e.event ?? '(không rõ)') ?? 0) + 1)
    return m
  }, [entries])
  const sigCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(e.signature.status, (m.get(e.signature.status) ?? 0) + 1)
    return m
  }, [entries])

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return entries
      .filter((e) => {
        if (filters.env && envOf(e) !== filters.env) return false
        if (filters.event && (e.event ?? '(không rõ)') !== filters.event) return false
        if (filters.sig && e.signature.status !== filters.sig) return false
        if (filters.channel && e.channel !== filters.channel) return false
        if (filters.source && e.source !== filters.source) return false
        if (filters.dupOnly && e.duplicateOf === null) return false
        if (q && !`${e.event ?? ''} ${e.channel} ${e.signature.matched ?? ''} ${e.bodyText}`.toLowerCase().includes(q))
          return false
        return true
      })
      .reverse()
  }, [entries, filters])

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTER)

  const toggle = (seq: number) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })

  const clearAll = async () => {
    if (!window.confirm('Xoá toàn bộ log webhook trên server? Người khác đang xem trang này cũng mất theo.')) return
    await clearWebhookLog()
    lastSeq.current = 0
    setEntries([])
    setOpen(new Set())
    await pull()
  }

  const receiverBase = meta?.publicUrl ?? (origin ? `${origin}/api/webhooks/kairo` : '')

  return (
    <div className="v2-hub wh">
      <section className="v2-card">
        <h1>Bàn nhận webhook</h1>
        <p>
          Nhận các sự kiện mà Kairo gửi về theo đăng ký ở <b>SDK &amp; Tích hợp → Đăng ký webhook</b>{' '}
          (web-tenant-admin), kiểm chữ ký <code>X-Kairo-Signature</code> và hiện log ngay khi tới.
        </p>
        <ReceiverUrl base={receiverBase} publicUrl={meta?.publicUrl ?? null} />
        <ol className="wh-steps">
          <li>Dán URL trên vào ô địa chỉ khi đăng ký webhook, tick các sự kiện muốn nhận.</li>
          <li>
            Kairo hiện secret <code>whsec_…</code> <b>một lần duy nhất</b> — dán nó vào mục <i>Secret kiểm chữ ký</i>{' '}
            bên dưới.
          </li>
          <li>Nhắn tin, tạo hội thoại, thêm người, gọi… trong tenant đó — log hiện ở cuối trang sau vài giây.</li>
        </ol>
      </section>

      <div className="wh-grid">
        <SecretsCard secrets={secrets} onChange={setSecrets} />
        <section className="v2-card">
          <h2>Cách trả lời Kairo</h2>
          <p className="v2-muted">
            Khác 2xx hoặc quá 10 giây thì Kairo ghi thất bại và gửi lại sau 1 phút → 5 phút → 30 phút; 5 lần thất bại
            liền thì endpoint chuyển &quot;lỗi&quot; ở web-tenant-admin.
          </p>
          {settings && <ResponseForm settings={settings} onSaved={setSettings} />}
          <SelfTest secrets={secrets} onFired={() => void pull()} />
        </section>
      </div>

      <section className="v2-card">
        <div className="wh-log-head">
          <h2>
            Log{' '}
            <span className="v2-muted">
              {filtered ? `${visible.length} / ` : ''}
              {entries.length} bản ghi
            </span>
          </h2>
          <div className="wh-live">
            <span className={`wh-dot${live && !pollError ? ' on' : ''}`} aria-hidden="true" />
            {pollError ? `Mất kết nối: ${pollError}` : live ? 'Đang theo dõi' : 'Đã tạm dừng'}
          </div>
          <div className="v2-actions">
            <button type="button" className="v2-btn" onClick={() => setLive((v) => !v)}>
              {live ? 'Tạm dừng' : 'Tiếp tục'}
            </button>
            <button
              type="button"
              className="v2-btn"
              disabled={visible.length === 0}
              onClick={() => download(`kairo-webhook-${new Date().toISOString().slice(0, 19)}.json`, visible)}
            >
              Tải JSON
            </button>
            <button type="button" className="v2-btn wh-danger" disabled={entries.length === 0} onClick={clearAll}>
              Xoá log
            </button>
          </div>
        </div>

        {meta && (
          <p className="v2-muted wh-meta">
            Sổ nằm trong bộ nhớ server từ {time(meta.startedAt)} {day(meta.startedAt)} — giữ {meta.capacity} bản gần
            nhất, restart container là mất.
          </p>
        )}

        {envCounts.size > 0 && (
          <div className="wh-chips" role="group" aria-label="Lọc nhanh theo môi trường">
            {[...envCounts.entries()].map(([env, n]) => (
              <button
                key={env}
                type="button"
                className={`wh-chip wh-chip-env${filters.env === env ? ' on' : ''}`}
                aria-pressed={filters.env === env}
                onClick={() => setFilter('env', filters.env === env ? '' : env)}
              >
                <EnvBadge env={env} color={envColor.get(env)} /> <b>{n}</b>
              </button>
            ))}
          </div>
        )}
        {eventCounts.size > 0 && (
          <div className="wh-chips" role="group" aria-label="Lọc nhanh theo sự kiện">
            {[...eventCounts.entries()].map(([ev, n]) => (
              <button
                key={ev}
                type="button"
                className={`wh-chip${filters.event === ev ? ' on' : ''}`}
                aria-pressed={filters.event === ev}
                onClick={() => setFilter('event', filters.event === ev ? '' : ev)}
                title={EVENT_LABEL.get(ev) ?? ev}
              >
                {ev} <b>{n}</b>
              </button>
            ))}
          </div>
        )}

        <div className="wh-filters">
          <label className="v2-field">
            <span>Môi trường</span>
            <select value={filters.env} onChange={(e) => setFilter('env', e.target.value)}>
              <option value="">Tất cả</option>
              {envList.map((n) => (
                <option key={n} value={n}>
                  {n} ({envCounts.get(n) ?? 0})
                </option>
              ))}
              <option value={NO_ENV}>Không xác định ({envCounts.get(NO_ENV) ?? 0})</option>
            </select>
          </label>
          <label className="v2-field">
            <span>Sự kiện</span>
            <select value={filters.event} onChange={(e) => setFilter('event', e.target.value)}>
              <option value="">Tất cả</option>
              {WEBHOOK_EVENTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.value} — {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span>Chữ ký</span>
            <select value={filters.sig} onChange={(e) => setFilter('sig', e.target.value)}>
              <option value="">Tất cả</option>
              {(Object.keys(SIG_LABEL) as SignatureStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SIG_LABEL[s]} ({sigCounts.get(s) ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span>Kênh</span>
            <select value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)}>
              <option value="">Tất cả</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span>Nguồn</span>
            <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="network">Kairo gửi thật</option>
              <option value="self-test">Tự bắn thử</option>
            </select>
          </label>
          <label className="v2-field wh-search">
            <span>Tìm trong thân</span>
            <input
              type="search"
              value={filters.q}
              placeholder="id hội thoại, id người, tên sự kiện…"
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </label>
          <label className="v2-check">
            <input type="checkbox" checked={filters.dupOnly} onChange={(e) => setFilter('dupOnly', e.target.checked)} />
            Chỉ bản giao lặp
          </label>
          {filtered && (
            <button type="button" className="v2-btn" onClick={() => setFilters(NO_FILTER)}>
              Bỏ lọc
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="wh-empty">
            <p>
              <b>Chưa nhận webhook nào.</b>
            </p>
            <p className="v2-muted">
              Đăng ký URL ở trên trong web-tenant-admin rồi tạo một sự kiện, hoặc bấm <i>Bắn thử</i> để xem khuôn log.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="wh-empty">
            <p className="v2-muted">Không có bản ghi nào khớp bộ lọc.</p>
          </div>
        ) : (
          <div className="v2-table-wrap">
            <table className="v2-table wh-table">
              <colgroup>
                <col style={{ width: 64 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 132 }} />
                <col style={{ width: '24%' }} />
                <col />
                <col style={{ width: 124 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 60 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Lúc nhận</th>
                  <th>Môi trường</th>
                  <th>Sự kiện</th>
                  <th>Nội dung (id)</th>
                  <th>Chữ ký</th>
                  <th>Kênh</th>
                  <th>Đã trả</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <Fragment key={e.seq}>
                    <tr
                      className={`wh-row${open.has(e.seq) ? ' open' : ''}${fresh.has(e.seq) ? ' fresh' : ''}`}
                      onClick={() => toggle(e.seq)}
                    >
                      <td className="wh-seq">
                        <button
                          type="button"
                          className="wh-expand"
                          aria-expanded={open.has(e.seq)}
                          aria-label={`${open.has(e.seq) ? 'Thu gọn' : 'Mở chi tiết'} bản ghi ${e.seq}`}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            toggle(e.seq)
                          }}
                        >
                          {open.has(e.seq) ? '▾' : '▸'}
                        </button>
                        {e.seq}
                      </td>
                      <td className="wh-time" title={e.receivedAt}>
                        {time(e.receivedAt)}
                      </td>
                      <td>
                        <EnvBadge env={envOf(e)} color={envColor.get(envOf(e))} />
                      </td>
                      <td>
                        <code className="wh-ev">{e.event ?? '(không rõ)'}</code>
                        {e.source === 'self-test' && <span className="wh-tag">tự thử</span>}
                        {e.duplicateOf !== null && <span className="wh-tag wh-tag-dup">lặp #{e.duplicateOf}</span>}
                      </td>
                      <td className="wh-sum">{summary(e)}</td>
                      <td>
                        <span className={`wh-sig wh-sig-${e.signature.status}`}>{SIG_LABEL[e.signature.status]}</span>
                      </td>
                      <td>{e.channel}</td>
                      <td>
                        {e.response.status}
                        {e.response.delayMs > 0 && <span className="v2-muted"> · {e.response.delayMs / 1000}s</span>}
                      </td>
                    </tr>
                    {open.has(e.seq) && (
                      <tr className="wh-detail-row">
                        <td colSpan={8}>
                          <Detail e={e} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key)
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
      },
      () => window.prompt('Không chép được tự động — chép tay:', text),
    )
  }
  return [copied, copy]
}

function ReceiverUrl({ base, publicUrl }: { base: string; publicUrl: string | null }) {
  const [channel, setChannel] = useState('')
  const [copied, copy] = useCopy()
  const clean = channel
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40)
  const url = base && clean ? `${base}/${clean}` : base
  const insecure = url.startsWith('http://')

  return (
    <div className="wh-url">
      <div className="wh-url-row">
        <code className="wh-url-text">{url || '…'}</code>
        <button type="button" className="v2-btn v2-btn-primary" disabled={!url} onClick={() => copy('url', url)}>
          {copied === 'url' ? 'Đã chép' : 'Chép URL'}
        </button>
      </div>
      <label className="wh-channel">
        <span className="v2-muted">Nhãn kênh (tuỳ chọn, để tách nhiều endpoint):</span>
        <input
          value={channel}
          maxLength={40}
          placeholder="vd. uat-tin-nhan"
          onChange={(e) => setChannel(e.target.value)}
          aria-label="Nhãn kênh"
        />
      </label>
      {insecure && (
        <p className="v2-hint wh-warn">
          URL này là http — Kairo SIT/UAT chỉ nhận địa chỉ https công khai
          {publicUrl ? '' : ' (khai KAIRO_WEBHOOK_PUBLIC_URL để trang in đúng URL https)'}.
        </p>
      )}
    </div>
  )
}

function SecretsCard({ secrets, onChange }: { secrets: PublicSecret[]; onChange: (s: PublicSecret[]) => void }) {
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await addWebhookSecret(label.trim(), value.trim())
      onChange(res.secrets)
      setLabel('')
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: PublicSecret) => {
    if (!window.confirm(`Xoá secret "${s.label}"? Webhook ký bằng nó sẽ hiện "chữ ký sai".`)) return
    try {
      onChange((await removeWebhookSecret(s.id)).secrets)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="v2-card">
      <h2>Secret kiểm chữ ký</h2>
      <p className="v2-muted">
        Chữ ký = HMAC-SHA256(khoá, <code>timestamp + &quot;.&quot; + thân</code>), khoá là phần sau <code>whsec_</code>{' '}
        giải base64url. Secret chỉ giữ trong bộ nhớ server, không trả lại trình duyệt.
      </p>
      <p className="v2-hint">
        <b>Nhãn = tên môi trường</b> hiện ở cột &quot;Môi trường&quot; của log (vd. <code>SIT</code>, <code>UAT</code>)
        — webhook khớp secret nào thì thuộc môi trường đó. Thêm secret sau cũng được: log cũ sẽ được kiểm lại.
      </p>
      {secrets.length > 0 ? (
        <ul className="wh-secrets">
          {secrets.map((s) => (
            <li key={s.id}>
              <b>{s.label}</b> <code>{s.hint}</code> <span className="v2-muted">{s.format}</span>
              <button type="button" className="v2-btn wh-mini" onClick={() => remove(s)} aria-label={`Xoá ${s.label}`}>
                Xoá
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wh-warn">Chưa có secret — mọi webhook sẽ hiện &quot;Chưa có secret&quot;.</p>
      )}
      <form className="v2-form wh-secret-form" onSubmit={add}>
        <label className="v2-field">
          <span>Nhãn</span>
          <input value={label} maxLength={60} placeholder="vd. UAT kairos" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="v2-field">
          <span>Secret</span>
          <input
            value={value}
            placeholder="whsec_…"
            autoComplete="off"
            spellCheck={false}
            required
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && <p className="v2-error">{error}</p>}
        <div className="v2-actions">
          <button type="submit" className="v2-btn v2-btn-primary" disabled={busy || !value.trim()}>
            {busy ? 'Đang lưu…' : 'Thêm secret'}
          </button>
        </div>
      </form>
    </section>
  )
}

function ResponseForm({ settings, onSaved }: { settings: WebhookSettings; onSaved: (s: WebhookSettings) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async (patch: Partial<WebhookSettings>) => {
    setError(null)
    try {
      onSaved((await saveWebhookSettings(patch)).settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const abnormal = settings.respondStatus >= 300 || settings.respondDelayMs > 10_000

  return (
    <div className="wh-resp">
      <label className="v2-field">
        <span>Mã trả về</span>
        <select value={settings.respondStatus} onChange={(e) => void save({ respondStatus: Number(e.target.value) })}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="v2-field">
        <span>Độ trễ</span>
        <select value={settings.respondDelayMs} onChange={(e) => void save({ respondDelayMs: Number(e.target.value) })}>
          {DELAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {saved && <p className="v2-hint">Đã lưu — áp cho webhook tiếp theo.</p>}
      {abnormal && (
        <p className="wh-warn">Đang giả lập lỗi — Kairo sẽ retry và có thể đánh dấu endpoint lỗi. Nhớ trả về 200.</p>
      )}
      {error && <p className="v2-error">{error}</p>}
    </div>
  )
}

function SelfTest({ secrets, onFired }: { secrets: PublicSecret[]; onFired: () => void }) {
  const [event, setEvent] = useState(WEBHOOK_EVENTS[0].value)
  const [secretId, setSecretId] = useState<string>('')
  const [tamper, setTamper] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // Secret vừa bị xoá thì quay về "không ký" thay vì giữ id chết.
  useEffect(() => {
    if (secretId && !secrets.some((s) => s.id === secretId)) setSecretId('')
  }, [secrets, secretId])

  const fire = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await fireSelfTest({ event, secretId: secretId || null, tamper, channel: '' })
      setResult(`Đã ghi #${r.seq} — ${SIG_LABEL[r.signature]}`)
      onFired()
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wh-test">
      <h3>Bắn thử</h3>
      <p className="v2-muted">Tự tạo một webhook mẫu đúng khuôn (không qua Kairo) — kiểm secret đã dán đúng chưa.</p>
      <div className="wh-test-row">
        <select value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Sự kiện bắn thử">
          {WEBHOOK_EVENTS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.value}
            </option>
          ))}
        </select>
        <select value={secretId} onChange={(e) => setSecretId(e.target.value)} aria-label="Ký bằng secret">
          <option value="">Không ký</option>
          {secrets.map((s) => (
            <option key={s.id} value={s.id}>
              Ký bằng {s.label}
            </option>
          ))}
        </select>
        <label className="v2-check">
          <input type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} />
          Sửa thân sau khi ký
        </label>
        <button type="button" className="v2-btn" disabled={busy} onClick={fire}>
          {busy ? 'Đang bắn…' : 'Bắn thử'}
        </button>
      </div>
      {result && <p className="v2-hint">{result}</p>}
    </div>
  )
}

function Detail({ e }: { e: WebhookEntry }) {
  const [copied, copy] = useCopy()
  const pretty = e.json !== null ? JSON.stringify(e.json, null, 2) : e.bodyText
  const kairoHeaders = Object.entries(e.headers).filter(([k]) => k.startsWith('x-kairo-'))
  const otherHeaders = Object.entries(e.headers).filter(([k]) => !k.startsWith('x-kairo-'))
  const s = e.signature

  return (
    <div className="wh-detail">
      <div className="wh-detail-side">
        <h4>Kiểm chữ ký</h4>
        <dl className="v2-kv">
          <dt>Kết quả</dt>
          <dd>
            <span className={`wh-sig wh-sig-${s.status}`}>{SIG_LABEL[s.status]}</span>
            {s.matched && (
              <>
                {' '}
                — khớp secret <b>{s.matched}</b>
                {s.reverified && <span className="v2-muted"> (kiểm lại khi thêm secret)</span>}
              </>
            )}
          </dd>
          {s.mode === 'literal' && (
            <>
              <dt>Lưu ý</dt>
              <dd className="wh-warn">
                Khớp khi ký bằng NGUYÊN chuỗi whsec_… chứ không phải khoá giải mã — bên gửi đang ký sai cách so với
                Kairo.
              </dd>
            </>
          )}
          <dt>Timestamp</dt>
          <dd>
            {s.timestamp ?? '—'} <span className="v2-muted">({skewText(s.skewSec)})</span>
            {s.skewSec !== null && Math.abs(s.skewSec) > 300 && (
              <span className="wh-warn"> — lệch quá 5 phút, consumer thật nên từ chối</span>
            )}
          </dd>
          <dt>Nhận lúc</dt>
          <dd>
            {day(e.receivedAt)} {time(e.receivedAt)}
          </dd>
          <dt>Từ IP</dt>
          <dd>{e.remoteIp ?? '—'}</dd>
          <dt>Kích thước</dt>
          <dd>
            {e.bodyBytes} byte{e.bodyTruncated && ' (đã cắt khi lưu)'}
          </dd>
          {e.duplicateOf !== null && (
            <>
              <dt>Giao lặp</dt>
              <dd>cùng chữ ký với #{e.duplicateOf} — Kairo giao at-least-once, consumer phải chống trùng</dd>
            </>
          )}
        </dl>
        <h4>Header Kairo</h4>
        <HeaderTable rows={kairoHeaders} empty="Không có header X-Kairo-*" />
        <details>
          <summary>Header khác ({otherHeaders.length})</summary>
          <HeaderTable rows={otherHeaders} empty="—" />
        </details>
      </div>
      <div className="wh-detail-body">
        <div className="wh-body-head">
          <h4>Thân {e.json !== null ? '(JSON)' : ''}</h4>
          <button type="button" className="v2-btn wh-mini" onClick={() => copy('body', e.bodyText)}>
            {copied === 'body' ? 'Đã chép' : 'Chép thân gốc'}
          </button>
        </div>
        {e.jsonError && <p className="wh-warn">{e.jsonError}</p>}
        <pre className="wh-pre">{pretty || '(rỗng)'}</pre>
      </div>
    </div>
  )
}

function HeaderTable({ rows, empty }: { rows: [string, string][]; empty: string }) {
  if (rows.length === 0) return <p className="v2-muted">{empty}</p>
  return (
    <table className="wh-headers">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>
              <code>{v}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EnvBadge({ env, color }: { env: string; color: number | undefined }) {
  if (env === NO_ENV) return <span className="wh-env wh-env-none">Không xác định</span>
  return <span className={`wh-env wh-env-${color ?? 0}`}>{env}</span>
}
