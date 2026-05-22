'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, FileDown, FileText, HelpCircle, Trash2 } from 'lucide-react'

interface PlanItem {
  id: string
  title: string
  banca?: string
  cargo?: string
  hoursPerDay?: string
  level?: string
  createdAt: string
  planJson: any
}

interface QuestionItem {
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
}

export default function GeradosPage() {
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [tab, setTab] = useState<'planos' | 'questoes'>('planos')
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/generated')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao carregar gerados'); return }
      setPlans(data.plans || [])
      setQuestions(data.questions || [])
    } catch { toast.error('Erro ao carregar seus itens gerados') }
    finally { setLoading(false) }
  }

  async function deleteItem(type: 'plan' | 'question', id: string) {
    const label = type === 'plan' ? 'este plano/projeto' : 'esta questão'
    if (!confirm(`Tem certeza que deseja excluir ${label}?`)) return
    setDeleting(`${type}:${id}`)
    try {
      const res = await fetch('/api/generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_item', type, id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir'); return }
      if (type === 'plan') {
        setPlans(prev => prev.filter(p => p.id !== id))
        if (openPlan === id) setOpenPlan(null)
      } else {
        setQuestions(prev => prev.filter(q => q.id !== id))
      }
      toast.success('Item excluído com sucesso')
    } catch {
      toast.error('Erro ao excluir item')
    } finally {
      setDeleting(null)
    }
  }

  async function exportPlanPDF(plan: PlanItem) {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const data = plan.planJson || {}
    let y = 14
    const pageH = doc.internal.pageSize.height

    const addLine = (text: string, size = 10, bold = false) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(String(text || ''), 180)
      for (const line of lines) {
        if (y > pageH - 15) { doc.addPage(); y = 14 }
        doc.text(line, 14, y)
        y += size * 0.45 + 2
      }
    }

    addLine('GabaritoIA - Plano de Estudos', 16, true)
    addLine(plan.title, 12, true)
    addLine(`Banca: ${plan.banca || data?.banca?.nome || 'Não informado'}`)
    addLine(`Cargo: ${plan.cargo || data?.identificacao?.cargo || 'Não informado'}`)
    addLine(`Gerado em: ${new Date(plan.createdAt).toLocaleDateString('pt-BR')}`)
    y += 3

    if (Array.isArray(data.materias)) {
      addLine('Matérias', 13, true)
      data.materias.forEach((m: any) => addLine(`- ${m.nome || m.materia} | Peso: ${m.peso || '1'} | Horas: ${m.horas_sugeridas || 'Não informado'}`))
      y += 3
    }

    if (data.banca) {
      addLine('Análise da banca', 13, true)
      addLine(`Estilo: ${data.banca.estilo || 'Não informado'}`)
      addLine(`Pegadinhas: ${data.banca.pegadinhas || 'Não informado'}`)
      addLine(`Foco: ${data.banca.foco || 'Não informado'}`)
      y += 3
    }

    if (Array.isArray(data.semanas)) {
      addLine('Cronograma', 13, true)
      data.semanas.forEach((sem: any) => {
        addLine(`${sem.titulo || `Semana ${sem.semana}`}`, 11, true)
        ;(sem.dias || []).forEach((d: any) => addLine(`${d.dia} (${d.date || ''}) - ${d.materia || ''} | ${d.subtema || ''} | ${d.horas || 0}h | ${d.meta_questoes || 0} questões`))
      })
      y += 3
    }

    if (Array.isArray(data.flashcards)) {
      addLine('Flashcards', 13, true)
      data.flashcards.forEach((f: any, i: number) => {
        addLine(`${i + 1}. ${f.pergunta || ''}`, 10, true)
        addLine(`Resposta: ${f.resposta || ''}`)
        if (f.armadilha) addLine(`Armadilha: ${f.armadilha}`)
      })
    }

    doc.save(`${plan.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
  }

  async function exportQuestionsPDF() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    let y = 14
    const pageH = doc.internal.pageSize.height
    const addLine = (text: string, size = 10, bold = false) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(String(text || ''), 180)
      for (const line of lines) {
        if (y > pageH - 15) { doc.addPage(); y = 14 }
        doc.text(line, 14, y)
        y += size * 0.45 + 2
      }
    }

    addLine('GabaritoIA - Questões Geradas', 16, true)
    addLine(`Total: ${questions.length} questão(ões)`, 10)
    y += 3

    questions.forEach((q, idx) => {
      addLine(`${idx + 1}. [${q.banca}] ${q.area} - ${q.difficulty}`, 11, true)
      addLine(q.enunciado)
      ;(q.options || []).forEach((op, i) => addLine(`${'ABCDE'[i] || i + 1}) ${op}`))
      addLine(`Gabarito: ${'ABCDE'[q.correctIndex] || q.correctIndex}`, 10, true)
      addLine(`Comentário: ${q.comentario}`)
      y += 3
    })

    doc.save('gabaritoia-questoes-geradas.pdf')
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">📁 Meus Gerados</h1>
        <p className="text-zinc-400 text-sm mt-1">Tudo que você gerou com IA fica salvo aqui para consultar, exportar ou excluir.</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button onClick={() => setTab('planos')} className={`chip ${tab === 'planos' ? 'chip-active' : ''}`}>Planos / Edital Pro ({plans.length})</button>
        <button onClick={() => setTab('questoes')} className={`chip ${tab === 'questoes' ? 'chip-active' : ''}`}>Questões ({questions.length})</button>
      </div>

      {tab === 'planos' && (
        <div className="space-y-4">
          {plans.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhum plano gerado ainda.</div>}
          {plans.map(plan => {
            const data = plan.planJson || {}
            const isOpen = openPlan === plan.id
            const deletingThis = deleting === `plan:${plan.id}`
            return (
              <div key={plan.id} className="card p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-300 flex items-center justify-center"><FileText size={20} /></div>
                    <div>
                      <div className="font-heading font-bold text-sm">{plan.title}</div>
                      <div className="text-xs text-zinc-500 mt-1">{plan.banca || data?.banca?.nome || 'Banca não informada'} · {plan.cargo || 'Cargo não informado'} · {new Date(plan.createdAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary text-xs" onClick={() => setOpenPlan(isOpen ? null : plan.id)}>{isOpen ? 'Fechar' : 'Ver'}</button>
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportPlanPDF(plan)}><FileDown size={14} /> PDF</button>
                    <button disabled={deletingThis} className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-3 py-2 text-xs flex items-center gap-1 disabled:opacity-50" onClick={() => deleteItem('plan', plan.id)}>{deletingThis ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-4 border-t border-white/[0.07] pt-4 space-y-3">
                    <div className="text-sm"><strong>Foco:</strong> {data?.banca?.foco || 'Não informado'}</div>
                    <div>
                      <div className="text-xs font-bold text-brand-300 mb-2">Matérias</div>
                      <div className="flex flex-wrap gap-2">{(data.materias || []).map((m: any, i: number) => <span key={i} className="chip text-xs">{m.nome || m.materia}</span>)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-brand-300 mb-2">Flashcards</div>
                      <div className="grid md:grid-cols-2 gap-2">{(data.flashcards || []).slice(0, 6).map((f: any, i: number) => <div key={i} className="bg-black/20 rounded-xl p-3 text-xs"><div className="font-semibold text-zinc-200">{f.pergunta}</div><div className="text-zinc-500 mt-1">{f.resposta}</div></div>)}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'questoes' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={exportQuestionsPDF} disabled={!questions.length} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> Exportar todas em PDF</button>
          </div>
          {questions.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhuma questão gerada salva ainda. As novas questões geradas passarão a aparecer aqui.</div>}
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const deletingThis = deleting === `question:${q.id}`
              return (
                <div key={q.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-300 flex items-center justify-center"><HelpCircle size={18} /></div>
                      <div>
                        <div className="text-xs text-brand-300 font-bold">{idx + 1}. {q.banca} · {q.area} · {q.difficulty}</div>
                        <div className="text-[11px] text-zinc-500">{new Date(q.createdAt).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </div>
                    <button disabled={deletingThis} className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-3 py-2 text-xs flex items-center gap-1 disabled:opacity-50" onClick={() => deleteItem('question', q.id)}>{deletingThis ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir</button>
                  </div>
                  <p className="text-sm leading-relaxed mb-3">{q.enunciado}</p>
                  <div className="space-y-1 mb-3">{(q.options || []).map((op, i) => <div key={i} className={`text-xs rounded-lg p-2 ${i === q.correctIndex ? 'bg-green-500/10 text-green-300' : 'bg-black/20 text-zinc-400'}`}>{'ABCDE'[i]}) {op}</div>)}</div>
                  <div className="text-xs text-zinc-400 border-l-2 border-brand-500 pl-3">{q.comentario}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
