import { handle } from '@/server/route'
import { actingUser, mintToken } from '@/server/v2'

export const dynamic = 'force-dynamic'

/**
 * Token phiên v2 cho user cố định (`POST /sdk/v2/tokens`) — hoặc cho user đã chọn trên trang
 * `/v2/panel-nguoi-dung` (header `x-kpn-act-as`, xem `actingUser`).
 *
 * Khác v1: KHÔNG tạo user — v2 xin token cho người đã có trong tenant (tra bằng email/userId).
 * Mỗi lời gọi là một phiên mới ở Kairo, nên client giữ token tới gần `expiresAt` rồi mới xin lại
 * (`src/lib/v2/session.ts`).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await actingUser(req)
    const minted = await mintToken(user.userId)
    return {
      token: minted.token,
      expiresAt: minted.expiresAt,
      user: { userId: user.userId, email: user.email, displayName: user.displayName },
    }
  })
}
