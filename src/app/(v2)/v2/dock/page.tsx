'use client'

import { DockFrame } from '@/components/v2/DockFrame'
import { V2Provider } from '@/kairo/v2/context'

/*
  Trang chỉ để nhúng trong iframe của dock chat (`ChatDock` ở `/v2/panel`) — không có khung
  trang, không có link điều hướng. Mở thẳng trang này thì dock đứng ở "Đang mở dock…" vì không
  có trang cha đưa hội thoại xuống.
*/
export default function V2DockPage() {
  return (
    <V2Provider>
      <div className="v2-dock-page">
        <DockFrame />
      </div>
    </V2Provider>
  )
}
