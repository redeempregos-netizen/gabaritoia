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

function wrapText(text: string, maxChars = 24, maxLines = 2) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ['']
  const words = clean.split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
    if (lines.length === maxLines) break
  }

  if (lines.length < maxLines && line) lines.push(line)
  const used = lines.join(' ')
  if (used.length < clean.length && lines.length) {
    lines[lines.length - 1] = clampText(lines[lines.length - 1], Math.max(8, maxChars - 1))
  }
  return lines.slice(0, maxLines)
}

function svgTextLines(lines: string[], x: number, y: number, opts: { fill: string; fontSize: number; weight?: number | string; anchor?: string; lineHeight?: number }) {
  const lineHeight = opts.lineHeight || Math.round(opts.fontSize * 1.25)
  return `<text x="${x}" y="${y}" fill="${opts.fill}" font-size="${opts.fontSize}" font-family="Arial, sans-serif" font-weight="${opts.weight || 400}" text-anchor="${opts.anchor || 'start'}">${lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`
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
  const nodes = toVisualNodes(data).slice(0, 6)
  const W = 1600
  const H = 1000
  const cx = W / 2
  const cy = H / 2
  const radiusX = 515
  const radiusY = 310
  const branchW = 330
  const branchH = 112
  const subW = 230
  const subH = 68

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#18181b"/></linearGradient><linearGradient id="center" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#a855f7"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/></filter></defs>`)
  parts.push(`<rect width="${W}" height="${H}" rx="34" fill="url(#bg)"/>`)
  parts.push(`<circle cx="1340" cy="90" r="190" fill="#7c3aed" opacity="0.12"/><circle cx="150" cy="840" r="205" fill="#22c55e" opacity="0.08"/>`)
  parts.push(`<text x="56" y="70" fill="#a78bfa" font-size="24" font-family="Arial, sans-serif" font-weight="700">GabaritoIA • Mapa Mental</text>`)

  parts.push(`<g filter="url(#shadow)"><rect x="${cx - 220}" y="${cy - 68}" width="440" height="136" rx="30" fill="url(#center)"/>${svgTextLines(wrapText(title, 28, 2), cx, cy - 18, { fill: '#fff', fontSize: 25, weight: 800, anchor: 'middle', lineHeight: 30 })}<text x="${cx}" y="${cy + 44}" fill="#ede9fe" font-size="16" font-family="Arial, sans-serif" text-anchor="middle">Tema central de revisão</text></g>`)

  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(nodes.length, 1)
    const x = cx + Math.cos(angle) * radiusX
    const y = cy + Math.sin(angle) * radiusY
    const bx = x - branchW / 2
    const by = y - branchH / 2
    const accent = colorByPriority(node.prioridade)
    const ctrlX = cx + Math.cos(angle) * 250
    const ctrlY = cy + Math.sin(angle) * 155
    parts.push(`<path d="M ${cx} ${cy} Q ${ctrlX} ${ctrlY} ${x} ${y}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>`)
    parts.push(`<g filter="url(#shadow)"><rect x="${bx}" y="${by}" width="${branchW}" height="${branchH}" rx="18" fill="#fff"/><rect x="${bx}" y="${by}" width="8" height="${branchH}" rx="4" fill="${accent}"/>${svgTextLines(wrapText(node.title, 27, 2), bx + 24, by + 31, { fill: '#18181b', fontSize: 18, weight: 800, lineHeight: 22 })}<text x="${bx + 24}" y="${by + 72}" fill="#52525b" font-size="12" font-family="Arial, sans-serif">${escapeXml(clampText(node.resumo || '', 42))}</text><text x="${bx + 24}" y="${by + 94}" fill="${accent}" font-size="11" font-family="Arial, sans-serif" font-weight="700">Prioridade ${escapeXml(node.prioridade || 'Média')}</text></g>`)

    node.children.slice(0, 2).forEach((child, ci) => {
      const side = Math.cos(angle) >= 0 ? 1 : -1
      const sx = x + side * 245
      const sy = y + (ci - 0.5) * 86
      const sbx = sx - subW / 2
      const sby = sy - subH / 2
      parts.push(`<path d="M ${x + side * branchW / 2} ${y} C ${x + side * 105} ${y} ${sx - side * 105} ${sy} ${sx - side * subW / 2} ${sy}" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>`)
      parts.push(`<rect x="${sbx}" y="${sby}" width="${subW}" height="${subH}" rx="14" fill="#27272a" stroke="#3f3f46"/>${svgTextLines(wrapText(child.title, 24, 2), sx, sy - 12, { fill: '#f4f4f5', fontSize: 13, weight: 700, anchor: 'middle', lineHeight: 16 })}<text x="${sx}" y="${sy + 24}" fill="#a1a1aa" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(clampText((child.palavrasChave || []).join(' • '), 30))}</text>`)
    })
  })

  parts.push(`<text x="${W - 56}" y="${H - 42}" fill="#71717a" font-size="16" font-family="Arial, sans-serif" text-anchor="end">Gerado com IA para revisão de concurso</text>`)
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
    canvas.width = 1600
    canvas.height = 1000
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
      toast.error('Erro ao exportar PNG')
    }
  }

  async function exportSVG() {
    if (!active || !svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(active.title || 'mapa-mental').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Brain size={13} /> GabaritoIA Visual
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Mapas Mentais com IA</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Crie mapas mentais visuais para revisar conteúdo de concursos e exporte em imagem.</p>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label">Tema central</label>
            <input className="input" placeholder="Ex: Atos Administrativos" value={tema} onChange={e => setTema(e.target.value)} />
          </div>
          <div>
            <label className="label">Banca</label>
            <input className="input" placeholder="Ex: FGV, CEBRASPE, FCC" value={banca} onChange={e => setBanca(e.target.value)} />
          </div>
          <div>
            <label className="label">Cargo / concurso</label>
            <input className="input" placeholder="Ex: Técnico Administrativo" value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
          <div>
            <label className="label">Nível</label>
            <div className="flex flex-wrap gap-2">{['Básico','Intermediário','Avançado'].map(n => <button key={n} onClick={() => setNivel(n)} className={`chip ${nivel === n ? 'chip-active' : ''}`}>{n}</button>)}</div>
          </div>
          <div>
            <label className="label">Objetivo</label>
            <div className="flex flex-wrap gap-2">{['Revisão rápida','Pré-prova','Aprofundamento'].map(o => <button key={o} onClick={() => setObjetivo(o)} className={`chip ${objetivo === o ? 'chip-active' : ''}`}>{o}</button>)}</div>
          </div>
          <div>
            <label className="label">Contexto opcional</label>
            <textarea className="input min-h-[110px] py-3" placeholder="Cole tópicos do edital ou pontos importantes..." value={contexto} onChange={e => setContexto(e.target.value)} />
          </div>
          <div>
            <label className="label">Provedor de IA</label>
            <div className="flex flex-wrap gap-2">{availableProviders.map(p => <button key={p} onClick={() => setProvider(p)} className={`chip ${provider === p ? 'chip-active' : ''}`}>{p}</button>)}</div>
          </div>
          <button onClick={gerar} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
            {loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : <><Brain size={16} /> Gerar mapa mental</>}
          </button>
        </div>

        <div className="space-y-4">
          {queue && loading && <div className="card p-4 text-sm text-zinc-300">Status: {queue.status} · {queue.progress}%</div>}

          {!active && <div className="card p-10 text-center text-zinc-500">Nenhum mapa selecionado.</div>}

          {active && (
            <>
              <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-heading font-bold text-zinc-100">{active.title}</div>
                  <div className="text-xs text-zinc-500">{active.topic}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setView('visual')} className={`btn-secondary text-xs ${view === 'visual' ? 'border-brand-500 text-brand-200' : ''}`}>Visual</button>
                  <button onClick={() => setView('estrutura')} className={`btn-secondary text-xs ${view === 'estrutura' ? 'border-brand-500 text-brand-200' : ''}`}>Estrutura</button>
                  <button onClick={exportPNG} className="btn-secondary text-xs flex items-center gap-1"><ImageIcon size={13} /> PNG</button>
                  <button onClick={exportSVG} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={13} /> SVG</button>
                </div>
              </div>

              {view === 'visual' ? (
                <div className="card overflow-auto p-2 bg-black/20">
                  <div className="min-w-[900px]" dangerouslySetInnerHTML={{ __html: svg }} />
                </div>
              ) : (
                <div className="card p-5">
                  <div className="font-heading font-bold mb-4">Estrutura do mapa</div>
                  {Array.isArray(data.nodes) ? data.nodes.map((n: any, i: number) => <NodeView key={i} node={n} />) : <div className="text-zinc-500">Sem estrutura.</div>}
                </div>
              )}
            </>
          )}

          {!!maps.length && <div className="card p-4"><div className="font-heading font-bold mb-3">Mapas recentes</div><div className="grid sm:grid-cols-2 gap-2">{maps.slice(0,6).map(m => <button key={m.id} onClick={() => setActive(m)} className="text-left rounded-xl border border-white/10 p-3 hover:border-brand-500/40"><div className="font-semibold text-sm text-zinc-200 truncate">{m.title}</div><div className="text-xs text-zinc-500 truncate">{m.topic}</div></button>)}</div></div>}
        </div>
      </div>
    </div>
  )
}
