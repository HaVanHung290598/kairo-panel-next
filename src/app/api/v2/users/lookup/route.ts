import { handle, readJson, requireEmail } from '@/server/route'
import { V2Error, resolveUser } from '@/server/v2'

export const dynamic = 'force-dynamic'

/**
 * Tra một người trong tenant của app-key bằng email (`POST /sdk/v2/users/resolve`) — trang
 * `/v2/panel-nguoi-dung` gọi trước khi nhúng panel dưới danh tính người đó, để báo lỗi bằng câu
 * rõ ràng ("không có trong tenant", "đã bị gỡ") thay vì để panel mount hỏng.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ email?: unknown }>(req)
    const email = requireEmail(body.email)
    const user = await resolveUser({ email })
    if (!user) throw new V2Error(`Không có người dùng ${email} trong tenant của app-key.`, 404, 'not_found')
    if (!user.member || user.status !== 'active') {
      throw new V2Error(`${email} không còn là thành viên đang hoạt động của tenant.`, 409, 'member_removed')
    }
    return {
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        status: user.status,
      },
    }
  })
}
