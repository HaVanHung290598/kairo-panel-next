import { kairoEnv } from '@/server/kairo'
import { handle, readJson, requireEmail, requireText } from '@/server/route'
import { V2Error, createDirect, fixedUser, provisionUser } from '@/server/v2'

export const dynamic = 'force-dynamic'
// SDK có thể giữ request tới 120 giây rồi mới trả 202; route phải sống lâu hơn thế.
export const maxDuration = 300

type SignupBody = {
  email?: string
  displayName?: string
  externalId?: string
  /** Mã do trình duyệt sinh MỘT lần cho mỗi lượt điền form — bấm lại thì nhận lại đúng kết quả. */
  requestKey?: string
  /** Mở sẵn hội thoại 1-1 giữa người vừa tạo và user cố định của panel. */
  openDirect?: boolean
}

const KEY = /^[A-Za-z0-9_-]{8,100}$/

/**
 * Người dùng tự tạo tài khoản Kairo (`POST /sdk/v2/users`, vòng 24 AC-4).
 *
 * Kairo trả mật khẩu một lần; tài khoản đăng nhập được NGAY trên web-enduser của cùng tenant,
 * vai `member`. Kairo không gửi mail — trang này tự hiện mật khẩu cho người vừa tạo, đúng vai
 * "bên tích hợp tự phân phối thông tin đăng nhập" của hợp đồng.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<SignupBody>(req)
    const email = requireEmail(body.email)
    const displayName = requireText(body.displayName, 'tên hiển thị', 120)
    // SDK BẮT BUỘC externalId (≤255, `sdk/internal/provision/input.go` — tài liệu PROVISION-API
    // viết như tuỳ chọn, thiếu là 400 invalid_input). Người tự đăng ký thường không có mã nhân sự,
    // nên để trống thì đặt `kpn:<email>`: cố định theo email ⇒ bấm lại vẫn cùng một danh tính.
    const typed = typeof body.externalId === 'string' ? body.externalId.trim().slice(0, 200) : ''
    const externalId = typed || `kpn:${email}`.slice(0, 255)
    if (!body.requestKey || !KEY.test(body.requestKey)) throw new V2Error('Thiếu mã lượt gửi (requestKey).', 400)

    const outcome = await provisionUser(
      { email, displayName, externalId },
      `kairo-panel-next:signup:${body.requestKey}`,
    )

    let direct: { conversationId: string | null; error: string | null } | null = null
    if (body.openDirect && outcome.user) {
      try {
        const me = await fixedUser()
        if (me.userId !== outcome.user.userId) {
          const { conversationId } = await createDirect(me.userId, outcome.user.userId)
          direct = { conversationId, error: null }
        }
      } catch (err) {
        // Tài khoản đã tạo xong — hỏng bước phụ này không được nuốt mất mật khẩu vừa cấp.
        direct = { conversationId: null, error: err instanceof Error ? err.message : String(err) }
      }
    }

    const { enduserUrl, tenantSlug } = kairoEnv()
    return {
      result: outcome.result,
      replayed: outcome.replayed,
      password: outcome.password,
      credentialsReady: outcome.credentialsReady,
      issuedAt: outcome.issuedAt,
      user: outcome.user && {
        userId: outcome.user.userId,
        email: outcome.user.email,
        displayName: outcome.user.displayName,
        roles: outcome.user.roles,
      },
      loginUrl: enduserUrl,
      tenantSlug,
      direct,
    }
  })
}
