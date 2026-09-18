/**
 * Chữ ký công khai của bundle nhúng Kairo — khớp `srcroot/widget-embed/src/panel.tsx` (v1),
 * `srcroot/widget-embed/src/v2/index.tsx` và `src/v2/conversations.tsx` (v2) trong repo
 * kairos-viper. Đây là hợp đồng, đổi là vỡ mọi bên tích hợp.
 */
export type KairoPanelMountOptions = {
  /** Selector hoặc phần tử. Không tồn tại thì mount() throw ĐỒNG BỘ. */
  target: HTMLElement | string
  /** v2: direct · group · channel · business (v1: chỉ business). */
  conversationId: string
  token: string
  graphqlUrl?: string
  wsUrl?: string
  /** Chỉ v2: signaling LiveKit (ws/wss). Bỏ trống thì v2 suy `<origin graphql>/livekit`. */
  livekitUrl?: string
  /** Chỉ v2: runtime cuộc gọi. Bỏ trống thì lấy `kairo-call.js` cùng thư mục với bundle. */
  callAssetUrl?: string
  /** Chỉ v2: slug tenant — lấy màu/logo tenant. */
  tenantSlug?: string
  /** Chỉ khi bật thông báo đẩy — phải cùng origin với trang. */
  swPath?: string
  /** Base URL để service worker mở /chat/<id>. */
  appUrl?: string
  /** Chỉ v2: phiên hết hạn (`expired`) hoặc tài khoản bị khoá (`locked`). */
  onSessionEnded?: (reason: string) => void
}

export type KairoPanelApi = {
  /**
   * Dựng panel vào `target`. Trả hàm dọn dẹp: gỡ panel khỏi DOM và đóng WebSocket.
   * Bắt buộc gọi khi đổi hồ sơ hoặc rời màn — không gọi là rò kết nối.
   */
  mount(options: KairoPanelMountOptions): () => void
}

/**
 * Widget khách vãng lai — nằm CÙNG bundle kairo-widget.js với KairoPanel nhưng là
 * kênh khác hẳn: khách chưa đăng nhập, không có token, server không tham gia.
 */
export type KairoWidgetMountOptions = {
  /** Slug tenant — widget lấy thương hiệu qua guestWidgetConfig(tenantSlug). */
  tenant: string
  /** Base URL Tenant API. Widget tự nối `/graphql` và `/ws/guest`, tự bỏ `/` thừa. */
  api: string
}

export type KairoWidgetApi = {
  /**
   * Tự tạo <div> + Shadow DOM ở cuối <body> rồi dựng bubble vào đó — không nhận
   * target. Trả hàm dọn dẹp; không gọi thì mỗi lần mount lại chồng thêm một bubble.
   */
  mount(options: KairoWidgetMountOptions): () => void
}

export type KairoConversationKind = 'direct' | 'group' | 'channel' | 'business'

/** Chỉ v2 (vòng 25, AC-10) — danh sách hội thoại người đang đăng nhập là thành viên. */
export type KairoConversationListMountOptions = {
  target: HTMLElement | string
  token: string
  graphqlUrl?: string
  wsUrl?: string
  tenantSlug?: string
  /** Mặc định cả bốn loại. */
  kinds?: KairoConversationKind[]
  selectedId?: string
  /** Người dùng chọn một hàng. `layout:'list'`: host tự mount KairoPanelV2 ở đâu tuỳ ý. */
  onSelect?: (conversationId: string) => void
  /** `split`: danh sách 320px + panel (≥720px), xếp chồng khi hẹp hơn. */
  layout?: 'list' | 'split'
  /** Chuyển tiếp cho panel khi `layout:'split'` (livekitUrl, callAssetUrl, swPath…). */
  panel?: Partial<Omit<KairoPanelMountOptions, 'target' | 'token' | 'conversationId'>>
  onSessionEnded?: (reason: string) => void
}

export type KairoConversationListApi = {
  mount(options: KairoConversationListMountOptions): () => void
  /** Đổi hàng đang chọn mà không mount lại. */
  select(target: HTMLElement | string, conversationId: string | null): void
}

declare global {
  interface Window {
    KairoPanel?: KairoPanelApi
    KairoWidget?: KairoWidgetApi
    KairoPanelV2?: KairoPanelApi
    KairoWidgetV2?: KairoWidgetApi
    KairoConversationListV2?: KairoConversationListApi
  }
}
