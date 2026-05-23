'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Circle, Clock, FileDown, Loader2, Target, Trash2, Upload } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type Cargo = { nome: string; vagas?: string; requisitos?: string; remuneracao?: string }
type Analysis = { banca: string; orgao: string; cargos: Cargo[] }
type Edital = { id: string; title: string; data: any; progress: Record<string, any> }
type Tab = 'verticalizado' | 'geral' | 'banca' | 'plano'
type Row = {
  id: string
  disciplina: string
  assunto: string
  subtopico: string
  codigo: string
  questoes: string
  prioridade: string
  revisao: string
  dificuldade: string
}

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

function flattenRows(data: any): Row[] {
  const rows: Row[] = []
  const materias = Array.isArray(data?.materias) ? data.materias : []
  materias.forEach((m: any, mi: number) => {
    const disciplina = String(m.nome || m.materia || `Matéria ${mi + 1}`)
    const topicos = Array.isArray(m.topicos) ? m.topicos : []
    topicos.forEach((t: any, ti: number) => {
      const assunto = String(t.nome || t.topico || `Assunto ${ti + 1}`)
      const subtopicos = Array.isArray(t.subtopicos) ? t.subtopicos : []
      if (subtopicos.length) {
        subtopicos.forEach((s: any, si: number) => {
          const subtopico = String(s.nome || s.topico || s || `Subtópico ${si + 1}`)
          rows.push({
            id: String(s.id || `${m.id || disciplina}-${t.id || assunto}-${si}`),
            disciplina,
            assunto,
            subtopico,
            codigo: String(s.codigo || `${mi + 1}.${ti + 1}.${si + 1}`),
            questoes: String(s.questoes || t.questoes || m.questoes || '—'),
            prioridade: String(s.prioridade || t.prioridade || m.prioridade || 'Média'),
            revisao: String(s.revisaoSugeridaDias || t.revisaoSugeridaDias || 7) + 'd',
            dificuldade: String(s.dificuldade || t.dificuldade || 'Média'),
          })
        })
      } else {
        rows.push({
          id: String(t.id || `${m.id || disciplina}-${ti}`),
          disciplina,
          assunto,
          subtopico: '—',
          codigo: String(t.codigo || `${mi + 1}.${ti + 1}`),
          questoes: String(t.questoes || m.questoes || '—'),
          prioridade: String(t.prioridade || m.prioridade || 'Média'),
          revisao: String(t.revisaoSugeridaDias || 7) + 'd',
          dificuldade: String(t.dificuldade || 'Média'),
        })
      }
    })
  })
  return rows
}

function statusLabel(status?: string) {
  if (status === 'feito') return { label: 'Estudado', icon: CheckCircle2, cls: 'text-green-400 bg-green-500/10 border-green-500/20', dot: 'bg-green-400' }
  if (status === 'revisar') return { label: 'Revisar', icon: Clock, cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-300' }
  return { label: 'Não estudado', icon: Circle, cls: 'text-zinc-400 bg-zinc-800 border-white/10', dot: 'bg-zinc-500' }
}

function priorityClass(priority: string) {
  if (priority === 'Alta') return 'bg-amber-500/10 text-amber-300 border-amber-500/20'
  if (priority === 'Baixa') return 'bg-zinc-800 text-zinc-400 border-white/10'
  return 'bg-brand-500/10 text-brand-300 border-brand-500/20'
}

function safe(value: any, fallback = 'Não informado') {
  const v = String(value || '').trim()
  return v || fallback
}

export function EditalVerticalizadoSmartPage() {
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [cargo, setCargo] = useState('')
  const [manualCargo, setManualCargo] = useState('')
  const [provider, setProvider] = useState('claude')
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [queue, setQueue] = useState<AIQueueStatus | null>(null)
  const [editais, setEditais] = useState<Edital[]>([])
  const [active, setActive] = useState<Edital | null>(null)
  const [tab, setTab] = useState<Tab>('verticalizado')
  const [savingProgress, setSavingProgress] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

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

  async function deleteEdital(id: string) {
    if (!confirm('Tem certeza que deseja excluir este edital verticalizado?')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/edital-verticalizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_item', id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir edital'); return }
      setEditais(prev => prev.filter(e => e.id !== id))
      if (active?.id === id) setActive(null)
      toast.success('Edital excluído com sucesso')
    } catch {
      toast.error('Erro ao excluir edital')
    } finally {
      setDeleting(null)
    }
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
        body: JSON.stringify({ editalText: text, fileName, cargo: cargoContext, provider, queueJobId: job.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar'); return }
      setActive(data.edital)
      setTab('verticalizado')
      await loadSaved()
      toast.success('Checklist verticalizado gerado!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar')
    } finally {
      setBusy(false)
      setQueue(null)
    }
  }

  const data = active?.data || {}
  const ident = data.identificacao || {}
  const banca = data.analiseBanca || {}
  const materias = Array.isArray(data.materias) ? data.materias : []
  const rows = useMemo(() => flattenRows(data), [data])
  const resultCargos = Array.isArray(ident.cargos) ? ident.cargos : []
  const progress = active?.progress || {}
  const done = rows.filter(r => progress[r.id]?.status === 'feito').length
  const revisar = rows.filter(r => progress[r.id]?.status === 'revisar').length
  const pending = Math.max(0, rows.length - done - revisar)
  const highPriority = rows.filter(r => r.prioridade === 'Alta').length
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0
  const groupedRows = useMemo(() => rows.reduce<Record<string, Row[]>>((acc, row) => {
    acc[row.disciplina] = acc[row.disciplina] || []
    acc[row.disciplina].push(row)
    return acc
  }, {}), [rows])

  async function saveProgress(nextProgress: Record<string, any>) {
    if (!active) return
    setSavingProgress(true)
    setActive({ ...active, progress: nextProgress })
    try {
      await fetch('/api/edital-verticalizado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: active.id, progress: nextProgress }),
      })
    } catch {
      toast.error('Não consegui salvar o progresso')
    } finally {
      setSavingProgress(false)
    }
  }

  function cycleStatus(rowId: string) {
    const current = progress[rowId]?.status || 'nao_estudado'
    const next = current === 'nao_estudado' ? 'feito' : current === 'feito' ? 'revisar' : 'nao_estudado'
    void saveProgress({ ...progress, [rowId]: { ...(progress[rowId] || {}), status: next, updatedAt: new Date().toISOString() } })
  }

  async function exportPDF() {
    if (!active) return
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210
    const H = 297
    let y = 0

    const ensure = (need = 12) => {
      if (y + need > H - 18) {
        doc.addPage()
        y = 18
        footer()
      }
    }
    const footer = () => {
      doc.setDrawColor(230, 230, 235)
      doc.line(14, H - 14, W - 14, H - 14)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 130)
      doc.text('GabaritoIA • Edital Verticalizado Premium', 14, H - 9)
      doc.text(String(doc.getNumberOfPages()).padStart(2, '0'), W - 18, H - 9)
    }
    const pill = (x: number, yy: number, label: string, fill: [number, number, number], color: [number, number, number] = [255, 255, 255]) => {
      doc.setFillColor(...fill)
      doc.roundedRect(x, yy, Math.max(28, label.length * 2.6 + 8), 8, 4, 4, 'F')
      doc.setTextColor(...color)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(label, x + 4, yy + 5.4)
    }
    const text = (value: string, x = 14, size = 10, bold = false, max = 180, color: [number, number, number] = [39, 39, 42]) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(...color)
      const lines = doc.splitTextToSize(String(value || ''), max)
      lines.forEach((line: string) => { ensure(size * 0.5 + 2); doc.text(line, x, y); y += size * 0.45 + 2 })
    }
    const section = (title: string) => {
      ensure(16)
      y += 3
      doc.setFillColor(245, 243, 255)
      doc.roundedRect(14, y, W - 28, 10, 3, 3, 'F')
      doc.setTextColor(91, 33, 182)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(title.toUpperCase(), 18, y + 6.8)
      y += 16
    }

    // Capa
    doc.setFillColor(17, 24, 39)
    doc.rect(0, 0, W, H, 'F')
    doc.setFillColor(124, 58, 237)
    doc.circle(178, 34, 38, 'F')
    doc.setFillColor(34, 197, 94)
    doc.circle(32, 246, 44, 'F')
    doc.setTextColor(167, 139, 250)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('GABARITOIA', 18, 28)
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(27)
    doc.text('Edital Verticalizado', 18, 62)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'normal')
    const titleLines = doc.splitTextToSize(active.title, 160)
    doc.text(titleLines, 18, 77)
    pill(18, 104, `${percent}% concluído`, [124, 58, 237])
    pill(60, 104, `${rows.length} itens`, [39, 39, 42])
    pill(98, 104, `${highPriority} prioridade alta`, [245, 158, 11])
    doc.setFontSize(10)
    doc.setTextColor(212, 212, 216)
    doc.text(`Banca: ${safe(ident.banca)}  •  Órgão: ${safe(ident.orgao)}`, 18, 128)
    doc.text(`Cargo: ${safe(ident.cargo)}  •  Prova: ${safe(ident.dataProva || ident.provaObjetiva || ident.prova)}`, 18, 136)
    doc.setTextColor(167, 139, 250)
    doc.setFont('helvetica', 'bold')
    doc.text('Como usar este material', 18, 164)
    doc.setTextColor(228, 228, 231)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize('Marque cada linha como estudada, revise os itens sinalizados e priorize os tópicos de maior incidência/peso. Este PDF transforma o edital em uma ferramenta prática de execução.', 160), 18, 174)
    footer()

    doc.addPage()
    y = 18
    footer()
    text('Resumo executivo', 14, 18, true, 180, [24, 24, 27])
    y += 3
    const stats = [
      ['Disciplinas', String(materias.length)],
      ['Itens verticalizados', String(rows.length)],
      ['Estudados', String(done)],
      ['Para revisar', String(revisar)],
      ['Pendentes', String(pending)],
      ['Prioridade alta', String(highPriority)],
    ]
    let sx = 14
    let sy = y
    stats.forEach((s, i) => {
      if (i === 3) { sx = 14; sy += 24 }
      doc.setFillColor(250, 250, 252)
      doc.setDrawColor(230, 230, 235)
      doc.roundedRect(sx, sy, 57, 18, 3, 3, 'FD')
      doc.setTextColor(113, 113, 122)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text(s[0].toUpperCase(), sx + 4, sy + 6)
      doc.setTextColor(39, 39, 42)
      doc.setFontSize(13)
      doc.text(s[1], sx + 4, sy + 14)
      sx += 62
    })
    y = sy + 28

    section('Identificação')
    text(`Banca: ${safe(ident.banca)}`)
    text(`Órgão: ${safe(ident.orgao)}`)
    text(`Cargo: ${safe(ident.cargo)}`)
    text(`Vagas: ${safe(ident.vagas)}`)
    text(`Remuneração: ${safe(ident.remuneracao)}`)
    text(`Requisitos: ${safe(ident.requisitos)}`)

    section('Legenda de execução')
    text('Status: Não estudado = ainda pendente; Estudado = conteúdo visto; Revisar = conteúdo que precisa retornar no ciclo de revisão.', 14, 9)
    text('Prioridade: Alta = estudar primeiro; Média = manter no ciclo; Baixa = revisar após dominar os tópicos centrais.', 14, 9)

    section('Checklist verticalizado')
    Object.entries(groupedRows).forEach(([disciplina, list]) => {
      ensure(18)
      doc.setFillColor(24, 24, 27)
      doc.roundedRect(14, y, W - 28, 9, 3, 3, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(disciplina.substring(0, 80), 18, y + 6)
      y += 12

      list.forEach(row => {
        const st = statusLabel(progress[row.id]?.status).label
        ensure(20)
        doc.setDrawColor(235, 235, 240)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(14, y, W - 28, 16, 2.5, 2.5, 'FD')
        doc.setTextColor(39, 39, 42)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.text(doc.splitTextToSize(`${row.codigo} • ${row.assunto}`, 95)[0], 18, y + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(82, 82, 91)
        doc.setFontSize(7.5)
        doc.text(doc.splitTextToSize(`Subtópico: ${row.subtopico}`, 102)[0], 18, y + 11.5)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(row.prioridade === 'Alta' ? 180 : 91, row.prioridade === 'Alta' ? 83 : 33, row.prioridade === 'Alta' ? 9 : 182)
        doc.text(row.prioridade, 128, y + 5.5)
        doc.setTextColor(113, 113, 122)
        doc.text(`Status: ${st}`, 128, y + 11.5)
        doc.text(`Questões: ${row.questoes} • Revisão: ${row.revisao}`, 162, y + 11.5)
        y += 19
      })
    })

    if (Array.isArray(banca.assuntosMaisCobrados) && banca.assuntosMaisCobrados.length) {
      section('Inteligência da banca')
      text(`Estilo: ${safe(banca.estilo)}`)
      text(`Foco: ${safe(banca.foco)}`)
      text(`Assuntos mais cobrados: ${banca.assuntosMaisCobrados.join(', ')}`)
    }

    doc.save(`${(active.title || 'edital-verticalizado').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-premium.pdf`)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7 shadow-2xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
              <Target size={13} /> Sistema de execução do edital
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold">Edital Verticalizado</h1>
            <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Transforme o conteúdo programático em um checklist rastreável, com status, prioridade, revisão e progresso real de estudo.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center min-w-full md:min-w-[300px]">
            <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-lg font-bold text-white">{editais.length}</div><div className="text-[10px] text-zinc-500">Salvos</div></div>
            <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-lg font-bold text-brand-300">IA</div><div className="text-[10px] text-zinc-500">Extração</div></div>
            <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-lg font-bold text-green-300">PDF</div><div className="text-[10px] text-zinc-500">Premium</div></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <div onClick={() => document.getElementById('edital-file')?.click()} className="border-2 border-dashed border-white/10 rounded-3xl p-8 text-center cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-all">
            <Upload className="mx-auto mb-3 text-brand-400" />
            <div className="font-semibold">{fileName || 'Subir edital PDF'}</div>
            <div className="text-sm text-zinc-500 mt-1">{text ? `${Math.round(text.length / 100) / 10}kb extraídos` : 'PDF pesquisável ou TXT'}</div>
            {(busy || analyzing) && !queue && <div className="text-xs text-brand-300 mt-2"><Loader2 size={12} className="inline animate-spin" /> Processando...</div>}
          </div>
          <input id="edital-file" type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} />

          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 text-xs text-zinc-400 leading-relaxed">
            <div className="font-heading font-bold text-brand-300 mb-2">Como usar</div>
            <p>1. Envie o edital em PDF pesquisável.</p>
            <p>2. Se houver vários cargos, escolha o cargo correto.</p>
            <p>3. Gere o checklist e marque cada tópico conforme estudar.</p>
            <p>4. Exporte o PDF premium para estudar fora da plataforma.</p>
          </div>

          {analysis && <div className="card p-4 space-y-3 border border-brand-500/20 bg-brand-500/5">
            <div className="text-xs font-bold text-brand-300">Reconhecido no edital</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-black/20 border border-white/10 p-2"><div className="text-zinc-500">Banca</div><div className="text-zinc-200 font-semibold">{analysis.banca}</div></div>
              <div className="rounded-xl bg-black/20 border border-white/10 p-2"><div className="text-zinc-500">Órgão</div><div className="text-zinc-200 font-semibold">{analysis.orgao}</div></div>
            </div>
            {analysis.cargos.length > 1 && <>
              <label className="label">Selecione o cargo encontrado</label>
              <select className="input" value={cargo} onChange={e => setCargo(e.target.value)} style={{ colorScheme: 'dark' }}>
                <option value="">Escolha o cargo</option>
                {analysis.cargos.map((c, i) => <option key={i} value={c.nome}>{c.nome}</option>)}
              </select>
            </>}
            {analysis.cargos.length === 1 && <div className="text-xs text-green-300">Cargo selecionado automaticamente: <b>{cargo}</b></div>}
            <details className="rounded-xl border border-white/10 bg-black/20 p-3">
              <summary className="text-xs text-zinc-400 cursor-pointer">Não encontrou o cargo? Digitar manualmente</summary>
              <input className="input mt-3" value={manualCargo} onChange={e => setManualCargo(e.target.value)} placeholder="Ex: Analista Administrativo" />
            </details>
          </div>}

          {queue && <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100"><Loader2 size={16} className="inline animate-spin" /> {queue.processing ? 'Gerando checklist verticalizado...' : `Você está em ${queue.position}º na fila`}</div>}
          <button disabled={busy || analyzing || !text || (!!analysis?.cargos?.length && !selectedCargo)} onClick={gerar} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-2xl px-6 py-4 disabled:opacity-40 shadow-lg shadow-brand-950/20">{busy ? 'Processando...' : '🚀 Gerar checklist verticalizado'}</button>

          {editais.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Editais salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{editais.map(e => {
            const deletingThis = deleting === e.id
            return <div key={e.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs hover:border-brand-500/30 transition-colors">
              <button onClick={() => { setActive(e); setTab('verticalizado') }} className="w-full text-left">
                <div className="font-semibold text-zinc-100 leading-snug">{e.title}</div>
                <div className="text-zinc-500 mt-1">{e.data?.identificacao?.banca || 'Edital'}</div>
              </button>
              <button disabled={deletingThis} onClick={() => deleteEdital(e.id)} className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 px-2 py-1.5 text-[11px] flex items-center gap-1 disabled:opacity-50">
                {deletingThis ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Excluir
              </button>
            </div>
          })}</div></div>}
        </div>

        <div>{!active ? <div className="card p-10 md:p-16 text-center text-zinc-500 bg-gradient-to-br from-zinc-900 to-zinc-950"><div className="text-4xl mb-4">📄</div><div className="font-heading font-bold text-zinc-200">Nenhum edital aberto</div><p className="text-sm mt-2 max-w-md mx-auto">Após o upload, o edital vira uma tabela verticalizada com progresso, revisão e exportação premium.</p></div> : <div className="space-y-5">
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900 to-brand-950/30 p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold text-brand-300 uppercase tracking-wider mb-2">Checklist executável</div>
                <h2 className="font-heading font-bold text-xl leading-tight">{active.title}</h2>
                <div className="text-xs text-zinc-500 mt-2">{safe(ident.banca)} · {safe(ident.cargo)}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF Premium</button>
                <button disabled={deleting === active.id} onClick={() => deleteEdital(active.id)} className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-3 py-2 text-xs flex items-center gap-1 disabled:opacity-50">{deleting === active.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir</button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-5">
              <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-xl font-bold text-white">{percent}%</div><div className="text-[10px] text-zinc-500">Concluído</div></div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-xl font-bold text-green-300">{done}</div><div className="text-[10px] text-zinc-500">Estudados</div></div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-xl font-bold text-amber-300">{revisar}</div><div className="text-[10px] text-zinc-500">Revisar</div></div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="text-xl font-bold text-zinc-200">{pending}</div><div className="text-[10px] text-zinc-500">Pendentes</div></div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-3 col-span-2 md:col-span-1"><div className="text-xl font-bold text-brand-300">{rows.length}</div><div className="text-[10px] text-zinc-500">Itens totais</div></div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-2"><span>Progresso geral</span><span>{done}/{rows.length} itens</span></div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-600 via-purple-500 to-green-400" style={{ width: `${percent}%` }} /></div>
              {savingProgress && <div className="text-[10px] text-zinc-500 mt-1">Salvando progresso...</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-zinc-900 p-1 overflow-x-auto"><div className="flex gap-1 min-w-max">{[
            { id: 'verticalizado', label: 'Checklist verticalizado' },
            { id: 'geral', label: 'Visão geral' },
            { id: 'banca', label: 'Inteligência da banca' },
            { id: 'plano', label: 'Plano' },
          ].map(t => <button key={t.id} onClick={() => setTab(t.id as Tab)} className={`px-4 py-2.5 text-xs md:text-sm rounded-xl whitespace-nowrap transition-all ${tab === t.id ? 'bg-brand-500/20 text-brand-200 border border-brand-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.label}</button>)}</div></div>

          {tab === 'verticalizado' && <div className="card overflow-hidden">
            <div className="hidden md:grid grid-cols-[120px_1.15fr_1.25fr_1.35fr_90px_110px_90px] bg-zinc-950/70 text-xs text-zinc-500 font-bold uppercase tracking-wider">
              <div className="p-3">Status</div><div className="p-3">Disciplina</div><div className="p-3">Assunto</div><div className="p-3">Subtópico</div><div className="p-3">Questões</div><div className="p-3">Prioridade</div><div className="p-3">Revisão</div>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {rows.map(row => {
                const status = statusLabel(progress[row.id]?.status)
                const Icon = status.icon
                return <div key={row.id} className="grid md:grid-cols-[120px_1.15fr_1.25fr_1.35fr_90px_110px_90px] gap-0 p-4 md:p-0 hover:bg-white/[0.02]">
                  <div className="md:p-3 mb-3 md:mb-0"><button onClick={() => cycleStatus(row.id)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${status.cls}`}><Icon size={12} /> {status.label}</button></div>
                  <div className="md:p-3 mb-2 md:mb-0"><div className="md:hidden text-[10px] font-bold text-zinc-500 uppercase mb-1">Disciplina</div><div className="text-zinc-100 font-semibold text-sm">{row.disciplina}</div></div>
                  <div className="md:p-3 mb-2 md:mb-0"><div className="md:hidden text-[10px] font-bold text-zinc-500 uppercase mb-1">Assunto</div><div className="text-zinc-300 text-sm">{row.assunto}</div></div>
                  <div className="md:p-3 mb-2 md:mb-0"><div className="md:hidden text-[10px] font-bold text-zinc-500 uppercase mb-1">Subtópico</div><div className="text-zinc-400 text-sm">{row.subtopico}</div></div>
                  <div className="md:p-3 mb-2 md:mb-0"><div className="md:hidden text-[10px] font-bold text-zinc-500 uppercase mb-1">Questões</div><div className="text-zinc-400 text-sm">{row.questoes}</div></div>
                  <div className="md:p-3 mb-2 md:mb-0"><span className={`rounded-full border px-2 py-1 text-[11px] ${priorityClass(row.prioridade)}`}>{row.prioridade}</span></div>
                  <div className="md:p-3"><div className="md:hidden text-[10px] font-bold text-zinc-500 uppercase mb-1">Revisão</div><div className="text-zinc-500 text-sm">{row.revisao}</div></div>
                </div>
              })}
            </div>
            {!rows.length && <div className="p-8 text-center text-zinc-500">Nenhum tópico verticalizado foi encontrado.</div>}
          </div>}

          {tab === 'geral' && <div className="grid md:grid-cols-2 gap-4">
            {[
              ['Banca', ident.banca], ['Órgão', ident.orgao], ['Cargo', ident.cargo], ['Data da prova', ident.dataProva || ident.provaObjetiva || ident.prova], ['Vagas', ident.vagas], ['Remuneração', ident.remuneracao], ['Requisitos', ident.requisitos], ['Disciplinas', materias.length],
            ].map(([label, value]) => <div key={String(label)} className="card p-4"><div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{label}</div><div className="text-sm text-zinc-200 mt-1">{safe(value)}</div></div>)}
            <div className="card p-5 md:col-span-2"><div className="text-xs font-bold text-brand-300 mb-3">Cargos detectados</div>{resultCargos.length ? resultCargos.map((c: any, i: number) => <div key={i} className="text-sm text-zinc-300 mb-1">• {c.nome}</div>) : <div className="text-sm text-zinc-500">Nenhum cargo individual salvo.</div>}</div>
          </div>}

          {tab === 'banca' && <div className="card p-5 text-sm space-y-4">
            <div><div className="text-xs font-bold text-brand-300 mb-1">Estilo da banca</div><div className="text-zinc-300">{safe(banca.estilo)}</div></div>
            <div><div className="text-xs font-bold text-brand-300 mb-1">Foco de cobrança</div><div className="text-zinc-300">{safe(banca.foco)}</div></div>
            {Array.isArray(banca.assuntosMaisCobrados) && banca.assuntosMaisCobrados.length > 0 && <div><div className="text-xs font-bold text-brand-300 mb-2">Assuntos mais cobrados</div><div className="flex flex-wrap gap-2">{banca.assuntosMaisCobrados.map((a: string, i: number) => <span key={i} className="chip">{a}</span>)}</div></div>}
          </div>}

          {tab === 'plano' && <div className="space-y-3">{(data.planoEstudos || []).length ? data.planoEstudos.map((s: any, i: number) => <div key={i} className="card p-5"><div className="text-xs text-brand-300 font-bold mb-1">Semana {s.semana}</div><div className="text-sm text-zinc-200 font-semibold">{s.foco}</div>{Array.isArray(s.tarefas) && <div className="mt-3 space-y-1">{s.tarefas.map((t: string, ti: number) => <div key={ti} className="text-xs text-zinc-400">• {t}</div>)}</div>}</div>) : <div className="card p-8 text-center text-zinc-500">Nenhum plano foi gerado.</div>}</div>}
        </div>}</div>
      </div>
    </div>
  )
}
