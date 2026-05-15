import type { Metadata } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const syne = Syne({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-syne' })

export const metadata: Metadata = {
  title: 'GabaritoIA — Questões para Concursos com IA',
  description: 'Plataforma inteligente de questões comentadas, plano de estudos e flashcards para concursos públicos.',
  keywords: 'concursos públicos, questões comentadas, plano de estudos, IA, CESPE, FCC, FGV',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${dmSans.variable} ${syne.variable} font-sans bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  )
}
