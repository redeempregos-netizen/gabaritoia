'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, FileDown } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type Cargo = { nome: string; vagas?: string; requisitos?: string; remuneracao?: string }
type Analysis = { banca: string; orgao: string; cargos: Cargo[] }
type Edital = { id: string; title: string; data: any; progress: Record<string, any> }

function normalizeCargos(raw: any): Cargo[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).map((c: any) => ({
    nome: String(c?.nome || c?.cargo || '').trim(),
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

export function EditalVerticalizadoPage() {
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [cargo, setCargo] = useState('')
  const [examDate, setExamDate] = useState('')
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
      if (keys.length) setProvider(d.config?.defaultProvider && keys.includes(d.config.defaultProvider) ? d.config.defaultProvider : keys[0])
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
    try {
      const res = await fetch('/api/ai/analyze-edital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText, provider }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não reconheci os cargos'); return }
      const raw = data.analysis || {}
      const found = {
        banca: raw.banca || 'Não informado',
        orgao: raw.orgao || raw.orgão || 'Não informado',
        cargos: normalizeCargos(raw.cargos),
      }
      setAnalysis(found)
      if (found.cargos.length === 1) setCargo(found.cargos[0].nome)
      if (found.cargos.length > 1) toast.success(`${found.cargos.length} cargos encontrados. Selecione o cargo.`)
      else if (found.cargos.length === 1) toast.success('Cargo reconhecido automaticamente.')
      else toast.warning('Não achei cargos individuais. Preencha manualmente.')
    } catch {
      toast.error('Erro ao reconhecer banca, órgão e cargos')
    } finally {
      setAnalyzing(false)
    }
  }

  function setCleanText(value: string) {
    const clean = value.replace(/\u0000/g, ' ').replace(/\s{3,}/g, ' ').substring(0, 30000)
    setText(clean)
    void analyzeEdital(clean)
  }

  async function readFile(file: File) {
    setFileName(file.name)
    setText('')
    setAnalysis(null)
    setCargo('')
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setBusy(true)
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        const parts: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const pageText = content.items.map((x: any) => x.str || '').join(' ')
          if (pageText) parts.push(pageText)
        }
        const full = parts.join('\n')
        if (!full.trim()) throw new Error('PDF sem texto')
        setCleanText(full)
        toast.success('PDF extraído. Reconhecendo cargos...')
      } catch {
        toast.error('PDF sem texto pesquisável. Envie TXT ou PDF pesquisável.')
      } finally {
        setBusy(false)
      }
    } else {
      const reader = new FileReader()
      reader.onload = e => setCleanText(String(e.target?.result || ''))
      reader.readAsText(file, 'utf-8')
    }
  }

  async function gerar() {
    if (!text) return toast.error('Suba o edital primeiro')
    if (analysis?.cargos?.length && !cargo) return toast.error('Selecione o cargo antes de gerar')
    setBusy(true)
    setQueue(null)
    try {
      const job = await createAIQueueJob('verticalized_edital', provider)
      setQueue(job)
      const selected = analysis?.cargos?.find(c => c.nome === cargo)
      const cargoContext = selected ? `${selected.nome} | Vagas: ${selected.vagas} | Requisitos: ${selected.requisitos} | Remuneração: ${selected.remuneracao}` : cargo
      const res = await fetch('/api/edital-verticalizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalText: text, fileName, cargo: cargoContext, examDate, hoursPerDay, level, provider, queueJobId: job.id }),
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const data = active.data || {}
    const ident = data.identificacao || {}
    const banca = data.analiseBanca || {}
    const materias = Array.isArray(data.materias) ? data.materias : []
    const cargos = Array.isArray(ident.cargos) ? ident.cargos : []
    const plano = Array.isArray(data.planoEstudos) ? data.planoEstudos : []
    const revisoes = Array.isArray(data.revisoes) ? data.revisoes : []
    const obs = Array.isArray(data.observacoes) ? data.observacoes : []

    const W = 210
    const H = 297
    const M = 14
    let y = 16
    let page = 1

    const colors = {
      dark: [24, 24, 27] as [number, number, number],
      brand: [124, 58, 237] as [number, number, number],
      purple: [168, 85, 247] as [number, number, number],
      text: [39, 39, 42] as [number, number, number],
      muted: [113, 113, 122] as [number, number, number],
      line: [228, 228, 231] as [number, number, number],
      soft: [246, 245, 255] as [number, number, number],
      green: [22, 163, 74] as [number, number, number],
      amber: [217, 119, 6] as [number, number, number],
    }

    const totalTopicos = materias.reduce((acc: number, m: any) => acc + (Array.isArray(m.topicos) ? m.topicos.length : 0), 0)
    const prioridadeAlta = materias.reduce((acc: number, m: any) => acc + (Array.isArray(m.topicos) ? m.topicos.filter((t: any) => t.prioridade === 'Alta').length : 0), 0)

    function rgb(c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]) }
    function fill(c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]) }
    function stroke(c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]) }
    function font(size: number, style: 'normal' | 'bold' = 'normal') { doc.setFont('helvetica', style); doc.setFontSize(size) }

    function footer() {
      stroke(colors.line)
      doc.line(M, H - 13, W - M, H - 13)
      font(8)
      rgb(colors.muted)
      doc.text('GabaritoIA • Edital Verticalizado', M, H - 7)
      doc.text(`Página ${page}`, W - M, H - 7, { align: 'right' })
    }

    function header(title = 'Edital Verticalizado') {
      fill(colors.dark)
      doc.rect(0, 0, W, 12, 'F')
      font(8, 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text('GabaritoIA', M, 8)
      font(8)
      doc.text(title, W - M, 8, { align: 'right' })
    }

    function newPage(title?: string) {
      footer()
      doc.addPage()
      page++
      y = 20
      header(title)
    }

    function ensure(space = 16, title?: string) {
      if (y + space > H - 18) newPage(title)
    }

    function textLine(txt: string, size = 10, style: 'normal' | 'bold' = 'normal', color = colors.text, indent = 0) {
      font(size, style)
      rgb(color)
      const lines = doc.splitTextToSize(String(txt || ''), W - M * 2 - indent)
      lines.forEach((line: string) => {
        ensure(size * 0.55 + 3)
        doc.text(line, M + indent, y)
        y += size * 0.42 + 3
      })
    }

    function section(title: string, subtitle?: string) {
      ensure(18, title)
      y += 3
      fill(colors.brand)
      doc.roundedRect(M, y - 5, 3, 8, 1.5, 1.5, 'F')
      font(14, 'bold')
      rgb(colors.dark)
      doc.text(title, M + 7, y)
      y += 7
      if (subtitle) textLine(subtitle, 9, 'normal', colors.muted)
      y += 2
    }

    function card(x: number, w: number, title: string, value: string, accent = colors.brand) {
      fill([250, 250, 250])
      stroke(colors.line)
      doc.roundedRect(x, y, w, 23, 3, 3, 'FD')
      fill(accent)
      doc.roundedRect(x, y, 3, 23, 2, 2, 'F')
      font(8, 'bold')
      rgb(colors.muted)
      doc.text(title.toUpperCase(), x + 7, y + 8)
      font(12, 'bold')
      rgb(colors.text)
      const valueLines = doc.splitTextToSize(value || 'Não informado', w - 11).slice(0, 2)
      doc.text(valueLines, x + 7, y + 15)
    }

    function bullet(txt: string, accent = colors.brand) {
      ensure(8)
      fill(accent)
      doc.circle(M + 1.5, y - 1.5, 1.2, 'F')
      textLine(txt, 9, 'normal', colors.text, 6)
    }

    // Capa
    fill(colors.dark)
    doc.rect(0, 0, W, H, 'F')
    fill(colors.brand)
    doc.circle(W - 22, 28, 34, 'F')
    fill(colors.purple)
    doc.circle(W - 6, 8, 26, 'F')
    doc.setTextColor(255, 255, 255)
    font(12, 'bold')
    doc.text('GabaritoIA', M, 26)
    font(26, 'bold')
    doc.text('Edital', M, 60)
    doc.text('Verticalizado', M, 73)
    font(11)
    doc.text('Sistema de execução para concurso público', M, 84)
    stroke([255, 255, 255])
    doc.setLineWidth(0.4)
    doc.line(M, 95, W - M, 95)
    font(16, 'bold')
    const titleLines = doc.splitTextToSize(active.title || 'Edital Verticalizado', 170)
    doc.text(titleLines, M, 112)
    font(10)
    doc.text(`Banca: ${ident.banca || 'Não informado'}`, M, 146)
    doc.text(`Órgão: ${ident.orgao || 'Não informado'}`, M, 154)
    doc.text(`Cargo: ${ident.cargo || 'Não informado'}`, M, 162)
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, M, 178)
    fill(colors.brand)
    doc.roundedRect(M, 232, W - M * 2, 28, 4, 4, 'F')
    doc.setTextColor(255, 255, 255)
    font(11, 'bold')
    doc.text('Conteúdo organizado por prioridade, tópicos, banca e plano de estudos.', M + 7, 244)
    font(9)
    doc.text('Use este PDF como mapa de execução e revisão até a prova.', M + 7, 253)

    doc.addPage()
    page++
    y = 20
    header('Resumo executivo')

    section('Resumo executivo', 'Visão rápida do edital e do plano de execução.')
    card(M, 42, 'Matérias', String(materias.length), colors.brand)
    card(M + 46, 42, 'Tópicos', String(totalTopicos), colors.purple)
    card(M + 92, 42, 'Alta prioridade', String(prioridadeAlta), colors.amber)
    card(M + 138, 44, 'Cargo', ident.cargo || 'Não informado', colors.green)
    y += 31

    section('Identificação do edital')
    const left = M
    const right = M + 92
    card(left, 86, 'Banca', ident.banca || 'Não informado')
    card(right, 86, 'Órgão', ident.orgao || 'Não informado')
    y += 28
    card(left, 86, 'Vagas', ident.vagas || 'Não informado', colors.green)
    card(right, 86, 'Remuneração', ident.remuneracao || 'Não informado', colors.amber)
    y += 31
    if (ident.requisitos) {
      textLine(`Requisitos: ${ident.requisitos}`, 9, 'normal', colors.text)
    }

    if (cargos.length) {
      section('Cargos detectados')
      cargos.slice(0, 20).forEach((c: any) => {
        ensure(18)
        fill([250, 250, 250])
        stroke(colors.line)
        doc.roundedRect(M, y, W - M * 2, 16, 2, 2, 'FD')
        font(9, 'bold')
        rgb(colors.text)
        doc.text(c.nome || 'Cargo', M + 4, y + 6)
        font(8)
        rgb(colors.muted)
        doc.text(`Vagas: ${c.vagas || 'Não informado'}  •  Remuneração: ${c.remuneracao || 'Não informado'}`, M + 4, y + 12)
        y += 19
      })
    }

    section('Análise da banca')
    textLine(`Nome: ${banca.nome || ident.banca || 'Não informado'}`, 10, 'bold')
    textLine(`Estilo: ${banca.estilo || banca.estiloQuestoes || 'Não informado'}`, 9)
    textLine(`Foco: ${banca.foco || 'Não informado'}`, 9)
    textLine(`Lei seca: ${banca.leiSeca || 'Não informado'}  •  Jurisprudência: ${banca.jurisprudencia || 'Não informado'}  •  Doutrina: ${banca.doutrina || 'Não informado'}`, 8, 'normal', colors.muted)
    if (Array.isArray(banca.pegadinhas) && banca.pegadinhas.length) {
      y += 2
      textLine('Pegadinhas comuns', 10, 'bold')
      banca.pegadinhas.slice(0, 8).forEach((p: string) => bullet(p, colors.amber))
    }
    if (Array.isArray(banca.assuntosMaisCobrados) && banca.assuntosMaisCobrados.length) {
      y += 2
      textLine('Assuntos mais cobrados', 10, 'bold')
      banca.assuntosMaisCobrados.slice(0, 10).forEach((p: string) => bullet(p, colors.green))
    }

    newPage('Conteúdo verticalizado')
    section('Conteúdo verticalizado', 'Estrutura em árvore com prioridade, peso, dificuldade e tópicos executáveis.')
    materias.forEach((m: any, mi: number) => {
      ensure(25, 'Conteúdo verticalizado')
      fill(colors.soft)
      stroke([221, 214, 254])
      doc.roundedRect(M, y, W - M * 2, 18, 3, 3, 'FD')
      font(12, 'bold')
      rgb(colors.dark)
      doc.text(`${mi + 1}. ${m.nome || 'Matéria'}`, M + 5, y + 7)
      font(8)
      rgb(colors.muted)
      doc.text(`Peso: ${m.peso || 'Não informado'}  •  Questões: ${m.questoes || 'Não informado'}  •  Prioridade: ${m.prioridade || 'Média'}`, M + 5, y + 13)
      y += 22
      if (m.estrategia) textLine(`Estratégia: ${m.estrategia}`, 8, 'normal', colors.muted)
      if (Array.isArray(m.topicosQuentes) && m.topicosQuentes.length) {
        textLine(`Tópicos quentes: ${m.topicosQuentes.slice(0, 6).join(' • ')}`, 8, 'normal', colors.amber)
      }
      ;(Array.isArray(m.topicos) ? m.topicos : []).forEach((t: any) => {
        ensure(13, 'Conteúdo verticalizado')
        const accent = t.prioridade === 'Alta' ? colors.amber : t.prioridade === 'Baixa' ? colors.muted : colors.brand
        fill(accent)
        doc.rect(M + 2, y - 4, 2, 8, 'F')
        font(9, 'bold')
        rgb(colors.text)
        const line = `${t.codigo || ''} ${t.nome || 'Tópico'}`.trim()
        const lines = doc.splitTextToSize(line, 145)
        doc.text(lines, M + 7, y)
        font(7)
        rgb(colors.muted)
        doc.text(`Prioridade: ${t.prioridade || 'Média'} • Dificuldade: ${t.dificuldade || 'Média'} • Revisão: ${t.revisaoSugeridaDias || 7}d`, W - M, y, { align: 'right' })
        y += Math.max(7, lines.length * 4 + 3)
        if (Array.isArray(t.subtopicos) && t.subtopicos.length) {
          t.subtopicos.slice(0, 8).forEach((s: any) => {
            ensure(6, 'Conteúdo verticalizado')
            font(8)
            rgb(colors.muted)
            doc.text(`• ${s.codigo || ''} ${s.nome || s}`.trim(), M + 12, y)
            y += 5
          })
        }
      })
      y += 5
    })

    newPage('Plano de estudos')
    section('Plano de estudos', 'Cronograma sugerido com foco semanal e metas de execução.')
    if (plano.length) {
      plano.forEach((s: any) => {
        ensure(22, 'Plano de estudos')
        fill([250, 250, 250])
        stroke(colors.line)
        doc.roundedRect(M, y, W - M * 2, 18, 3, 3, 'FD')
        font(10, 'bold')
        rgb(colors.text)
        doc.text(`Semana ${s.semana || ''}: ${s.foco || 'Foco não informado'}`, M + 5, y + 7)
        font(8)
        rgb(colors.muted)
        doc.text(`Meta de questões: ${s.metaQuestoes || 'Não informado'}`, M + 5, y + 13)
        y += 22
        ;(Array.isArray(s.tarefas) ? s.tarefas : []).slice(0, 8).forEach((t: string) => bullet(t))
      })
    } else {
      textLine('Nenhum plano de estudos foi informado pela IA para este edital.', 10, 'normal', colors.muted)
    }

    if (revisoes.length) {
      section('Revisões automáticas')
      revisoes.forEach((r: any) => bullet(`${r.tipo || 'Revisão'}: ${r.descricao || ''}`, colors.green))
    }

    if (obs.length) {
      section('Observações estratégicas')
      obs.slice(0, 8).forEach((o: string) => bullet(o, colors.purple))
    }

    footer()
    const safeName = (active.title || 'edital-verticalizado').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    doc.save(`${safeName || 'edital-verticalizado'}-premium.pdf`)
  }

  const data = active?.data || {}
  const ident = data.identificacao || {}
  const banca = data.analiseBanca || {}
  const mats = data.materias || []
  const resultCargos = Array.isArray(ident.cargos) ? ident.cargos : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-heading text-2xl font-bold mb-1">📄 Edital Verticalizado</h1>
      <p className="text-zinc-400 text-sm mb-6">Suba o edital, selecione o cargo reconhecido e gere o sistema de execução.</p>
      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <div onClick={() => document.getElementById('edital-file')?.click()} className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center cursor-pointer hover:border-white/20">
            <Upload className="mx-auto mb-3 text-zinc-500" />
            <div className="font-semibold">{fileName || 'Subir edital PDF'}</div>
            <div className="text-sm text-zinc-500">{text ? `${Math.round(text.length / 100) / 10}kb extraídos` : 'PDF pesquisável ou TXT'}</div>
            {(busy || analyzing) && !queue && <div className="text-xs text-brand-300 mt-2"><Loader2 size={12} className="inline animate-spin" /> Processando...</div>}
          </div>
          <input id="edital-file" type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} />

          {analysis && <div className="card p-4 space-y-3 border border-brand-500/20 bg-brand-500/5">
            <div className="text-xs font-bold text-brand-300">Reconhecido no edital</div>
            <div className="text-xs text-zinc-400">Banca: <span className="text-zinc-200">{analysis.banca}</span></div>
            <div className="text-xs text-zinc-400">Órgão: <span className="text-zinc-200">{analysis.orgao}</span></div>
            {analysis.cargos.length ? <>
              <label className="label">Selecione o cargo</label>
              <select className="input" value={cargo} onChange={e => setCargo(e.target.value)} style={{ colorScheme: 'dark' }}>
                <option value="">Escolha o cargo foco</option>
                {analysis.cargos.map((c, i) => <option key={i} value={c.nome}>{c.nome}</option>)}
              </select>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {analysis.cargos.map((c, i) => <button key={i} onClick={() => setCargo(c.nome)} className={`w-full text-left rounded-xl border p-3 text-xs ${cargo === c.nome ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-black/20'}`}>
                  <b className="text-zinc-100">{c.nome}</b>
                  <div className="text-zinc-500">Vagas: {c.vagas}</div>
                  <div className="text-zinc-500">Remuneração: {c.remuneracao}</div>
                </button>)}
              </div>
            </> : <div className="text-xs text-amber-300">Nenhum cargo individual encontrado. Digite abaixo.</div>}
          </div>}

          <div className="card p-4 space-y-3">
            <div><label className="label">Cargo foco</label><input className="input" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Analista Administrativo" /></div>
            <div><label className="label">Data da prova</label><input type="date" className="input" value={examDate} onChange={e => setExamDate(e.target.value)} style={{ colorScheme: 'dark' }} /></div>
            <div><label className="label">Horas por dia</label><div className="flex flex-wrap gap-2">{['1h','2h','3h','4h','5h','6h+'].map(h => <button key={h} onClick={() => setHoursPerDay(h)} className={`chip ${hoursPerDay === h ? 'chip-active' : ''}`}>{h}</button>)}</div></div>
            <div><label className="label">Nível</label><div className="flex gap-2">{['Iniciante','Intermediário','Avançado'].map(n => <button key={n} onClick={() => setLevel(n)} className={`chip ${level === n ? 'chip-active' : ''}`}>{n}</button>)}</div></div>
          </div>

          {queue && <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100"><Loader2 size={16} className="inline animate-spin" /> {queue.status === 'queued' ? `Você está em ${queue.position}º na fila` : 'Sua vez chegou. Gerando...'}</div>}
          <button disabled={busy || analyzing || !text || (!!analysis?.cargos?.length && !cargo)} onClick={gerar} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 disabled:opacity-40">{busy ? 'Processando...' : '🚀 Gerar edital executável'}</button>

          {editais.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Editais salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{editais.map(e => <button key={e.id} onClick={() => { setActive(e); setTab('geral') }} className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div className="font-semibold text-zinc-100">{e.title}</div><div className="text-zinc-500">{e.data?.identificacao?.banca || 'Edital'}</div></button>)}</div></div>}
        </div>

        <div>{!active ? <div className="card p-12 text-center text-zinc-500">Após o upload, os cargos aparecem aqui para seleção antes de gerar.</div> : <div className="space-y-5">
          <div className="card p-5 flex justify-between gap-3"><div><h2 className="font-heading font-bold">{active.title}</h2><div className="text-xs text-zinc-500 mt-1">{ident.banca} · {ident.cargo}</div></div><button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF Premium</button></div>
          <div className="flex gap-2 overflow-x-auto border-b border-white/[0.07]">{[{ id: 'geral', label: 'Visão geral' }, { id: 'conteudo', label: 'Conteúdo' }, { id: 'banca', label: 'Banca' }, { id: 'plano', label: 'Plano' }].map(t => <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-4 py-2 text-sm border-b-2 ${tab === t.id ? 'border-brand-500 text-brand-300' : 'border-transparent text-zinc-500'}`}>{t.label}</button>)}</div>
          {tab === 'geral' && <div className="space-y-4"><div className="card p-5 grid md:grid-cols-2 gap-3 text-sm"><div>Banca: {ident.banca || 'Não informado'}</div><div>Órgão: {ident.orgao || 'Não informado'}</div><div>Cargo: {ident.cargo || 'Não informado'}</div><div>Vagas: {ident.vagas || 'Não informado'}</div></div><div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Cargos detectados</div>{resultCargos.length ? resultCargos.map((c: any, i: number) => <div key={i} className="text-sm text-zinc-300 mb-1">• {c.nome}</div>) : <div className="text-sm text-zinc-500">Nenhum cargo individual salvo.</div>}</div></div>}
          {tab === 'banca' && <div className="card p-5 text-sm space-y-2"><div><b>Nome:</b> {banca.nome || ident.banca || 'Não informado'}</div><div><b>Estilo:</b> {banca.estilo || 'Não informado'}</div><div><b>Foco:</b> {banca.foco || 'Não informado'}</div></div>}
          {tab === 'conteudo' && <div className="space-y-4">{mats.map((m: any) => <div key={m.id || m.nome} className="card p-5"><div className="font-bold">{m.nome}</div><div className="text-xs text-zinc-500 mb-3">Peso: {m.peso} · Prioridade: {m.prioridade}</div>{(m.topicos || []).map((t: any) => <div key={t.id} className="rounded-xl border border-white/10 p-3 mb-2 text-sm">{t.codigo} {t.nome}</div>)}</div>)}</div>}
          {tab === 'plano' && <div className="card p-5 text-sm text-zinc-300">{(data.planoEstudos || []).map((s: any, i: number) => <div key={i} className="mb-2"><b>Semana {s.semana}:</b> {s.foco}</div>)}</div>}
        </div>}</div>
      </div>
    </div>
  )
}
