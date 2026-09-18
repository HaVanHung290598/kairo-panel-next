import { browserEndpoints, kairoEnv, kairoRuntime } from '@/server/kairo'
import { handle } from '@/server/route'
import { fixedUser } from '@/server/v2'

export const dynamic = 'force-dynamic'

/**
 * Cấu hình runtime cho các trang `/v2/*` — không secret, không token.
 *
 * `fixedUser` là người "đang đăng nhập" của phần mềm doanh nghiệp (xem `fixedUser()`); trả kèm
 * để trang hiện rõ panel đang chạy dưới danh tính ai.
 */
export async function GET() {
  return handle(async () => {
    const env = kairoEnv()
    const ep = browserEndpoints()
    const user = await fixedUser()
    return {
      runtime: kairoRuntime(),
      graphqlUrl: ep.graphqlUrl,
      wsUrl: ep.wsUrl,
      livekitUrl: ep.livekitUrl,
      widgetUrl: ep.widgetV2Url,
      guestTenant: env.guestTenant,
      tenantSlug: env.tenantSlug,
      enduserUrl: env.enduserUrl,
      fixedUser: { userId: user.userId, email: user.email, displayName: user.displayName, roles: user.roles },
    }
  })
}
