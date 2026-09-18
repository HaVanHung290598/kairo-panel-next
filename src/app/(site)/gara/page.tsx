import type { Metadata } from 'next'

import { CurrentUser } from '@/components/CurrentUser'
import { KairoGuestWidget } from '@/kairo/GuestWidget'

export const metadata: Metadata = {
  title: 'Gara Cardoctor — Sửa chữa · Đồng sơn · Cứu hộ 24/7',
}

/*
  Trang công khai giả lập của tenant: website mà khách vãng lai đang xem.

  Toàn bộ phần vỏ là của gara, không phải của Kairo. Đúng một dòng dưới cùng thuộc
  về Kairo — <KairoGuestWidget /> — tương ứng hai thẻ script mà tenant thật sẽ dán
  vào site của họ:

      <script src="/kairo-widget.js"></script>
      <script>KairoWidget.mount({ tenant: '…', api: '…' })</script>

  Ở đây không dán script trần: bundle nạp qua src/kairo/loadBundle.ts để có Promise
  rõ ràng (script inline chạy trước khi bundle tải xong thì `KairoWidget` còn
  undefined), và để lấy được hàm dọn mà mount() trả về.

  Slug tenant đến từ KAIRO_GUEST_TENANT qua /api/config, không viết cứng ở đây —
  trang này prerender tĩnh nên hằng số trong file sẽ dính vào bundle lúc build.
*/
export default function GaraPage() {
  return (
    <>
      <header>
        <b>GARA CARDOCTOR</b>
        <span>Sửa chữa — Đồng sơn — Cứu hộ 24/7 · Hotline 1900 0000</span>
        <CurrentUser />
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

      <KairoGuestWidget />
    </>
  )
}
