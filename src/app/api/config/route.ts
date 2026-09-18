import { NextResponse } from 'next/server'

import { CURRENT_USER, browserEndpoints, kairoEnv } from '@/server/kairo'

export const dynamic = 'force-dynamic'

/**
 * Cấu hình runtime (không có secret) cho các trang v1 (`/` và `/gara`) — FE không hardcode
 * endpoint Kairo, không có biến NEXT_PUBLIC_* nào.
 *
 * `widgetUrl` LUÔN là bundle v1 (`/kairo-widget.js`): hai trang này là bản kiểm thử của
 * widget v1, còn v2 có cửa riêng `/api/v2/config`. Trước 18/09 route này trả nguyên
 * `KAIRO_WIDGET_JS_URL`, và khi env trỏ bundle v2 thì `/` lặng lẽ chạy panel v2.
 */
export async function GET() {
  const { guestTenant } = kairoEnv()
  const { graphqlUrl, wsUrl, livekitUrl, widgetV1Url } = browserEndpoints()
  return NextResponse.json({
    graphqlUrl,
    wsUrl,
    widgetUrl: widgetV1Url,
    livekitUrl,
    guestTenant,
    userName: CURRENT_USER.displayName,
  })
}
