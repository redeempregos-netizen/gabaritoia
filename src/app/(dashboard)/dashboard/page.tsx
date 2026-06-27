import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { BarChart3, Target, Zap, Flame, Lock } from 'lucide-react'
import Link from 'next/link'
import { ResetDashboardButton } from '@/components/dashboard/ResetDashboardButton'
import { canAccessRoute } from '@/lib/plans'

type SummaryRow = {
  total: number
  correct: number
  today: number
}

type AreaRow = {
  area: string
  total: number
  correct: number
}

type RecentRow = {
  id: string
  isCorrect: boolean
  createdAt: Date
  area: string
  banca: string
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const startOfToday = new Date(`${today}T00:00:00-03:00`)

  const [user, summaryRows, areaRows, recentAnswers] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.$queryRawUnsafe<SummaryRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN "isCorrect" = true THEN 1 ELSE 0 END), 0)::int AS correct,
        COALESCE(SUM(CASE WHEN "createdAt" >= $2 THEN 1 ELSE 0 END), 0)::int AS today
      FROM answers
      WHERE "userId" = $1
    `, session.userId, startOfToday),
    prisma.$queryRawUnsafe<AreaRow[]>(`
      SELECT q.area AS area,
             COUNT(a.id)::int AS total,
             COALESCE(SUM(CASE WHEN a."isCorrect" = true THEN 1 ELSE 0 END), 0)::int AS correct
      FROM answers a
      JOIN questions q ON q.id = a."questionId"
      WHERE a."userId" = $1
      GROUP BY q.area
      ORDER BY correct DESC, total DESC
      LIMIT 5
    `, session.userId),
    prisma.$queryRawUnsafe<RecentRow[]>(`
      SELECT a.id,
             a."isCorrect",
             a."createdAt",
             q.area,
             q.banca
      FROM answers a
      JOIN questions q ON q.id = a."questionId"
      WHERE a."userId" = $1
      ORDER BY a."createdAt" DESC
      LIMIT 6
    `, session.userId),
  ])
  if (!user) redirect('/login')

  const summary = summaryRows[0] || { total: 0, correct: 0, today: 0 }
  const total = Number(summary.total || 0)
  const correct = Number(summary.correct || 0)
  const pct = total ? Math.round(correct / total * 100) : 0
  const todayAns = Number(summary.today || 0)

  const topAreas = areaRows.map(a => ({
    area: a.area || 'Geral',
    pct: a.total ? Math.round(Number(a.correct || 0) / Number(a.total || 1) * 100) : 0,
  }))

  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()))
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = user.name.split(' ')[0]

  const quickActions = [
    { href: '/gerar', label: 'Gerar questão', emoji: '✦', desc: 'Nova questão agora', lockedText: 'Recurso bloqueado' },
    { href: '/plano-questoes', label: 'Plano de Questões', emoji: '🎯', desc: 'Metas e revisão', lockedText: 'Disponível no Básico, Pro e Premium' },
    { href: '/cadernos', label: 'Cadernos PDF', emoji: '📚', desc: 'Subir PDFs', lockedText: 'Disponível no Pro e Premium' },
    { href: '/gerados', label: 'Meus Gerados', emoji: '📁', desc: 'Ver questões', lockedText: 'Recurso bloqueado' },
  ].map(item => ({ ...item, locked: !canAccessRoute(user.plan, item.href) }))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{greeting}, {firstName}! 👋</h1>
          <p className="text-zinc-400 text-sm mt-1">Veja seu progresso e continue estudando</p>
        </div>
        <ResetDashboardButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total respondidas', value: total, icon: BarChart3, color: 'text-brand-400', bg: 'bg-brand-500/10', bar: pct, barColor: 'bg-brand-500' },
          { label: 'Taxa de acerto', value: `${pct}%`, icon: Target, color: 'text-green-400', bg: 'bg-green-500/10', bar: pct, barColor: 'bg-green-500' },
          { label: 'Questões hoje', value: todayAns, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', bar: Math.min(todayAns / 10 * 100, 100), barColor: 'bg-amber-500' },
          { label: 'Dias seguidos', value: user.streak, icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10', bar: Math.min(user.streak / 30 * 100, 100), barColor: 'bg-orange-500' },
        ].map(m => {
          const Icon = m.icon
          return (
            <div key={m.label} className="card p-5 relative overflow-hidden">
              <div className={`inline-flex p-2 rounded-lg ${m.bg} mb-3`}>
                <Icon size={16} className={m.color} />
              </div>
              <div className="font-heading text-2xl font-bold">{m.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{m.label}</div>
              <div className="h-1 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                <div className={`h-full rounded-full ${m.barColor} transition-all duration-700`} style={{ width: `${m.bar}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-heading text-sm font-semibold text-brand-300 mb-4">Desempenho por área</h2>
          {topAreas.length === 0 ? (
            <p className="text-sm text-zinc-500">Responda questões para ver seu desempenho por área.</p>
          ) : topAreas.map(a => (
            <div key={a.area} className="flex items-center gap-3 mb-3">
              <div className="text-xs text-zinc-300 w-28 truncate flex-shrink-0">{a.area}</div>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${a.pct >= 70 ? 'bg-green-500' : a.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${a.pct}%` }}
                />
              </div>
              <div className="text-xs text-zinc-500 w-8 text-right">{a.pct}%</div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <h2 className="font-heading text-sm font-semibold text-brand-300 mb-4">Últimas questões</h2>
          {recentAnswers.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-zinc-500 mb-3">Nenhuma questão respondida ainda.</p>
              <Link href="/gerar" className="btn-primary text-sm px-4 py-2 inline-flex">Gerar primeira questão</Link>
            </div>
          ) : recentAnswers.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2 border-b border-white/[0.05] last:border-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{a.area}</div>
                <div className="text-[10px] text-zinc-500">{a.banca} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {a.isCorrect ? 'Certa' : 'Errada'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {quickActions.map(item => (
          item.locked ? (
            <Link key={item.href} href="/conta" className="card p-4 border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 transition-colors group">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-2xl opacity-60">{item.emoji}</div>
                <Lock size={15} className="text-amber-400" />
              </div>
              <div className="text-sm font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">{item.label}</div>
              <div className="text-xs text-amber-300/80 mt-0.5">{item.lockedText}</div>
              <div className="text-[11px] text-zinc-500 mt-2">Toque para ver planos</div>
            </Link>
          ) : (
            <Link key={item.href} href={item.href} className="card p-4 hover:border-brand-500/30 transition-colors group">
              <div className="text-2xl mb-2">{item.emoji}</div>
              <div className="text-sm font-semibold text-zinc-100 group-hover:text-brand-300 transition-colors">{item.label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
            </Link>
          )
        ))}
      </div>
    </div>
  )
}
