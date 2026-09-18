import { request } from './client'

/** Cấu hình runtime do server cấp — FE không hardcode endpoint của Kairo. */
export type KairoConfig = {
  graphqlUrl: string
  wsUrl: string
  widgetUrl: string
  /** Signaling LiveKit cho cuộc gọi panel v2 — xem KAIRO_LIVEKIT_URL. null = để bundle tự suy. */
  livekitUrl: string | null
  /** Slug tenant cho widget khách — xem KAIRO_GUEST_TENANT. */
  guestTenant: string
  /** Tên nhân viên đang đăng nhập — xem DEMO_USER_NAME. */
  userName: string
}

export function fetchConfig(signal: AbortSignal): Promise<KairoConfig> {
  return request<KairoConfig>('/api/config', { signal })
}
