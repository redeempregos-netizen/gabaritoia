import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, role: true, plan: true },
  })
  if (!user) redirect('/login')

  const mobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/gerar', label: 'Gerar', emoji: '✦' },
    { href: '/edital-pro', label: 'Pro', emoji: '🚀' },
    { href: '/historico', label: 'Histórico', emoji: '◷' },
    ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin', emoji: '⚙' }] : [{ href: '/planos', label: 'Planos', emoji: '💳' }]),
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar desktop */}
      <div className="hidden md:flex">
        <Sidebar user={user} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 pb-20 md:pb-0">
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-white/[0.07] z-50 px-1 pb-safe">
        <div className="flex">
          {mobileNav.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2.5 text-zinc-500 hover:text-brand-400 transition-colors"
            >
              <span className="text-lg leading-none">{item.emoji}</span>
              <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
