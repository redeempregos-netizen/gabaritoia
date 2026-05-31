'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw } from 'lucide-react'

type QuestionItem = {
  id: string
  banca: string
  area: string
  subtopic?: string
  cargo?: string
  difficulty: string
  type: string
  format: string
  enunciado: string
  options: string[]
  correctIndex: number
  comentario: string
  createdAt: string
  planId?: string | null
  dayNumber?: number | null
  selectedIdx?: number | null
  isCorrect?: boolean | null
  answeredAt?: string | null
}

type DayStats = {
  dayNumber: number
  total: number
  answered: number
  correct: number
  wrong: number
  percent: number
  done: boolean
}

export default function ResolverPlanoQuestoesPage() {
  const [planId, setPlanId] = useState('')
  const [dia, setDia] = useState(0)
  const [loading, setLoading] = useState(true)
  const [answering, setAnswering] = useState<string | null>(null)
  const [planTitle, setPlanTitle] = useState('Plano de Questões')
  const [planCargo, setPlanCargo] = useState('')
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [dayStats, setDayStats] = useState<Record<string, DayStats>>({})

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('planId') || ''
    const day = Number(params.get('dia') || 0)
    setPlanId(pid)
    setDia(day)
    if (!pid || !day) {
      setLoading(false)
      toast.error('Plano ou dia inválido')
      return
    }
    load(pid, day)
  }, [])

  async function load(pid = planId, day = dia) {
    setLoading(true)
    try {
      const [planRes, generatedRes] = await Promise.all([
        fetch(`/api/generated?planId=${encodeURIComponent(pid)}`),
        fetch('/api/generated'),
      ])
      const planData = await planRes.json().catch(() => ({}))
      const generatedData = await generatedRes.json().catch(() => ({}))

      if (!planRes.ok || !planData.plan) {
        toast.error(planData.error || 'Plano não encontrado')
        return
      }
      if (!generatedRes.ok) {
        toast.error(generatedData.error || 'Erro ao carregar questões')
        return
      }

      setPlanTitle(planData.plan.title || 'Plano de Questões')
      setPlanCargo(planData.plan.cargo || planData.plan.planJson?.cargo || '')
      setDayStats(planData.dayStats || {})
      const list = (generatedData.questions || []).filter((q: QuestionItem) => String(q.planId || '') === String(pid) && Number(q.dayNumber || 0) === Number(day))
      setQuestions(list)
    } catch {
      toast.error('Erro ao carregar questões do dia')
    } finally {
      setLoading(false)
    }
  }

  async function answerQuestion(questionId: string, optionIndex: number) {
    const current = questions.find(q => q.id === questionId)
    if (!current || current.answeredAt || answering) return
    setAnswering(questionId)
    try {
      const res = await fetch('/api/generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer_question', questionId, selectedIdx: optionIndex }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar resposta')
        return
      }

      const answeredAt = new Date().toISOString()
      setQuestions(prev => prev.map(q => q.id === questionId ? {
        ...q,
        selectedIdx: optionIndex,
        isCorrect: data.isCorrect,
        answeredAt,
      } : q))
      if (data.dayStats) setDayStats(data.dayStats)
      if (data.isCorrect) toast.success('Resposta correta!')
      else toast.error('Resposta incorreta.')
    } catch {
      toast.error('Erro ao salvar resposta')
    } finally {
      setAnswering(null)
    }
  }

  const stats = useMemo(() => {
    const remote = dayStats[String(dia)]
    if (remote) return remote
    const total = questions.length
    const answered = questions.filter(q => q.answeredAt).length
    const correct = questions.filter(q => q.answeredAt && q.isCorrect).length
    const wrong = questions.filter(q => q.answeredAt && q.isCorrect === false).length
    return { dayNumber: dia, total, answered, correct, wrong, percent: total ? Math.round((answered / total) * 100) : 0, done: total > 0 && answered >= total }
  }, [dayStats, dia, questions])

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link href={`/plano-questoes?id=${planId}`} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-brand-300 mb-3"><ArrowLeft size={14} /> Voltar ao cronograma</Link>
          <h1 className="font-heading text-2xl font-bold">Questões do Dia {dia}</h1>
          <p className="text-sm text-zinc-500 mt-1">{planTitle}{planCargo ? ` · ${planCargo}` : ''}</p>
        </div>
        <button onClick={() => load()} className="btn-secondary text-xs flex items-center gap-1.5 w-fit"><RotateCcw size={14} /> Atualizar</button>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-5">
        <div className="card p-4"><div className="text-xs text-zinc-500">Geradas</div><div className="font-heading text-2xl font-bold text-white">{stats.total}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Respondidas</div><div className="font-heading text-2xl font-bold text-brand-300">{stats.answered}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Acertos</div><div className="font-heading text-2xl font-bold text-green-300">{stats.correct}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Erros</div><div className="font-heading text-2xl font-bold text-red-300">{stats.wrong}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Concluído</div><div className="font-heading text-2xl font-bold text-white">{stats.percent}%</div></div>
      </div>

      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
          <span>Status: {stats.done ? 'Feito' : stats.total ? 'Em andamento' : 'Aguardando questões'}</span>
          <span>{stats.answered} de {stats.total} respondidas</span>
        </div>
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full ${stats.done ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${stats.percent}%` }} />
        </div>
      </div>

      {questions.length === 0 && (
        <div className="card p-8 text-center text-zinc-500">
          Nenhuma questão encontrada para este dia. Volte ao cronograma e clique em “Gerar questões do dia”.
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, idx) => {
          const selected = q.answeredAt ? Number(q.selectedIdx) : undefined
          const answered = q.answeredAt || selected !== undefined
          return (
            <div key={q.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-xs text-brand-300 font-bold">{idx + 1}. {q.banca} · {q.area} · {q.difficulty}</div>
                  <div className="text-[11px] text-zinc-500">Dia {q.dayNumber} · {new Date(q.createdAt).toLocaleDateString('pt-BR')}</div>
                </div>
                {answered && <span className={`rounded-full border px-2 py-1 text-[10px] ${q.isCorrect ? 'border-green-500/20 bg-green-500/10 text-green-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>{q.isCorrect ? 'Acertou' : 'Errou'}</span>}
              </div>

              <p className="text-sm leading-relaxed mb-3 whitespace-pre-line">{q.enunciado}</p>

              <div className="space-y-1 mb-3">
                {(q.options || []).map((op, i) => {
                  const isRight = answered && i === q.correctIndex
                  const isWrongSelected = answered && selected === i && i !== q.correctIndex
                  const className = answered
                    ? isRight
                      ? 'bg-green-500/10 text-green-300 border-green-500/20'
                      : isWrongSelected
                        ? 'bg-red-500/10 text-red-300 border-red-500/20'
                        : 'bg-black/20 text-zinc-500 border-white/5'
                    : 'bg-black/20 text-zinc-300 border-white/5 hover:border-brand-500/30 hover:text-brand-200 cursor-pointer'
                  return <button key={i} disabled={!!answered || answering === q.id} onClick={() => answerQuestion(q.id, i)} className={`w-full text-left text-xs rounded-lg p-2 border ${className}`}>{answering === q.id ? 'Salvando... ' : ''}{'ABCDE'[i]}) {op}</button>
                })}
              </div>

              {!answered && <div className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-3">Marque uma alternativa para salvar e liberar o comentário.</div>}
              {answered && <div className="text-xs text-zinc-400 border-l-2 border-brand-500 pl-3">{selected === q.correctIndex ? 'Você acertou. ' : `Você errou. Gabarito: ${'ABCDE'[q.correctIndex]}. `}{q.comentario}</div>}
            </div>
          )
        })}
      </div>

      {stats.done && questions.length > 0 && <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-green-200 text-sm flex items-center gap-2"><CheckCircle2 size={18} /> Dia {dia} concluído e marcado como feito no cronograma.</div>}
    </div>
  )
}
