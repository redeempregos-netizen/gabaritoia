'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Sparkles, FileText, Rocket,
  History, Settings, LogOut, CreditCard, Zap, DollarSign, FolderOpen, Brain
} from 'lucide-react'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/dashboard',  label: 'Painel',              icon: LayoutDashboard },
  { href: '/gerar',      label: 'Gerar Questão',       icon: Sparkles },
  { href: '/mapas',      label: 'Mapas Mentais',       icon: Brain, badge: 'Novo' },
  { href: '/edital',     label: 'Edital Verticalizado', icon: FileText },
  { href: '/edital-pro', label: 'Edital Pro',           icon: Rocket, badge: 'Novo' },
  { href: '/gerados',    label: 'Meus Gerados',         icon: FolderOpen },
  { href: '/historico',  label: 'Histórico',            icon: History },
  { href: '/planos',     label: 'Planos e Créditos',   icon: CreditCard },
]

interface SidebarProps {
  user: { name: string; email: string; role: string; plan: string }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [credits, setCredits] = useState<number | null>(null)
  const [claiming, setClaiming] = useState(false)

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
            {user.role === 'ADMIN' ? 'Administrador' : `Plano ${user.plan}`}
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
              <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all" style={{ width: `${Math.min(credits / 100 * 100, 100)}%` }} />
            </div>
            <button onClick={claimBonus} disabled={claiming} className="w-full py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50">
              {claiming ? 'Resgatando...' : '🎁 Bônus diário'}
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-2">Menu</div>
        {NAV.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} className={cn('sidebar-item', active && 'sidebar-item-active')}>
              <Icon size={15} />
              <span className="flex-1 text-xs">{item.label}</span>
              {item.badge && <span className="text-[9px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full font-semibold">{item.badge}</span>}
            </Link>
          )
        })}

        {user.role === 'ADMIN' && (
          <>
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mt-3 mb-2">Admin</div>
            <Link href="/admin" className={cn('sidebar-item', pathname === '/admin' && 'sidebar-item-active')}>
              <Settings size={15} />
              <span className="text-xs">Administração</span>
            </Link>
            <Link href="/admin/custos" className={cn('sidebar-item', pathname.startsWith('/admin/custos') && 'sidebar-item-active')}>
              <DollarSign size={15} />
              <span className="text-xs">Custos IA</span>
            </Link>
          </>
        )}
      </nav>

      <div className="px-3 pb-4 border-t border-white/[0.07] pt-3">
        <button onClick={handleLogout} className="sidebar-item w-full text-left text-red-400 hover:bg-red-500/10 hover:text-red-300">
          <LogOut size={15} />
          <span className="text-xs">Sair da conta</span>
        </button>
      </div>
    </aside>
  )
}
