'use client'

import { PageTransition } from '@/components/motion/PageTransition'
import { ClientsGroupsView } from '@/components/contacts/ClientsGroupsView'

export const dynamic = 'force-dynamic'

export default function ContactsPage() {
  return (
    <PageTransition>
      <ClientsGroupsView />
    </PageTransition>
  )
}
