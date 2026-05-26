'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Loader2, Target } from 'lucide-react'
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
  const [plan, setPlan] = useState<DayPlan[]>([])

  const materias = useMemo(() => materiasText.split('\n').map(s => s.trim()).filter(Boolean), [materiasText])

  function gerarPlano() {
    if (!banca.trim()) { toast.error('Informe a banca'); return }
    if (!cargo.trim()) { toast.error('Informe o cargo'); return }
    if (!materias.length) { toast.error('Informe pelo menos uma matéria'); return }

    setLoading(true)
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
                ? 'Usar questões dos Cadernos PDF importados.'
                : source === 'geradas'
                  ? 'Usar questões geradas por IA no estilo da banca.'
                  : 'Misturar Cadernos PDF e questões geradas por IA.',
        })
      }
      setPlan(rows)
      setLoading(false)
      toast.success('Plano de questões gerado')
    }, 350)
  }

  const totalQuestoes = plan.reduce((acc, d) => acc + d.metaQuestoes, 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Target size={13} /> Plano de resolução
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Plano de Estudos de Questões</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Monte um cronograma prático de questões por dia, com revisão de erros e simulados no estilo da banca.</p>
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
              <button onClick={() => setSource('ambos')} className={`chip ${source === 'ambos' ? 'chip-active' : ''}`}>Cadernos + IA</button>
              <button onClick={() => setSource('cadernos')} className={`chip ${source === 'cadernos' ? 'chip-active' : ''}`}>Cadernos PDF</button>
              <button onClick={() => setSource('geradas')} className={`chip ${source === 'geradas' ? 'chip-active' : ''}`}>Geradas IA</button>
            </div>
          </div>
          <button onClick={gerarPlano} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Gerar plano de questões
          </button>
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
                <div className="p-4 border-b border-white/[0.07]">
                  <div className="font-heading font-bold">Cronograma de questões</div>
                  <div className="text-xs text-zinc-500 mt-1">{cargo}</div>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {plan.map(day => (
                    <div key={day.dia} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-300 flex items-center justify-center font-bold text-xs">D{day.dia}</div>
                          <div>
                            <div className="font-semibold text-sm text-zinc-100">{day.foco}</div>
                            <div className="text-xs text-zinc-500 mt-1">{day.data} · {day.tipo}</div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-brand-300 whitespace-nowrap">
                          {day.metaQuestoes} questões
                        </div>
                      </div>
                      <div className="mt-3 flex items-start gap-2 text-xs text-zinc-400 leading-relaxed">
                        <CheckCircle2 size={13} className="text-green-400 mt-0.5 shrink-0" />
                        {day.observacao}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
