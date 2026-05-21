'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Brain, Download, FileDown, Image as ImageIcon, Loader2 } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type MindMap = { id: string; title: string; topic: string; data: any; createdAt: string }

type VisualNode = {
  title: string
  resumo?: string
  prioridade?: string
  palavrasChave?: string[]
  children: VisualNode[]
}

function clampText(text: string, max = 42) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean
}

function toVisualNodes(data: any): VisualNode[] {
  return (Array.isArray(data?.nodes) ? data.nodes : []).map((n: any) => ({
    title: n.titulo || 'Tópico',
    resumo: n.resumo || '',
    prioridade: n.prioridade || 'Média',
    palavrasChave: Array.isArray(n.palavrasChave) ? n.palavrasChave : [],
    children: (Array.isArray(n.filhos) ? n.filhos : []).map((f: any) => ({
      title: f.titulo || 'Subtópico',
      resumo: f.resumo || '',
      prioridade: f.prioridade || n.prioridade || 'Média',
      palavrasChave: Array.isArray(f.palavrasChave) ? f.palavrasChave : [],
      children: (Array.isArray(f.filhos) ? f.filhos : []).map((s: any) => ({
        title: s.titulo || 'Item',
        resumo: s.resumo || '',
        prioridade: s.prioridade || f.prioridade || 'Média',
        palavrasChave: Array.isArray(s.palavrasChave) ? s.palavrasChave : [],
        children: [],
      })),
    })),
  }))
}

function colorByPriority(p?: string) {
  if (p === 'Alta') return '#f59e0b'
  if (p === 'Baixa') return '#64748b'
  return '#7c3aed'
}

function escapeXml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildMindMapSvg(data: any) {
  const title = data?.titulo || 'Mapa Mental'
  const nodes = toVisualNodes(data).slice(0, 8)
  const W = 1400
  const H = 900
  const cx = W / 2
  const cy = H / 2
  const radiusX = 460
  const radiusY = 280
  const branchW = 250
  const branchH = 88
  const subW = 170
  const subH = 52

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#18181b"/></linearGradient><linearGradient id="center" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#a855f7"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/></filter></defs>`)
  parts.push(`<rect width="${W}" height="${H}" rx="34" fill="url(#bg)"/>`)
  parts.push(`<circle cx="1180" cy="80" r="170" fill="#7c3aed" opacity="0.12"/><circle cx="150" cy="780" r="190" fill="#22c55e" opacity="0.08"/>`)
  parts.push(`<text x="56" y="70" fill="#a78bfa" font-size="24" font-family="Arial" font-weight="700">GabaritoIA • Mapa Mental</text>`)

  parts.push(`<g filter="url(#shadow)"><rect x="${cx - 180}" y="${cy - 62}" width="360" height="124" rx="28" fill="url(#center)"/><text x="${cx}" y="${cy - 10}" fill="#fff" font-size="26" font-family="Arial" font-weight="800" text-anchor="middle">${escapeXml(clampText(title, 28))}</text><text x="${cx}" y="${cy + 24}" fill="#ede9fe" font-size="16" font-family="Arial" text-anchor="middle">Tema central de revisão</text></g>`)

  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(nodes.length, 1)
    const x = cx + Math.cos(angle) * radiusX
    const y = cy + Math.sin(angle) * radiusY
    const bx = x - branchW / 2
    const by = y - branchH / 2
    const accent = colorByPriority(node.prioridade)
    const ctrlX = cx + Math.cos(angle) * 230
    const ctrlY = cy + Math.sin(angle) * 140
    parts.push(`<path d="M ${cx} ${cy} Q ${ctrlX} ${ctrlY} ${x} ${y}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>`)
    parts.push(`<g filter="url(#shadow)"><rect x="${bx}" y="${by}" width="${branchW}" height="${branchH}" rx="18" fill="#fff"/><rect x="${bx}" y="${by}" width="8" height="${branchH}" rx="4" fill="${accent}"/><text x="${bx + 22}" y="${by + 30}" fill="#18181b" font-size="18" font-family="Arial" font-weight="800">${escapeXml(clampText(node.title, 24))}</text><text x="${bx + 22}" y="${by + 55}" fill="#52525b" font-size="12" font-family="Arial">${escapeXml(clampText(node.resumo || '', 34))}</text><text x="${bx + 22}" y="${by + 74}" fill="${accent}" font-size="11" font-family="Arial" font-weight="700">Prioridade ${escapeXml(node.prioridade || 'Média')}</text></g>`)

    node.children.slice(0, 3).forEach((child, ci) => {
      const side = Math.cos(angle) >= 0 ? 1 : -1
      const sx = x + side * 200
      const sy = y + (ci - 1) * 74
      const sbx = sx - subW / 2
      const sby = sy - subH / 2
      parts.push(`<path d="M ${x + side * branchW / 2} ${y} C ${x + side * 90} ${y} ${sx - side * 95} ${sy} ${sx - side * subW / 2} ${sy}" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>`)
      parts.push(`<rect x="${sbx}" y="${sby}" width="${subW}" height="${subH}" rx="14" fill="#27272a" stroke="#3f3f46"/><text x="${sx}" y="${sy - 4}" fill="#f4f4f5" font-size="13" font-family="Arial" font-weight="700" text-anchor="middle">${escapeXml(clampText(child.title, 20))}</text><text x="${sx}" y="${sy + 15}" fill="#a1a1aa" font-size="10" font-family="Arial" text-anchor="middle">${escapeXml(clampText((child.palavrasChave || []).join(' • '), 24))}</text>`)
    })
  })

  parts.push(`<text x="${W - 56}" y="${H - 42}" fill="#71717a" font-size="16" font-family="Arial" text-anchor="end">Gerado com IA para revisão de concurso</text>`)
  parts.push(`</svg>`)
  return parts.join('')
}

function NodeView({ node, level = 0 }: { node: any; level?: number }) {
  const kids = Array.isArray(node.filhos) ? node.filhos : []
  return (
    <div className={`${level ? 'ml-4 border-l border-white/10 pl-4' : ''}`}>
      <div className={`rounded-2xl border p-4 mb-3 ${level === 0 ? 'border-brand-500/30 bg-brand-500/10' : 'border-white/10 bg-black/20'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-zinc-100">{node.titulo}</div>
            {node.resumo && <div className="text-sm text-zinc-400 mt-1">{node.resumo}</div>}
          </div>
          {node.prioridade && <span className="text-[10px] rounded-full px-2 py-1 bg-amber-500/10 text-amber-300">{node.prioridade}</span>}
        </div>
        {Array.isArray(node.palavrasChave) && node.palavrasChave.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{node.palavrasChave.map((p: string, i: number) => <span key={i} className="chip text-[10px]">{p}</span>)}</div>}
      </div>
      {kids.map((k: any, i: number) => <NodeView key={i} node={k} level={level + 1} />)}
    </div>
  )
}

export default function MapasPage() {
  const [tema, setTema] = useState('')
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [nivel, setNivel] = useState('Intermediário')
  const [objetivo, setObjetivo] = useState('Revisão rápida')
  const [contexto, setContexto] = useState('')
  const [provider, setProvider] = useState('claude')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['claude'])
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState<AIQueueStatus | null>(null)
  const [maps, setMaps] = useState<MindMap[]>([])
  const [active, setActive] = useState<MindMap | null>(null)
  const [view, setView] = useState<'visual' | 'estrutura'>('visual')

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        setAvailableProviders(keys)
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
    loadMaps()
  }, [])

  useEffect(() => {
    if (!queue?.id || !loading) return
    const timer = setInterval(async () => {
      try { setQueue(await getAIQueueStatus(queue.id)) } catch {}
    }, 1200)
    return () => clearInterval(timer)
  }, [queue?.id, loading])

  async function loadMaps() {
    const data = await fetch('/api/mindmaps').then(r => r.json()).catch(() => null)
    if (data?.mindMaps) setMaps(data.mindMaps)
  }

  async function gerar() {
    if (!tema.trim()) return toast.error('Informe o tema do mapa mental')
    setLoading(true)
    setQueue(null)
    try {
      const job = await createAIQueueJob('mind_map', provider)
      setQueue(job)
      const res = await fetch('/api/mindmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema, banca, cargo, nivel, objetivo, contexto, provider, queueJobId: job.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar mapa mental'); return }
      setActive(data.mindMap)
      setView('visual')
      await loadMaps()
      toast.success('Mapa mental gerado!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar mapa')
    } finally {
      setLoading(false)
      setQueue(null)
    }
  }

  const data = active?.data || {}
  const svg = useMemo(() => active ? buildMindMapSvg(active.data) : '', [active])

  async function svgToPngDataUrl(svgMarkup: string) {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Erro ao converter mapa'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 900
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/png')
  }

  async function exportPNG() {
    if (!active || !svg) return
    try {
      const png = await svgToPngDataUrl(svg)
      const a = document.createElement('a')
      a.href = png
      a.download = `${(active.title || 'mapa-mental').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
      a.click()
    } catch {
      toast.error('Não consegui exportar a imagem')
    }
  }

  async function exportPDF() {
    if (!active) return
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const png = await svgToPngDataUrl(svg)
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, 297, 210, 'F')
    doc.addImage(png, 'PNG', 8, 8, 281, 181)
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.text('GabaritoIA • PDF Premium de Mapa Mental', 14, 200)

    doc.addPage('portrait')
    let y = 16
    const add = (txt: string, size = 10, bold = false) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(bold ? 24 : 63, bold ? 24 : 63, bold ? 27 : 70)
      const lines = doc.splitTextToSize(String(txt || ''), 180)
      lines.forEach((line: string) => { if (y > 280) { doc.addPage(); y = 14 } doc.text(line, 14, y); y += size * 0.45 + 2 })
    }
    const walk = (n: any, lvl = 0) => {
      add(`${'  '.repeat(lvl)}${lvl ? '• ' : ''}${n.titulo || ''}`, lvl ? 10 : 13, lvl === 0)
      if (n.resumo) add(`${'  '.repeat(lvl + 1)}${n.resumo}`, 9)
      ;(n.filhos || []).forEach((k: any) => walk(k, lvl + 1))
    }
    add('Resumo e estrutura do mapa', 16, true)
    add(active.data?.resumo || '', 10)
    y += 4
    ;(active.data?.nodes || []).forEach((n: any) => walk(n))
    if (active.data?.pegadinhas?.length) { y += 4; add('Pegadinhas de prova', 13, true); active.data.pegadinhas.forEach((p: string) => add(`• ${p}`, 9)) }
    if (active.data?.revisaoRapida?.length) { y += 4; add('Revisão rápida', 13, true); active.data.revisaoRapida.forEach((p: string) => add(`• ${p}`, 9)) }
    if (active.data?.questoesProvaveis?.length) { y += 4; add('Como pode cair', 13, true); active.data.questoesProvaveis.forEach((p: string) => add(`• ${p}`, 9)) }
    doc.save(`${(active.title || 'mapa-mental').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-premium.pdf`)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">🧠 Mapas Mentais</h1>
        <p className="text-zinc-400 text-sm mt-1">Crie mapas mentais visuais para revisar conteúdos de concurso com IA.</p>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div><label className="label">Tema principal</label><input className="input" placeholder="Ex: Atos Administrativos" value={tema} onChange={e => setTema(e.target.value)} /></div>
            <div><label className="label">Banca</label><input className="input" placeholder="Ex: FGV, Cebraspe, FCC" value={banca} onChange={e => setBanca(e.target.value)} /></div>
            <div><label className="label">Cargo</label><input className="input" placeholder="Ex: Analista Administrativo" value={cargo} onChange={e => setCargo(e.target.value)} /></div>
            <div><label className="label">Nível</label><div className="flex gap-2">{['Iniciante','Intermediário','Avançado'].map(n => <button key={n} onClick={() => setNivel(n)} className={`chip ${nivel === n ? 'chip-active' : ''}`}>{n}</button>)}</div></div>
            <div><label className="label">Objetivo</label><div className="flex flex-wrap gap-2">{['Revisão rápida','Aprofundamento','Reta final','Memorização'].map(n => <button key={n} onClick={() => setObjetivo(n)} className={`chip ${objetivo === n ? 'chip-active' : ''}`}>{n}</button>)}</div></div>
            <div><label className="label">Contexto extra ou trecho do edital</label><textarea className="input min-h-28" placeholder="Cole aqui um trecho do edital, material ou conteúdo que quer transformar em mapa mental..." value={contexto} onChange={e => setContexto(e.target.value)} /></div>
            <div><label className="label">Provedor IA</label><div className="flex flex-wrap gap-2">{availableProviders.map(p => <button key={p} onClick={() => setProvider(p)} className={`chip ${provider === p ? 'chip-active' : ''}`}>{p}</button>)}</div></div>
          </div>

          {queue && <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100"><Loader2 size={16} className="inline animate-spin" /> {queue.processing ? 'Criando mapa mental...' : `Você está em ${queue.position}º na fila`}</div>}
          <button onClick={gerar} disabled={loading || !tema.trim()} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 disabled:opacity-40 flex items-center justify-center gap-2">{loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : '🧠 Gerar mapa visual'}</button>

          {maps.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Mapas salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{maps.map(m => <button key={m.id} onClick={() => { setActive(m); setView('visual') }} className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div className="font-semibold text-zinc-100">{m.title}</div><div className="text-zinc-500">{new Date(m.createdAt).toLocaleDateString('pt-BR')}</div></button>)}</div></div>}
        </div>

        <div>
          {!active ? <div className="card p-12 text-center text-zinc-500"><Brain size={42} className="mx-auto mb-4 text-brand-400" /><div className="font-heading font-bold text-zinc-200">Crie seu primeiro mapa mental visual</div><div className="text-sm mt-2">A IA organiza o conteúdo e o sistema transforma em imagem de mapa mental.</div></div> : <div className="space-y-5">
            <div className="card p-5 flex flex-col gap-4">
              <div className="flex justify-between gap-3">
                <div><h2 className="font-heading font-bold">{data.titulo || active.title}</h2><div className="text-sm text-zinc-400 mt-1">{data.resumo}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setView('visual')} className={`chip ${view === 'visual' ? 'chip-active' : ''}`}>Mapa visual</button>
                <button onClick={() => setView('estrutura')} className={`chip ${view === 'estrutura' ? 'chip-active' : ''}`}>Estrutura</button>
                <button onClick={exportPNG} className="btn-secondary text-xs flex items-center gap-1"><ImageIcon size={14} /> PNG</button>
                <button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF Premium</button>
                <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`${(active.title || 'mapa-mental').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.svg`} className="btn-secondary text-xs flex items-center gap-1"><Download size={14} /> SVG</a>
              </div>
            </div>

            {view === 'visual' ? <div className="card p-3 overflow-auto bg-zinc-950"><div className="min-w-[900px]" dangerouslySetInnerHTML={{ __html: svg }} /></div> : <div className="space-y-3">{(data.nodes || []).map((n: any, i: number) => <NodeView key={i} node={n} />)}</div>}

            {data.pegadinhas?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-amber-300 mb-3">Pegadinhas de prova</div><div className="space-y-2">{data.pegadinhas.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">⚠ {p}</div>)}</div></div>}
            {data.revisaoRapida?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Revisão rápida</div><div className="space-y-2">{data.revisaoRapida.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">• {p}</div>)}</div></div>}
            {data.questoesProvaveis?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-green-300 mb-3">Como pode cair</div><div className="space-y-2">{data.questoesProvaveis.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">🎯 {p}</div>)}</div></div>}
          </div>}
        </div>
      </div>
    </div>
  )
}
