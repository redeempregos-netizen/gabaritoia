import type { Metadata, Viewport } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const syne = Syne({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-syne' })

export const metadata: Metadata = {
  title: 'GabaritoIA — Questões para Concursos com IA',
  description: 'Plataforma inteligente de questões comentadas, plano de estudos e flashcards para concursos públicos.',
  keywords: 'concursos públicos, questões comentadas, plano de estudos, IA, CESPE, FCC, FGV',
  manifest: '/manifest.json',
  applicationName: 'GabaritoIA',
  appleWebApp: {
    capable: true,
    title: 'GabaritoIA',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#7c3aed',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="GabaritoIA" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function () {})
            })
          }
        ` }} />
      </head>
      <body className={`${dmSans.variable} ${syne.variable} font-sans bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  )
}
