'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Brain, FileDown, Loader2 } from 'lucide-react'
import { createAIQueueJob, getAIQueueStatus, type AIQueueStatus } from '@/lib/aiQueueClient'

type MindMap = { id: string; title: string; topic: string; data: any; createdAt: string }

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
      await loadMaps()
      toast.success('Mapa mental gerado!')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao gerar mapa')
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
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(String(txt || ''), 180)
      lines.forEach((line: string) => { if (y > 280) { doc.addPage(); y = 14 } doc.text(line, 14, y); y += size * 0.45 + 2 })
    }
    const walk = (n: any, lvl = 0) => {
      add(`${'  '.repeat(lvl)}${lvl ? '•' : ''} ${n.titulo || ''}`, lvl ? 10 : 12, lvl === 0)
      if (n.resumo) add(`${'  '.repeat(lvl + 1)}${n.resumo}`, 9)
      ;(n.filhos || []).forEach((k: any) => walk(k, lvl + 1))
    }
    add('GabaritoIA — Mapa Mental', 16, true)
    add(active.data?.titulo || active.title, 14, true)
    add(active.data?.resumo || '', 10)
    y += 4
    ;(active.data?.nodes || []).forEach((n: any) => walk(n))
    if (active.data?.pegadinhas?.length) { y += 4; add('Pegadinhas', 13, true); active.data.pegadinhas.forEach((p: string) => add(`• ${p}`, 9)) }
    if (active.data?.revisaoRapida?.length) { y += 4; add('Revisão rápida', 13, true); active.data.revisaoRapida.forEach((p: string) => add(`• ${p}`, 9)) }
    doc.save(`${(active.title || 'mapa-mental').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
  }

  const data = active?.data || {}

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">🧠 Mapas Mentais</h1>
        <p className="text-zinc-400 text-sm mt-1">Crie mapas mentais para revisar conteúdos de concurso com IA.</p>
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
          <button onClick={gerar} disabled={loading || !tema.trim()} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold rounded-xl px-6 py-3.5 disabled:opacity-40 flex items-center justify-center gap-2">{loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : '🧠 Gerar mapa mental'}</button>

          {maps.length > 0 && <div className="card p-4"><div className="text-xs font-bold text-brand-300 mb-3">Mapas salvos</div><div className="space-y-2 max-h-72 overflow-y-auto">{maps.map(m => <button key={m.id} onClick={() => setActive(m)} className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div className="font-semibold text-zinc-100">{m.title}</div><div className="text-zinc-500">{new Date(m.createdAt).toLocaleDateString('pt-BR')}</div></button>)}</div></div>}
        </div>

        <div>
          {!active ? <div className="card p-12 text-center text-zinc-500"><Brain size={42} className="mx-auto mb-4 text-brand-400" /><div className="font-heading font-bold text-zinc-200">Crie seu primeiro mapa mental</div><div className="text-sm mt-2">Informe um tema e a IA organiza tudo em blocos de revisão.</div></div> : <div className="space-y-5">
            <div className="card p-5 flex justify-between gap-3"><div><h2 className="font-heading font-bold">{data.titulo || active.title}</h2><div className="text-sm text-zinc-400 mt-1">{data.resumo}</div></div><button onClick={exportPDF} className="btn-secondary text-xs flex items-center gap-1"><FileDown size={14} /> PDF</button></div>
            <div className="space-y-3">{(data.nodes || []).map((n: any, i: number) => <NodeView key={i} node={n} />)}</div>
            {data.pegadinhas?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-amber-300 mb-3">Pegadinhas de prova</div><div className="space-y-2">{data.pegadinhas.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">⚠ {p}</div>)}</div></div>}
            {data.revisaoRapida?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-brand-300 mb-3">Revisão rápida</div><div className="space-y-2">{data.revisaoRapida.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">• {p}</div>)}</div></div>}
            {data.questoesProvaveis?.length > 0 && <div className="card p-5"><div className="text-xs font-bold text-green-300 mb-3">Como pode cair</div><div className="space-y-2">{data.questoesProvaveis.map((p: string, i: number) => <div key={i} className="text-sm text-zinc-300">🎯 {p}</div>)}</div></div>}
          </div>}
        </div>
      </div>
    </div>
  )
}
