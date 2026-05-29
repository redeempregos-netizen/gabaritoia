'use client'

import { useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, Loader2, RotateCcw, Sparkles, Target } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

type DayPlan = {
  dia: number
  data: string
  diaSemana: string
  turno: string
  horasPorDia: number
  foco: string
  metaQuestoes: number
  tipo: string
  observacao: string
}

type PlanProgress = {
  diasConcluidos: number[]
  questoesGeradas: number
  totalDias: number
  percentual: number
  ultimaAtualizacao?: string
}

const DEFAULT_MATERIAS = 'Português\nDireito Administrativo\nDireito Constitucional\nInformática\nRaciocínio Lógico'
const WEEK_DAYS = [
  { key: 1, label: 'Segunda' },
  { key: 2, label: 'Terça' },
  { key: 3, label: 'Quarta' },
  { key: 4, label: 'Quinta' },
  { key: 5, label: 'Sexta' },
  { key: 6, label: 'Sábado' },
  { key: 0, label: 'Domingo' },
]
const TURNOS = ['Manhã', 'Tarde', 'Noite']

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function diaSemanaLabel(date: Date) {
  return WEEK_DAYS.find(d => d.key === date.getDay())?.label || 'Dia'
}

export default function PlanoQuestoesPage() {
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [questionsPerDay, setQuestionsPerDay] = useState(30)
  const [hoursPerDay, setHoursPerDay] = useState(2)
  const [materiasText, setMateriasText] = useState(DEFAULT_MATERIAS)
  const [source, setSource] = useState<'geradas' | 'cadernos' | 'ambos'>('ambos')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [turno, setTurno] = useState('Noite')
  const [loading, setLoading] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)
  const [progress, setProgress] = useState<PlanProgress>({ diasConcluidos: [], questoesGeradas: 0, totalDias: 0, percentual: 0 })
  const [generatingDay, setGeneratingDay] = useState<number | null>(null)
  const [generatedDays, setGeneratedDays] = useState<Record<number, number>>({})
  const [plan, setPlan] = useState<DayPlan[]>([])
  const planLockRef = useRef(false)
  const dayLocksRef = useRef<Record<number, boolean>>({})

  const materias = useMemo(() => materiasText.split('\n').map(s => s.trim()).filter(Boolean), [materiasText])

  function toggleDay(day: number) {
    setSelectedDays(prev => {
      if (prev.includes(day)) return prev.filter(d => d !== day)
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  function resetarPlano() {
    if (loading || generatingDay !== null || planLockRef.current || savingPlan) {
      toast.info('Aguarde a geração atual finalizar')
      return
    }
    setPlan([])
    setGeneratedDays({})
    setGeneratingDay(null)
    setSavedPlanId(null)
    setProgress({ diasConcluidos: [], questoesGeradas: 0, totalDias: 0, percentual: 0 })
    dayLocksRef.current = {}
    setBanca('')
    setCargo('')
    setExamDate('')
    setQuestionsPerDay(30)
    setHoursPerDay(2)
    setMateriasText(DEFAULT_MATERIAS)
    setSource('ambos')
    setSelectedDays([1, 2, 3, 4, 5])
    setTurno('Noite')
    toast.success('Plano resetado')
  }

  async function salvarPlanoGerado(rows: DayPlan[]) {
    if (!rows.length) return
    setSavingPlan(true)
    try {
      const res = await fetch('/api/generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_question_plan',
          title: `Plano de Questões — ${cargo}`,
          banca,
          cargo,
          examDate,
          hoursPerDay,
          questionsPerDay,
          selectedDays,
          turno,
          source,
          materias,
          materiasText,
          plan: rows,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Plano gerado, mas não foi salvo em Meus Gerados')
        return
      }
      setSavedPlanId(data.plan?.id || null)
      setProgress({ diasConcluidos: [], questoesGeradas: 0, totalDias: rows.length, percentual: 0, ultimaAtualizacao: new Date().toISOString() })
      toast.success('Plano gerado e salvo em Meus Gerados')
    } catch {
      toast.error('Plano gerado, mas não foi salvo em Meus Gerados')
    } finally {
      setSavingPlan(false)
    }
  }

  async function atualizarProgresso(day: DayPlan, generated: number) {
    if (!savedPlanId || generated <= 0) return
    try {
      const res = await fetch('/api/generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_question_plan_progress',
          planId: savedPlanId,
          dayNumber: day.dia,
          generated,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      if (data.progresso) setProgress(data.progresso)
    } catch {}
  }

  function gerarPlano() {
    if (planLockRef.current || loading || savingPlan) {
      toast.info('Já existe uma geração de plano em andamento')
      return
    }
    if (!banca.trim()) { toast.error('Informe a banca'); return }
    if (!cargo.trim()) { toast.error('Informe o cargo'); return }
    if (!materias.length) { toast.error('Informe pelo menos uma matéria'); return }
    if (!selectedDays.length) { toast.error('Escolha pelo menos um dia da semana'); return }
    if (!hoursPerDay || hoursPerDay < 0.5) { toast.error('Informe quantas horas por dia vai estudar'); return }

    planLockRef.current = true
    setLoading(true)
    setSavedPlanId(null)
    setProgress({ diasConcluidos: [], questoesGeradas: 0, totalDias: 0, percentual: 0 })
    setGeneratedDays({})
    dayLocksRef.current = {}
    setTimeout(() => {
      const today = new Date()
      const end = examDate ? new Date(`${examDate}T12:00:00`) : new Date(today.getTime() + 21 * 86400000)
      const diffDays = Math.max(7, Math.ceil((end.getTime() - today.getTime()) / 86400000))
      const rows: DayPlan[] = []
      let studyIndex = 0

      for (let offset = 0; offset <= diffDays && rows.length < 45; offset++) {
        const d = new Date(today.getTime() + offset * 86400000)
        if (!selectedDays.includes(d.getDay())) continue

        const count = studyIndex + 1
        const isReview = count % 5 === 0
        const isSimulado = count % 7 === 0
        const materia = materias[studyIndex % materias.length]
        const materia2 = materias[(studyIndex + 1) % materias.length]
        const adjustedQuestions = Math.max(5, Math.round(Number(questionsPerDay || 30) * Math.max(0.5, Number(hoursPerDay || 2)) / 2))

        rows.push({
          dia: count,
          data: formatDate(d),
          diaSemana: diaSemanaLabel(d),
          turno,
          horasPorDia: Number(hoursPerDay),
          foco: isSimulado ? `Simulado misto: ${materias.slice(0, 4).join(', ')}` : isReview ? `Revisão de erros: ${materia} + ${materia2}` : materia,
          metaQuestoes: isSimulado ? Math.max(adjustedQuestions, 40) : isReview ? Math.max(15, Math.round(adjustedQuestions * 0.7)) : adjustedQuestions,
          tipo: isSimulado ? 'Simulado' : isReview ? 'Revisão' : 'Questões novas',
          observacao: isSimulado
            ? `Resolver em tempo cronometrado no estilo ${banca}. Separar ${hoursPerDay}h para simulado e correção das erradas.`
            : isReview
              ? `Usar ${hoursPerDay}h para refazer questões erradas e ler comentários antes de avançar.`
              : source === 'cadernos'
                ? `Usar ${hoursPerDay}h com questões dos PDFs importados no módulo Cadernos.`
                : source === 'geradas'
                  ? `Usar ${hoursPerDay}h com questões criadas pelo Gerador de Questões com IA.`
                  : `Usar ${hoursPerDay}h combinando PDFs importados com questões criadas pela IA.`,
        })
        studyIndex++
      }

      setPlan(rows)
      setProgress({ diasConcluidos: [], questoesGeradas: 0, totalDias: rows.length, percentual: 0 })
      setLoading(false)
      planLockRef.current = false
      salvarPlanoGerado(rows)
    }, 350)
  }

  async function gerarQuestoesDoDia(day: DayPlan) {
    if (generatingDay !== null || dayLocksRef.current[day.dia]) {
      toast.info('Já existe uma geração de questões em andamento')
      return
    }
    if (!banca.trim() || !cargo.trim()) {
      toast.error('Informe banca e cargo antes de gerar as questões')
      return
    }

    const total = Math.max(1, Number(day.metaQuestoes || 1))
    if (total > 10) {
      const ok = window.confirm(`Este dia tem ${total} questões. Isso vai consumir ${total} créditos e gerar em lotes de 10. Continuar?`)
      if (!ok) return
    }

    dayLocksRef.current[day.dia] = true
    setGeneratingDay(day.dia)
    try {
      let created = 0
      const batches = Math.ceil(total / 10)
      for (let i = 0; i < batches; i++) {
        const quantity = Math.min(10, total - created)
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            banca,
            area: day.foco,
            cargo,
            education: 'Nível Superior',
            difficulty: day.tipo === 'Simulado' ? 'Média' : day.tipo === 'Revisão' ? 'Fácil' : 'Média',
            type: 'MULTIPLE_CHOICE',
            format: 'Estilo banca',
            quantity,
            editalText: `REFERÊNCIA DO PLANO DE QUESTÕES: ${cargo}\nDIA DO PLANO: ${day.dia}\nDATA: ${day.data}\nDIA DA SEMANA: ${day.diaSemana}\nTURNO DE ESTUDO: ${day.turno}\nHORAS DE ESTUDO NO DIA: ${day.horasPorDia}h\nTIPO: ${day.tipo}\nFOCO: ${day.foco}\nORIENTAÇÃO: ${day.observacao}`,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Erro ao gerar questões do dia')
          break
        }
        created += data.questions?.length || quantity
        setGeneratedDays(prev => ({ ...prev, [day.dia]: (prev[day.dia] || 0) + (data.questions?.length || quantity) }))
      }

      if (created > 0) {
        await atualizarProgresso(day, created)
        toast.success(`${created} questão(ões) gerada(s). Dia ${day.dia} marcado como concluído.`)
      }
    } catch {
      toast.error('Erro ao gerar questões do dia')
    } finally {
      setGeneratingDay(null)
      dayLocksRef.current[day.dia] = false
    }
  }

  const totalQuestoes = plan.reduce((acc, d) => acc + d.metaQuestoes, 0)
  const totalHoras = plan.reduce((acc, d) => acc + Number(d.horasPorDia || 0), 0)
  const diasConcluidos = progress.diasConcluidos || []
  const progressoPercentual = progress.percentual || (plan.length ? Math.round((diasConcluidos.length / plan.length) * 100) : 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Target size={13} /> Plano de resolução
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Plano de Estudos de Questões</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Monte um cronograma, gere as questões do dia com IA, salve em Meus Gerados e desconte créditos apenas na geração real.</p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label">Banca</label>
            <input className="input" placeholder="Ex: FURB, FGV, CEBRASPE" value={banca} onChange={e => setBanca(e.target.value)} />
          </div>
          <div>
            <label className="label">Cargo / concurso</label>
            <input className="input" placeholder="Ex: Prefeitura de Florianópolis — Administrativo" value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
          <div>
            <label className="label">Data da prova</label>
            <input className="input" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Dias da semana que vai estudar</label>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map(d => <button key={d.key} type="button" onClick={() => toggleDay(d.key)} className={`chip text-xs ${selectedDays.includes(d.key) ? 'chip-active' : ''}`}>{d.label}</button>)}
            </div>
          </div>
          <div>
            <label className="label">Turno de estudo</label>
            <div className="flex flex-wrap gap-2">
              {TURNOS.map(t => <button key={t} type="button" onClick={() => setTurno(t)} className={`chip ${turno === t ? 'chip-active' : ''}`}>{t}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Horas por dia</label>
              <input className="input" type="number" min={0.5} max={12} step={0.5} value={hoursPerDay} onChange={e => setHoursPerDay(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Questões base/dia</label>
              <input className="input" type="number" min={5} max={200} value={questionsPerDay} onChange={e => setQuestionsPerDay(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-zinc-600 -mt-2">A meta diária é ajustada conforme as horas. Ex.: 2h usa a meta base; 4h dobra a meta.</p>
          <div>
            <label className="label">Matérias / tópicos</label>
            <textarea className="input min-h-[140px] py-3" value={materiasText} onChange={e => setMateriasText(e.target.value)} />
            <p className="text-xs text-zinc-600 mt-2">Uma matéria por linha.</p>
          </div>
          <div>
            <label className="label">Fonte das questões</label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSource('ambos')} className={`chip ${source === 'ambos' ? 'chip-active' : ''}`}>PDFs + Gerador IA</button>
              <button onClick={() => setSource('cadernos')} className={`chip ${source === 'cadernos' ? 'chip-active' : ''}`}>Só PDFs importados</button>
              <button onClick={() => setSource('geradas')} className={`chip ${source === 'geradas' ? 'chip-active' : ''}`}>Só Gerador IA</button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">Essa escolha orienta o cronograma. O botão de gerar usa IA e salva em Meus Gerados.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={gerarPlano} disabled={loading || planLockRef.current || savingPlan} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
              {(loading || savingPlan) && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Gerando plano...' : savingPlan ? 'Salvando...' : 'Gerar plano'}
            </button>
            <button onClick={resetarPlano} type="button" disabled={loading || generatingDay !== null || savingPlan} className="btn-secondary w-full flex items-center justify-center gap-2 h-11 disabled:opacity-50">
              <RotateCcw size={15} /> Resetar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {savedPlanId && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>Plano salvo em Meus Gerados. Progresso: {progressoPercentual}%.</span>
              <Link href="/gerados" className="rounded-xl border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-100 flex items-center gap-1.5 w-fit">
                <ExternalLink size={13} /> Abrir Meus Gerados
              </Link>
            </div>
          )}

          {!plan.length && (
            <div className="card p-10 text-center text-zinc-500">
              <CalendarDays size={34} className="mx-auto mb-3 text-zinc-600" />
              Preencha os dados para criar uma trilha diária de questões.
            </div>
          )}

          {!!plan.length && (
            <>
              <div className="grid md:grid-cols-4 gap-3">
                <div className="card p-4"><div className="text-xs text-zinc-500">Dias concluídos</div><div className="font-heading text-2xl font-bold text-white">{diasConcluidos.length}/{plan.length}</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Questões geradas</div><div className="font-heading text-2xl font-bold text-brand-300">{progress.questoesGeradas || 0}</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Horas totais</div><div className="font-heading text-2xl font-bold text-green-300">{totalHoras}h</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Progresso</div><div className="font-heading text-2xl font-bold text-white">{progressoPercentual}%</div></div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                  <span>Progresso do plano</span>
                  <span>{diasConcluidos.length} de {plan.length} dias</span>
                </div>
                <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${progressoPercentual}%` }} />
                </div>
                <div className="text-xs text-zinc-500 mt-2">Meta total prevista: {totalQuestoes} questões.</div>
              </div>

              <div className="card overflow-hidden">
                <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
                  <div>
                    <div className="font-heading font-bold">Cronograma de questões</div>
                    <div className="text-xs text-zinc-500 mt-1">{cargo}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/gerados" className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <ExternalLink size={13} /> Meus Gerados
                    </Link>
                    <button onClick={resetarPlano} disabled={loading || generatingDay !== null || savingPlan} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 flex items-center gap-1.5 disabled:opacity-50">
                      <RotateCcw size={13} /> Resetar tudo
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {plan.map(day => {
                    const generated = generatedDays[day.dia] || 0
                    const completed = diasConcluidos.includes(day.dia)
                    return (
                      <div key={day.dia} className="p-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="flex gap-3">
                            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center font-bold text-xs ${completed ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-brand-500/10 border-brand-500/20 text-brand-300'}`}>{completed ? '✓' : `D${day.dia}`}</div>
                            <div>
                              <div className="font-semibold text-sm text-zinc-100 flex flex-wrap items-center gap-2">
                                {day.foco}
                                {completed && <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">Concluído</span>}
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">{day.data} · {day.diaSemana} · {day.turno} · {day.horasPorDia}h · {day.tipo}</div>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row md:flex-col gap-2 md:items-end">
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-brand-300 whitespace-nowrap">
                              {day.metaQuestoes} questões · {day.horasPorDia}h
                            </div>
                            <button
                              onClick={() => gerarQuestoesDoDia(day)}
                              disabled={generatingDay !== null || !!dayLocksRef.current[day.dia]}
                              className="rounded-xl bg-brand-600 hover:bg-brand-500 text-white px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {generatingDay === day.dia ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                              {generatingDay === day.dia ? 'Gerando...' : completed ? `Gerar mais (${generated} feitas)` : generated > 0 ? `Gerar mais (${generated} feitas)` : 'Gerar questões do dia'}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex items-start gap-2 text-xs text-zinc-400 leading-relaxed">
                          <CheckCircle2 size={13} className="text-green-400 mt-0.5 shrink-0" />
                          {day.observacao}
                        </div>
                        {generated > 0 && <div className="mt-2 text-xs text-green-400">✓ {generated} questão(ões) deste dia salvas em Meus Gerados.</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
