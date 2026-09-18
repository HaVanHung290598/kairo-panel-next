'use client'

import { usePathname } from 'next/navigation'

import { useV2 } from '@/kairo/v2/context'

/*
  Khung chung của các trang v2 — vỏ "phần mềm doanh nghiệp", không phải của Kairo.

  Link là thẻ <a> thường (tải lại trang), cố ý không dùng next/link: panel v2 giữ store
  singleton của module, và trang v1 nạp bundle khác hẳn — tải lại trang là cách chắc chắn
  nhất để hai bản không sống chung một document.
*/
const NAV = [
  { href: '/v2', label: 'Tổng quan' },
  { href: '/v2/panel', label: 'Panel nội bộ' },
  { href: '/v2/dang-ky', label: 'Tự tạo tài khoản' },
  { href: '/v2/gara', label: 'Widget khách' },
]

export function V2Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { config, error } = useV2()

  return (
    <div className="v2-app">
      <header className="v2-top">
        <a className="v2-brand" href="/v2">
          GaraSoft <span>· Kairo SDK v2</span>
        </a>
        <nav className="v2-nav" aria-label="Trang v2">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
          <a className="v2-nav-v1" href="/" title="Bản kiểm thử widget.js v1 — giữ nguyên">
            Bản v1 ↗
          </a>
        </nav>
        <div className="v2-who">
          {config && (
            <>
              <span className="v2-runtime" data-runtime={config.runtime}>
                {config.runtime === 'dev-machine' ? 'Máy dev · qua proxy' : 'Server'}
              </span>
              <span className="v2-user" title={config.fixedUser.email}>
                {config.fixedUser.displayName}
              </span>
            </>
          )}
        </div>
      </header>
      {error && (
        <p className="v2-banner" role="alert">
          {error}
        </p>
      )}
      <main className="v2-main">{children}</main>
    </div>
  )
}
