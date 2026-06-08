'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

interface StudyDay { dia: string; date: string; materia: string; subtema: string; tipo: string; horas: number; meta_questoes: number; descanso: boolean }
interface StudyWeek { semana: number; titulo: string; dias: StudyDay[] }
interface Flashcard { topico: string; pergunta: string; resposta: string; fonte: string; armadilha: string }
interface BancaInfo { nome: string; estilo: string; pegadinhas: string; foco: string }
interface PlanData { banca: BancaInfo; materias: Array<{ nome: string; peso: number }>; semanas: StudyWeek[]; flashcards: Flashcard[] }
interface CargoDetectado { nome: string; vagas?: string; requisitos?: string; remuneracao?: string }
interface EditalAnalysis { banca: string; orgao: string; cargos: CargoDetectado[] }

export default function EditalProPage() {
  const [editalText, setEditalText] = useState('')
  const [fileName, setFileName] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('3h')
  const [level, setLevel] = useState('Iniciante')
  const [provider, setProvider] = useState('claude')
  const [loading, setLoading] = useState(false)
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [analyzingEdital, setAnalyzingEdital] = useState(false)
  const [analysis, setAnalysis] = useState<EditalAnalysis | null>(null)
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [daysCompleted, setDaysCompleted] = useState<Record<string, boolean>>({})
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({ 0: true })
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({})
  const [fcFilter, setFcFilter] = useState('todos')
  const [loadingMoreFlash, setLoadingMoreFlash] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<AIQueueStatus | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!queue?.id || !loading) return
    const timer = setInterval(async () => {
      try {
        const status = await getAIQueueStatus(queue.id)
        setQueue(status)
      } catch {}
    }, 1200)
    return () => clearInterval(timer)
  }, [queue?.id, loading])

  function normalizarCargos(valor: any): CargoDetectado[] {
    const itens = Array.isArray(valor) ? valor : []
    const vistos = new Set<string>()
    return itens.map((item: any) => ({
      nome: String(item?.nome || item?.cargo || '').trim(),
      vagas: String(item?.vagas || 'Não informado'),
      requisitos: String(item?.requisitos || item?.escolaridade || 'Não informado'),
      remuneracao: String(item?.remuneracao || item?.remuneração || item?.salario || 'Não informado'),
    })).filter(c => {
      const key = c.nome.toLowerCase()
      if (!c.nome || c.nome === 'Não informado' || vistos.has(key)) return false
      vistos.add(key)
      return true
    })
  }

  async function analisarEdital(text: string) {
    if (!text || text.length < 10) return
    setAnalyzingEdital(true)
    setAnalysis(null)
    setCargo('')
    try {
      const res = await fetch('/api/ai/analyze-edital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText: text, provider }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível analisar o edital'); return }
      const raw = data.analysis || {}
      const detected = { banca: raw.banca || 'Não informado', orgao: raw.orgao || raw.orgão || 'Não informado', cargos: normalizarCargos(raw.cargos) }
      setAnalysis(detected)
      if (detected.cargos.length === 1) setCargo(detected.cargos[0].nome)
      if (detected.cargos.length > 1) toast.success(`${detected.cargos.length} cargos encontrados. Selecione o seu cargo.`)
      else if (detected.cargos.length === 1) toast.success('Cargo reconhecido automaticamente!')
      else toast.success('Edital analisado. Informe o cargo manualmente.')
    } catch { toast.error('Erro ao reconhecer banca e cargos') }
    finally { setAnalyzingEdital(false) }
  }

  function setExtractedText(text: string) {
    const cleaned = text.replace(/\u0000/g, ' ').replace(/\s{3,}/g, ' ').replace(/([a-záéíóúâêôãõç])([A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1 $2').substring(0, 30000)
    setEditalText(cleaned)
    if (cleaned.length < 800) toast.warning('Pouco texto foi extraído. O PDF pode ser escaneado.')
    void analisarEdital(cleaned)
  }

  async function extractPdfText(file: File) {
    setExtractingPdf(true)
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
      const chunks: string[] = []
      for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 100); pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = content.items.map((item: any) => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
        if (pageText) chunks.push(`\n--- PÁGINA ${pageNumber} ---\n${pageText}`)
      }
      const text = chunks.join('\n')
      if (!text.trim()) throw new Error('PDF sem texto pesquisável')
      setExtractedText(text)
    } catch {
      toast.error('Não consegui extrair texto real do PDF. Tente PDF pesquisável ou TXT.')
      setEditalText('')
    } finally { setExtractingPdf(false) }
  }

  function processFile(file: File) {
    const lower = file.name.toLowerCase()
    setFileName(file.name)
    setAnalysis(null)
    setCargo('')
    setEditalText('')

    if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      void extractPdfText(file)
      return
    }

    if (lower.endsWith('.txt')) {
      const reader = new FileReader()
      reader.onload = e => setExtractedText(String(e.target?.result || ''))
      reader.readAsText(file, 'utf-8')
      return
    }

    if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
      setFileName('')
      toast.error('DOC/DOCX ainda não é lido direto. Salve o arquivo como PDF pesquisável ou TXT e envie novamente.')
      return
    }

    toast.error('Formato não suportado. Envie PDF pesquisável ou TXT.')
  }

  async function gerarPlano() {
    if (!editalText) { toast.error('Faça upload do edital primeiro'); return }
    if (analysis?.cargos?.length && !cargo) { toast.error('Selecione o cargo antes de gerar o plano'); return }
    setLoading(true)
    setPlan(null)
    setQueue(null)
    try {
      const job = await createAIQueueJob('edital_pro_plan', provider)
      setQueue(job)
      const cargoSelecionado = analysis?.cargos?.find(c => c.nome === cargo)
      const cargoContexto = cargoSelecionado ? `${cargoSelecionado.nome} | Vagas: ${cargoSelecionado.vagas || 'Não informado'} | Requisitos: ${cargoSelecionado.requisitos || 'Não informado'} | Remuneração: ${cargoSelecionado.remuneracao || 'Não informado'}` : cargo
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText, cargo: cargoContexto, examDate, hoursPerDay, level, provider, queueJobId: job.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar plano'); return }
      setPlan(data.plan)
      setPlanId(data.plan.id)
      setDaysCompleted({})
      setOpenWeeks({ 0: true })
      toast.success('Plano gerado com sucesso!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar plano')
    } finally {
      setLoading(false)
      setQueue(null)
    }
  }

  async function toggleDay(semIdx: number, diaIdx: number) {
    const key = `${semIdx}_${diaIdx}`
    const newVal = !daysCompleted[key]
    const next = { ...daysCompleted, [key]: newVal }
    setDaysCompleted(next)
    if (planId) await fetch(`/api/ai/plan/${planId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daysCompleted: next }) }).catch(() => {})
  }

  async function gerarMaisFlash() {
    if (!plan) return
    setLoadingMoreFlash(true)
    try {
      const res = await fetch('/api/ai/flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materias: plan.materias.map(m => m.nome), banca: plan.banca?.nome, provider }) })
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
  const selectedCargo = analysis?.cargos?.find(c => c.nome === cargo)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/30 rounded-full px-3 py-1 text-xs font-semibold text-brand-300 mb-3">🚀 Novo recurso</div>
        <h1 className="font-heading text-2xl font-bold">Edital Pro — Plano de estudos inteligente</h1>
        <p className="text-zinc-400 text-sm mt-1">Envie o arquivo do edital em PDF ou TXT para gerar cronograma e flashcards</p>
      </div>

      {!plan ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-4 ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`} onClick={() => document.getElementById('ep-file')?.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}>
              <Upload size={32} className="mx-auto mb-3 text-zinc-500" />
              <div className="font-heading font-semibold mb-1">{fileName || 'Enviar arquivo do edital'}</div>
              <div className="text-sm text-zinc-500">{editalText ? `${Math.round(editalText.length / 100) / 10}kb extraídos` : 'PDF pesquisável ou TXT — clique aqui ou arraste o arquivo'}</div>
              <button type="button" className="btn-secondary mt-4 px-4 py-2 text-xs">Selecionar arquivo</button>
              {extractingPdf && <div className="mt-2 text-xs text-brand-300 flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> Extraindo texto real do PDF...</div>}
              {analyzingEdital && !extractingPdf && <div className="mt-2 text-xs text-brand-300 flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> Reconhecendo banca e cargos...</div>}
              {!analyzingEdital && !extractingPdf && editalText && <div className="mt-2 text-xs text-green-400">✓ Edital carregado</div>}
            </div>
            <input type="file" id="ep-file" accept=".pdf,.txt,application/pdf,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.currentTarget.value = '' }} />

            {queue && loading && (
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 mb-4 text-sm text-brand-100">
                <div className="flex items-center gap-2 font-semibold"><Loader2 size={16} className="animate-spin" /> Fila de IA</div>
                <div className="text-xs mt-1">Status: {queue.status} • Posição: {queue.position}</div>
              </div>
            )}

            {analysis && (
              <div className="card p-4 mb-4 space-y-3">
                <div className="text-xs text-zinc-500">Detectado</div>
                <div className="text-sm text-zinc-300">Órgão: <b>{analysis.orgao}</b></div>
                <div className="text-sm text-zinc-300">Banca: <b>{analysis.banca}</b></div>
                {analysis.cargos.length > 0 && <select className="input" value={cargo} onChange={e => setCargo(e.target.value)}><option value="">Selecione o cargo</option>{analysis.cargos.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}</select>}
                {selectedCargo && <div className="rounded-xl bg-zinc-800/70 p-3 text-xs text-zinc-300">Vagas: {selectedCargo.vagas} • Requisitos: {selectedCargo.requisitos} • Remuneração: {selectedCargo.remuneracao}</div>}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <input className="input" placeholder="Cargo desejado" value={cargo} onChange={e => setCargo(e.target.value)} />
            <input className="input" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
            <select className="input" value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)}><option>1h</option><option>2h</option><option>3h</option><option>4h</option><option>5h+</option></select>
            <select className="input" value={level} onChange={e => setLevel(e.target.value)}><option>Iniciante</option><option>Intermediário</option><option>Avançado</option></select>
            <button onClick={gerarPlano} disabled={loading || extractingPdf || analyzingEdital} className="btn-primary w-full h-12 flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={18} /> : null} Gerar plano pelo edital</button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex justify-between items-center mb-4"><h2 className="font-heading text-xl font-bold">Plano gerado</h2><div className="text-sm text-zinc-400">{pct}% concluído</div></div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
          </div>
          {plan.semanas.map((semana, si) => (
            <div key={si} className="card overflow-hidden">
              <button className="w-full p-4 flex items-center justify-between" onClick={() => setOpenWeeks(p => ({ ...p, [si]: !p[si] }))}>
                <div><div className="font-heading font-bold">Semana {semana.semana}</div><div className="text-sm text-zinc-500">{semana.titulo}</div></div>{openWeeks[si] ? <ChevronUp /> : <ChevronDown />}
              </button>
              {openWeeks[si] && <div className="p-4 pt-0 space-y-2">{semana.dias.map((dia, di) => <label key={di} className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={!!daysCompleted[`${si}_${di}`]} onChange={() => toggleDay(si, di)} /><div className="text-sm"><b>{dia.dia}</b> — {dia.materia} / {dia.subtema}<div className="text-xs text-zinc-500">{dia.tipo} • {dia.horas}h • {dia.meta_questoes} questões</div></div></label>)}</div>}
            </div>
          ))}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-heading font-bold">Flashcards</h2><button onClick={gerarMaisFlash} disabled={loadingMoreFlash} className="btn-secondary text-xs">{loadingMoreFlash ? 'Gerando...' : 'Gerar mais'}</button></div>
            <select className="input mb-3" value={fcFilter} onChange={e => setFcFilter(e.target.value)}>{topicos.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <div className="grid md:grid-cols-2 gap-3">{filteredCards.map((f, i) => <button key={i} onClick={() => setFlippedCards(p => ({ ...p, [i]: !p[i] }))} className="rounded-2xl border border-white/10 p-4 text-left min-h-[120px]"><div className="text-xs text-brand-300 mb-2">{f.topico}</div><div className="text-sm text-zinc-100">{flippedCards[i] ? f.resposta : f.pergunta}</div><div className="text-[11px] text-zinc-500 mt-3">Clique para virar</div></button>)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
