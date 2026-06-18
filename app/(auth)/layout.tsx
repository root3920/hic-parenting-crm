'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { PreviewRoleProvider, usePreviewRole } from '@/contexts/PreviewRoleContext'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'
import { cn } from '@/lib/utils'

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const { previewRole } = usePreviewRole()
  const { collapsed } = useSidebar()
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main className={cn(
        'transition-all duration-200',
        collapsed ? 'md:ml-16' : 'md:ml-60',
      )}>
        <div className={cn('pt-12', previewRole && 'pt-[calc(3rem+2.25rem)]')}>
          <div className="max-w-screen-2xl mx-auto px-4 py-4 md:px-8 md:py-6">
            {children}
          </div>
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
      <SidebarProvider>
        <AuthLayoutInner>{children}</AuthLayoutInner>
      </SidebarProvider>
    </PreviewRoleProvider>
  )
}
