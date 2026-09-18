# Thống kê URL gọi ra ngoài & CURL cho Kairo REST SDK

> Khảo sát ngày 2026-09-11. Mọi response trong tài liệu là kết quả gọi thật vào **SIT**,
> không phải ví dụ bịa. Thay `<APP_KEY>` bằng giá trị `KAIRO_APP_KEY` trong `.env.local`
> — file này **không** chứa app-key thật vì nó nằm trong repo và được rsync lên server.

## 1. Toàn cảnh

Dự án chạm đúng **8 URL** trên **2 host**. Cột "Ai gọi" là ranh giới quan trọng nhất:
app-key chỉ tồn tại ở ba dòng đầu, tất cả sau `import 'server-only'`
([src/server/kairo.ts:7](../src/server/kairo.ts#L7)) nên bundler chặn ngay nếu ai đó lỡ
import từ component client.

| # | URL | Method | Ai gọi | Xác thực | Code |
| - | --- | ------ | ------ | -------- | ---- |
| 1 | `{SDK_BASE}/sdk/v1/business-conversations` | GET | **server** | app-key | [records/route.ts:16](../src/app/api/records/route.ts#L16) |
| 2 | `{SDK_BASE}/sdk/v1/users` | POST | **server** | app-key | [session/route.ts:16](../src/app/api/session/route.ts#L16) |
| 3 | `{SDK_BASE}/sdk/v1/tokens` | POST | **server** | app-key | [session/route.ts:24](../src/app/api/session/route.ts#L24) |
| 4 | `{SW_JS_URL}` | GET | **server** | không | [kairo-sw.js/route.ts:17](../src/app/kairo-sw.js/route.ts#L17) |
| 5 | `{WIDGET_JS_URL}` | GET | browser | không | [loadBundle.ts](../src/kairo/loadBundle.ts) |
| 6 | `{GRAPHQL_URL}` | POST | browser | user token | trong bundle Kairo |
| 7 | `{WS_URL}` | WS | browser | user token | trong bundle Kairo |
| 8 | `{GRAPHQL_BASE}/ws/guest` | WS | browser | tenant slug | trong bundle Kairo |

Host: `api.sit.yousee.vn` (1–3, 6–8) và `d3ikqcrv5ojj7m.cloudfront.net` (4–5).

URL 5–8 **không đi qua server này** — browser nói thẳng với Kairo. Reverse proxy đặt
trước app không nhìn thấy và cũng không cấu hình gì được cho chúng, kể cả WebSocket.
Đây là lý do nginx của dự án không cần header `Upgrade`/`Connection`.

## 2. Biến môi trường liên quan

Tất cả đọc lúc chạy qua `kairoEnv()` ([src/server/kairo.ts:16](../src/server/kairo.ts#L16)),
không phải lúc build — nên `next build` không cần `.env.local`, còn `next start` thì cần.

| Biến | Phục vụ URL # |
| ---- | ------------- |
| `KAIRO_SDK_BASE_URL` | 1, 2, 3 |
| `KAIRO_APP_KEY` | xác thực 1, 2, 3 |
| `KAIRO_SW_JS_URL` | 4 |
| `KAIRO_WIDGET_JS_URL` | 5 |
| `KAIRO_GRAPHQL_URL` | 6, và suy ra base cho 8 |
| `KAIRO_WS_URL` | 7 |
| `KAIRO_GUEST_TENANT` | tham số cho 8 |

---

## 3. CURL thẳng — 4 API mà server gọi

Copy dán chạy ngay. Đây đúng là những lời gọi mà `callSdk()` thực hiện phía server.

### 3.1 Lấy danh sách hội thoại nghiệp vụ

```bash
curl -s -X GET 'https://api.sit.yousee.vn/sdk/v1/business-conversations' \
  -H 'Authorization: Bearer <APP_KEY>' \
  -H 'Content-Type: application/json'
```

Đo được: `200` · 10 hội thoại · ~0.17–0.21s

```json
{
  "conversations": [
    {
      "id": "e7c02fc4-34a4-4549-b5aa-5cf2dcf930df",
      "title": "Giám định — xe chị Linh",
      "lastMessageAt": "2026-08-27T07:35:57Z",
      "lastSeq": 25,
      "partnerTenantNames": ["An Phát", "garagethanhdat-demo"],
      "createdAt": "2026-08-26T08:51:31Z"
    }
  ]
}
```

**Endpoint trả nhiều hơn app đang dùng.** `records/route.ts` chỉ map `id`, `title`,
`lastMessageAt`, `partnerTenantNames` — **`lastSeq` và `createdAt` bị bỏ**. Cần sắp xếp
theo ngày tạo hay đếm tin chưa đọc thì dữ liệu đã sẵn, chỉ việc thêm vào `map`.

### 3.2 Bảo đảm nhân viên tồn tại phía Kairo

```bash
curl -s -X POST 'https://api.sit.yousee.vn/sdk/v1/users' \
  -H 'Authorization: Bearer <APP_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
        "externalId": "63be0b63-365f-4284-988a-76c56ffcad6e",
        "displayName": "CarDoctor-Demo"
      }'
```

Đo được: `200` · ~0.23s

```json
{
  "created": false,
  "displayName": "CarDoctor-Demo",
  "externalId": "63be0b63-365f-4284-988a-76c56ffcad6e",
  "userId": "273f802c-cbce-464c-99a5-9c9a8487e856"
}
```

Đây là **upsert** — `created: false` nghĩa là user đã có từ trước. Gọi lại bao nhiêu lần
cũng không tạo trùng, nên app gọi mỗi phiên mà không sợ rác dữ liệu.

⚠️ `externalId` là **chuỗi tuỳ ý**, SDK không validate định dạng. Dán thừa vài ký tự
(`...ad6eabc` thay vì `...ad6e`) sẽ **âm thầm tạo một nhân viên khác**, không hề báo lỗi.

### 3.3 Mint token phiên cho nhân viên

```bash
curl -s -X POST 'https://api.sit.yousee.vn/sdk/v1/tokens' \
  -H 'Authorization: Bearer <APP_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"externalId": "63be0b63-365f-4284-988a-76c56ffcad6e"}'
```

Đo được: `200` · ~0.17s

```json
{
  "expiresAt": "2026-09-18T03:36:30Z",
  "token": "<KHÔNG in ra log chung>",
  "userId": "273f802c-cbce-464c-99a5-9c9a8487e856"
}
```

Đây là thứ **duy nhất** trong ba cái được phép xuống browser.

**Token sống 7 ngày**, không "ngắn hạn" như README mô tả. Hiện không thành vấn đề vì
[session.ts:13](../src/lib/session.ts#L13) giữ token **chỉ trong RAM** (biến cấp module),
chết theo tab, không đụng `localStorage`. Đừng chuyển sang localStorage nếu không muốn
token 7 ngày nằm lại trên đĩa máy khách. Client tự xin token mới khi hạn còn dưới 2 phút
([session.ts:11](../src/lib/session.ts#L11)).

### 3.4 Lấy service worker từ CDN để phát lại cùng origin

Không cần xác thực — đây là file tĩnh trên CloudFront:

```bash
curl -s 'https://d3ikqcrv5ojj7m.cloudfront.net/kairo-sw.js'
```

Đo được: `200` · `text/javascript` · 973 byte · ~0.31s

Server lấy về rồi phát lại tại `/kairo-sw.js` của chính origin này, vì service worker
**bắt buộc same-origin** với trang. Route đó cache nội dung trong RAM sau lần gọi đầu và
trả header `Cache-Control: no-cache` (revalidate, **không phải** `no-store`) để trình
duyệt còn so byte mà phát hiện bản mới.

---

## 4. Phụ lục — hàm tiện dụng, không lộ app-key

Các lệnh mục 3 đặt app-key vào **tham số dòng lệnh**: trên máy dùng chung, `ps` của user
khác đọc được, và `~/.zsh_history` cũng lưu lại. Dùng hàm này thay thế khi làm việc trên
Mac Studio — key đi vào curl qua **stdin** (`curl -K -`) nên không lọt vào `argv`:

```bash
sdk() {  # sdk <METHOD> <path> [json-body]
  local m=$1 p=$2 b=$3; local -a extra
  [[ -n $b ]] && extra=(--data "$b")
  local base=$(grep '^KAIRO_SDK_BASE_URL=' .env.local | cut -d= -f2-)
  { printf 'header = "Authorization: Bearer '
    grep '^KAIRO_APP_KEY=' .env.local | cut -d= -f2- | tr -d '\n'
    printf '"\n'
  } | curl -sK - -X "$m" -H 'Content-Type: application/json' "${extra[@]}" \
        -w '\n__http=%{http_code} %{time_total}s\n' "$base$p"
}
UID_=$(grep '^DEMO_USER_ID=' .env.local | cut -d= -f2-)
UNAME_=$(grep '^DEMO_USER_NAME=' .env.local | cut -d= -f2-)

sdk GET  /sdk/v1/business-conversations | jq .
sdk POST /sdk/v1/users  "{\"externalId\":\"$UID_\",\"displayName\":\"$UNAME_\"}" | jq .
sdk POST /sdk/v1/tokens "{\"externalId\":\"$UID_\"}" | jq .
```

Chạy trên server thì `cd kairo-panel-next` trước — hàm đọc `.env.local` ở thư mục hiện tại.

---

## 5. GraphQL — KHÔNG dùng app-key

`{GRAPHQL_URL}` nhận **user token** (kết quả 3.3), không phải app-key. Riêng nhánh khách
vãng lai không cần header xác thực nào, chỉ cần tenant slug:

```bash
curl -s 'https://api.sit.yousee.vn/bff-tenant/graphql' \
  -H 'Content-Type: application/json' \
  -d '{"query":"query($s:String!){guestWidgetConfig(tenantSlug:$s){enabled brandName primaryColor}}","variables":{"s":"cardoctor"}}'
```

```json
{ "data": { "guestWidgetConfig": { "enabled": true, "brandName": "cardoctor", "primaryColor": null } } }
```

Query này là cách nhanh nhất để debug bubble khách: sai slug hoặc `enabled: false` thì
widget mount xong nhưng không hiện gì.

## 6. Ghi chú vận hành

- `callSdk` đặt timeout **10 giây** cho mọi lời gọi SDK
  ([src/server/kairo.ts:54](../src/server/kairo.ts#L54)); SIT chậm hơn mức đó thì route trả 502.
- Ba endpoint SDK yêu cầu **server ra được internet**. "Server local" trong mạng kín vẫn
  dựng được app nhưng `/api/session` và `/api/records` sẽ chết.
- App-key thay mặt **cả tenant**, không phải một nhân viên. Chỉ chạy ở máy dev hoặc trên
  server; đừng để lọt vào browser, log chung, hay ảnh chụp màn hình.
