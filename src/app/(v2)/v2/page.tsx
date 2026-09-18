'use client'

import { Hub } from '@/components/v2/Hub'
import { V2Shell } from '@/components/v2/Shell'
import { V2Provider } from '@/kairo/v2/context'

export default function V2HomePage() {
  return (
    <V2Provider needBundle={false}>
      <V2Shell>
        <Hub />
      </V2Shell>
    </V2Provider>
  )
}
