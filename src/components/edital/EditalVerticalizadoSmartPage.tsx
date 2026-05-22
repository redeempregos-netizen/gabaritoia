'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileDown, Loader2, Upload } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type Cargo = { nome: string; vagas?: string; requisitos?: string; remuneracao?: string }
type Analysis = { banca: string; orgao: string; cargos: Cargo[] }
type Edital = { id: string; title: string; data: any; progress: Record<string, any> }

function normalizeCargos(raw: any): Cargo[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).map((c: any) => ({
    nome: String(c?.nome || c?.cargo || c?.funcao || c?.função || '').trim(),
    vagas: String(c?.vagas || 'Não informado'),
    requisitos: String(c?.requisitos || c?.escolaridade || 'Não informado'),
    remuneracao: String(c?.remuneracao || c?.remuneração || c?.salario || c?.salário || 'Não informado'),
  })).filter(c => {
    const k = c.nome.toLowerCase()
    if (!c.nome || seen.has(k)) return false
    if (['diversos cargos', 'nível superior', 'nivel superior', 'nível médio', 'nivel medio', 'quadro de vagas'].some(x => k.includes(x))) return false
    seen.add(k)
    return true
  })
}

export function EditalVerticalizadoSmartPage() {
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [cargo, setCargo] = useState('')
  const [manualCargo, setManualCargo] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('3h')
  const [level, setLevel] = useState('Iniciante')
  const [provider, setProvider] = useState('claude')
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [queue, setQueue] = useState<AIQueueStatus | null>(null)
  const [editais, setEditais] = useState<Edital[]>([])
  const [active, setActive] = useState<Edital | null>(null)
  const [tab, setTab] = useState<'geral'|'conteudo'|'banca'|'plano'>('geral')

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      const keys = (d.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      const best = d.config?.featureProviders?.editalVerticalizado
      if (best && keys.includes(best)) setProvider(best)
      else if (keys.length) setProvider(d.config?.defaultProvider && keys.includes(d.config.defaultProvider) ? d.config.defaultProvider : keys[0])
    }).catch(() => {})
    loadSaved()
  }, [])

  useEffect(() => {
    if (!queue?.id || !busy) return
    const timer = setInterval(async () => {
      try { setQueue(await getAIQueueStatus(queue.id)) } catch {}
    }, 1200)
    return () => clearInterval(timer)
  }, [queue?.id, busy])

  async function loadSaved() {
    const data = await fetch('/api/edital-verticalizado').then(r => r.json()).catch(() => null)
    if (data?.editais) setEditais(data.editais)
  }

  async function analyzeEdital(editalText: string) {
    setAnalyzing(true)
    setAnalysis(null)
    setCargo('')
    setManualCargo('')
    try {
      const res = await fetch('/api/ai/analyze-edital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText, provider }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não reconheci os dados do edital'); return }
      const raw = data.analysis || {}
      const found = { banca: raw.banca || 'Não informado', orgao: raw.orgao || raw.orgão || 'Não informado', cargos: normalizeCargos(raw.cargos) }
      setAnalysis(found)
      if (found.cargos.length === 1) { setCargo(found.cargos[0].nome); toast.success('Cargo reconhecido automaticamente.') }
      else if (found.cargos.length > 1) toast.success(`${found.cargos.length} cargos encontrados. Selecione o cargo.`)
      else toast.warning('Não encontrei cargos individuais. Use o campo manual se necessário.')
    } catch {
      toast.error('Erro ao analisar edital')
    } finally {
      setAnalyzing(false)
    }
  }

  function setCleanText(value: string) {
    const clean = value.replace(/\u0000/g, ' ').replace(/\s{3,}/g, ' ').substring(0, 35000)
    setText(clean)
    void analyzeEdital(clean)
  }

  async function readFile(file: File) {
    setFileName(file.name)
    setText('')
    setAnalysis(null)
    setCargo('')
    setManualCargo('')
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setBusy(true)
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        const parts: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const pageText = content.items.map((x: any) => x.str || '').join(' ')
          if (pageText) parts.push(`--- PÁGINA ${i} --- ${pageText}`)
        }
        const full = parts.join('\n')
        if (!full.trim()) throw new Error('PDF sem texto')
        setCleanText(full)
        toast.success('PDF extraído. Analisando edital...')
      } catch {
        toast.error('PDF sem texto pesquisável. Envie PDF pesquisável ou TXT.')
      } finally {
        setBusy(false)
      }
    } else {
      const reader = new FileReader()
      reader.onload = e => setCleanText(String(e.target?.result || ''))
      reader.readAsText(file, 'utf-8')
    }
  }

  const selectedCargo = cargo || manualCargo

  async function gerar() {
    if (!text) return toast.error('Suba o edital primeiro')
    if (analysis?.cargos?.length && !selectedCargo) return toast.error('Selecione o cargo encontrado no edital')
    setBusy(true)
    setQueue(null)
    try {
      const job = await createAIQueueJob('verticalized_edital', provider)
      setQueue(job)
      const selected = analysis?.cargos?.find(c => c.nome === selectedCargo)
      const cargoContext = selected ? `${selected.nome} | Vagas: ${selected.vagas} | Requisitos: ${selected.requisitos} | Remuneração: ${selected.remuneracao}` : selectedCargo
      const res = await fetch('/api/edital-verticalizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText: text, fileName, cargo: cargoContext, hoursPerDay, level, provider, queueJobId: job.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar'); return }
      setActive(data.edital)
      setTab('geral')
      await loadSaved()
      toast.success('Edital verticalizado gerado!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar')
    } finally {
      setBusy(false)
      setQueue(null)
    }
  }

  async function exportPDF() {
    if (!active) return
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const data = active.data || {}
    const ident = data.identificacao || {}
    const materias = Array.isArray(data.materias) ? data.materias : []
    let y = 16
    const add = (txt: string, size = 10, bold = false) => {
      doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.splitTextToSize(String(txt || ''), 180).forEach((line: string) => { if (y > 280) { doc.addPage(); y = 16 } doc.text(line, 14, y); y += size * 0.45 + 2 })
    }
    add('GabaritoIA — Edital Verticalizado', 16, true)
    add(active.title, 13, true)
    add(`Banca: ${ident.banca || 'Não informado'}`)
    add(`Órgão: ${ident.orgao || 'Não informado'}`)
    add(`Cargo: ${ident.cargo || 'Não informado'}`)
    add(`Data da prova: ${ident.dataProva || ident.provaObjetiva || 'Extraída automaticamente quando informada no edital'}`)
    y += 4
    materias.forEach((m: any, i: number) => {
      add(`${i + 1}. ${m.nome}`, 12, true)
      if (m.estrategia) add(`Estratégia: ${m.estrategia}`, 9)
      ;(m.topicos || []).forEach((t: any) => add(`□ ${t.codigo || ''} ${t.nome || ''}`, 8))
    })
    doc.save(`${(active.title || 'edital-verticalizado').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-premium.pdf`)
  }

  const data = active?.data || {}
  const ident = data.identificacao || {}
  const banca = data.analiseBanca || {}
  const mats = Array.isArray(data.materias) ? data.materias : []
  const resultCargos = Array.isArray(ident.cargos) ? ident.cargos : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-heading text-2xl font-bold mb-1">📄 Edital Verticalizado</h1>
      <p className="text-zinc-400 text-sm mb-6">Suba o edital. A IA reconhece banca, órgão, cargos e datas automaticamente.</p>
      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <div onClick={() => document.getElementById('edital-file')?.click()} className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center cursor-pointer hover:border-white/20">
            <Upload className="mx-auto mb-3 text-zinc-500" />
            <div className="font-semibold">{fileName || 'Subir edital PDF'}</div>
            <div className="text-sm text-zinc-500">{text ? `${Math.round(text.length / 100) / 10}kb extraídos` : 'PDF pesquisável ou TXT'}</div>
            {(busy || analyzing) && !queue && <div className="text-xs text-brand-300 mt-2"><Loader2 size={12} className="inline animate-spin" /> Processando...</div>}
          </div>
          <input id="edital-file" type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} />

          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 text-xs text-zinc-400 leading-relaxed">
            <div className="font-heading font-bold text-brand-300 mb-2">Fluxo automático</div>
            <p>• A data da prova será extraída automaticamente do edital.</p>
            <p>• O cargo só precisa ser escolhido quando houver vários cargos detectados.</p>
            <p>• Preenchimento manual fica apenas como fallback.</p>
          </div>

          {analysis && <div className="card p-4 space-y-3 border border-brand-500/20 bg-brand-500/5">
            <div className="text-xs font-bold text-brand-300">Reconhecido no edital</div>
            <div className="text-xs text-zinc-400">Banca: <span className="text-zinc-200">{analysis.banca}</span></div>
            <div className="text-xs text-zinc-400">Órgão: <span className="text-zinc-200">{analysis.orgao}</span></div>
            {analysis.cargos.length > 1 && <>
              <label className="label">Selecione o cargo encontrado</label>
              <select className="input" value={cargo} onChange={e => setCargo(e.target.value)} style={{ colorScheme: 'dark' }}>
                <option value="">Escolha o cargo</option>
                {analysis.cargos.map((c, i) => <option key={i} value={c.nome}>{c.nome}</option>)}
              </select>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {analysis.cargos.map((c, i) => <button key={i} onClick={() => setCargo(c.nome)} className={`w-full text-left rounded-xl border p-3 text-xs ${cargo === c.nome ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-black/20'}`}>
                  <b className="text-zinc-100">{c.nome}</b>
                  <div className="text-zinc-500">Vagas: {c.vagas}</div>
                  <div className="text-zinc-500">Remuneração: {c.remuneracao}</div>
                </button>)}
              </div>
            </>}
            {analysis.cargos.length === 1 && <div className="text-xs text-green-300">Cargo selecionado automaticamente: <b>{cargo}</b></div>}
            <details className="rounded-xl border border-white/10 bg-black/20 p-3">
              <summary className="text-xs text-zinc-400 cursor-pointer">Não encontrou o cargo? Digitar manualmente</summary>
              <input className="input mt-3" value={manualCargo} onChange={e => setManualCargo(e.target.value)} placeholder="Ex: Analista Administrativo" />
            </details>
          </div>}

          <div className="card p-4 space-y-3">
            <div><label className="label">Horas por dia</label><div className="flex flex-wrap gap-2">{['1h','2h','3h','4h','5h','6h+'].map(h => <button key={h} onClick={() => setHoursPerDay(h)} className={`chip ${hoursPerDay === h ? 'chip-active' : ''}`}>{h}</button>)}</div></div>
            <div><label className="label">Nível</label><div className="flex gap-2">{['Iniciante','Intermediário','Avançado'].map(n => <button key={n} onClick={() => setLevel(n)} className={`chip ${level === n ? 'chip-active' : ''}`}>{n}</button>)}</div></div>
          </div>

          {queue && <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100"><Loader2 size={16} className="inline animate-spin" /> {queue.processing ? 'Gerando edital verticalizado...' : `Você está em ${queue.position}º na fila`}</div>}
          <button disabled={busy || analyzing || !text || (!!analysis?.cargos?.length && !selectedCargo)} onClick={gerar} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 disabled:opacity-40">{busy ? 'Processando...' : '🚀 Gerar edital executável'}</button>

          {editais.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Editais salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{editais.map(e => <button key={e.id} onClick={() => { setActive(e); setTab('geral') }} className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div className="font-semibold text-zinc-100">{e.title}</div><div className="text-zinc-500">{e.data?.identificacao?.banca || 'Edital'}</div></button>)}</div></div>}
        </div>

        <div>{!active ? <div className="card p-12 text-center text-zinc-500">Após o upload, o sistema reconhece cargos e datas automaticamente.</div> : <div className="space-y-5">
          <div className="card p-5 flex justify-between gap-3"><div><h2 className="font-heading font-bold">{active.title}</h2><div className="text-xs text-zinc-500 mt-1">{ident.banca} · {ident.cargo}</div></div><button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF</button></div>
          <div className="flex gap-2 overflow-x-auto border-b border-white/[0.07]">{[{ id: 'geral', label: 'Visão geral' }, { id: 'conteudo', label: 'Conteúdo' }, { id: 'banca', label: 'Banca' }, { id: 'plano', label: 'Plano' }].map(t => <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-4 py-2 text-sm border-b-2 ${tab === t.id ? 'border-brand-500 text-brand-300' : 'border-transparent text-zinc-500'}`}>{t.label}</button>)}</div>
          {tab === 'geral' && <div className="space-y-4"><div className="card p-5 grid md:grid-cols-2 gap-3 text-sm"><div>Banca: {ident.banca || 'Não informado'}</div><div>Órgão: {ident.orgao || 'Não informado'}</div><div>Cargo: {ident.cargo || 'Não informado'}</div><div>Data da prova: {ident.dataProva || ident.provaObjetiva || 'Não informado'}</div><div>Vagas: {ident.vagas || 'Não informado'}</div><div>Remuneração: {ident.remuneracao || 'Não informado'}</div></div><div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Cargos detectados</div>{resultCargos.length ? resultCargos.map((c: any, i: number) => <div key={i} className="text-sm text-zinc-300 mb-1">• {c.nome}</div>) : <div className="text-sm text-zinc-500">Nenhum cargo individual salvo.</div>}</div></div>}
          {tab === 'banca' && <div className="card p-5 text-sm space-y-2"><div><b>Nome:</b> {banca.nome || ident.banca || 'Não informado'}</div><div><b>Estilo:</b> {banca.estilo || 'Não informado'}</div><div><b>Foco:</b> {banca.foco || 'Não informado'}</div></div>}
          {tab === 'conteudo' && <div className="space-y-4">{mats.map((m: any) => <div key={m.id || m.nome} className="card p-5"><div className="font-bold">{m.nome}</div><div className="text-xs text-zinc-500 mb-3">Peso: {m.peso} · Prioridade: {m.prioridade}</div>{(m.topicos || []).map((t: any) => <div key={t.id || t.nome} className="rounded-xl border border-white/10 p-3 mb-2 text-sm">{t.codigo} {t.nome}</div>)}</div>)}</div>}
          {tab === 'plano' && <div className="card p-5 text-sm text-zinc-300">{(data.planoEstudos || []).map((s: any, i: number) => <div key={i} className="mb-2"><b>Semana {s.semana}:</b> {s.foco}</div>)}</div>}
        </div>}</div>
      </div>
    </div>
  )
}
