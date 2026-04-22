'use client'

import { TopNav } from '@/components/layout/TopNav'
import { PreviewRoleProvider, usePreviewRole } from '@/contexts/PreviewRoleContext'

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const { previewRole } = usePreviewRole()
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <TopNav />
      <main className={previewRole ? 'pt-24' : 'pt-14'}>
        <div className="max-w-screen-2xl mx-auto px-4 py-4 md:px-8 md:py-6">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PreviewRoleProvider>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </PreviewRoleProvider>
  )
}
