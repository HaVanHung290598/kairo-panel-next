'use client'

import { useAsync } from '@/hooks/useAsync'
import { useV2 } from '@/kairo/v2/context'
import { fetchRestConversations } from '@/lib/v2/api'

const KIND_LABEL: Record<string, string> = {
  direct: '1-1',
  group: 'Nhóm',
  channel: 'Kênh',
  business: 'Nghiệp vụ',
  guest: 'Khách',
}

/*
  Trang tổng quan v2: nói rõ từng trang kiểm cái gì của vòng 24–25, và đối chiếu "REST phía server
  thấy gì" (`GET /sdk/v2/users/{id}/conversations`, app-key) với thứ danh sách nhúng hiện ra
  (token phiên, RLS) — hai con số nên khớp (trừ hội thoại khách/lưu trữ mà danh sách cố ý bỏ).
*/
export function Hub() {
  const { config } = useV2()
  const rest = useAsync(fetchRestConversations)

  const byKind = new Map<string, number>()
  for (const c of rest.data ?? []) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1)

  return (
    <div className="v2-hub">
      <section className="v2-card">
        <h1>Bộ kiểm thử nhúng Kairo — bản v2</h1>
        <p>
          Các trang dưới đây nhúng bundle <code>/sdk/v2/kairo-widget.js</code> (vòng 24–25). Bản v1 (
          <a href="/">/</a> và <a href="/gara">/gara</a>) giữ nguyên để kiểm <code>kairo-widget.js</code> v1.
        </p>
        {config && (
          <dl className="v2-kv">
            <dt>Người đang đăng nhập (cố định)</dt>
            <dd>
              {config.fixedUser.displayName} · <code>{config.fixedUser.email}</code> · {config.fixedUser.roles.join(', ')}
            </dd>
            <dt>Tenant (app-key)</dt>
            <dd>
              <code>{config.tenantSlug}</code>
              {config.guestTenant !== config.tenantSlug && (
                <>
                  {' '}
                  · widget khách: <code>{config.guestTenant}</code>
                </>
              )}
            </dd>
            <dt>Chạy ở</dt>
            <dd>
              {config.runtime === 'dev-machine'
                ? 'máy dev — trình duyệt đi qua proxy cùng origin /kairo/* (CORS của cụm không mở cho localhost)'
                : 'server — trình duyệt gọi thẳng cụm'}
            </dd>
            <dt>Bundle v2</dt>
            <dd>
              <code>{config.widgetUrl}</code>
            </dd>
            <dt>Web-enduser</dt>
            <dd>{config.enduserUrl ? <a href={config.enduserUrl}>{config.enduserUrl}</a> : 'chưa khai KAIRO_ENDUSER_URL'}</dd>
          </dl>
        )}
      </section>

      <div className="v2-grid">
        <a className="v2-card v2-tile" href="/v2/panel">
          <h2>Panel nội bộ</h2>
          <p>
            <code>KairoConversationListV2</code> + <code>KairoPanelV2</code>: hộp thư <b>split</b> gói sẵn, hoặc danh
            sách <b>list</b> + panel tự ghép. Hội thoại 1-1 / nhóm / kênh / nghiệp vụ, gọi tới 20 người. Tạo hội thoại
            1-1, nhóm, kênh nghiệp vụ có link mời đối tác tenant khác.
          </p>
        </a>
        <a className="v2-card v2-tile" href="/v2/dang-ky">
          <h2>Tự tạo tài khoản</h2>
          <p>
            <code>POST /sdk/v2/users</code>: tạo tài khoản đăng nhập được ngay trên web-enduser, mở sẵn hội thoại 1-1
            với người của panel để nhắn qua lại.
          </p>
        </a>
        <a className="v2-card v2-tile" href="/v2/gara">
          <h2>Widget khách v2</h2>
          <p>
            <code>KairoWidgetV2</code> trên website công khai: khách vãng lai chat với tenant, thấy bí danh tư vấn viên
            (AC-9) thay tên thật.
          </p>
        </a>
      </div>

      <section className="v2-card">
        <h2>REST thấy gì</h2>
        <p className="v2-muted">
          <code>GET /sdk/v2/users/{'{userId}'}/conversations</code> bằng app-key, nhân danh user cố định.
        </p>
        {rest.error && <p className="v2-error">{rest.error}</p>}
        {rest.loading && <p className="v2-muted">Đang tải…</p>}
        {rest.data && (
          <>
            <p>
              {rest.data.length} hội thoại —{' '}
              {[...byKind.entries()].map(([k, n]) => `${KIND_LABEL[k] ?? k}: ${n}`).join(' · ') || 'chưa có'}
            </p>
            <div className="v2-table-wrap">
              <table className="v2-table">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Tiêu đề</th>
                    <th>Thành viên</th>
                    <th>Vai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rest.data.slice(0, 50).map((c) => (
                    <tr key={c.id}>
                      <td>{KIND_LABEL[c.kind] ?? c.kind}</td>
                      <td>{c.title || <span className="v2-muted">(không tiêu đề)</span>}</td>
                      <td>{c.memberCount}</td>
                      <td>{c.memberRole}</td>
                      <td>
                        {c.kind !== 'guest' && <a href={`/v2/panel?c=${encodeURIComponent(c.id)}`}>Mở</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
