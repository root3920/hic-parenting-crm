import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'HIC Parenting CRM',
  description: 'Internal CRM Dashboard for HIC Parenting',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="font-sans antialiased bg-zinc-50 dark:bg-zinc-950">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
