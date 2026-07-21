'use client'

import { PageTransition } from '@/components/motion/PageTransition'
import { ClientSuccessPipeline } from '@/components/client-success/ClientSuccessPipeline'

export const dynamic = 'force-dynamic'

export default function ClientSuccessPage() {
  return (
    <PageTransition>
      <ClientSuccessPipeline />
    </PageTransition>
  )
}
