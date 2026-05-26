'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, Loader2, RotateCcw, Sparkles, Target } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

type DayPlan = {
  dia: number
  data: string
  foco: string
  metaQuestoes: number
  tipo: string
  observacao: string
}

const DEFAULT_MATERIAS = 'Português\nDireito Administrativo\nDireito Constitucional\nInformática\nRaciocínio Lógico'

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function PlanoQuestoesPage() {
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [questionsPerDay, setQuestionsPerDay] = useState(30)
  const [materiasText, setMateriasText] = useState(DEFAULT_MATERIAS)
  const [source, setSource] = useState<'geradas' | 'cadernos' | 'ambos'>('ambos')
  const [loading, setLoading] = useState(false)
  const [generatingDay, setGeneratingDay] = useState<number | null>(null)
  const [generatedDays, setGeneratedDays] = useState<Record<number, number>>({})
  const [plan, setPlan] = useState<DayPlan[]>([])

  const materias = useMemo(() => materiasText.split('\n').map(s => s.trim()).filter(Boolean), [materiasText])

  function resetarPlano() {
    setPlan([])
    setGeneratedDays({})
    setGeneratingDay(null)
    setBanca('')
    setCargo('')
    setExamDate('')
    setQuestionsPerDay(30)
    setMateriasText(DEFAULT_MATERIAS)
    setSource('ambos')
    toast.success('Plano resetado')
  }

  function gerarPlano() {
    if (!banca.trim()) { toast.error('Informe a banca'); return }
    if (!cargo.trim()) { toast.error('Informe o cargo'); return }
    if (!materias.length) { toast.error('Informe pelo menos uma matéria'); return }

    setLoading(true)
    setGeneratedDays({})
    setTimeout(() => {
      const today = new Date()
      const end = examDate ? new Date(`${examDate}T12:00:00`) : new Date(today.getTime() + 21 * 86400000)
      const diffDays = Math.max(7, Math.ceil((end.getTime() - today.getTime()) / 86400000))
      const totalDays = Math.min(diffDays, 45)
      const rows: DayPlan[] = []

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(today.getTime() + i * 86400000)
        const isReview = (i + 1) % 5 === 0
        const isSimulado = (i + 1) % 7 === 0
        const materia = materias[i % materias.length]
        const materia2 = materias[(i + 1) % materias.length]

        rows.push({
          dia: i + 1,
          data: formatDate(d),
          foco: isSimulado ? `Simulado misto: ${materias.slice(0, 4).join(', ')}` : isReview ? `Revisão de erros: ${materia} + ${materia2}` : materia,
          metaQuestoes: isSimulado ? Math.max(questionsPerDay, 40) : isReview ? Math.max(15, Math.round(questionsPerDay * 0.7)) : questionsPerDay,
          tipo: isSimulado ? 'Simulado' : isReview ? 'Revisão' : 'Questões novas',
          observacao: isSimulado
            ? `Resolver em tempo cronometrado no estilo ${banca}. Corrigir todas as erradas.`
            : isReview
              ? 'Refazer questões erradas e ler comentários antes de avançar.'
              : source === 'cadernos'
                ? 'Usar questões dos PDFs importados no módulo Cadernos.'
                : source === 'geradas'
                  ? 'Usar questões criadas pelo Gerador de Questões com IA.'
                  : 'Combinar questões dos PDFs importados com questões criadas pela IA.',
        })
      }
      setPlan(rows)
      setLoading(false)
      toast.success('Plano de questões gerado')
    }, 350)
  }

  async function gerarQuestoesDoDia(day: DayPlan) {
    if (!banca.trim() || !cargo.trim()) {
      toast.error('Informe banca e cargo antes de gerar as questões')
      return
    }

    const total = Math.max(1, Number(day.metaQuestoes || 1))
    if (total > 10) {
      const ok = window.confirm(`Este dia tem ${total} questões. Isso vai consumir ${total} créditos e gerar em lotes de 10. Continuar?`)
      if (!ok) return
    }

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
            editalText: `REFERÊNCIA DO PLANO DE QUESTÕES: ${cargo}\nDIA: ${day.dia}\nDATA: ${day.data}\nTIPO: ${day.tipo}\nFOCO: ${day.foco}\nORIENTAÇÃO: ${day.observacao}`,
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
        toast.success(`${created} questão(ões) gerada(s) e salvas em Meus Gerados`)
      }
    } catch {
      toast.error('Erro ao gerar questões do dia')
    } finally {
      setGeneratingDay(null)
    }
  }

  const totalQuestoes = plan.reduce((acc, d) => acc + d.metaQuestoes, 0)

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
            <label className="label">Questões por dia</label>
            <input className="input" type="number" min={5} max={200} value={questionsPerDay} onChange={e => setQuestionsPerDay(Number(e.target.value))} />
          </div>
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
            <button onClick={gerarPlano} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Gerar plano
            </button>
            <button onClick={resetarPlano} type="button" className="btn-secondary w-full flex items-center justify-center gap-2 h-11">
              <RotateCcw size={15} /> Resetar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {!plan.length && (
            <div className="card p-10 text-center text-zinc-500">
              <CalendarDays size={34} className="mx-auto mb-3 text-zinc-600" />
              Preencha os dados para criar uma trilha diária de questões.
            </div>
          )}

          {!!plan.length && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="card p-4"><div className="text-xs text-zinc-500">Dias de plano</div><div className="font-heading text-2xl font-bold text-white">{plan.length}</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Meta total</div><div className="font-heading text-2xl font-bold text-brand-300">{totalQuestoes}</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Banca</div><div className="font-heading text-lg font-bold text-white truncate">{banca}</div></div>
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
                    <button onClick={resetarPlano} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 flex items-center gap-1.5">
                      <RotateCcw size={13} /> Resetar tudo
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {plan.map(day => {
                    const generated = generatedDays[day.dia] || 0
                    return (
                      <div key={day.dia} className="p-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="flex gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-300 flex items-center justify-center font-bold text-xs">D{day.dia}</div>
                            <div>
                              <div className="font-semibold text-sm text-zinc-100">{day.foco}</div>
                              <div className="text-xs text-zinc-500 mt-1">{day.data} · {day.tipo}</div>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row md:flex-col gap-2 md:items-end">
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-brand-300 whitespace-nowrap">
                              {day.metaQuestoes} questões
                            </div>
                            <button
                              onClick={() => gerarQuestoesDoDia(day)}
                              disabled={generatingDay !== null}
                              className="rounded-xl bg-brand-600 hover:bg-brand-500 text-white px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {generatingDay === day.dia ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                              {generated > 0 ? `Gerar mais (${generated} feitas)` : 'Gerar questões do dia'}
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
