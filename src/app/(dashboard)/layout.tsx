import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileShell } from '@/components/layout/MobileShell'
import { isCadernosOnlyPlan, isFreePlan } from '@/lib/plans'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, role: true, plan: true },
  })
  if (!user) redirect('/login')

  const fullMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/gerar', label: 'Gerar', emoji: '✦' },
    { href: '/cadernos', label: 'Cadernos', emoji: '📚' },
    { href: '/edital', label: 'Edital', emoji: '📄' },
    { href: '/gerados', label: 'Gerados', emoji: '📁' },
  ]

  const adminMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/admin', label: 'Admin', emoji: '⚙️' },
    { href: '/admin/usuarios', label: 'Usuários', emoji: '👥' },
    { href: '/admin/custos', label: 'Custos', emoji: '💰' },
    { href: '/planos', label: 'Planos', emoji: '⚡' },
  ]

  const freeMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/planos', label: 'Planos', emoji: '⚡' },
  ]

  const cadernosMobileNav = [
    { href: '/dashboard', label: 'Painel', emoji: '⊞' },
    { href: '/cadernos', label: 'Cadernos', emoji: '📚' },
    { href: '/gerados', label: 'Gerados', emoji: '📁' },
    { href: '/planos', label: 'Planos', emoji: '⚡' },
  ]

  const mobileNav = user.role === 'ADMIN' ? adminMobileNav : isFreePlan(user.plan) ? freeMobileNav : isCadernosOnlyPlan(user.plan) ? cadernosMobileNav : fullMobileNav

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
