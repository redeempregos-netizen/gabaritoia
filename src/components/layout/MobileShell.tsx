'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, LogOut, Menu, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlanLabel } from '@/lib/plans'

type MobileItem = {
  href: string
  label: string
  emoji: string
}

type MobileShellProps = {
  user: {
    name: string
    email: string
    role: string
    plan: string
  }
  nav: MobileItem[]
}

export function MobileShell({ user, nav }: MobileShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)

  const bottomNav = useMemo(() => nav.slice(0, 4), [nav])

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => setCredits(typeof d.credits === 'number' ? d.credits : null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="w-10 h-10 rounded-2xl border border-white/10 bg-zinc-900 flex items-center justify-center text-zinc-200 active:scale-95"
            aria-label="Abrir menu"
          >
            <Menu size={19} />
          </button>

          <div className="w-9 h-9 rounded-2xl bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100 truncate">{user.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">
              {user.role === 'ADMIN' ? 'Administrador' : getPlanLabel(user.plan)} · {user.email}
            </div>
          </div>

          {credits !== null && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-amber-300 text-[11px] font-bold flex items-center gap-1">
              <Zap size={12} /> {credits}
            </div>
          )}
        </div>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-[70]">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Fechar menu" />

          <aside className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-zinc-950 border-r border-white/[0.08] shadow-2xl overflow-y-auto">
            <div className="p-4 border-b border-white/[0.07]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="font-heading font-extrabold text-lg tracking-tight">
                  Gabarito<span className="text-brand-400">IA</span>
                </div>
                <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl border border-white/10 bg-zinc-900 flex items-center justify-center text-zinc-300" aria-label="Fechar menu">
                  <X size={17} />
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100 truncate">{user.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-black/20 border border-white/10 p-2">
                    <div className="text-zinc-500 text-[10px] mb-0.5">Plano</div>
                    <div className="font-semibold text-zinc-100 truncate">{user.role === 'ADMIN' ? 'Admin' : getPlanLabel(user.plan)}</div>
                  </div>
                  <div className="rounded-xl bg-black/20 border border-white/10 p-2">
                    <div className="text-zinc-500 text-[10px] mb-0.5">Créditos</div>
                    <div className="font-semibold text-amber-300">{credits ?? '-'}</div>
                  </div>
                </div>
              </div>
            </div>

            <nav className="p-3 space-y-1">
              <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 py-2">Menu completo</div>
              {nav.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-colors border',
                      active ? 'bg-brand-500/10 border-brand-500/20 text-brand-200' : 'bg-zinc-900/40 border-white/[0.06] text-zinc-300 active:bg-zinc-800'
                    )}
                  >
                    <span className="text-lg w-6 text-center">{item.emoji}</span>
                    <span className="flex-1 font-medium">{item.label}</span>
                    <ChevronRight size={15} className="text-zinc-600" />
                  </Link>
                )
              })}
            </nav>

            <div className="p-3 border-t border-white/[0.07]">
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 active:scale-[0.99]">
                <LogOut size={16} /> Sair da conta
              </button>
            </div>
          </aside>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/98 backdrop-blur border-t border-white/[0.07] z-50 px-1 pb-safe shadow-2xl shadow-black/40">
        <div className="flex">
          {bottomNav.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2.5 transition-colors rounded-xl my-1 min-w-0',
                  active ? 'text-brand-300 bg-brand-500/10' : 'text-zinc-500 active:text-brand-400'
                )}
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-[9px] mt-0.5 font-medium leading-none truncate max-w-full px-0.5">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl my-1 text-zinc-500 active:text-brand-400"
          >
            <span className="text-lg leading-none">☰</span>
            <span className="text-[9px] mt-0.5 font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>
    </>
  )
}
