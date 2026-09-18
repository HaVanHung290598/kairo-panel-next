import type { KairoConfigV2 } from '@/lib/v2/api'
import { absoluteHttp, absoluteWs } from '../absoluteUrl'

/**
 * Tham số chung mọi bề mặt v2 cần: địa chỉ máy chủ (đã tuyệt đối hoá) + slug tenant.
 *
 * KHÔNG truyền `swPath`: thông báo đẩy của panel v2 đang tạm tắt ở phía Kairo (nợ C77 vòng 24),
 * truyền vào chỉ hiện nút không làm gì. `callAssetUrl` để trống — bundle tự lấy `kairo-call.js`
 * cùng thư mục với chính nó (qua proxy `/kairo/cdn/sdk/v2/` khi chạy trên máy dev).
 */
export function serverOptions(config: KairoConfigV2) {
  return {
    graphqlUrl: absoluteHttp(config.graphqlUrl),
    wsUrl: absoluteWs(config.wsUrl),
    tenantSlug: config.tenantSlug,
  }
}

export function panelExtras(config: KairoConfigV2) {
  return {
    ...(config.livekitUrl ? { livekitUrl: absoluteWs(config.livekitUrl) } : {}),
    appUrl: window.location.origin,
  }
}
