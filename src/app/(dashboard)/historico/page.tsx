import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function HistoricoPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const answers = await prisma.answer.findMany({
    where: { userId: session.userId },
    include: {
      question: {
        select: { area: true, banca: true, difficulty: true, type: true, aiProvider: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const total = answers.length
  const correct = answers.filter(a => a.isCorrect).length
  const wrong = total - correct
  const pct = total ? Math.round(correct / total * 100) : 0

  const today = new Date().toISOString().split('T')[0]
  const todayAnswers = answers.filter(a => a.createdAt.toISOString().startsWith(today))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">◷ Histórico</h1>
        <p className="text-zinc-400 text-sm mt-1">Todas as questões respondidas</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: total, color: 'text-brand-400' },
          { label: 'Acertos', value: correct, color: 'text-green-400' },
          { label: 'Erros', value: wrong, color: 'text-red-400' },
          { label: 'Aproveitamento', value: `${pct}%`, color: 'text-amber-400' },
        ].map(m => (
          <div key={m.label} className="card p-4">
            <div className={`font-heading text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Lista */}
      {answers.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <div className="text-zinc-300 font-medium mb-2">Nenhuma questão respondida ainda</div>
          <div className="text-zinc-500 text-sm mb-6">Comece gerando sua primeira questão</div>
          <a href="/gerar" className="btn-primary inline-flex px-6 py-2.5 text-sm">
            Gerar questão
          </a>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07] text-xs text-zinc-500 uppercase tracking-wider font-medium">
            {total} questões respondidas
          </div>
          {answers.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-4 p-4 ${i < answers.length - 1 ? 'border-b border-white/[0.04]' : ''} hover:bg-white/[0.02] transition-colors`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.question.area}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {a.question.banca} · {a.question.difficulty} · {a.question.aiProvider || 'claude'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                a.isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {a.isCorrect ? '✓ Certa' : '✗ Errada'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
