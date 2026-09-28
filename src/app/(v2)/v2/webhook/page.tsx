'use client'

import { V2Shell } from '@/components/v2/Shell'
import { WebhookMonitor } from '@/components/v2/WebhookMonitor'
import { V2Provider } from '@/kairo/v2/context'

export default function V2WebhookPage() {
  return (
    <V2Provider needBundle={false}>
      <V2Shell>
        <WebhookMonitor />
      </V2Shell>
    </V2Provider>
  )
}
