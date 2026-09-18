import type { Metadata } from 'next'

import '../globals.css'

export const metadata: Metadata = {
  title: 'GaraSoft — phần mềm điều hành',
  description: 'Demo nhúng Kairo Panel vào phần mềm nghiệp vụ doanh nghiệp',
}

/*
  Nhánh phần mềm nghiệp vụ. KairoPanel KHÔNG mount ở đây: nó bám theo hồ sơ đang
  chọn nên do Workspace dựng (xem src/kairo/useKairoPanel.ts). Layout này chỉ giữ
  đúng phần chung của nhánh — stylesheet và tiêu đề.
*/
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
