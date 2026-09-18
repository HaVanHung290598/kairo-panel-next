import { kairoEnv } from '@/server/kairo'
import { handle, readJson } from '@/server/route'
import { V2Error, fixedUser, invitationLink, issueInvitations } from '@/server/v2'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Cấp thêm link mời đối tác vào một kênh nghiệp vụ SẴN CÓ của user cố định. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params
    if (!UUID.test(id)) throw new V2Error('Mã hội thoại không hợp lệ.', 400)
    const body = await readJson<{ invitationCount?: number }>(req)
    const count = Number.isInteger(body.invitationCount) ? Number(body.invitationCount) : 1
    if (count < 1 || count > 10) throw new V2Error('Số link mời đối tác phải từ 1 đến 10.', 400)

    const me = await fixedUser()
    const issued = await issueInvitations(me.userId, id, count)
    const { enduserUrl } = kairoEnv()
    return {
      conversationId: issued.conversationId,
      invitations: issued.invitations.map((i) => ({
        invitationId: i.invitationId,
        expiresAt: i.expiresAt,
        link: invitationLink(enduserUrl, i.token),
        token: enduserUrl ? null : i.token,
      })),
    }
  })
}
