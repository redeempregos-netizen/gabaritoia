'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, UserCircle } from 'lucide-react'
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

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100 truncate">{user.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">{getPlanLabel(user.plan)} · {user.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-300 active:scale-95"
            aria-label="Sair da conta"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </header>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/98 backdrop-blur border-t border-white/[0.07] z-50 px-1 pb-safe shadow-2xl shadow-black/40">
        <div className="flex">
          {nav.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2.5 transition-colors rounded-xl my-1',
                  active ? 'text-brand-300 bg-brand-500/10' : 'text-zinc-500 active:text-brand-400'
                )}
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-[9px] mt-0.5 font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
