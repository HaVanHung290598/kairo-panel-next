import type { Metadata } from 'next'

import { KairoGuestWidget } from '@/kairo/GuestWidget'

export const metadata: Metadata = {
  title: 'Gara Cardoctor (v2) — Sửa chữa · Đồng sơn · Cứu hộ 24/7',
}

/*
  Bản v2 của trang công khai /gara: cùng vỏ website, chỉ khác bundle — `KairoWidgetV2` từ
  `/sdk/v2/kairo-widget.js`. Đoạn nhúng tenant thật dán vào site của họ:

      <script src="…/sdk/v2/kairo-widget.js"></script>
      <script>KairoWidgetV2.mount({ tenant: '…', api: '…' })</script>

  Vòng 25 (AC-9): tin của nhân viên hiện BÍ DANH tư vấn viên do admin tenant đặt ở màn Thương
  hiệu (S22), không bao giờ hiện tên thật; chưa đặt thì hiện "Nhân viên".
*/
export default function GaraV2Page() {
  return (
    <>
      <header>
        <b>GARA CARDOCTOR</b>
        <span>Sửa chữa — Đồng sơn — Cứu hộ 24/7 · Hotline 1900 0000</span>
        <a className="site-version" href="/v2" title="Bộ kiểm thử v2">
          widget v2
        </a>
      </header>

      <section className="hero">
        <h1>Xe gặp chuyện? Báo giá trong 15 phút.</h1>
        <p>Đồng sơn, máy gầm, điện — nhận xe tất cả các hãng. Cứu hộ nội thành có mặt trong 30 phút.</p>
        <span className="phone">☎ 1900 0000</span>
      </section>

      <section className="svc">
        <div>
          <b>Đồng sơn</b>Sơn lại theo màu zin, bảo hành 12 tháng.
        </div>
        <div>
          <b>Máy — gầm</b>Đại tu, bảo dưỡng định kỳ, kiểm tra 21 điểm.
        </div>
        <div>
          <b>Cứu hộ 24/7</b>Gọi 1900 0000 hoặc nhắn ngay góc màn hình.
        </div>
      </section>

      <footer>© Gara Cardoctor · Sửa chữa — Đồng sơn — Cứu hộ 24/7 · Hotline 1900 0000</footer>

      <KairoGuestWidget version="v2" />
    </>
  )
}
