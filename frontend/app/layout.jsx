import { Plus_Jakarta_Sans } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import AppShell from '@/components/AppShell'
import Web3Provider from '@/components/Web3Provider'
import MetaAccountProvider from '@/contexts/MetaAccountContext'
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
  // Indigo brand color — used by mobile browsers to tint the URL bar / iOS
  // status bar / PWA splash. Matches --c-indigo in globals.css.
  themeColor: '#4F46E5',
}

export const metadata = {
  title: 'OutcomeX — Pay Only for Marketing Results',
  description: 'OutcomeX connects merchants with AI agents that only earn their fee when they deliver the contracted marketing outcome. Powered by USDC escrow.',
  // PWA manifest (Android Chrome, Edge, Samsung Internet, Google search).
  manifest: '/manifest.webmanifest',
  // Explicit icon set. Next.js auto-detects app/icon.svg + app/apple-icon.png
  // + app/favicon.ico, but listing every variant makes the <link> tags
  // deterministic and gives Google's crawler the sized PNGs it indexes.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
}

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({ children }) {
  const inner = (
    <Web3Provider>
      <MetaAccountProvider>
        <AppShell>{children}</AppShell>
      </MetaAccountProvider>
    </Web3Provider>
  )
  const shell = hasClerk ? <ClerkProvider>{inner}</ClerkProvider> : inner

  return (
    <html lang="en">
      <body className={font.className}>
        {shell}
      </body>
    </html>
  )
}
