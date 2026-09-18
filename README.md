# kairo-panel-next

Gộp `kairo-panel-demo` (frontend Vite) và `kairo-panel-demo-be` (backend Node thuần)
thành **một ứng dụng Next.js duy nhất**: giao diện phần mềm nghiệp vụ có nhúng
`KairoPanel`, và các route handler giữ app-key để nói chuyện với Kairo REST SDK.

Phần mock server / BE giả của bản demo cũ **không** được mang sang — dự án này chỉ
nói chuyện với Kairo thật.

> Mới đọc repo? Bắt đầu từ [docs/tong-quan-nhung-kairo.md](docs/tong-quan-nhung-kairo.md): trên màn
> hình phần nào của app này, phần nào của Kairo, dữ liệu đi đường nào, và vì sao.

## Chạy

```bash
npm install
cp .env.example .env.local     # rồi điền app-key thật
npm run dev                    # http://localhost:3100
```

Một tiến trình duy nhất phục vụ cả UI lẫn API.

### Chạy trên máy dev (Mac) trỏ vào cụm trên server — `npm run dev:local`

`.env.local` ở đây là env của **cụm kairos-viper trên server kairos 192.168.110.33** (chữ
"local" không có nghĩa là máy dev). Chạy thẳng `npm run dev` trên Mac thì trang tải được nhưng
panel không gọi được cụm: CORS của bff-tenant chỉ cho origin `*.tienloixanh.org`, không cho
`localhost`. Không sửa CORS của cụm dùng chung — dùng proxy cùng origin:

```bash
cp .env.development.example .env.development.local   # KAIRO_RUNTIME=dev-machine + đích proxy
npm run dev:local                                    # mở http://localhost:3100
```

`scripts/dev-local.mjs` chạy `next dev` ở cổng nội bộ 3190 và đứng trước nó ở 3100:
`/kairo/api/*` → bff-tenant, `/kairo/cdn/*` → widget-embed, `/kairo/livekit/*` → LiveKit (HTTP
lẫn WebSocket, đổi `Origin` thành origin cụm cho phép); mọi đường khác vào Next. Server biết đang
ở máy dev qua `KAIRO_RUNTIME=dev-machine` (`kairoRuntime()` trong `src/server/kairo.ts`) nên
`/api/config` và `/api/v2/config` trả đường dẫn cùng origin `/kairo/...` thay vì URL cụm.

`.env.development.local` chỉ được Next nạp khi `next dev` và bị `.dockerignore` loại — trên
server (Docker) runtime luôn là `server`, trình duyệt gọi thẳng URL trong `.env.local`.

## Bản v1 và bản v2

| Route | Bundle | Kiểm gì |
| --- | --- | --- |
| `/` | v1 `/kairo-widget.js` | `KairoPanel` v1 — kênh nghiệp vụ theo hồ sơ (giữ nguyên) |
| `/gara` | v1 | `KairoWidget` khách vãng lai (giữ nguyên) |
| `/v2` | — | tổng quan + "REST thấy gì" (`GET /sdk/v2/users/{id}/conversations`) |
| `/v2/panel` | v2 `/sdk/v2/kairo-widget.js` | `KairoConversationListV2` `split` (gói sẵn) hoặc `list` + `KairoPanelV2` (tự ghép); lọc loại; tạo 1-1 / nhóm / kênh nghiệp vụ + link mời đối tác |
| `/v2/dang-ky` | — | người dùng tự tạo tài khoản (`POST /sdk/v2/users`), đăng nhập được ngay web-enduser |
| `/v2/gara` | v2 | `KairoWidgetV2` khách vãng lai |

Mỗi trang chỉ đọc global của bản mình (`src/kairo/loadBundle.ts`) — env trỏ bundle nào cũng
không làm `/` chạy nhầm v2. Chuyển giữa v1/v2 là tải lại trang (hai bundle đều giữ store singleton).

**User của v2 là một người CÓ SẴN trong tenant** — `DEMO_V2_USER_EMAIL` (bắt buộc, không mặc
định; cụm .33 dùng `huy@cardoctor.vn`), xin token bằng `POST /sdk/v2/tokens`. Khác v1 (tự đẻ user bằng `DEMO_USER_ID`
qua `/v1/users`). Nhờ vậy panel nói chuyện được với đồng nghiệp đăng nhập web-enduser, với tài
khoản vừa tự tạo, và với đối tác tenant khác qua kênh nghiệp vụ.

Biến env thêm cho v2 — khai ở file env của từng môi trường (`.env.local`, `.env.sit.local`,
`.env.uat.local`), mẫu đầy đủ ở `.env.example`:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `DEMO_V2_USER_EMAIL` / `DEMO_V2_USER_ID` | **bắt buộc** | user cố định của các trang v2 (cụm .33: `huy@cardoctor.vn`) |
| `KAIRO_ENDUSER_URL` | — (ẩn link) | web-enduser của môi trường: link đăng nhập + link mời `/doi-tac/moi?token=` (cụm .33: `http://tienloixanh.org:55173`, trùng `PARTNER_INVITE_BASE_URL`) |
| `KAIRO_TENANT_SLUG` | = `KAIRO_GUEST_TENANT` | slug tenant của app-key, khi khác tenant của widget khách |
| `KAIRO_WIDGET_V1_JS_URL` / `KAIRO_WIDGET_V2_JS_URL` | dựng từ gốc của `KAIRO_WIDGET_JS_URL` | trỏ riêng từng bundle |
| `KAIRO_SDK_V2_PATH_PREFIX` | `/sdk/v2` | tiền tố REST v2 (sdk luôn phục vụ v2 ở `/sdk/v2`) |

App-key phải có phạm vi `v2` (bật ở màn S21 của tenant-admin).

Những điều đã đo được và nên biết khi kiểm:

- SDK **bắt buộc** `externalId` khi cấp một người (tài liệu viết như tuỳ chọn) — form để trống
  thì route tự đặt `kpn:<email>`.
- Web-enduser **ẩn hội thoại 1-1 chưa có tin**; panel v2 mở thẳng một hội thoại 1-1 rỗng bằng id
  thì header trống tên và nút gọi không đổ chuông. Gửi một tin trước (từ panel), tải lại — hết.

## Vì sao gộp lại đáng giá

Bản tách đôi có một khiếm khuyết ở dev: `kairo-sw.js` **bắt buộc same-origin** với
trang, mà Vite (5173) và BE (4173) khác cổng nên đăng ký service worker luôn lỗi.
Ở đây FE và API cùng một origin, nên `swPath: '/kairo-sw.js'` hợp lệ ở cả dev lẫn
production. Đồng thời không còn CORS, không còn `VITE_BE_BASE_URL`.

## Hai nhánh route

Cây route chia hai nhóm phục vụ hai đối tượng khác hẳn nhau, mỗi nhóm một stylesheet
riêng — `globals.css` và `site.css` đều đặt lại `*` và `body`, nạp chung là vỡ cả hai.

| Route   | Người xem            | Kênh Kairo    | Style        |
| ------- | -------------------- | ------------- | ------------ |
| `/`     | nhân viên đã đăng nhập | `KairoPanel`  | `globals.css` |
| `/gara` | khách vãng lai        | `KairoWidget` | `site.css`    |

Hai kênh KHÁC nhau, đừng nhầm. `KairoPanel` cần token do server mint và mount vào
đúng vùng của hồ sơ đang chọn. `KairoWidget` chỉ cần tenant slug, không token, tự
gắn mình vào cuối `<body>` trong Shadow DOM. Cả hai nằm chung một bundle
`kairo-widget.js`, gắn `window.KairoPanel` và `window.KairoWidget` cùng lúc — nên
`loadBundle.ts` chỉ chèn một thẻ script cho cả hai.

## Cấu trúc

```
src/
├── app/
│   ├── layout.tsx            root RỖNG: chỉ <html lang="vi">/<body>, không CSS
│   ├── globals.css           giao diện phần mềm doanh nghiệp (không phải của Kairo)
│   ├── (app)/                nhánh phần mềm nghiệp vụ
│   │   ├── layout.tsx        nạp globals.css
│   │   └── page.tsx          "/" — vỏ server component của Workspace
│   ├── (site)/               nhánh website công khai của tenant
│   │   ├── layout.tsx        nạp site.css
│   │   ├── site.css          style của gara, cố ý không dùng DS của Kairo
│   │   └── gara/page.tsx     "/gara" — trang khách vãng lai + KairoWidget
│   ├── api/config/route.ts   GET  → { graphqlUrl, wsUrl, widgetUrl, guestTenant, userName }
│   ├── api/session/route.ts  POST → mint browser user-session qua REST SDK
│   ├── api/records/route.ts  GET  → danh sách hội thoại nghiệp vụ của tenant
│   └── kairo-sw.js/route.ts  lấy kairo-sw.js từ CDN rồi phát lại cùng origin
├── server/kairo.ts           ranh giới DUY NHẤT với REST SDK — app-key chỉ ở đây
├── lib/                      ranh giới DUY NHẤT của client với API
│   ├── client.ts             fetch + lỗi, đường dẫn tương đối (cùng origin)
│   ├── config.ts             /api/config
│   ├── records.ts            /api/records
│   └── session.ts            /api/session, cache token theo expiresAt
├── kairo/                    mọi thứ dính tới bundle Kairo, gom một chỗ
│   ├── types.ts              hợp đồng KairoPanel.mount() và KairoWidget.mount()
│   ├── loadBundle.ts         chèn <script> CDN một lần, phục vụ CẢ HAI global
│   ├── useKairoPanel.ts      vòng đời mount → switch → unmount của panel
│   └── GuestWidget.tsx       bubble khách: mount + dọn, tenant truyền qua prop
├── hooks/useAsync.ts         tải dữ liệu + huỷ đúng cách
└── components/               Workspace, RecordList, PanelStage, CurrentUser
```

## Luồng dữ liệu

1. Trình duyệt mở `/` → `Workspace` gọi `/api/config` và `/api/records`.
2. Chọn một hồ sơ → `useKairoPanel` chạy song song: nạp `kairo-widget.js` từ CDN và
   gọi `POST /api/session`.
3. Server gọi Kairo REST SDK bằng app-key: `POST /sdk/v1/users` (bảo đảm user tồn
   tại) rồi `POST /sdk/v1/tokens` (mint token ngắn hạn), chỉ trả token xuống.
4. `KairoPanel.mount()` dựng panel trong Shadow DOM và tự mở GraphQL/WS thẳng tới
   Kairo Tenant API — không đi vòng qua server này.
5. Đổi hồ sơ hoặc rời trang → React gọi hàm dọn, panel gỡ khỏi DOM và WebSocket đóng.

Widget khách (`/gara`) đi đường ngắn hơn hẳn: lấy `widgetUrl` và `guestTenant` qua
`/api/config`, nạp cùng bundle đó, rồi `KairoWidget.mount({ tenant, api })`. Không có
bước mint token — khách chưa đăng nhập, `openGuestConversation` chỉ cần tenant slug.

Slug tenant nằm ở `KAIRO_GUEST_TENANT` chứ không viết cứng trong page, vì `/gara` được
prerender tĩnh: hằng số trong file sẽ dính vào bundle lúc build, đổi `.env.local` rồi
restart cũng không ăn. Đi qua `/api/config` thì giá trị đọc lúc chạy như mọi biến khác.

Biến này dùng `need()` nên BẮT BUỘC — thiếu là `/api/config` trả 500, và vì `Workspace`
cũng gọi route đó nên **cả nhánh phần mềm nghiệp vụ chết theo**, không riêng `/gara`.

## Ranh giới bảo mật

`KAIRO_APP_KEY` chỉ tồn tại trong `src/server/kairo.ts`, file này có `import
'server-only'` nên bundler chặn ngay nếu ai đó lỡ import từ component client.
Không biến `NEXT_PUBLIC_*` nào — cấu hình công khai đi qua `/api/config`.
