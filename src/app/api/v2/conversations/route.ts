import { kairoEnv } from '@/server/kairo'
import { handle, readJson, requireEmail, requireText } from '@/server/route'
import {
  V2Error,
  createBusiness,
  createDirect,
  createGroup,
  fixedUser,
  invitationLink,
  listConversations,
  peerNames,
  requireUserByEmail,
} from '@/server/v2'

export const dynamic = 'force-dynamic'

/**
 * Hội thoại của user cố định, nhìn từ phía SERVER tích hợp (app-key).
 *
 * Danh sách hiển thị cho người dùng là `KairoConversationListV2` (đi theo token phiên); route GET
 * này để trang kiểm thử đối chiếu "REST thấy gì" với "bundle hiện gì", và cho thanh tiêu đề của
 * dock chat (`ChatDock`).
 *
 * `?names=1`: hội thoại 1-1 có `title` rỗng ở SDK — điền `peerName` (tên người kia) bằng
 * `/users/resolve`. Mặc định không tra, để bảng "REST thấy gì" đúng nguyên văn SDK.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const me = await fixedUser()
    const conversations = await listConversations(me.userId)
    if (new URL(req.url).searchParams.get('names') !== '1') return { conversations }
    const names = await peerNames(me.userId, conversations)
    return {
      conversations: conversations.map((c) => (names.has(c.id) ? { ...c, peerName: names.get(c.id) } : c)),
    }
  })
}

type CreateBody = {
  kind?: 'direct' | 'group' | 'business'
  /** direct: email người kia. */
  peerEmail?: string
  /** group/business: tiêu đề. */
  title?: string
  /** group/business: email thành viên nội bộ (không gồm user cố định). */
  memberEmails?: string[]
  /** business: số link mời đối tác (1–10). */
  invitationCount?: number
}

/**
 * Tạo hội thoại nhân danh user cố định — việc mà danh sách nhúng CỐ Ý không làm ("không nút tạo
 * hội thoại", INTEGRATION §0): bên tích hợp tạo qua REST ở server của mình.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<CreateBody>(req)
    const me = await fixedUser()

    if (body.kind === 'direct') {
      const peer = await requireUserByEmail(requireEmail(body.peerEmail, 'Email người nhận'))
      if (peer.userId === me.userId) throw new V2Error('Không mở hội thoại 1-1 với chính mình.', 400)
      const { conversationId } = await createDirect(me.userId, peer.userId)
      return { conversationId, kind: 'direct', invitations: [] }
    }

    if (body.kind === 'group' || body.kind === 'business') {
      const title = requireText(body.title, 'tiêu đề', 120)
      const emails = [...new Set((body.memberEmails ?? []).map((e) => requireEmail(e, `Email thành viên "${e}"`)))]
      const members = []
      for (const email of emails) members.push(await requireUserByEmail(email))
      const memberIds = members.map((m) => m.userId).filter((id) => id !== me.userId)

      if (body.kind === 'group') {
        if (memberIds.length < 2) throw new V2Error('Nhóm cần ít nhất 2 người khác ngoài bạn.', 400)
        const issued = await createGroup(me.userId, title, memberIds)
        return { conversationId: issued.conversationId, kind: 'group', invitations: [] }
      }

      const count = Number.isInteger(body.invitationCount) ? Number(body.invitationCount) : 1
      if (count < 1 || count > 10) throw new V2Error('Số link mời đối tác phải từ 1 đến 10.', 400)
      const issued = await createBusiness(me.userId, title, memberIds, count)
      const { enduserUrl } = kairoEnv()
      return {
        conversationId: issued.conversationId,
        kind: 'business',
        invitations: issued.invitations.map((i) => ({
          invitationId: i.invitationId,
          expiresAt: i.expiresAt,
          link: invitationLink(enduserUrl, i.token),
          token: enduserUrl ? null : i.token,
        })),
      }
    }

    throw new V2Error('kind phải là direct, group hoặc business.', 400)
  })
}
