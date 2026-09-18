'use client'

import { useAsync } from '@/hooks/useAsync'
import { fetchConfig } from '@/lib/config'

/*
  Tên nhân viên "đang đăng nhập" của phần mềm doanh nghiệp, hiện ở góc phải header.

  Tự gọi /api/config chứ không nhận qua prop, để dùng được ở CẢ HAI nhánh route:
  nhánh (app) đã có config sẵn trong Workspace, nhưng nhánh (site) thì không — và
  /gara được prerender tĩnh nên không thể đọc DEMO_USER_NAME lúc render. Đổi lại là
  trang / gọi /api/config hai lần; route đó chỉ đọc biến môi trường nên không đáng kể.

  Chưa có dữ liệu thì không dựng gì: header tự co lại, không để chỗ trống nhấp nháy.
*/
export function CurrentUser() {
  const { data } = useAsync(fetchConfig)
  if (!data) return null

  return <span className="current-user">{data.userName}</span>
}
