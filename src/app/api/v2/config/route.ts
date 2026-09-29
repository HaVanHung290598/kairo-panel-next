import { browserEndpoints, kairoEnv, kairoRuntime } from '@/server/kairo'
import { handle } from '@/server/route'
import { actAsEmail, actingUser } from '@/server/v2'

export const dynamic = 'force-dynamic'

/**
 * Cấu hình runtime cho các trang `/v2/*` — không secret, không token.
 *
 * `fixedUser` là người "đang đăng nhập" của phần mềm doanh nghiệp: user cố định của env
 * (`fixedUser()`), hoặc user chọn tay ở `/v2/panel-nguoi-dung` (`actingUser`); trả kèm để trang hiện
 * rõ panel đang chạy dưới danh tính ai.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const env = kairoEnv()
    const ep = browserEndpoints()
    const user = await actingUser(req)
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
      /** true = người trên là user chọn tay ở `/v2/panel-nguoi-dung`, không phải user của env. */
      actingAs: actAsEmail(req) !== null,
    }
  })
}
