'use client'

import { SignupForm } from '@/components/v2/SignupForm'
import { V2Shell } from '@/components/v2/Shell'
import { V2Provider } from '@/kairo/v2/context'

export default function V2SignupPage() {
  return (
    <V2Provider needBundle={false}>
      <V2Shell>
        <SignupForm />
      </V2Shell>
    </V2Provider>
  )
}
