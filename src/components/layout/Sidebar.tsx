'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Sparkles, FileText, Rocket,
  History, Settings, LogOut, BookOpen
} from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/gerar', label: 'Gerar Questão', icon: Sparkles },
  { href: '/edital', label: 'Edital Verticalizado', icon: FileText },
  { href: '/edital-pro', label: 'Edital Pro', icon: Rocket, badge: 'Novo' },
  { href: '/historico', label: 'Histórico', icon: History },
]

interface SidebarProps {
  user: { name: string; email: string; role: string; plan: string }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 bg-zinc-900 border-r border-white/[0.07] flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.07]">
        <div className="font-heading font-extrabold text-lg tracking-tight">
          Gabarito<span className="text-brand-400">IA</span>
        </div>
      </div>

      {/* User info */}
      <div className="flex items-center gap-3 mx-3 mt-3 px-3 py-2.5 bg-zinc-800/60 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {user.name[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-zinc-100 truncate">{user.name}</div>
          <div className="text-[10px] text-zinc-500">{user.role === 'ADMIN' ? 'Administrador' : `Plano ${user.plan}`}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-2">Menu</div>
        {NAV.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('sidebar-item', active && 'sidebar-item-active')}
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[9px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}

        {user.role === 'ADMIN' && (
          <>
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mt-4 mb-2">Admin</div>
            <Link
              href="/admin"
              className={cn('sidebar-item', pathname.startsWith('/admin') && 'sidebar-item-active')}
            >
              <Settings size={16} />
              Administração
            </Link>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-white/[0.07] pt-3">
        <button
          onClick={handleLogout}
          className="sidebar-item w-full text-left text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut size={16} />
          Sair da conta
        </button>
      </div>
    </aside>
  )
}
