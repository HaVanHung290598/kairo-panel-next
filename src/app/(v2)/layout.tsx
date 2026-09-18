import type { Metadata } from 'next'

import './v2.css'

export const metadata: Metadata = {
  title: 'GaraSoft · Kairo SDK v2',
  description: 'Bộ kiểm thử nhúng Kairo bản v2 — panel nội bộ, danh sách hội thoại, tự tạo tài khoản',
}

/*
  Nhánh kiểm thử bundle v2 (vòng 24–25). Stylesheet riêng: globals.css của nhánh (app) và
  site.css của (site) đều đặt lại `*`/`body`, nạp chung là vỡ nhau (xem src/app/layout.tsx).
  Trang /v2/gara nằm ở nhánh (site) vì nó là website công khai, không phải phần mềm nội bộ.
*/
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
