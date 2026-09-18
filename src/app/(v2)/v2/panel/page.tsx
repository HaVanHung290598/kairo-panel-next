'use client'

import { PanelWorkbench } from '@/components/v2/PanelWorkbench'
import { V2Shell } from '@/components/v2/Shell'
import { V2Provider } from '@/kairo/v2/context'

export default function V2PanelPage() {
  return (
    <V2Provider>
      <V2Shell>
        <PanelWorkbench />
      </V2Shell>
    </V2Provider>
  )
}
