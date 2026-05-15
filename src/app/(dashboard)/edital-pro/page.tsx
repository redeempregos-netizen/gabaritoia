'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, ChevronDown, ChevronUp } from 'lucide-react'

interface StudyDay { dia: string; date: string; materia: string; subtema: string; tipo: string; horas: number; meta_questoes: number; descanso: boolean }
interface StudyWeek { semana: number; titulo: string; dias: StudyDay[] }
interface Flashcard { topico: string; pergunta: string; resposta: string; fonte: string; armadilha: string }
interface BancaInfo { nome: string; estilo: string; pegadinhas: string; foco: string }
interface PlanData { banca: BancaInfo; materias: Array<{ nome: string; peso: number }>; semanas: StudyWeek[]; flashcards: Flashcard[] }

export default function EditalProPage() {
  const [editalText, setEditalText] = useState('')
  const [fileName, setFileName] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('3h')
  const [level, setLevel] = useState('Iniciante')
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [daysCompleted, setDaysCompleted] = useState<Record<string, boolean>>({})
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({ 0: true })
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({})
  const [fcFilter, setFcFilter] = useState('todos')
  const [dragging, setDragging] = useState(false)
  const [loadingMoreFlash, setLoadingMoreFlash] = useState(false)
  const [provider, setProvider] = useState('claude')

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
  }, [])

  function processFile(file: File) {
    setFileName(file.name)
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = e => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer)
        let text = ''
        for (let i = 0; i < arr.length; i++) { if (arr[i] > 31 && arr[i] < 127) text += String.fromCharCode(arr[i]) }
        setEditalText(text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{3,}/g, ' ').substring(0, 5000))
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => setEditalText((e.target?.result as string).substring(0, 5000))
      reader.readAsText(file, 'utf-8')
    }
  }

  async function gerarPlano() {
    if (!editalText) { toast.error('Faça upload do edital primeiro'); return }
    setLoading(true)
    setPlan(null)
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText, cargo, examDate, hoursPerDay, level, provider }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar plano'); return }
      setPlan(data.plan)
      setPlanId(data.plan.id)
      setDaysCompleted({})
      setOpenWeeks({ 0: true })
      toast.success('Plano gerado com sucesso!')
    } catch { toast.error('Erro ao gerar plano') }
    finally { setLoading(false) }
  }

  async function toggleDay(semIdx: number, diaIdx: number) {
    const key = `${semIdx}_${diaIdx}`
    const newVal = !daysCompleted[key]
    setDaysCompleted(prev => ({ ...prev, [key]: newVal }))
    if (planId) {
      await fetch(`/api/ai/plan/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysCompleted: { ...daysCompleted, [key]: newVal } }),
      }).catch(() => {})
    }
  }

  async function gerarMaisFlash() {
    if (!plan) return
    setLoadingMoreFlash(true)
    try {
      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materias: plan.materias.map(m => m.nome), banca: plan.banca?.nome, provider }),
      })
      const data = await res.json()
      if (res.ok && data.flashcards) {
        setPlan(prev => prev ? { ...prev, flashcards: [...prev.flashcards, ...data.flashcards] } : prev)
        toast.success(`${data.flashcards.length} flashcards adicionados!`)
      }
    } catch { toast.error('Erro ao gerar flashcards') }
    finally { setLoadingMoreFlash(false) }
  }

  const totalDays = plan?.semanas.flatMap(s => s.dias.filter(d => !d.descanso)).length || 0
  const doneDays = Object.values(daysCompleted).filter(Boolean).length
  const pct = totalDays ? Math.round(doneDays / totalDays * 100) : 0

  const topicos = plan ? ['todos', ...Array.from(new Set(plan.flashcards.map(f => f.topico)))] : []
  const filteredCards = plan?.flashcards.filter(f => fcFilter === 'todos' || f.topico === fcFilter) || []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/30 rounded-full px-3 py-1 text-xs font-semibold text-brand-300 mb-3">🚀 Novo recurso</div>
        <h1 className="font-heading text-2xl font-bold">Edital Pro — Plano de estudos inteligente</h1>
        <p className="text-zinc-400 text-sm mt-1">Transforme qualquer edital em plano completo com cronograma e flashcards</p>
      </div>

      {!plan ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-4 ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`}
              onClick={() => document.getElementById('ep-file')?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            >
              <Upload size={32} className="mx-auto mb-3 text-zinc-500" />
              <div className="font-heading font-semibold mb-1">{fileName || 'Arraste o edital aqui'}</div>
              <div className="text-sm text-zinc-500">{editalText ? `${Math.round(editalText.length / 100) / 10}kb extraídos` : 'PDF, TXT — ou clique para selecionar'}</div>
              {editalText && <div className="mt-2 text-xs text-green-400">✓ Edital carregado</div>}
            </div>
            <input type="file" id="ep-file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />

            <div className="card p-5 space-y-4">
              <div><label className="label">Cargo / vaga pretendida</label><input className="input" placeholder="Ex: Agente Administrativo..." value={cargo} onChange={e => setCargo(e.target.value)} /></div>
              <div><label className="label">Data da prova (opcional)</label><input type="date" className="input" value={examDate} onChange={e => setExamDate(e.target.value)} style={{ colorScheme: 'dark' }} /></div>
              <div>
                <label className="label">Horas por dia</label>
                <div className="flex flex-wrap gap-2">
                  {['1h', '2h', '3h', '4h', '5h', '6h+'].map(h => (
                    <button key={h} onClick={() => setHoursPerDay(h)} className={`chip ${hoursPerDay === h ? 'chip-active' : ''}`}>{h}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Nível atual</label>
                <div className="flex gap-2">
                  {['Iniciante', 'Intermediário', 'Avançado'].map(l => (
                    <button key={l} onClick={() => setLevel(l)} className={`chip ${level === l ? 'chip-active' : ''}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={gerarPlano} disabled={loading || !editalText}
              className="w-full mt-4 bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40">
              {loading ? <><Loader2 size={16} className="animate-spin" />Gerando plano...</> : '🚀 Gerar plano completo com IA'}
            </button>
          </div>

          <div className="space-y-2">
            {[
              { icon: '⚡', t: 'Flashcards por tópico', d: '10+ flashcards com pergunta, resposta, fonte legal e armadilha da banca' },
              { icon: '⚖️', t: 'Matérias por peso', d: 'A IA prioriza pelo edital — estude o que mais cai' },
              { icon: '🎯', t: 'Alerta da banca', d: 'Estilo, pegadinhas e foco específico da banca' },
              { icon: '📅', t: 'Cronograma até a prova', d: 'Semanas preenchidas dia a dia com meta de questões' },
              { icon: '📄', t: 'Adaptado às suas horas', d: 'Você informa quanto tempo tem — o plano se ajusta' },
            ].map(f => (
              <div key={f.t} className="card p-4 flex gap-3">
                <div className="text-2xl">{f.icon}</div>
                <div><div className="text-sm font-semibold">{f.t}</div><div className="text-xs text-zinc-500 mt-0.5">{f.d}</div></div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {/* Alerta banca */}
          <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl p-4 mb-6">
            <div className="text-xs font-bold text-amber-400 mb-1">🎯 Alerta da banca — {plan.banca?.nome}</div>
            <div className="text-sm text-zinc-300"><strong>Estilo:</strong> {plan.banca?.estilo}</div>
            <div className="text-sm text-zinc-300"><strong>Pegadinhas:</strong> {plan.banca?.pegadinhas}</div>
            <div className="text-sm text-zinc-300"><strong>Foco:</strong> {plan.banca?.foco}</div>
          </div>

          {/* Progresso */}
          <div className="card p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Progresso do plano</span>
              <span className="text-xs text-zinc-500">{doneDays} de {totalDays} dias concluídos</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Cronograma */}
          <h2 className="font-heading font-bold mb-3">📅 Cronograma semanal</h2>
          <div className="card overflow-hidden mb-6">
            {plan.semanas.map((sem, si) => (
              <div key={si} className="border-b border-white/[0.05] last:border-0">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpenWeeks(p => ({ ...p, [si]: !p[si] }))}>
                  <span className="font-medium text-sm">{sem.titulo}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{sem.dias.filter(d => !d.descanso && daysCompleted[`${si}_${sem.dias.indexOf(d)}`]).length}/{sem.dias.filter(d => !d.descanso).length} dias</span>
                    {openWeeks[si] ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                  </div>
                </div>
                {openWeeks[si] && (
                  <div className="grid grid-cols-7 border-t border-white/[0.05]">
                    {sem.dias.map((dia, di) => {
                      const key = `${si}_${di}`
                      const done = daysCompleted[key]
                      return (
                        <div key={di}
                          className={`p-2 text-center border-r border-white/[0.05] last:border-0 cursor-pointer transition-colors ${dia.descanso ? 'opacity-40' : done ? 'bg-green-500/8' : 'hover:bg-white/[0.02]'}`}
                          onClick={() => !dia.descanso && toggleDay(si, di)}
                        >
                          <div className="text-[10px] text-zinc-500 mb-1">{dia.dia}</div>
                          {dia.descanso ? (
                            <div className="text-base">🛌</div>
                          ) : (
                            <>
                              <div className="text-[10px] font-semibold text-brand-300 leading-tight mb-1 truncate">{dia.materia}</div>
                              <div className="text-[9px] text-zinc-500 leading-tight mb-1 truncate">{dia.subtema}</div>
                              <div className="text-[9px] text-zinc-600">{dia.horas}h · {dia.meta_questoes}q</div>
                              {done && <div className="text-green-400 text-[10px] mt-0.5">✓</div>}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Flashcards */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-heading font-bold">⚡ Flashcards de revisão</h2>
            <div className="flex flex-wrap gap-2">
              {topicos.map(t => (
                <button key={t} onClick={() => setFcFilter(t)} className={`chip text-xs ${fcFilter === t ? 'chip-active' : ''}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {filteredCards.map((fc, i) => (
              <div key={i} className={`card p-4 cursor-pointer fc-card ${flippedCards[i] ? 'flipped' : ''}`} onClick={() => setFlippedCards(p => ({ ...p, [i]: !p[i] }))}>
                <div className="fc-inner">
                  <div className="fc-front">
                    <div className="text-xs text-brand-300 mb-2">{fc.topico}</div>
                    <div className="text-sm font-semibold mb-3">{fc.pergunta}</div>
                    <div className="text-xs text-zinc-500">👆 Clique para ver a resposta</div>
                  </div>
                  <div className="fc-back">
                    <div className="text-sm text-zinc-200 mb-2 leading-relaxed">{fc.resposta}</div>
                    {fc.fonte && <div className="text-xs text-zinc-500">📚 {fc.fonte}</div>}
                    {fc.armadilha && <div className="text-xs text-amber-400 mt-1">⚠ Armadilha: {fc.armadilha}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={() => { setPlan(null); setEditalText(''); setFileName('') }}
              className="btn-secondary">↩ Novo plano</button>
            <button onClick={gerarMaisFlash} disabled={loadingMoreFlash} className="btn-secondary flex items-center gap-2">
              {loadingMoreFlash ? <Loader2 size={14} className="animate-spin" /> : '⚡'} Mais flashcards
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
