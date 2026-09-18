import type { Metadata } from 'next'

/*
  Root layout CỐ Ý rỗng: chỉ dựng khung <html>/<body>, không nạp CSS nào.

  Cây route chia hai nhánh phục vụ hai đối tượng khác hẳn nhau, và chúng KHÔNG
  dùng chung style được — globals.css đặt lại `*` và `html, body`, đè vỡ trang
  website của tenant:

    (app)   phần mềm nghiệp vụ, người dùng là nhân viên  → globals.css + KairoPanel
    (site)  website công khai của tenant, người xem là khách → site.css + KairoWidget

  Mỗi nhóm tự import stylesheet của mình, nên CSS của nhánh này không lọt sang
  nhánh kia. Đây cũng là lý do không đặt <KairoGuestWidget /> ở đây nữa: bubble
  khách chỉ thuộc về (site).
*/
export const metadata: Metadata = {
  title: 'GaraSoft',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
