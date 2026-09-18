import { Workspace } from '@/components/Workspace'

// Toàn bộ màn hình phụ thuộc vòng đời DOM của panel nên nằm ở client component.
// Trang này chỉ là vỏ server component.
export default function Page() {
  return <Workspace />
}
