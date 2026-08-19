'use client'

import { PageTransition } from '@/components/motion/PageTransition'
import { InstagramReviewQueue } from '@/components/instagram/InstagramReviewQueue'

export const dynamic = 'force-dynamic'

export default function InstagramDMPage() {
  return (
    <PageTransition>
      <InstagramReviewQueue />
    </PageTransition>
  )
}
