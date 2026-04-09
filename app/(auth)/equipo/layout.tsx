import { EquipoSubNav } from '@/components/layout/EquipoSubNav'

export default function EquipoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EquipoSubNav />
      {children}
    </>
  )
}
