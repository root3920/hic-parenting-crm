'use client'

import { PageTransition } from '@/components/motion/PageTransition'
import { SetterPortal } from '@/components/setter-portal/SetterPortal'

export const dynamic = 'force-dynamic'

export default function SetterPortalPage() {
  return (
    <PageTransition>
      <SetterPortal />
    </PageTransition>
  )
}
