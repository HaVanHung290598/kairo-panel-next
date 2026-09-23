import type { SessionV2 } from '@/lib/v2/api'

/*
  Giao thức nhắn tin giữa trang `/v2/panel` và dock chat nhỏ `/v2/dock` (chạy trong iframe).

  Vì sao dock nằm trong iframe: bundle v2 chỉ cho MỘT `KairoPanelV2` mount trên một document
  (store chép từ web-enduser là singleton của module — mount thứ hai ném lỗi `[KairoPanelV2]`).
  Panel to của trang đã giữ suất đó, nên panel nhỏ phải sống ở document khác. Iframe cùng origin
  ⇒ gọi được `/api/v2/*` và tải lại chính bundle đó như một bản độc lập.

  Chiều đi:
    dock  → trang : `ready`              — iframe đã nạp config + bundle, sẵn sàng nhận hội thoại
    trang → dock  : `open`               — hội thoại đang chọn (null = chưa chọn) + token phiên của
                                            trang (dock dùng chung, không xin phiên Kairo thứ hai)
  Hội thoại đang chọn chỉ có MỘT nguồn: state `selected` của trang. Dock không tự đổi hội thoại —
  đổi ở thanh tiêu đề dock là đổi `selected` của trang, rồi trang gửi `open` xuống.
*/

export const DOCK_PATH = '/v2/dock'

export type DockMessage =
  | { type: 'kairo-dock:ready' }
  | { type: 'kairo-dock:open'; conversationId: string | null; session: SessionV2 | null }

export function isDockMessage(e: MessageEvent): e is MessageEvent<DockMessage> {
  if (e.origin !== window.location.origin) return false
  const t = (e.data as { type?: unknown } | null)?.type
  return t === 'kairo-dock:ready' || t === 'kairo-dock:open'
}

export function postDock(target: Window | null | undefined, msg: DockMessage): void {
  target?.postMessage(msg, window.location.origin)
}
