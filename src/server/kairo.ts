/**
 * Ranh giới DUY NHẤT của server với Kairo REST SDK.
 *
 * App-key chỉ tồn tại ở đây — file này không bao giờ được import từ component
 * client, và không route nào trả app-key xuống browser.
 */
import 'server-only'

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Thiếu biến môi trường ${name} trong .env.local`)
  return value
}

/**
 * Tiền tố đường dẫn đứng trước mọi route SDK v1 (`/v1/...`).
 *
 * SIT/UAT có gateway đứng trước, chia request theo tiền tố `/sdk` nên đường thật là
 * `https://api.<env>.yousee.vn/sdk/v1/users`. Cụm trên server kairos gọi thẳng service sdk
 * (không gateway) nên route là `/v1/users`, không có tiền tố — khai `KAIRO_SDK_PATH_PREFIX=`
 * (rỗng) trong .env.local. Không khai biến thì mặc định `/sdk`, để env SIT/UAT cũ
 * chạy nguyên không phải sửa.
 */
function sdkPathPrefix(): string {
  const value = process.env['KAIRO_SDK_PATH_PREFIX']
  return (value ?? '/sdk').replace(/\/+$/, '')
}

/**
 * Tiền tố của REST v2. Khác v1: service sdk LUÔN phục vụ v2 ở `/sdk/v2` (CONTEXT_PATH chỉ bọc
 * route v1/health legacy — `deployment/local/loop24/PROVISION-API.md` của kairos-viper), nên
 * mặc định là `/sdk/v2` kể cả ở cụm không có gateway. Gateway nào đặt v2 chỗ khác thì khai
 * `KAIRO_SDK_V2_PATH_PREFIX`.
 */
function sdkV2PathPrefix(): string {
  const value = process.env['KAIRO_SDK_V2_PATH_PREFIX']
  return (value ?? '/sdk/v2').replace(/\/+$/, '')
}

/**
 * Ứng dụng đang chạy ở đâu — trả lời câu "trình duyệt nói chuyện với Kairo bằng đường nào".
 *
 *   - `server` (mặc định): chạy trong container trên máy chủ (`.env.local` = cụm kairos-viper
 *     trên chính server kairos 192.168.110.33, `.env.sit.local`, `.env.uat.local`). Trình duyệt
 *     gọi THẲNG các URL trong env — origin của trang đã nằm trong CORS của bff.
 *   - `dev-machine`: chạy bằng `npm run dev:local` trên máy dev (Mac). Backend VẪN là cụm trong
 *     env, nhưng CORS của bff không cho origin `localhost`, nên trình duyệt chỉ gọi đường dẫn
 *     CÙNG ORIGIN `/kairo/...` và `scripts/dev-local.mjs` chuyển tiếp sang cụm (bảng
 *     `DEV_PROXY_PREFIX` bên dưới). Khai ở `.env.development.local` — Next chỉ nạp file đó khi
 *     `next dev`, và `.dockerignore` loại `.env*.local` nên nó không bao giờ lọt vào ảnh deploy.
 */
export type KairoRuntime = 'server' | 'dev-machine'

export function kairoRuntime(): KairoRuntime {
  return process.env['KAIRO_RUNTIME'] === 'dev-machine' ? 'dev-machine' : 'server'
}

/**
 * Tiền tố cùng origin mà `scripts/dev-local.mjs` chuyển tiếp — PHẢI khớp bảng `ROUTES` trong
 * script đó (script chạy ngoài Next nên không import được file này).
 */
export const DEV_PROXY_PREFIX = {
  api: '/kairo/api', // → bff-tenant (GraphQL, /ws, /ws/calls, /ws/guest, /guest/*)
  cdn: '/kairo/cdn', // → widget-embed (kairo-widget.js v1, sdk/v2/*)
  livekit: '/kairo/livekit', // → LiveKit signaling
} as const

/**
 * Bundle v1 và v2 nằm cùng một gốc CDN: `<gốc>/kairo-widget.js` và `<gốc>/sdk/v2/kairo-widget.js`.
 * `KAIRO_WIDGET_JS_URL` trỏ bản nào cũng được — lấy gốc rồi dựng cả hai; muốn trỏ riêng từng bản
 * thì khai `KAIRO_WIDGET_V1_JS_URL` / `KAIRO_WIDGET_V2_JS_URL`.
 */
function widgetUrls(): { v1: string; v2: string } {
  const legacy = need('KAIRO_WIDGET_JS_URL')
  const base = legacy.replace(/\/(sdk\/v2\/)?kairo-widget\.js(\?.*)?$/, '')
  return {
    v1: process.env['KAIRO_WIDGET_V1_JS_URL'] || `${base}/kairo-widget.js`,
    v2: process.env['KAIRO_WIDGET_V2_JS_URL'] || `${base}/sdk/v2/kairo-widget.js`,
  }
}

/** Đọc lúc chạy (không phải lúc build) để `next build` không cần .env.local. */
export function kairoEnv() {
  const widgets = widgetUrls()
  return {
    sdkBaseUrl: need('KAIRO_SDK_BASE_URL'),
    sdkPathPrefix: sdkPathPrefix(),
    sdkV2PathPrefix: sdkV2PathPrefix(),
    appKey: need('KAIRO_APP_KEY'),
    graphqlUrl: need('KAIRO_GRAPHQL_URL'),
    wsUrl: need('KAIRO_WS_URL'),
    widgetV1JsUrl: widgets.v1,
    widgetV2JsUrl: widgets.v2,
    /**
     * Signaling LiveKit cho cuộc gọi của panel v2 (ws/wss). Không bắt buộc: bỏ trống thì
     * bundle v2 tự suy `<origin của graphqlUrl>/livekit`; bundle v1 bỏ qua hoàn toàn.
     */
    livekitUrl: process.env['KAIRO_LIVEKIT_URL'] || null,
    swJsUrl: need('KAIRO_SW_JS_URL'),
    guestTenant: need('KAIRO_GUEST_TENANT'),
    /**
     * Slug tenant của APP-KEY — panel/danh sách lấy màu/logo theo nó, trang tự tạo tài khoản in
     * nó làm "không gian" để đăng nhập web-enduser. Thường trùng KAIRO_GUEST_TENANT nên không
     * khai thì dùng lại; khác nhau (widget khách của tenant A, app-key tenant B) thì khai riêng.
     */
    tenantSlug: process.env['KAIRO_TENANT_SLUG'] || need('KAIRO_GUEST_TENANT'),
    /**
     * Web-enduser của CÙNG cụm — chỉ để in link (đăng nhập sau khi tự tạo tài khoản, link mời
     * đối tác `/doi-tac/moi?token=`). Không khai thì trang ẩn link, chức năng vẫn chạy.
     */
    enduserUrl: (process.env['KAIRO_ENDUSER_URL'] || '').replace(/\/+$/, '') || null,
  }
}

/**
 * URL mà TRÌNH DUYỆT dùng để nói chuyện với Kairo, theo `kairoRuntime()`.
 *
 * Bundle v2 giải URL tương đối theo `location.href` (`widget-embed/src/v2/index.tsx`), nên ở
 * `dev-machine` trả đường dẫn cùng origin là đủ; client vẫn đổi sang tuyệt đối trước khi mount
 * (`src/kairo/absoluteUrl.ts`) để bundle v1 và WebSocket khách không phải đoán.
 */
export function browserEndpoints() {
  const env = kairoEnv()
  if (kairoRuntime() === 'dev-machine') {
    return {
      graphqlUrl: `${DEV_PROXY_PREFIX.api}/graphql`,
      wsUrl: `${DEV_PROXY_PREFIX.api}/ws`,
      livekitUrl: DEV_PROXY_PREFIX.livekit as string | null,
      widgetV1Url: `${DEV_PROXY_PREFIX.cdn}/kairo-widget.js`,
      widgetV2Url: `${DEV_PROXY_PREFIX.cdn}/sdk/v2/kairo-widget.js`,
    }
  }
  return {
    graphqlUrl: env.graphqlUrl,
    wsUrl: env.wsUrl,
    livekitUrl: env.livekitUrl,
    widgetV1Url: env.widgetV1JsUrl,
    widgetV2Url: env.widgetV2JsUrl,
  }
}

/**
 * Nhân viên "đã đăng nhập" của phần mềm doanh nghiệp — cố định cho demo. Tích
 * hợp thật thì lấy từ phiên đăng nhập của chính hệ thống doanh nghiệp.
 */
export const CURRENT_USER = {
  id: process.env.DEMO_USER_ID ?? 'fa0a48af-40fd-47c7-aab3-80e9142faa62',
  displayName: process.env.DEMO_USER_NAME ?? 'hunghv guess 2',
}

export type SdkResult<T> = {
  ok: boolean
  status: number
  body: T | null
  headers?: Headers
}

type SdkInit = RequestInit & { timeoutMs?: number }

async function send<T>(url: string, init: SdkInit): Promise<SdkResult<T>> {
  const { appKey } = kairoEnv()
  const { timeoutMs = 10_000, ...rest } = init

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${appKey}`,
        'Content-Type': 'application/json',
        ...rest.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // Mạng đứt / hết giờ: trả status 0 thay vì ném, để route trả câu lỗi rõ ràng thay vì 500 trần.
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, body: { error: `Không gọi được Kairo SDK: ${reason}` } as T }
  }

  let body: T | null = null
  try {
    body = (await res.json()) as T
  } catch {
    body = null
  }

  return { ok: res.ok, status: res.status, body, headers: res.headers }
}

export function callSdk<T>(path: string, init: SdkInit = {}): Promise<SdkResult<T>> {
  const { sdkBaseUrl, sdkPathPrefix } = kairoEnv()
  return send<T>(`${sdkBaseUrl}${sdkPathPrefix}${path}`, init)
}

/** REST v2 (`/sdk/v2/...`) — cùng app-key, key phải có phạm vi `v2` (bật ở S21). */
export function callSdkV2<T>(path: string, init: SdkInit = {}): Promise<SdkResult<T>> {
  const { sdkBaseUrl, sdkV2PathPrefix } = kairoEnv()
  return send<T>(`${sdkBaseUrl}${sdkV2PathPrefix}${path}`, init)
}

export function describeSdkError(result: SdkResult<unknown>): string {
  // v1 trả `{error: "câu"}`; v2 trả `{error: {code, message}}`.
  const body = result.body as { error?: string | { code?: string; message?: string } } | null
  if (body?.error && typeof body.error === 'object') {
    const { code, message } = body.error
    return [message, code && `(${code})`].filter(Boolean).join(' ') || `HTTP ${result.status}`
  }
  if (typeof body?.error === 'string' && body.error) return body.error
  if (body) return JSON.stringify(body)
  return `HTTP ${result.status} (không có body — có thể route chưa được deploy)`
}

/** Mã lỗi v2 (`error.code`), hoặc null. */
export function sdkErrorCode(result: SdkResult<unknown>): string | null {
  const body = result.body as { error?: { code?: string } } | null
  return body?.error && typeof body.error === 'object' ? (body.error.code ?? null) : null
}
