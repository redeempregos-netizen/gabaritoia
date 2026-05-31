'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { canAccessRoute, getPlanLabel } from '@/lib/plans'
import {
  LayoutDashboard, Sparkles, FileText, Rocket,
  History, Settings, LogOut, Zap, DollarSign, FolderOpen, Brain, BookOpen, Target, UserCircle, Lock,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: string
  upgradeText?: string
}

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Painel',              icon: LayoutDashboard },
  { href: '/conta',      label: 'Minha Conta',         icon: UserCircle },
  { href: '/gerar',      label: 'Gerar Questão',       icon: Sparkles },
  { href: '/plano-questoes', label: 'Plano de Questões', icon: Target, badge: 'Novo' },
  { href: '/cadernos',   label: 'Cadernos PDF',        icon: BookOpen },
  { href: '/mapas',      label: 'Mapas Mentais',       icon: Brain },
  { href: '/edital',     label: 'Edital Verticalizado', icon: FileText },
  { href: '/edital-pro', label: 'Edital Pro',           icon: Rocket },
  { href: '/gerados',    label: 'Meus Gerados',         icon: FolderOpen },
  { href: '/historico',  label: 'Histórico',            icon: History },
]

const USER_NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Painel',              icon: LayoutDashboard },
  { href: '/conta',      label: 'Minha Conta',         icon: UserCircle },
  { href: '/gerar',      label: 'Gerar Questão',       icon: Sparkles },
  { href: '/plano-questoes', label: 'Plano de Questões', icon: Target, badge: 'Upgrade', upgradeText: 'Básico+' },
  { href: '/cadernos',   label: 'Cadernos PDF',        icon: BookOpen, badge: 'Upgrade', upgradeText: 'Pro+' },
  { href: '/edital',     label: 'Edital Verticalizado', icon: FileText, badge: 'Upgrade', upgradeText: 'Pro+' },
  { href: '/edital-pro', label: 'Edital Pro',           icon: Rocket, badge: 'Upgrade', upgradeText: 'Premium' },
  { href: '/mapas',      label: 'Mapas Mentais',        icon: Brain, badge: 'Upgrade', upgradeText: 'Premium' },
  { href: '/gerados',    label: 'Meus Gerados',         icon: FolderOpen },
]

interface SidebarProps {
  user: { name: string; email: string; role: string; plan: string }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [credits, setCredits] = useState<number | null>(null)
  const [claiming, setClaiming] = useState(false)
  const nav: NavItem[] = user.role === 'ADMIN' ? ADMIN_NAV : USER_NAV

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => setCredits(d.credits))
      .catch(() => {})
  }, [])

  async function claimBonus() {
    setClaiming(true)
    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'daily_bonus' }),
      })
      const data = await res.json()
      if (res.ok) {
        setCredits(data.credits)
        alert(`+${data.amount} créditos! Bônus diário resgatado 🎉`)
      } else {
        alert(data.error)
      }
    } finally {
      setClaiming(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 bg-zinc-900 border-r border-white/[0.07] flex flex-col flex-shrink-0 h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-white/[0.07]">
        <div className="font-heading font-extrabold text-lg tracking-tight">
          Gabarito<span className="text-brand-400">IA</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mx-3 mt-3 px-3 py-2.5 bg-zinc-800/60 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {user.name[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-zinc-100 truncate">{user.name}</div>
          <div className="text-[10px] text-zinc-500">
            {user.role === 'ADMIN' ? 'Administrador' : getPlanLabel(user.plan)}
          </div>
        </div>
      </div>

      {credits !== null && (
        <div className="mx-3 mt-2">
          <div className="bg-zinc-800/40 rounded-xl p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={11} className="text-amber-400" />
                <span className="text-[10px] font-medium text-zinc-400">Créditos</span>
              </div>
              <span className="font-heading font-bold text-amber-400 text-xs">{credits}</span>
            </div>
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all" style={{ width: `${Math.min(credits / 1000 * 100, 100)}%` }} />
            </div>
            <button onClick={claimBonus} disabled={claiming} className="w-full py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50">
              {claiming ? 'Resgatando...' : '🎁 Resgatar 20 créditos'}
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-2">Menu</div>
        {nav.map((item, idx) => {
          const Icon = item.icon
          const locked = user.role !== 'ADMIN' && !canAccessRoute(user.plan, item.href)
          const active = !locked && (pathname === item.href || pathname.startsWith(item.href + '/'))
          return (
            <Link key={`${item.href}-${item.label}-${idx}`} href={locked ? '/conta' : item.href} className={cn('sidebar-item', active && 'sidebar-item-active', locked && 'opacity-70 hover:text-amber-300')}>
              <Icon size={15} />
              <span className="flex-1 text-xs">{item.label}</span>
              {locked ? <Lock size={12} className="text-amber-400" /> : item.badge && <span className="text-[9px] bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full font-semibold">{item.badge}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-3 border-t border-white/[0.07] space-y-1">
        {user.role === 'ADMIN' && (
          <>
            <Link href="/admin/assinaturas" className="sidebar-item"><DollarSign size={15} /><span className="text-xs">Assinaturas</span></Link>
            <Link href="/admin/settings" className="sidebar-item"><Settings size={15} /><span className="text-xs">Admin</span></Link>
          </>
        )}
        <button onClick={handleLogout} className="sidebar-item w-full text-red-400 hover:bg-red-500/10 hover:text-red-300">
          <LogOut size={15} /><span className="text-xs">Sair</span>
        </button>
      </div>
    </aside>
  )
}
