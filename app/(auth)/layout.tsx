import { TopNav } from '@/components/layout/TopNav'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <TopNav />
      <main className="pt-14">
        <div className="max-w-screen-2xl mx-auto px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
