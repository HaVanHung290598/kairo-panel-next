# kairo-panel-next đang làm gì — tổng quan cho người mới đọc

> Viết ngày 2026-09-18. Đọc cùng `README.md` (cách chạy, bảng env) và `docs/sdk-endpoints.md`
> (các URL gọi ra ngoài). Tài liệu này trả lời: trên màn hình phần nào là của app này, phần nào là
> của Kairo, dữ liệu đi đường nào, và vì sao một số việc phải làm ở app này chứ không phải Kairo.

## 1. Một câu tóm tắt

`kairo-panel-next` đóng vai **phần mềm của một doanh nghiệp bên ngoài** (GaraSoft — phần mềm điều
hành gara) đang **nhúng Kairo** vào trang của mình. Nó tồn tại để kiểm thử bộ nhúng của Kairo đúng
như một bên tích hợp thật sẽ dùng.

Hình dung dễ nhất: **app này là "ngôi nhà", còn bundle `kairo-widget.js` là "đồ nội thất Kairo mang
tới lắp vào"**. Nhà lo khung, lo đăng nhập, giữ chìa khoá. Đồ nội thất có điện nước riêng, tự nối
thẳng về Kairo.

Có hai bản chạy song song:

| Route | Bundle nhúng | Dùng để kiểm |
| --- | --- | --- |
| `/` | v1 — `/kairo-widget.js` | `KairoPanel` v1: kênh nghiệp vụ gắn theo hồ sơ |
| `/gara` | v1 | `KairoWidget`: bong bóng chat cho khách vãng lai |
| `/v2` | — | trang tổng quan của bản v2 |
| `/v2/panel` | v2 — `/sdk/v2/kairo-widget.js` | danh sách hội thoại + panel nội bộ (vòng 24–25 của Kairo) |
| `/v2/dang-ky` | — | người dùng tự tạo tài khoản Kairo |
| `/v2/gara` | v2 | `KairoWidgetV2`: bong bóng chat khách, bản v2 |

Bản v1 giữ nguyên để kiểm `widget.js` v1. Mỗi trang chỉ nạp và chỉ đọc bundle của bản mình
(`src/kairo/loadBundle.ts`); đi từ trang v1 sang v2 là tải lại cả trang.

## 2. Ba tầng, ba chủ

```
┌─────────────────────────────────────────────────────────────┐
│ Trình duyệt                                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Trang GaraSoft (React/Next — code trong src/)          │  │
│  │   ┌───────────────────────────────────────────────┐   │  │
│  │   │ #shadow-root — giao diện Kairo (widget.js)     │───┼──┼──► Kairo: GraphQL, WebSocket,
│  │   └───────────────────────────────────────────────┘   │  │    LiveKit (bằng token phiên)
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │ /api/* (cùng origin)
                  ┌────────▼─────────┐
                  │ Server Next       │──────────────────────────► Kairo REST SDK /sdk/v2/*
                  │ (src/app/api/*)   │    (bằng APP-KEY)
                  └──────────────────┘
```

1. **Trang GaraSoft** — phần vỏ, của app này.
2. **Bundle Kairo** — vẽ bên trong một `#shadow-root`, của Kairo.
3. **Server Next** — một "BFF mỏng" của app này: giữ app-key, đổi app-key lấy token, và làm các việc
   quản trị (tạo tài khoản, tạo hội thoại).

## 3. Trên màn hình: phần nào của ai

Lấy màn `/v2/panel` làm ví dụ.

**Của kairo-panel-next** (sửa được trong `src/`):

- thanh tối trên cùng: chữ GaraSoft, các tab Tổng quan / Panel nội bộ / Tự tạo tài khoản / Widget
  khách, nút "Bản v1", chip "Máy dev · qua proxy", tên người đang đăng nhập;
- hàng công cụ: nút *Gói sẵn (split) / Tự ghép (list + panel)*, các ô *Loại hiện*, nút *＋ Tạo hội
  thoại* cùng hộp thoại của nó;
- khung viền trắng bao ngoài và lớp phủ "Đang mở… / Thử lại / Xin phiên mới";
- dòng "Đang chọn: <id>" dưới cùng;
- toàn bộ trang `/v2`, `/v2/dang-ky`, và phần website gara ở `/gara`, `/v2/gara`.

**Của Kairo** (bundle, không sửa ở repo này — code gốc ở `srcroot/widget-embed` của kairos-viper):

- ô *Tìm cuộc trò chuyện*, nút *Tất cả / Chưa đọc*, từng hàng hội thoại;
- header hội thoại ("Trần Thị Lan · Ngoại tuyến"), các tab *Trò chuyện / Tệp / Thành viên / Lịch hẹn*;
- bong bóng tin, tin ghim, ô soạn, đính kèm, emoji;
- nút gọi và toàn bộ màn cuộc gọi;
- ở `/gara`, `/v2/gara`: bong bóng chat góc phải và khung chat của khách.

**Cách tự phân biệt:** mở DevTools — mọi thứ của Kairo nằm dưới `#shadow-root`. Shadow DOM hoạt
động như một web component tự đóng gói CSS: CSS của trang không lọt vào, CSS của Kairo không lọt ra.
Vì vậy bên trong khung mang màu xanh lá, font, bo góc của web-enduser Kairo; bên ngoài là màu xanh
dương của GaraSoft.

App chỉ làm đúng ba việc với bundle, giống `createRoot(el).render(<App/>)` rồi `root.unmount()`:

1. đưa ra một `<div>` **có chiều cao thật** (cha cao 0 là màn trắng);
2. gọi `mount({...})`;
3. gọi hàm `dispose()` mà `mount` trả về khi đổi lựa chọn hoặc rời màn (không gọi là rò WebSocket).

Vòng đời này gói trong `src/kairo/v2/useKairoMount.ts` (v2) và `src/kairo/useKairoPanel.ts` (v1).

## 4. Bundle v2 có ba bề mặt

Tải một file `sdk/v2/kairo-widget.js` là có ba global. Mỗi cái một `mount`, một Shadow DOM riêng.

| Global | Dành cho | Cần token | Hiển thị |
| --- | --- | --- | --- |
| `KairoPanelV2` | nhân viên | có — token phiên của người đó | **một** hội thoại |
| `KairoConversationListV2` | nhân viên | có | **danh sách** hội thoại người đó là thành viên |
| `KairoWidgetV2` | khách vãng lai | không (tự xin vé khách) | hộp chat khách với tenant |

- `KairoPanelV2` (vòng 24) là bản chép 1-1 khung chat của web-enduser. Vòng 25 mở cho cả 1-1, nhóm,
  kênh — không chỉ kênh nghiệp vụ như v1.
- `KairoConversationListV2` (vòng 25) có hai kiểu:
  - `split` — gói sẵn: danh sách 320px + panel bên phải (khung ≥720px), khung hẹp thì xếp chồng và
    có nút "‹ Quay lại";
  - `list` — chỉ danh sách; trang tự đặt `KairoPanelV2` ở chỗ khác khi người dùng chọn một hàng.
  Nút *Gói sẵn / Tự ghép* trên `/v2/panel` là để kiểm hai kiểu này.
- `KairoWidgetV2` thực chất vẫn là widget v1; vòng 25 thêm **bí danh tư vấn viên** (khách thấy bí
  danh do tenant đặt, không bao giờ thấy tên thật nhân viên).
- Cuộc gọi dùng thêm file `kairo-call.js` (LiveKit). Bundle tự tải file này khi người dùng bấm gọi,
  giống lazy `import()`. Trang không phải thêm thẻ script nào.

## 5. Dữ liệu đi đường nào

### Hai loại "chìa"

- **App-key** — chìa tổng của tenant. Chỉ nằm ở server Next (`src/server/kairo.ts`, có
  `import 'server-only'`). Không bao giờ xuống trình duyệt.
- **Token phiên** — chìa của **một người**, có hạn dùng. Được phép đưa xuống trình duyệt.

### Khi mở `/v2/panel`

1. Trang gọi `GET /api/v2/config` (server Next): địa chỉ GraphQL/WS/LiveKit, URL bundle, slug tenant,
   và biết "người đang đăng nhập" là ai (`DEMO_V2_USER_EMAIL`).
2. Trang gọi `POST /api/v2/session`. Server Next cầm app-key gọi Kairo:
   `POST /sdk/v2/users/resolve` (tra người theo email) → `POST /sdk/v2/tokens` (xin token), rồi chỉ
   trả token xuống trình duyệt. Token được giữ lại tới gần hạn — không xin lại mỗi lần đổi hội thoại
   (`src/lib/v2/api.ts`).
3. Trình duyệt tải bundle v2 và gọi `KairoConversationListV2.mount({ token, graphqlUrl, wsUrl, … })`.
4. Từ đây **bundle tự nói chuyện thẳng với Kairo** bằng token: GraphQL (danh sách, tin nhắn), WebSocket
   `/ws` (tin mới theo thời gian thực), `/ws/calls` (chuông), LiveKit (hình, tiếng). Server Next không
   đứng giữa nữa.

Bundle giống một SPA độc lập có Apollo và socket riêng. Dữ liệu nó thấy là **những gì người đó được
thấy** (lọc theo quyền), không phải toàn tenant.

### v1 khác v2 ở đâu

v1 (`/api/session`) **tự tạo** một user bằng `DEMO_USER_ID` qua `/v1/users` rồi xin token `/v1/tokens`.
v2 **không tạo user**: xin token cho một người **có sẵn** trong tenant. Nhờ vậy panel v2 nói chuyện
được với đồng nghiệp thật trên web-enduser, với tài khoản vừa tự tạo, và với đối tác tenant khác.

## 6. Những việc bundle cố ý KHÔNG làm — nên app này phải làm

Danh sách nhúng của Kairo cố ý **không có nút tạo hội thoại**, không có tab đối tác, chuông, lịch
chung. Kairo muốn bên tích hợp tự quyết ai nói chuyện với ai. Vì vậy các việc sau là của app này, đi
qua **server Next + app-key** (REST `/sdk/v2`), không qua bundle:

| Việc | Ở đâu trên màn hình | Gọi Kairo |
| --- | --- | --- |
| Tạo hội thoại 1-1 / nhóm | hộp thoại *＋ Tạo hội thoại* | `POST /sdk/v2/conversations/direct`, `/groups` |
| Tạo kênh nghiệp vụ + link mời đối tác | hộp thoại, tab *Nghiệp vụ + đối tác* | `POST /sdk/v2/conversations/business` |
| Người dùng tự tạo tài khoản | `/v2/dang-ky` | `POST /sdk/v2/users` |
| Xem "REST thấy gì" để đối chiếu | bảng cuối trang `/v2` | `GET /sdk/v2/users/{id}/conversations` |

Sau khi app tạo xong, bundle **tự thấy qua realtime**: hội thoại mới tự hiện trong danh sách, không
cần mount lại.

Vài điều của hợp đồng Kairo nên biết:

- **Tự tạo tài khoản:** Kairo trả mật khẩu **một lần** và **không gửi mail** — gửi thông tin đăng nhập
  là việc của bên tích hợp. Trang hiện mật khẩu tại chỗ. Email đã có tài khoản thì Kairo trả
  "existing", không trả và không đặt lại mật khẩu. Mỗi lượt điền form mang một mã lượt gửi
  (idempotency): bấm lại hay mạng chập thì nhận lại đúng kết quả cũ chứ không tạo thêm.
- **Link mời đối tác** có dạng `<web-enduser>/doi-tac/moi?token=…`. Người bên tenant khác mở link,
  đăng nhập **không gian của họ**, bấm *Tham gia*, rồi vào kênh và nói chuyện với panel.

## 7. Người thứ ba: web-enduser

Người được chat cùng không ở trong trang GaraSoft. Họ dùng **web-enduser** của cùng cụm Kairo
(cụm server kairos: `http://tienloixanh.org:55173`, màn đầu hỏi không gian: `cardoctor`, `thanhdat`…).
Ba cửa sổ cùng nhìn chung một dữ liệu:

- Huy — nhúng trong GaraSoft (panel v2);
- đồng nghiệp hoặc tài khoản vừa tự tạo — trên web-enduser, cùng tenant;
- đối tác Gara Thành Đạt — trên web-enduser, tenant khác, vào qua link mời.

Nghiệm thu vì vậy nên mở hai tab: một tab trang nhúng, một tab web-enduser.

## 8. Các ô "Loại hiện" trên `/v2/panel` làm gì

Bốn ô ứng với 4 loại hội thoại panel mở được: 1-1 = `direct`, Nhóm = `group`, Kênh = `channel` (có
dấu `#`), Nghiệp vụ = `business` (có chip công ty đối tác). Hội thoại khách vãng lai không bao giờ
hiện, dù tick gì.

Mỗi lần bấm một ô:

1. state `kinds` của trang đổi;
2. `kinds` là phụ thuộc của effect mount → danh sách cũ bị `dispose()` (gỡ Shadow DOM, đóng socket;
   ở kiểu split thì panel bên phải bị gỡ theo);
3. `KairoConversationListV2.mount({ kinds })` chạy lại, dùng lại token đang giữ (không tạo phiên mới).

`kinds` là tham số lúc `mount`; bundle không có hàm đổi nó khi đang chạy, nên trang phải mount lại —
đó là lý do danh sách nháy mỗi lần bấm. Bundle vẫn tải **toàn bộ** hội thoại rồi mới lọc ở trình duyệt.

Hệ quả nhìn thấy:

- ô tìm và pill *Chưa đọc* trở về trạng thái đầu;
- hội thoại đang mở được giữ nhờ `?c=` trên URL. Ở kiểu split, panel mở lại đúng hội thoại đó **kể cả
  khi loại của nó vừa bị bỏ tick** (bundle không đối chiếu `selectedId` với `kinds`). Ở kiểu tự ghép,
  panel là mount riêng nên đứng yên;
- bỏ tick cả bốn: không mount danh sách, trang hiện "Chọn ít nhất một loại hội thoại…".

Các ô này mô phỏng việc bên tích hợp truyền `kinds` khi nhúng — ví dụ một CRM chỉ muốn hiện kênh
nghiệp vụ: `kinds: ['business']`.

## 9. Env và nơi chạy

**Trên server (Docker):** `compose.yaml` nạp **một** file env của môi trường qua `env_file` —
`.env.local` (cụm kairos-viper trên server kairos 192.168.110.33; chữ "local" **không** có nghĩa là
máy dev), `.env.sit.local`, hoặc `.env.uat.local`. Mọi biến nằm trong file đó; mẫu đầy đủ ở
`.env.example`. Env được đọc lúc chạy, đổi env chỉ cần restart container.

Biến riêng cho v2: `DEMO_V2_USER_EMAIL` (bắt buộc — người "đang đăng nhập" của trang v2),
`KAIRO_ENDUSER_URL` (link đăng nhập và link mời), `KAIRO_TENANT_SLUG` (khi khác tenant của widget
khách). App-key phải có phạm vi `v2` (bật ở màn S21 của tenant-admin).

**Trên máy dev (Mac) — `npm run dev:local`:** CORS của cụm chỉ cho origin `*.tienloixanh.org`, không
cho `localhost`. Thay vì sửa CORS của cụm dùng chung, `scripts/dev-local.mjs` đứng trước Next làm
proxy (giống `server.proxy` của Vite):

- `/kairo/api/*` → bff-tenant, `/kairo/cdn/*` → widget-embed, `/kairo/livekit/*` → LiveKit — cả HTTP
  lẫn WebSocket, header `Origin` được đổi sang origin cụm cho phép;
- mọi đường khác → `next dev` ở cổng nội bộ.

App biết mình đang ở máy dev qua `KAIRO_RUNTIME=dev-machine`, đặt trong `.env.development.local` (mẫu:
`.env.development.example`). Next chỉ nạp file này khi `next dev`, `.dockerignore` loại nó khỏi ảnh
deploy. Khi đó `/api/config` và `/api/v2/config` trả đường dẫn cùng origin `/kairo/...` thay vì URL
cụm. Trên server không có proxy: trình duyệt gọi thẳng URL trong env.

## 10. Giới hạn và điều đã đo được

- **Một trang chỉ nên có một `KairoPanelV2`:** panel dùng lại store (singleton) của web-enduser.
  Kiểu split đã tự lo điều này; đừng mount thêm panel đơn cạnh một split.
- **Hết phiên:** token hết hạn / bị thu hồi / tài khoản khoá thì bundle gọi `onSessionEnded`. Bundle
  không tự làm mới token; trang hiện nút *Xin phiên mới* để lấy token mới rồi mount lại.
- **Thông báo đẩy (Web Push) của panel v2 đang tắt** phía Kairo (nợ C77 vòng 24) — trang không bật.
- **SDK bắt buộc `externalId`** khi tạo một người (tài liệu Kairo ghi như tuỳ chọn). Form để trống
  thì route tự đặt `kpn:<email>`.
- **Hội thoại 1-1 chưa có tin nào:** web-enduser ẩn nó khỏi danh sách; panel v2 mở thẳng nó bằng id
  thì header trống tên và nút gọi không đổ chuông. Gửi một tin đầu tiên từ panel rồi tải lại là hết.
  Đây là hành vi của bundle Kairo, không phải của app này.
- **Cuộc gọi:** đã đo được chuông đổ sang bên kia và đường tín hiệu LiveKit qua proxy thông. Hình và
  tiếng thật **chưa** đo được bằng máy — nên thử tay với hai người.

## 11. Đi tìm code ở đâu

| Muốn xem | File |
| --- | --- |
| Giữ app-key, gọi REST SDK v1/v2, chọn runtime | `src/server/kairo.ts` |
| Nghiệp vụ v2: tra người, token, tạo tài khoản, tạo hội thoại | `src/server/v2.ts` |
| Route API của app | `src/app/api/**/route.ts` |
| Nạp bundle v1/v2, không cho lẫn global | `src/kairo/loadBundle.ts` |
| Vòng đời mount / dispose bề mặt v2 | `src/kairo/v2/useKairoMount.ts` |
| Tham số truyền vào `mount` | `src/kairo/v2/mountOptions.ts` |
| Trang panel nội bộ (split/list, lọc loại) | `src/components/v2/PanelWorkbench.tsx` |
| Hộp thoại tạo hội thoại | `src/components/v2/CreateConversation.tsx` |
| Form tự tạo tài khoản | `src/components/v2/SignupForm.tsx` |
| Widget khách v1/v2 | `src/kairo/GuestWidget.tsx` |
| Proxy máy dev | `scripts/dev-local.mjs` |
| Hợp đồng bundle phía Kairo | kairos-viper: `srcroot/widget-embed/INTEGRATION.md` |
| Hợp đồng REST v2 phía Kairo | kairos-viper: `deployment/local/loop24/PROVISION-API.md`, `CONVERSATION-API.md`, `deployment/local/loop25/SDK-V21-WEBHOOK.md` |
