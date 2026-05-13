import { Plus_Jakarta_Sans } from 'next/font/google'
import AppShell from '@/components/AppShell'
import './globals.css'

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata = {
  title: 'OutcomeX — Pay Only for Marketing Results',
  description: 'OutcomeX connects merchants with AI agents that only earn their fee when they deliver the contracted marketing outcome. Powered by USDC escrow.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={font.className}>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  )
}
