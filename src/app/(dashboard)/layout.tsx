import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileShell } from '@/components/layout/MobileShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, role: true, plan: true },
  })
  if (!user) redirect('/login')

  const userMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/conta', label: 'Minha Conta', emoji: '👤' },
    { href: '/gerar', label: 'Gerar Questão', emoji: '✦' },
    { href: '/plano-questoes', label: 'Plano de Questões', emoji: '🎯' },
    { href: '/cadernos', label: 'Cadernos PDF', emoji: '📚' },
    { href: '/gerados', label: 'Meus Gerados', emoji: '📁' },
    { href: '/em-breve', label: 'Mapas Mentais', emoji: '🧠' },
    { href: '/em-breve', label: 'Edital Verticalizado', emoji: '📄' },
    { href: '/em-breve', label: 'Edital Pro', emoji: '🚀' },
    { href: '/em-breve', label: 'Histórico', emoji: '🕘' },
  ]

  const adminMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/conta', label: 'Minha Conta', emoji: '👤' },
    { href: '/gerar', label: 'Gerar Questão', emoji: '✦' },
    { href: '/cadernos', label: 'Cadernos PDF', emoji: '📚' },
    { href: '/plano-questoes', label: 'Plano de Questões', emoji: '🎯' },
    { href: '/gerados', label: 'Meus Gerados', emoji: '📁' },
    { href: '/historico', label: 'Histórico', emoji: '🕘' },
    { href: '/mapas', label: 'Mapas Mentais', emoji: '🧠' },
    { href: '/edital', label: 'Edital Verticalizado', emoji: '📄' },
    { href: '/edital-pro', label: 'Edital Pro', emoji: '🚀' },
    { href: '/admin', label: 'Administração', emoji: '⚙️' },
    { href: '/admin/usuarios', label: 'Usuários', emoji: '👥' },
    { href: '/admin/custos', label: 'Custos IA', emoji: '💰' },
  ]

  const mobileNav = user.role === 'ADMIN' ? adminMobileNav : userMobileNav

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar user={user} />
      </div>

      <main className="flex-1 overflow-y-auto bg-zinc-950 pb-24 md:pb-0">
        <MobileShell user={user} nav={mobileNav} />
        {children}
      </main>
    </div>
  )
}
