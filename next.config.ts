import type { NextConfig } from 'next'

// Không cần proxy, không cần rewrite: FE và BE nằm chung một origin trong cùng
// ứng dụng Next này. Nhờ vậy service worker /kairo-sw.js luôn same-origin —
// điều mà bản Vite + BE riêng cổng không làm được ở môi trường dev.
const nextConfig: NextConfig = {
  output: 'standalone',
  /*
    Chặn cache cho toàn bộ /api/*.

    `export const dynamic = 'force-dynamic'` mà cả ba route đang có CHỈ tắt cache
    phía server của Next — nó không gửi header nào xuống browser. Kết quả: response
    ra khỏi app không có Cache-Control lẫn ETag, nên trình duyệt và proxy trung gian
    được quyền tự suy diễn thời hạn. Đổi KAIRO_GUEST_TENANT rồi restart vẫn có thể
    ăn config cũ; /api/records poll 5 giây có thể nhận lại bản cũ; còn /api/session
    thì trả token.

    Đặt ở đây thay vì từng route vì nó phủ luôn response lỗi (502) và mọi route
    thêm về sau — không phụ thuộc việc ai đó nhớ set.

    /kairo-sw.js KHÔNG nằm dưới /api nên không dính, và đó là chủ ý: route đó dùng
    `no-cache` (revalidate) chứ không phải `no-store`, để trình duyệt còn so byte mà
    phát hiện service worker mới.
  */
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
