'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, FileDown, CheckCircle2, Circle, Flame, BarChart3 } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type Topico = { id: string; codigo: string; nome: string; prioridade: string; dificuldade: string; questoesFeitas: number; acertos: number; revisado: boolean; subtopicos?: Array<{ id: string; codigo: string; nome: string }> }
type Materia = { id: string; nome: string; questoes: string; peso: string; prioridade: string; estrategia: string; topicosQuentes: string[]; topicos: Topico[] }
type VerticalizedData = { identificacao: any; materias: Materia[]; analiseBanca: any; planoEstudos: any[]; revisoes: any[]; modoRetaFinal: string[]; observacoes: string[] }
type Edital = { id: string; title: string; data: VerticalizedData; progress: Record<string, any>; createdAt?: string }

type ViewTab = 'geral' | 'conteudo' | 'banca' | 'plano'

export default function EditalPage() {
  const [editalText, setEditalText] = useState('')
  const [fileName, setFileName] = useState('')
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('3h')
  const [level, setLevel] = useState('Iniciante')
  const [provider, setProvider] = useState('claude')
  const [loading, setLoading] = useState(false)
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<AIQueueStatus | null>(null)
  const [editais, setEditais] = useState<Edital[]>([])
  const [active, setActive] = useState<Edital | null>(null)
  const [progress, setProgress] = useState<Record<string, any>>({})
  const [tab, setTab] = useState<ViewTab>('geral')

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
    loadEditais()
  }, [])

  useEffect(() => {
    if (!queue?.id || !loading) return
    const timer = setInterval(async () => {
      try { setQueue(await getAIQueueStatus(queue.id)) } catch {}
    }, 1200)
    return () => clearInterval(timer)
  }, [queue?.id, loading])

  async function loadEditais() {
    const res = await fetch('/api/edital-verticalizado')
    const data = await res.json()
    if (res.ok) setEditais(data.editais || [])
  }

  function setCurrent(edital: Edital) {
    setActive(edital)
    setProgress(edital.progress || {})
    setTab('geral')
  }

  const stats = useMemo(() => {
    const materias = active?.data?.materias || []
    const topicos = materias.flatMap(m => m.topicos || [])
    const done = topicos.filter(t => progress[t.id]?.done).length
    const reviewed = topicos.filter(t => progress[t.id]?.reviewed).length
    const high = topicos.filter(t => t.prioridade === 'Alta').length
    return { total: topicos.length, done, reviewed, high, pct: topicos.length ? Math.round(done / topicos.length * 100) : 0 }
  }, [active, progress])

  async function saveProgress(next: Record<string, any>) {
    if (!active) return
    setProgress(next)
    await fetch('/api/edital-verticalizado', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: active.id, progress: next }) }).catch(() => {})
  }

  function toggleTopic(topicId: string, field: 'done' | 'reviewed') {
    const current = progress[topicId] || {}
    const next = { ...progress, [topicId]: { ...current, [field]: !current[field], updatedAt: new Date().toISOString() } }
    void saveProgress(next)
  }

  function updateQuestions(topicId: string, value: number) {
    const current = progress[topicId] || {}
    const next = { ...progress, [topicId]: { ...current, questoesFeitas: value, updatedAt: new Date().toISOString() } }
    void saveProgress(next)
  }

  async function extractPdfText(file: File) {
    setExtractingPdf(true)
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
      const chunks: string[] = []
      for (let p = 1; p <= Math.min(pdf.numPages, 100); p++) {
        const page = await pdf.getPage(p)
        const content = await page.getTextContent()
        const text = content.items.map((i: any) => i.str || '').join(' ').replace(/\s+/g, ' ').trim()
        if (text) chunks.push(`\n--- PÁGINA ${p} ---\n${text}`)
      }
      const full = chunks.join('\n').substring(0, 30000)
      if (!full) throw new Error('sem texto')
      setEditalText(full)
      toast.success('Edital carregado com texto pesquisável')
    } catch {
      toast.error('Não consegui extrair o PDF. Tente PDF pesquisável ou TXT.')
    } finally { setExtractingPdf(false) }
  }

  function processFile(file: File) {
    setFileName(file.name)
    setEditalText('')
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) void extractPdfText(file)
    else {
      const reader = new FileReader()
      reader.onload = e => setEditalText(String(e.target?.result || '').substring(0, 30000))
      reader.readAsText(file, 'utf-8')
    }
  }

  async function gerarVerticalizado() {
    if (!editalText) { toast.error('Faça upload do edital primeiro'); return }
    setLoading(true)
    setQueue(null)
    try {
      const job = await createAIQueueJob('verticalized_edital', provider)
      setQueue(job)
      const res = await fetch('/api/edital-verticalizado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editalText, fileName, cargo, examDate, hoursPerDay, level, provider, queueJobId: job.id }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao verticalizar edital'); return }
      const edital = data.edital
      setActive(edital)
      setProgress({})
      setTab('geral')
      await loadEditais()
      toast.success('Edital verticalizado gerado!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar')
    } finally {
      setLoading(false)
      setQueue(null)
    }
  }

  async function exportPDF() {
    if (!active) return
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    let y = 14
    const add = (txt: string, size = 10, bold = false) => {
      doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(String(txt || ''), 180)
      lines.forEach((line: string) => { if (y > 280) { doc.addPage(); y = 14 } doc.text(line, 14, y); y += size * 0.45 + 2 })
    }
    add('GabaritoIA - Edital Verticalizado', 16, true)
    add(active.title, 12, true)
    add(`Banca: ${active.data.identificacao?.banca || 'Não informado'}`)
    add(`Órgão: ${active.data.identificacao?.orgao || 'Não informado'}`)
    add(`Cargo: ${active.data.identificacao?.cargo || 'Não informado'}`)
    add(`Progresso: ${stats.pct}% (${stats.done}/${stats.total})`)
    y += 3
    active.data.materias.forEach(m => {
      add(m.nome, 13, true)
      add(`Prioridade: ${m.prioridade} | Peso: ${m.peso} | Questões: ${m.questoes}`)
      add(`Estratégia: ${m.estrategia}`)
      ;(m.topicos || []).forEach(t => add(`${progress[t.id]?.done ? '[x]' : '[ ]'} ${t.codigo} ${t.nome} | ${t.prioridade} | ${t.dificuldade}`))
      y += 2
    })
    doc.save(`${active.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
  }

  const identificacao = active?.data?.identificacao || {}
  const analiseBanca = active?.data?.analiseBanca || {}
  const cargosDetectados = Array.isArray(identificacao.cargos) ? identificacao.cargos : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">📄 Edital Verticalizado</h1>
        <p className="text-zinc-400 text-sm mt-1">Transforme um edital gigante em um sistema de execução com progresso, revisão e prioridades.</p>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <div className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`} onClick={() => document.getElementById('edital-file')?.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}>
            <Upload size={30} className="mx-auto mb-3 text-zinc-500" />
            <div className="font-heading font-semibold mb-1">{fileName || 'Subir edital PDF'}</div>
            <div className="text-sm text-zinc-500">{editalText ? `${Math.round(editalText.length / 100) / 10}kb extraídos` : 'PDF pesquisável ou TXT'}</div>
            {extractingPdf && <div className="mt-2 text-xs text-brand-300 flex justify-center gap-1"><Loader2 size={12} className="animate-spin" /> Extraindo PDF...</div>}
          </div>
          <input id="edital-file" type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />

          <div className="card p-4 space-y-3">
            <div><label className="label">Cargo foco</label><input className="input" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Analista Administrativo" /></div>
            <div><label className="label">Data da prova</label><input type="date" className="input" value={examDate} onChange={e => setExamDate(e.target.value)} style={{ colorScheme: 'dark' }} /></div>
            <div><label className="label">Horas por dia</label><div className="flex flex-wrap gap-2">{['1h','2h','3h','4h','5h','6h+'].map(h => <button key={h} onClick={() => setHoursPerDay(h)} className={`chip ${hoursPerDay === h ? 'chip-active' : ''}`}>{h}</button>)}</div></div>
            <div><label className="label">Nível</label><div className="flex gap-2">{['Iniciante','Intermediário','Avançado'].map(n => <button key={n} onClick={() => setLevel(n)} className={`chip ${level === n ? 'chip-active' : ''}`}>{n}</button>)}</div></div>
          </div>

          {queue && loading && <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100"><div className="flex items-center gap-2 font-semibold"><Loader2 size={16} className="animate-spin" /> Fila de IA</div><div className="text-xs mt-1 text-brand-200/80">{queue.status === 'queued' ? `Você está em ${queue.position}º na fila. Rodando: ${queue.running}/${queue.maxConcurrent}.` : 'Sua vez chegou. Verticalizando o edital...'}</div></div>}

          <button disabled={loading || extractingPdf || !editalText} onClick={gerarVerticalizado} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 disabled:opacity-40">
            {loading ? <><Loader2 size={16} className="animate-spin" />{queue?.status === 'queued' ? `Na fila: ${queue.position}º` : 'Gerando...'}</> : '🚀 Gerar edital executável'}
          </button>

          {editais.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Editais salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{editais.map(e => <button key={e.id} onClick={() => setCurrent(e)} className={`w-full text-left rounded-xl border p-3 text-xs ${active?.id === e.id ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-black/20'}`}><div className="font-semibold text-zinc-100">{e.title}</div><div className="text-zinc-500 mt-1">{e.data?.identificacao?.banca || e.data?.identificacao?.orgao || 'Edital'}</div></button>)}</div></div>}
        </div>

        <div>
          {!active ? <div className="card p-12 text-center"><div className="text-4xl mb-4">📋</div><div className="font-heading font-bold">Sistema operacional do concurseiro</div><div className="text-sm text-zinc-500 mt-2">Suba o edital para gerar tópicos, prioridades, revisões, plano de estudos e progresso.</div></div> : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-4"><BarChart3 size={16} className="text-brand-400 mb-2" /><div className="text-2xl font-bold">{stats.pct}%</div><div className="text-xs text-zinc-500">Concluído</div></div>
                <div className="card p-4"><CheckCircle2 size={16} className="text-green-400 mb-2" /><div className="text-2xl font-bold">{stats.done}/{stats.total}</div><div className="text-xs text-zinc-500">Tópicos</div></div>
                <div className="card p-4"><Flame size={16} className="text-amber-400 mb-2" /><div className="text-2xl font-bold">{stats.high}</div><div className="text-xs text-zinc-500">Prioridade alta</div></div>
                <div className="card p-4"><CheckCircle2 size={16} className="text-blue-400 mb-2" /><div className="text-2xl font-bold">{stats.reviewed}</div><div className="text-xs text-zinc-500">Revisados</div></div>
              </div>

              <div className="card p-5">
                <div className="flex justify-between gap-3 mb-3"><div><h2 className="font-heading font-bold">{active.title}</h2><div className="text-xs text-zinc-500 mt-1">{identificacao.banca} · {identificacao.cargo}</div></div><button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF</button></div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-500 to-purple-500" style={{ width: `${stats.pct}%` }} /></div>
              </div>

              <div className="flex gap-2 overflow-x-auto border-b border-white/[0.07]">
                {[{ id: 'geral', label: 'Visão geral' }, { id: 'conteudo', label: 'Conteúdo' }, { id: 'banca', label: 'Banca' }, { id: 'plano', label: 'Plano' }].map(t => <button key={t.id} onClick={() => setTab(t.id as ViewTab)} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.id ? 'border-brand-500 text-brand-300' : 'border-transparent text-zinc-500'}`}>{t.label}</button>)}
              </div>

              {tab === 'geral' && <div className="space-y-4">
                <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Identificação do edital</div><div className="grid md:grid-cols-2 gap-3 text-sm"><div><span className="text-zinc-500">Banca:</span> {identificacao.banca || 'Não informado'}</div><div><span className="text-zinc-500">Órgão:</span> {identificacao.orgao || 'Não informado'}</div><div><span className="text-zinc-500">Cargo foco:</span> {identificacao.cargo || 'Não informado'}</div><div><span className="text-zinc-500">Vagas:</span> {identificacao.vagas || 'Não informado'}</div><div><span className="text-zinc-500">Remuneração:</span> {identificacao.remuneracao || 'Não informado'}</div><div><span className="text-zinc-500">Requisitos:</span> {identificacao.requisitos || 'Não informado'}</div></div></div>
                <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Cargos detectados</div>{cargosDetectados.length ? <div className="grid md:grid-cols-2 gap-2">{cargosDetectados.map((c: any, i: number) => <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div className="font-semibold text-zinc-100">{c.nome}</div><div className="text-zinc-500 mt-1">Vagas: {c.vagas || 'Não informado'}</div><div className="text-zinc-500">Remuneração: {c.remuneracao || 'Não informado'}</div><div className="text-zinc-500">Requisitos: {c.requisitos || 'Não informado'}</div></div>)}</div> : <div className="text-sm text-zinc-500">Nenhum cargo individual foi detectado. Use o campo Cargo foco antes de gerar novamente.</div>}</div>
              </div>}

              {tab === 'banca' && <div className="space-y-4">
                <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Aba Banca</div><div className="grid md:grid-cols-2 gap-3 text-sm"><div><span className="text-zinc-500">Nome:</span> {analiseBanca.nome || identificacao.banca || 'Não informado'}</div><div><span className="text-zinc-500">Perfil:</span> {analiseBanca.perfilQuestoes || 'Não informado'}</div><div><span className="text-zinc-500">Lei seca:</span> {analiseBanca.leiSeca || 'Não informado'}</div><div><span className="text-zinc-500">Jurisprudência:</span> {analiseBanca.jurisprudencia || 'Não informado'}</div><div><span className="text-zinc-500">Doutrina:</span> {analiseBanca.doutrina || 'Não informado'}</div></div><div className="mt-4 text-sm text-zinc-300"><strong>Estilo:</strong> {analiseBanca.estilo || 'Não informado'}</div><div className="mt-2 text-sm text-zinc-300"><strong>Foco:</strong> {analiseBanca.foco || 'Não informado'}</div></div>
                <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Pegadinhas e assuntos cobrados</div>{Array.isArray(analiseBanca.pegadinhas) && <div className="flex flex-wrap gap-2 mb-3">{analiseBanca.pegadinhas.map((p: string, i: number) => <span key={i} className="chip text-xs">⚠ {p}</span>)}</div>}{Array.isArray(analiseBanca.assuntosMaisCobrados) && <div className="flex flex-wrap gap-2">{analiseBanca.assuntosMaisCobrados.map((p: string, i: number) => <span key={i} className="chip text-xs">🔥 {p}</span>)}</div>}</div>
              </div>}

              {tab === 'conteudo' && <div className="space-y-4">{active.data.materias.map(m => <div key={m.id} className="card p-5"><div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3"><div><div className="font-heading font-bold">{m.nome}</div><div className="text-xs text-zinc-500">Peso: {m.peso} · Questões: {m.questoes} · Prioridade: {m.prioridade}</div></div><div className="text-xs text-brand-300">{m.topicos?.filter(t => progress[t.id]?.done).length || 0}/{m.topicos?.length || 0}</div></div><div className="text-xs text-zinc-400 mb-3">{m.estrategia}</div>{m.topicosQuentes?.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{m.topicosQuentes.map((t, i) => <span key={i} className="chip text-xs">🔥 {t}</span>)}</div>}<div className="space-y-2">{m.topicos.map(t => <div key={t.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start gap-3"><button onClick={() => toggleTopic(t.id, 'done')} className="mt-0.5">{progress[t.id]?.done ? <CheckCircle2 size={18} className="text-green-400" /> : <Circle size={18} className="text-zinc-500" />}</button><div className="flex-1"><div className="text-sm font-medium">{t.codigo} {t.nome}</div><div className="text-[11px] text-zinc-500 mt-1">Prioridade: {t.prioridade} · Dificuldade: {t.dificuldade}</div>{t.subtopicos?.length ? <div className="mt-2 text-[11px] text-zinc-500">{t.subtopicos.map(s => s.nome).join(' · ')}</div> : null}</div><div className="flex items-center gap-2"><input type="number" min={0} value={progress[t.id]?.questoesFeitas || 0} onChange={e => updateQuestions(t.id, Number(e.target.value))} className="w-16 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs" /><button onClick={() => toggleTopic(t.id, 'reviewed')} className={`text-[10px] rounded-lg px-2 py-1 border ${progress[t.id]?.reviewed ? 'border-blue-500 text-blue-300 bg-blue-500/10' : 'border-white/10 text-zinc-500'}`}>Revisado</button></div></div></div>)}</div></div>)}</div>}

              {tab === 'plano' && <div className="space-y-4">{active.data.planoEstudos?.length > 0 ? <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Cronograma automático</div><div className="space-y-2">{active.data.planoEstudos.map((s: any, i: number) => <div key={i} className="bg-black/20 rounded-xl p-3 text-xs"><div className="font-semibold text-zinc-200">Semana {s.semana}: {s.foco}</div><div className="text-zinc-500 mt-1">{(s.tarefas || []).join(' · ')}</div><div className="text-brand-300 mt-1">Meta: {s.metaQuestoes || 'Não informado'}</div></div>)}</div></div> : <div className="card p-8 text-center text-zinc-500">Nenhum plano foi gerado para este edital.</div>}{active.data.revisoes?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Revisões automáticas</div>{active.data.revisoes.map((r: any, i: number) => <div key={i} className="text-sm text-zinc-300 mb-2">{r.tipo}: {r.descricao}</div>)}</div>}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
