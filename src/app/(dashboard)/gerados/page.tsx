'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, FileDown, FileText, HelpCircle, Trash2, Search, SlidersHorizontal, BarChart3 } from 'lucide-react'

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

function uniqueValues<T>(items: T[], getter: (item: T) => string | undefined | null) {
  return Array.from(new Set(items.map(getter).map(v => String(v || '').trim()).filter(Boolean))).sort()
}

function getQuestionPlanStats(plan: PlanItem) {
  const data = plan.planJson || {}
  const progresso = data.progresso || {}
  const cronograma = Array.isArray(data.cronograma) ? data.cronograma : []
  const totalDias = Number(progresso.totalDias || cronograma.length || 0)
  const diasConcluidos = Array.isArray(progresso.diasConcluidos) ? progresso.diasConcluidos.length : 0
  const percentual = Number(progresso.percentual || (totalDias ? Math.round((diasConcluidos / totalDias) * 100) : 0))
  const questoesGeradas = Number(progresso.questoesGeradas || 0)
  const horasTotais = cronograma.reduce((acc: number, d: any) => acc + Number(d.horasPorDia || 0), 0)
  const questoesPrevistas = cronograma.reduce((acc: number, d: any) => acc + Number(d.metaQuestoes || 0), 0)
  const status = percentual >= 100 ? 'Concluído' : percentual > 0 ? 'Em andamento' : 'Não iniciado'
  return { totalDias, diasConcluidos, percentual, questoesGeradas, horasTotais, questoesPrevistas, status, cronograma }
}

export default function GeradosPage() {
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [tab, setTab] = useState<'planos' | 'questoes'>('planos')
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterBanca, setFilterBanca] = useState('')
  const [filterCargo, setFilterCargo] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

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
    const key = `${type}:${id}`
    if (deleting === key) return toast.info('Este item já está sendo excluído')
    const label = type === 'plan' ? 'este plano/projeto' : 'esta questão'
    if (!confirm(`Tem certeza que deseja excluir ${label}?`)) return
    setDeleting(key)
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
    const isQuestionPlan = data?.tipo === 'plano_questoes'
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

    addLine(isQuestionPlan ? 'GabaritoIA - Plano de Questões' : 'GabaritoIA - Plano de Estudos', 16, true)
    addLine(plan.title, 12, true)
    addLine(`Banca: ${plan.banca || data?.banca?.nome || data?.banca || 'Não informado'}`)
    addLine(`Cargo: ${plan.cargo || data?.identificacao?.cargo || data?.cargo || 'Não informado'}`)
    addLine(`Gerado em: ${new Date(plan.createdAt).toLocaleDateString('pt-BR')}`)
    y += 3

    if (isQuestionPlan) {
      const stats = getQuestionPlanStats(plan)
      addLine('Progresso', 13, true)
      addLine(`${stats.percentual}% concluído | ${stats.diasConcluidos}/${stats.totalDias} dias | ${stats.questoesGeradas} questões geradas | ${stats.horasTotais}h previstas`)
      y += 3
      addLine('Cronograma', 13, true)
      stats.cronograma.forEach((d: any) => addLine(`Dia ${d.dia} - ${d.data} - ${d.turno} - ${d.horasPorDia}h - ${d.metaQuestoes} questões - ${d.foco}`))
      doc.save(`${plan.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
      return
    }

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

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return questions
      .filter(q => {
        if (filterBanca && q.banca !== filterBanca) return false
        if (filterCargo && (q.cargo || '') !== filterCargo) return false
        if (filterArea && q.area !== filterArea) return false
        if (filterDifficulty && q.difficulty !== filterDifficulty) return false
        if (term && !`${q.enunciado} ${q.comentario} ${q.banca} ${q.area} ${q.cargo || ''} ${q.subtopic || ''}`.toLowerCase().includes(term)) return false
        return true
      })
      .sort((a, b) => sortOrder === 'desc'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
  }, [questions, search, filterBanca, filterCargo, filterArea, filterDifficulty, sortOrder])

  const filteredPlans = useMemo(() => {
    const term = search.trim().toLowerCase()
    return plans
      .filter(p => !term || `${p.title} ${p.banca || ''} ${p.cargo || ''} ${p.planJson?.tipo || ''}`.toLowerCase().includes(term))
      .sort((a, b) => sortOrder === 'desc'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
  }, [plans, search, sortOrder])

  const bancas = useMemo(() => uniqueValues(questions, q => q.banca), [questions])
  const cargos = useMemo(() => uniqueValues(questions, q => q.cargo), [questions])
  const areas = useMemo(() => uniqueValues(questions, q => q.area), [questions])
  const dificuldades = useMemo(() => uniqueValues(questions, q => q.difficulty), [questions])

  function limparFiltros() {
    setSearch('')
    setFilterBanca('')
    setFilterCargo('')
    setFilterArea('')
    setFilterDifficulty('')
    setSortOrder('desc')
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
    addLine(`Total: ${filteredQuestions.length} questão(ões)`, 10)
    y += 3

    filteredQuestions.forEach((q, idx) => {
      addLine(`${idx + 1}. [${q.banca}] ${q.area} - ${q.difficulty}`, 11, true)
      addLine(q.enunciado)
      ;(q.options || []).forEach((op, i) => addLine(`${'ABCDE'[i] || i + 1}) ${op}`))
      addLine(`Gabarito: ${'ABCDE'[q.correctIndex] || q.correctIndex}`, 10, true)
      addLine(`Comentário: ${q.comentario}`)
      y += 3
    })

    doc.save('gabaritoia-questoes-filtradas.pdf')
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">📁 Meus Gerados</h1>
        <p className="text-zinc-400 text-sm mt-1">Tudo que você gerou com IA fica salvo aqui para consultar, exportar ou excluir.</p>
      </div>

      <div className="card p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-300 uppercase tracking-wider"><SlidersHorizontal size={14} /> Filtros</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-zinc-500" />
            <input className="input pl-9" placeholder="Buscar por texto, banca, cargo ou área" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')} style={{ colorScheme: 'dark' }}>
            <option value="desc">Mais recentes primeiro</option>
            <option value="asc">Mais antigos primeiro</option>
          </select>
          <button type="button" onClick={limparFiltros} className="btn-secondary">Limpar filtros</button>
        </div>

        {tab === 'questoes' && (
          <div className="grid md:grid-cols-4 gap-3">
            <select className="input" value={filterBanca} onChange={e => setFilterBanca(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todas as bancas</option>{bancas.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select className="input" value={filterCargo} onChange={e => setFilterCargo(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todos os cargos</option>{cargos.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select className="input" value={filterArea} onChange={e => setFilterArea(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todas as áreas</option>{areas.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select className="input" value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todas as dificuldades</option>{dificuldades.map(v => <option key={v} value={v}>{v}</option>)}</select>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button onClick={() => setTab('planos')} className={`chip ${tab === 'planos' ? 'chip-active' : ''}`}>Planos / Edital Pro ({filteredPlans.length}/{plans.length})</button>
        <button onClick={() => setTab('questoes')} className={`chip ${tab === 'questoes' ? 'chip-active' : ''}`}>Questões ({filteredQuestions.length}/{questions.length})</button>
      </div>

      {tab === 'planos' && (
        <div className="space-y-4">
          {plans.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhum plano gerado ainda.</div>}
          {!!plans.length && filteredPlans.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhum plano encontrado com esses filtros.</div>}
          {filteredPlans.map(plan => {
            const data = plan.planJson || {}
            const isQuestionPlan = data?.tipo === 'plano_questoes'
            const stats = isQuestionPlan ? getQuestionPlanStats(plan) : null
            const isOpen = openPlan === plan.id
            const deletingThis = deleting === `plan:${plan.id}`
            return (
              <div key={plan.id} className="card p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isQuestionPlan ? 'bg-green-500/10 text-green-300' : 'bg-brand-500/10 text-brand-300'}`}>{isQuestionPlan ? <BarChart3 size={20} /> : <FileText size={20} />}</div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-heading font-bold text-sm">{plan.title}</div>
                        {isQuestionPlan && <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">Plano de Questões</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{plan.banca || data?.banca?.nome || data?.banca || 'Banca não informada'} · {plan.cargo || data?.cargo || 'Cargo não informado'} · {new Date(plan.createdAt).toLocaleDateString('pt-BR')}</div>
                      {isQuestionPlan && stats && (
                        <div className="mt-3 max-w-xl">
                          <div className="flex flex-wrap gap-2 text-xs text-zinc-400 mb-2">
                            <span>{stats.percentual}% concluído</span>
                            <span>•</span>
                            <span>{stats.diasConcluidos}/{stats.totalDias} dias</span>
                            <span>•</span>
                            <span>{stats.questoesGeradas} questões geradas</span>
                            <span>•</span>
                            <span>{stats.horasTotais}h previstas</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${stats.percentual}%` }} />
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-1">Status: {stats.status} · Meta prevista: {stats.questoesPrevistas} questões</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isQuestionPlan && <a href={`/plano-questoes?id=${plan.id}`} className="rounded-xl bg-green-600 hover:bg-green-500 text-white px-3 py-2 text-xs font-semibold">Continuar plano</a>}
                    <button className="btn-secondary text-xs" onClick={() => setOpenPlan(isOpen ? null : plan.id)}>{isOpen ? 'Fechar' : isQuestionPlan ? 'Detalhes' : 'Ver'}</button>
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportPlanPDF(plan)}><FileDown size={14} /> PDF</button>
                    <button disabled={deletingThis} className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-3 py-2 text-xs flex items-center gap-1 disabled:opacity-50" onClick={() => deleteItem('plan', plan.id)}>{deletingThis ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-4 border-t border-white/[0.07] pt-4 space-y-3">
                    {isQuestionPlan && stats ? (
                      <>
                        <div className="grid md:grid-cols-4 gap-3">
                          <div className="bg-black/20 rounded-xl p-3 text-xs"><div className="text-zinc-500">Progresso</div><div className="text-lg font-bold text-green-300">{stats.percentual}%</div></div>
                          <div className="bg-black/20 rounded-xl p-3 text-xs"><div className="text-zinc-500">Dias</div><div className="text-lg font-bold text-white">{stats.diasConcluidos}/{stats.totalDias}</div></div>
                          <div className="bg-black/20 rounded-xl p-3 text-xs"><div className="text-zinc-500">Questões geradas</div><div className="text-lg font-bold text-brand-300">{stats.questoesGeradas}</div></div>
                          <div className="bg-black/20 rounded-xl p-3 text-xs"><div className="text-zinc-500">Horas previstas</div><div className="text-lg font-bold text-white">{stats.horasTotais}h</div></div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-brand-300 mb-2">Cronograma</div>
                          <div className="grid md:grid-cols-2 gap-2">
                            {stats.cronograma.slice(0, 12).map((d: any) => (
                              <div key={d.dia} className="bg-black/20 rounded-xl p-3 text-xs">
                                <div className="font-semibold text-zinc-200">D{d.dia} · {d.foco}</div>
                                <div className="text-zinc-500 mt-1">{d.data} · {d.turno} · {d.horasPorDia}h · {d.metaQuestoes} questões</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm"><strong>Foco:</strong> {data?.banca?.foco || 'Não informado'}</div>
                        <div>
                          <div className="text-xs font-bold text-brand-300 mb-2">Matérias</div>
                          <div className="flex flex-wrap gap-2">{(data.materias || []).map((m: any, i: number) => <span key={i} className="chip text-xs">{m.nome || m.materia}</span>)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-brand-300 mb-2">Flashcards</div>
                          <div className="grid md:grid-cols-2 gap-2">{(data.flashcards || []).slice(0, 6).map((f: any, i: number) => <div key={i} className="bg-black/20 rounded-xl p-3 text-xs"><div className="font-semibold text-zinc-200">{f.pergunta}</div><div className="text-zinc-500 mt-1">{f.resposta}</div></div>)}</div>
                        </div>
                      </>
                    )}
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
            <button onClick={exportQuestionsPDF} disabled={!filteredQuestions.length} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> Exportar filtradas em PDF</button>
          </div>
          {questions.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhuma questão gerada salva ainda. As novas questões geradas passarão a aparecer aqui.</div>}
          {!!questions.length && filteredQuestions.length === 0 && <div className="card p-8 text-center text-zinc-500">Nenhuma questão encontrada com esses filtros.</div>}
          <div className="space-y-4">
            {filteredQuestions.map((q, idx) => {
              const deletingThis = deleting === `question:${q.id}`
              return (
                <div key={q.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-300 flex items-center justify-center"><HelpCircle size={18} /></div>
                      <div>
                        <div className="text-xs text-brand-300 font-bold">{idx + 1}. {q.banca} · {q.area} · {q.difficulty}</div>
                        <div className="text-[11px] text-zinc-500">{q.cargo ? `${q.cargo} · ` : ''}{new Date(q.createdAt).toLocaleDateString('pt-BR')}</div>
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
