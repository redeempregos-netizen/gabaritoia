'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, FileText, Loader2, RotateCcw, Sparkles, Target } from 'lucide-react'
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

type DayStats = {
  dayNumber: number
  total: number
  answered: number
  correct: number
  wrong: number
  percent: number
  done: boolean
}

type PlanProgress = {
  diasConcluidos: number[]
  diasComQuestoes: number[]
  questoesGeradas: number
  questoesRespondidas: number
  acertos: number
  erros: number
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
const emptyProgress: PlanProgress = {
  diasConcluidos: [],
  diasComQuestoes: [],
  questoesGeradas: 0,
  questoesRespondidas: 0,
  acertos: 0,
  erros: 0,
  totalDias: 0,
  percentual: 0,
}

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function diaSemanaLabel(date: Date) {
  return WEEK_DAYS.find(d => d.key === date.getDay())?.label || 'Dia'
}

function dateInputValue(value: any) {
  const text = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10)
  return ''
}

export default function PlanoQuestoesPage() {
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [questionsPerDay, setQuestionsPerDay] = useState(30)
  const [hoursPerDay, setHoursPerDay] = useState(2)
  const [materiasText, setMateriasText] = useState(DEFAULT_MATERIAS)
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [turno, setTurno] = useState('Noite')
  const [loading, setLoading] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)
  const [progress, setProgress] = useState<PlanProgress>(emptyProgress)
  const [dayStats, setDayStats] = useState<Record<string, DayStats>>({})
  const [generatingDay, setGeneratingDay] = useState<number | null>(null)
  const [plan, setPlan] = useState<DayPlan[]>([])
  const planLockRef = useRef(false)
  const dayLocksRef = useRef<Record<number, boolean>>({})

  const materias = useMemo(() => materiasText.split('\n').map(s => s.trim()).filter(Boolean), [materiasText])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) carregarPlanoSalvo(id)
  }, [])

  async function carregarPlanoSalvo(id: string) {
    setLoadingSaved(true)
    try {
      const res = await fetch(`/api/generated?planId=${encodeURIComponent(id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.plan) {
        toast.error(data.error || 'Plano salvo não encontrado')
        return
      }

      const saved = data.plan
      const json = saved.planJson || {}
      const cronograma: DayPlan[] = Array.isArray(json.cronograma) ? json.cronograma : []
      const progresso = json.progresso || {}

      setSavedPlanId(saved.id)
      setBanca(json.banca || saved.banca || '')
      setCargo(json.cargo || saved.cargo || '')
      setExamDate(dateInputValue(json.examDate || saved.examDate))
      setSelectedDays(Array.isArray(json.selectedDays) ? json.selectedDays.map(Number) : [1, 2, 3, 4, 5])
      setTurno(json.turno || 'Noite')
      setHoursPerDay(Number(json.hoursPerDay || saved.hoursPerDay || 2))
      setQuestionsPerDay(Number(json.questionsPerDay || 30))
      setMateriasText(Array.isArray(json.materias) && json.materias.length ? json.materias.join('\n') : (saved.editalText || DEFAULT_MATERIAS))
      setPlan(cronograma)
      setDayStats(data.dayStats || {})
      setProgress({
        diasConcluidos: Array.isArray(progresso.diasConcluidos) ? progresso.diasConcluidos.map(Number) : [],
        diasComQuestoes: Array.isArray(progresso.diasComQuestoes) ? progresso.diasComQuestoes.map(Number) : [],
        questoesGeradas: Number(progresso.questoesGeradas || 0),
        questoesRespondidas: Number(progresso.questoesRespondidas || 0),
        acertos: Number(progresso.acertos || 0),
        erros: Number(progresso.erros || 0),
        totalDias: Number(progresso.totalDias || cronograma.length || 0),
        percentual: Number(progresso.percentual || 0),
        ultimaAtualizacao: progresso.ultimaAtualizacao,
      })
      toast.success('Plano carregado para continuar')
    } catch {
      toast.error('Erro ao carregar plano salvo')
    } finally {
      setLoadingSaved(false)
    }
  }

  function toggleDay(day: number) {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b))
  }

  function resetarPlano() {
    if (loading || generatingDay !== null || planLockRef.current || savingPlan || loadingSaved) {
      toast.info('Aguarde a geração atual finalizar')
      return
    }
    setPlan([])
    setGeneratingDay(null)
    setSavedPlanId(null)
    setProgress(emptyProgress)
    setDayStats({})
    dayLocksRef.current = {}
    setBanca('')
    setCargo('')
    setExamDate('')
    setQuestionsPerDay(30)
    setHoursPerDay(2)
    setMateriasText(DEFAULT_MATERIAS)
    setSelectedDays([1, 2, 3, 4, 5])
    setTurno('Noite')
    toast.success('Plano resetado')
  }

  async function salvarPlanoGerado(rows: DayPlan[]) {
    if (!rows.length) return null
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
          source: 'geradas',
          materias,
          materiasText,
          plan: rows,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Plano gerado, mas não foi salvo')
        return null
      }
      const id = data.plan?.id || null
      setSavedPlanId(id)
      setProgress({ ...emptyProgress, totalDias: rows.length, ultimaAtualizacao: new Date().toISOString() })
      toast.success('Plano gerado e salvo')
      return id
    } catch {
      toast.error('Plano gerado, mas não foi salvo')
      return null
    } finally {
      setSavingPlan(false)
    }
  }

  async function recarregarPlanoAtual(id = savedPlanId) {
    if (!id) return
    try {
      const res = await fetch(`/api/generated?planId=${encodeURIComponent(id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.plan) return
      const progresso = data.plan.planJson?.progresso || {}
      setDayStats(data.dayStats || {})
      setProgress({
        diasConcluidos: Array.isArray(progresso.diasConcluidos) ? progresso.diasConcluidos.map(Number) : [],
        diasComQuestoes: Array.isArray(progresso.diasComQuestoes) ? progresso.diasComQuestoes.map(Number) : [],
        questoesGeradas: Number(progresso.questoesGeradas || 0),
        questoesRespondidas: Number(progresso.questoesRespondidas || 0),
        acertos: Number(progresso.acertos || 0),
        erros: Number(progresso.erros || 0),
        totalDias: Number(progresso.totalDias || plan.length || 0),
        percentual: Number(progresso.percentual || 0),
        ultimaAtualizacao: progresso.ultimaAtualizacao,
      })
    } catch {}
  }

  function gerarPlano() {
    if (planLockRef.current || loading || savingPlan || loadingSaved) return toast.info('Já existe uma geração em andamento')
    if (!banca.trim()) return toast.error('Informe a banca')
    if (!cargo.trim()) return toast.error('Informe o cargo')
    if (!materias.length) return toast.error('Informe pelo menos uma matéria')
    if (!selectedDays.length) return toast.error('Escolha pelo menos um dia da semana')

    planLockRef.current = true
    setLoading(true)
    setSavedPlanId(null)
    setProgress(emptyProgress)
    setDayStats({})
    dayLocksRef.current = {}

    setTimeout(async () => {
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
          observacao: `${isSimulado ? `Resolver em tempo cronometrado no estilo ${banca}.` : isReview ? 'Refazer questões erradas e revisar comentários depois de responder.' : `Resolver questões de ${materia} e registrar desempenho.`} Fonte: questões geradas por IA.`,
        })
        studyIndex++
      }

      setPlan(rows)
      setProgress({ ...emptyProgress, totalDias: rows.length })
      setLoading(false)
      planLockRef.current = false
      await salvarPlanoGerado(rows)
    }, 300)
  }

  async function gerarQuestoesDoDia(day: DayPlan) {
    if (generatingDay !== null || dayLocksRef.current[day.dia]) return toast.info('Já existe uma geração em andamento')
    if (!savedPlanId) return toast.error('Gere e salve o plano antes de gerar questões do dia')
    if (!banca.trim() || !cargo.trim()) return toast.error('Informe banca e cargo')

    const total = Math.max(1, Number(day.metaQuestoes || 1))
    if (total > 10 && !window.confirm(`Este dia tem ${total} questões. Vai consumir ${total} créditos. Continuar?`)) return

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
            editalText: `REFERÊNCIA DO PLANO DE QUESTÕES: ${cargo}\nDIA DO PLANO: ${day.dia}\nDATA: ${day.data}\nTIPO: ${day.tipo}\nFOCO: ${day.foco}\nFONTE: Questões geradas por IA\nORIENTAÇÃO: ${day.observacao}`,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || 'Erro ao gerar questões do dia')
          break
        }

        const ids = (data.questions || []).map((q: any) => q.id).filter(Boolean)
        if (ids.length) {
          await fetch('/api/generated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'link_questions', questionIds: ids, planId: savedPlanId, dayNumber: day.dia }),
          })
        }
        created += ids.length || quantity
      }

      if (created > 0) {
        await fetch('/api/generated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_question_plan_progress', planId: savedPlanId, dayNumber: day.dia, generated: created }),
        })
        await recarregarPlanoAtual()
        toast.success(`${created} questão(ões) vinculada(s) ao Dia ${day.dia}.`)
      }
    } catch {
      toast.error('Erro ao gerar questões do dia')
    } finally {
      setGeneratingDay(null)
      dayLocksRef.current[day.dia] = false
    }
  }

  const diasFeitos = progress.diasConcluidos?.length || 0
  const diasComQuestoes = progress.diasComQuestoes?.length || 0
  const progressoPercentual = progress.percentual || 0

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3"><Target size={13} /> Centro de estudo</div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Plano de Questões</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Cronograma com questões por dia geradas por IA, respostas salvas, acertos, erros, percentual e status feito.</p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="card p-5 space-y-4 h-fit">
          <div><label className="label">Banca</label><input className="input" placeholder="Ex: FURB, FGV, CEBRASPE" value={banca} onChange={e => setBanca(e.target.value)} /></div>
          <div><label className="label">Cargo / concurso</label><input className="input" placeholder="Ex: Prefeitura — Administrativo" value={cargo} onChange={e => setCargo(e.target.value)} /></div>
          <div><label className="label">Data da prova</label><input className="input" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
          <div><label className="label">Dias da semana</label><div className="flex flex-wrap gap-2">{WEEK_DAYS.map(d => <button key={d.key} type="button" onClick={() => toggleDay(d.key)} className={`chip text-xs ${selectedDays.includes(d.key) ? 'chip-active' : ''}`}>{d.label}</button>)}</div></div>
          <div><label className="label">Turno</label><div className="flex flex-wrap gap-2">{TURNOS.map(t => <button key={t} type="button" onClick={() => setTurno(t)} className={`chip ${turno === t ? 'chip-active' : ''}`}>{t}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Horas/dia</label><input className="input" type="number" min={0.5} step={0.5} value={hoursPerDay} onChange={e => setHoursPerDay(Number(e.target.value))} /></div><div><label className="label">Questões base/dia</label><input className="input" type="number" min={5} value={questionsPerDay} onChange={e => setQuestionsPerDay(Number(e.target.value))} /></div></div>
          <div><label className="label">Matérias / tópicos</label><textarea className="input min-h-[140px] py-3" value={materiasText} onChange={e => setMateriasText(e.target.value)} /></div>

          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100">
            <div className="font-semibold mb-1">Fonte das questões: IA</div>
            <p className="text-xs text-brand-100/80 leading-relaxed">Este plano cria questões novas com inteligência artificial de acordo com a banca, cargo, matérias e quantidade definida. PDFs importados ficam separados em Cadernos PDF.</p>
            <Link href="/cadernos" className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs font-semibold text-zinc-100"><FileText size={13} /> Abrir Cadernos PDF</Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={gerarPlano} disabled={loading || planLockRef.current || savingPlan || loadingSaved} className="btn-primary w-full flex items-center justify-center gap-2 h-11 disabled:opacity-50">{(loading || savingPlan || loadingSaved) && <Loader2 size={16} className="animate-spin" />}{loadingSaved ? 'Carregando...' : loading ? 'Gerando...' : savingPlan ? 'Salvando...' : 'Gerar plano'}</button>
            <button onClick={resetarPlano} disabled={loading || generatingDay !== null || savingPlan || loadingSaved} className="btn-secondary w-full flex items-center justify-center gap-2 h-11 disabled:opacity-50"><RotateCcw size={15} /> Resetar</button>
          </div>
        </div>

        <div className="space-y-4">
          {savedPlanId && <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-200">Plano salvo. Responda cada dia pelo botão do próprio cronograma.</div>}
          {!plan.length && <div className="card p-10 text-center text-zinc-500"><CalendarDays size={34} className="mx-auto mb-3 text-zinc-600" />{loadingSaved ? 'Carregando plano salvo...' : 'Preencha os dados para criar uma trilha diária de questões.'}</div>}

          {!!plan.length && <>
            <div className="grid md:grid-cols-5 gap-3">
              <div className="card p-4"><div className="text-xs text-zinc-500">Dias feitos</div><div className="font-heading text-2xl font-bold text-green-300">{diasFeitos}/{plan.length}</div></div>
              <div className="card p-4"><div className="text-xs text-zinc-500">Dias com questões</div><div className="font-heading text-2xl font-bold text-white">{diasComQuestoes}/{plan.length}</div></div>
              <div className="card p-4"><div className="text-xs text-zinc-500">Respondidas</div><div className="font-heading text-2xl font-bold text-brand-300">{progress.questoesRespondidas}/{progress.questoesGeradas}</div></div>
              <div className="card p-4"><div className="text-xs text-zinc-500">Acertos / erros</div><div className="font-heading text-2xl font-bold text-white">{progress.acertos}/{progress.erros}</div></div>
              <div className="card p-4"><div className="text-xs text-zinc-500">Progresso real</div><div className="font-heading text-2xl font-bold text-white">{progressoPercentual}%</div></div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-2"><span>Progresso real de resolução</span><span>{progress.questoesRespondidas} de {progress.questoesGeradas} questões respondidas</span></div>
              <div className="h-3 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${progressoPercentual}%` }} /></div>
            </div>

            <div className="card overflow-hidden">
              <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
                <div><div className="font-heading font-bold">Cronograma de questões</div><div className="text-xs text-zinc-500 mt-1">{cargo}</div></div>
                <button onClick={() => recarregarPlanoAtual()} disabled={!savedPlanId} className="btn-secondary text-xs flex items-center gap-1.5"><RotateCcw size={13} /> Atualizar progresso</button>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {plan.map(day => {
                  const stat = dayStats[String(day.dia)] || { dayNumber: day.dia, total: 0, answered: 0, correct: 0, wrong: 0, percent: 0, done: false }
                  const hasQuestions = stat.total > 0
                  return (
                    <div key={day.dia} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="flex gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center font-bold text-xs ${stat.done ? 'bg-green-500/10 border-green-500/20 text-green-300' : hasQuestions ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-brand-500/10 border-brand-500/20 text-brand-300'}`}>{stat.done ? '✓' : `D${day.dia}`}</div>
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-zinc-100 flex flex-wrap items-center gap-2">{day.foco}{stat.done && <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">Feito</span>}{hasQuestions && !stat.done && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">Em andamento</span>}</div>
                            <div className="text-xs text-zinc-500 mt-1">{day.data} · {day.diaSemana} · {day.turno} · {day.horasPorDia}h · {day.tipo}</div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                              <div className="rounded-xl bg-black/20 p-2"><div className="text-zinc-500">Geradas</div><div className="font-bold text-white">{stat.total}</div></div>
                              <div className="rounded-xl bg-black/20 p-2"><div className="text-zinc-500">Respondidas</div><div className="font-bold text-brand-300">{stat.answered}</div></div>
                              <div className="rounded-xl bg-black/20 p-2"><div className="text-zinc-500">Acertos</div><div className="font-bold text-green-300">{stat.correct}</div></div>
                              <div className="rounded-xl bg-black/20 p-2"><div className="text-zinc-500">Erros</div><div className="font-bold text-red-300">{stat.wrong}</div></div>
                              <div className="rounded-xl bg-black/20 p-2"><div className="text-zinc-500">Concluído</div><div className="font-bold text-white">{stat.percent}%</div></div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className={`h-full ${stat.done ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${stat.percent}%` }} /></div>
                            <div className="mt-2 text-xs text-zinc-500">Status: {stat.done ? 'Feito' : hasQuestions ? 'Em andamento' : 'Aguardando gerar questões'}</div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-brand-300 whitespace-nowrap">Meta: {day.metaQuestoes} questões</div>
                          <button onClick={() => gerarQuestoesDoDia(day)} disabled={generatingDay !== null || !!dayLocksRef.current[day.dia]} className="rounded-xl bg-brand-600 hover:bg-brand-500 text-white px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">{generatingDay === day.dia ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{generatingDay === day.dia ? 'Gerando...' : hasQuestions ? 'Gerar mais' : 'Gerar questões do dia'}</button>
                          {hasQuestions && savedPlanId && <Link href={`/plano-questoes/resolver?planId=${savedPlanId}&dia=${day.dia}`} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><ExternalLink size={13} /> Responder Dia {day.dia}</Link>}
                        </div>
                      </div>
                      <div className="mt-3 flex items-start gap-2 text-xs text-zinc-400 leading-relaxed"><CheckCircle2 size={13} className="text-green-400 mt-0.5 shrink-0" />{day.observacao}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
