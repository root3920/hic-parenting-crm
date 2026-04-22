'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { UserRole } from '@/hooks/useProfile'

interface PreviewRoleContextValue {
  previewRole: UserRole | null
  setPreviewRole: (role: UserRole | null) => void
}

const PreviewRoleContext = createContext<PreviewRoleContextValue>({
  previewRole: null,
  setPreviewRole: () => {},
})

export function PreviewRoleProvider({ children }: { children: ReactNode }) {
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null)
  return (
    <PreviewRoleContext.Provider value={{ previewRole, setPreviewRole }}>
      {children}
    </PreviewRoleContext.Provider>
  )
}

export function usePreviewRole() {
  return useContext(PreviewRoleContext)
}
