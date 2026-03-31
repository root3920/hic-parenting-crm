import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
})

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
    <html lang="en" className={poppins.variable}>
      <body className="font-sans antialiased bg-zinc-50 dark:bg-zinc-950">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
