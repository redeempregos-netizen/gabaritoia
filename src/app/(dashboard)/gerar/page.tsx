'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Upload, Search, FileText, Target } from 'lucide-react'

const DIFS = ['Fácil', 'Média', 'Difícil']
const TIPOS = ['MULTIPLE_CHOICE', 'TRUE_FALSE']
const TIPO_LABELS: Record<string, string> = { MULTIPLE_CHOICE: 'Múltipla escolha', TRUE_FALSE: 'Certo ou Errado' }
const FMTS = ['Estilo banca', 'Questão inédita']
const ESCOLARIDADES = ['Fundamental incompleto', 'Fundamental completo', 'Médio completo', 'Técnico (curso técnico específico)', 'Nível Superior', 'Pós-graduação']
const BANCAS = ['CEBRASPE', 'CESPE', 'FCC', 'FGV', 'VUNESP', 'IBFC', 'IDECAN', 'FURB', 'FEPESE', 'FAURGS', 'FUNDATEC', 'AOCP', 'INSTITUTO AOCP', 'QUADRIX', 'CONSULPLAN', 'OBJETIVA', 'LEGALLE', 'FAFIPA', 'AVANÇA SP']
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

interface Question {
  id: string
  banca: string
  area: string
  difficulty: string
  type: string
  enunciado: string
  options: string[]
  correctIndex: number
  comentario: string
  subtopic?: string
  cargo?: string
  examName?: string
  examYear?: string
  basedOn?: string
  isOriginal?: boolean
  aiProvider?: string
}

type LastError = { message: string; action: string; details?: Record<string, any> }

function RequiredBadge() { return <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">Obrigatório</span> }
function OptionalBadge() { return <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Opcional</span> }

function parseOrigin(q: Question) {
  const text = String(q.enunciado || '')
  const [firstLine, ...rest] = text.split('\n')
  const hasHeader = firstLine.toLowerCase().startsWith('banca:')
  const meta: Record<string, string> = {}
  if (hasHeader) {
    firstLine.split('|').forEach(part => {
      const [key, ...value] = part.split(':')
      if (key && value.length) meta[key.trim().toLowerCase()] = value.join(':').trim()
    })
  }
  return { banca: q.banca || meta.banca || 'Não informada', prova: q.examName || meta.prova || q.cargo || 'Concurso público', ano: q.examYear || meta.ano || '', baseado: q.basedOn || meta['baseado em'] || q.subtopic || q.area, pergunta: hasHeader ? rest.join('\n').trim() : text.trim() }
}

function detectarBanca(texto: string) { const upper = texto.toUpperCase(); return BANCAS.find(banca => upper.includes(banca)) || '' }
function detectarAno(texto: string) { return texto.match(/\b(20[0-3][0-9])\b/)?.[1] || '' }
function detectarUf(texto: string) { const upper = texto.toUpperCase(); return UFS.find(uf => new RegExp(`(?:^|[^A-Z])${uf}(?:[^A-Z]|$)`).test(upper)) || '' }
function detectarCidade(texto: string) {
  const m = texto.match(/(?:prefeitura|munic[ií]pio|cidade|c[aâ]mara municipal)\s+(?:municipal\s+)?(?:de|do|da)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú\s]{2,60})(?:\s*[-/]\s*[A-Z]{2})?/i)
  return m?.[1]?.replace(/\s{2,}/g, ' ').trim() || ''
}
function detectarCargos(texto: string) {
  const encontrados = new Set<string>()
  const linhas = texto.split(/\n|\r|\.|;/).map(l => l.trim()).filter(Boolean)
  linhas.forEach(linha => {
    const clean = linha.replace(/\s+/g, ' ').trim()
    const matchCargo = clean.match(/(?:cargo|emprego|função|vaga)\s*(?:de|para|:|-)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú0-9ºª\s\/\-]{3,70})/i)
    if (matchCargo?.[1]) encontrados.add(matchCargo[1].replace(/\s{2,}/g, ' ').trim())
    const matchEscolaridade = clean.match(/(Agente|Analista|Assistente|Auxiliar|Técnico|Professor|Contador|Fiscal|Motorista|Enfermeiro|Médico|Procurador|Guarda|Operador|Pedagogo|Psicólogo|Farmacêutico|Engenheiro)[A-Za-zÀ-ú0-9ºª\s\/\-]{2,70}/i)
    if (matchEscolaridade?.[0]) encontrados.add(matchEscolaridade[0].replace(/\s{2,}/g, ' ').trim())
  })
  return Array.from(encontrados).slice(0, 12)
}

export default function GerarPage() {
  const [banca, setBanca] = useState('')
  const [area, setArea] = useState('')
  const [cargo, setCargo] = useState('')
  const [city, setCity] = useState('')
  const [uf, setUf] = useState('')
  const [education, setEducation] = useState('Nível Superior')
  const [difficulty, setDifficulty] = useState('Média')
  const [type, setType] = useState('MULTIPLE_CHOICE')
  const [format, setFormat] = useState('Estilo banca')
  const [quantity, setQuantity] = useState(1)
  const [maxQtd, setMaxQtd] = useState(10)
  const [provider, setProvider] = useState('claude')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['claude'])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchingWeb, setSearchingWeb] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answered, setAnswered] = useState<Record<string, number>>({})
  const [savingAnswer, setSavingAnswer] = useState<Record<string, boolean>>({})
  const [editalRef, setEditalRef] = useState('')
  const [editalYear, setEditalYear] = useState('')
  const [editalText, setEditalText] = useState('')
  const [editalFileName, setEditalFileName] = useState('')
  const [detectedCargos, setDetectedCargos] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [webQuery, setWebQuery] = useState('')
  const [webResults, setWebResults] = useState<any[]>([])
  const [lastError, setLastError] = useState<LastError | null>(null)
  const [reportingError, setReportingError] = useState(false)
  const generateLockRef = useRef(false)

  useEffect(() => { carregarUsuario() }, [])
  async function carregarUsuario() {
    try {
      const meRes = await fetch('/api/auth/me')
      const me = await meRes.json()
      const admin = meRes.ok && me.user?.role === 'ADMIN'
      setIsAdmin(admin)
      if (!admin) { setUseWebSearch(false); return }
      const res = await fetch('/api/admin/stats')
      if (!res.ok) return
      const data = await res.json()
      const cfg = data.config?.maxQtd
      if (cfg) setMaxQtd(Number(cfg))
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) { setAvailableProviders(keys); const def = data.config?.defaultProvider; setProvider(def && keys.includes(def) ? def : keys[0]) }
    } catch { setIsAdmin(false); setUseWebSearch(false) }
  }

  function handleError(message: string, action: string, details?: Record<string, any>) { setLastError({ message, action, details }); toast.error(message) }

  async function reportarErro() {
    if (!lastError) return
    setReportingError(true)
    try {
      const res = await fetch('/api/report-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: lastError.message, action: lastError.action, page: 'Gerador de Questões', url: window.location.href, userAgent: navigator.userAgent, timestamp: new Date().toISOString(), details: lastError.details }) })
      if (!res.ok) throw new Error('Falha ao reportar')
      toast.success('Erro reportado ao administrador')
      setLastError(null)
    } catch { toast.error('Não foi possível reportar o erro') }
    finally { setReportingError(false) }
  }

  function aplicarTextoDoEdital(raw: string) {
    const cleaned = raw.replace(/\s{3,}/g, ' ').substring(0, 8000)
    setEditalText(cleaned)
    const bancaDetectada = detectarBanca(cleaned)
    if (bancaDetectada && !banca.trim()) { setBanca(bancaDetectada); toast.success(`Banca detectada: ${bancaDetectada}`) }
    const anoDetectado = detectarAno(cleaned)
    if (anoDetectado && !editalYear.trim()) setEditalYear(anoDetectado)
    const ufDetectada = detectarUf(cleaned)
    if (ufDetectada && !uf.trim()) setUf(ufDetectada)
    const cidadeDetectada = detectarCidade(cleaned)
    if (cidadeDetectada && !city.trim()) setCity(cidadeDetectada)
    const cargos = detectarCargos(cleaned)
    setDetectedCargos(cargos)
    toast.success('Edital carregado para contexto das questões')
  }

  function processEditalFile(file: File) {
    setEditalFileName(file.name)
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = e => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer)
        let text = ''
        for (let i = 0; i < arr.length; i++) if (arr[i] > 31 && arr[i] < 127) text += String.fromCharCode(arr[i])
        aplicarTextoDoEdital(text.replace(/[^\x20-\x7E\n]/g, ' '))
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => aplicarTextoDoEdital(String(e.target?.result || ''))
      reader.readAsText(file, 'utf-8')
    }
  }

  async function buscarWebContexto() {
    if (!isAdmin) return []
    const q = (webQuery || editalRef || `${banca} ${cargo} ${city} ${uf} ${area} concurso questões edital`).trim()
    if (!q) { handleError('Informe uma busca para usar a SerpAPI', 'search_web_validation', { webQuery, editalRef, banca, cargo, city, uf, area }); return [] }
    setSearchingWeb(true)
    try {
      const res = await fetch('/api/search/web', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, maxResults: 5 }) })
      const data = await res.json()
      if (!res.ok) { handleError(data.error || 'Erro na busca web', 'search_web', { status: res.status, query: q, response: data }); return [] }
      setWebResults(data.results || [])
      toast.success(data.cached ? 'Referências recuperadas do cache' : 'Referências encontradas na web')
      return data.results || []
    } catch (e) { handleError('Erro na busca web', 'search_web_exception', { error: (e as Error).message, query: q }); return [] }
    finally { setSearchingWeb(false) }
  }

  async function gerar() {
    if (generateLockRef.current || loading || searchingWeb) { toast.info('Já existe uma geração em andamento'); return }
    if (!banca.trim()) { toast.error('Informe o nome da banca'); return }
    if (!area.trim()) { toast.error('Informe a área do conhecimento'); return }
    generateLockRef.current = true; setLoading(true); setQuestions([]); setAnswered({}); setLastError(null)
    try {
      const results = isAdmin && useWebSearch ? await buscarWebContexto() : []
      const webContext = results.length ? `REFERÊNCIAS PÚBLICAS ENCONTRADAS NA WEB:\n${results.map((r: any, i: number) => `${i + 1}. ${r.title}\nFonte: ${r.displayedLink || r.source || r.link}\nResumo: ${r.snippet}`).join('\n\n')}` : ''
      const contextoEdital = [editalRef.trim() ? `REFERÊNCIA DO EDITAL/CONCURSO: ${editalRef.trim()}` : '', editalYear.trim() ? `ANO DO EDITAL/PROVA: ${editalYear.trim()}` : '', city.trim() ? `CIDADE/MUNICÍPIO: ${city.trim()}` : '', uf.trim() ? `UF/ESTADO: ${uf.trim()}` : '', cargo.trim() ? `CARGO/FUNÇÃO: ${cargo.trim()}` : '', webContext, editalText.trim() ? `TRECHO EXTRAÍDO DO EDITAL ORIGINAL: ${editalText.trim()}` : ''].filter(Boolean).join('\n\n')
      const payload = { banca, area, cargo, city, uf, education, difficulty, type, format, quantity, provider, editalText: contextoEdital || undefined }
      const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { handleError(data.error || 'Erro ao gerar', 'generate_question', { status: res.status, payload, response: data }); return }
      setQuestions(data.questions)
      toast.success(`${data.questions.length} questão(ões) gerada(s)!`)
    } catch (e) { handleError('Erro ao gerar questão', 'generate_question_exception', { error: (e as Error).message, banca, area, cargo, city, uf, quantity }) }
    finally { setLoading(false); generateLockRef.current = false }
  }

  async function responder(q: Question, idx: number) {
    if (answered[q.id] !== undefined || savingAnswer[q.id]) return
    setSavingAnswer(prev => ({ ...prev, [q.id]: true }))
    try {
      const res = await fetch('/api/ai/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, selectedIdx: idx }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível registrar a resposta')
        return
      }
      setAnswered(p => ({ ...p, [q.id]: idx }))
    } catch {
      toast.error('Não foi possível registrar a resposta')
    } finally {
      setSavingAnswer(prev => ({ ...prev, [q.id]: false }))
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">✦ Gerar Questão</h1>
        <p className="text-zinc-400 text-sm mt-1">A IA cria questões no estilo da banca com origem, prova, ano e base de conteúdo.</p>
      </div>
      <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
        <strong>Quanto mais informações você preencher, melhor fica a questão.</strong> Banca e área são obrigatórias. Cargo, cidade, UF, ano e edital são opcionais, mas deixam a questão mais próxima da prova real.
      </div>
      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-heading text-sm font-semibold text-brand-300 mb-4">1. Banca <RequiredBadge /></div>
            <input className="input" placeholder="Ex: CEBRASPE, FCC, FGV, FEPESE, FAURGS..." value={banca} onChange={e => setBanca(e.target.value)} />
            <p className="text-xs text-zinc-600 mt-2">Obrigatório. Define o estilo da cobrança, pegadinhas e linguagem da questão.</p>
          </div>
          <div className="card p-5">
            <div className="font-heading text-sm font-semibold text-brand-300 mb-4">2. Área do conhecimento <RequiredBadge /></div>
            <input className="input" placeholder="Ex: Direito Constitucional, Matemática, Informática..." value={area} onChange={e => setArea(e.target.value)} />
            <p className="text-xs text-zinc-600 mt-2">Obrigatório. Limita o conteúdo técnico que a IA pode cobrar.</p>
          </div>
          <div className="card p-5 space-y-4">
            <div className="font-heading text-sm font-semibold text-brand-300">3. Contexto do edital <OptionalBadge /></div>
            <div><label className="label">Referência do edital/concurso <OptionalBadge /></label><input className="input" placeholder="Ex: Prefeitura de Florianópolis — Administrativo" value={editalRef} onChange={e => setEditalRef(e.target.value)} /><p className="text-xs text-zinc-600 mt-2">Ajuda a montar a origem da questão: órgão, prova, cargo e contexto.</p></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="label">Ano <OptionalBadge /></label><input className="input" placeholder="2026" value={editalYear} onChange={e => setEditalYear(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div><div><label className="label">UF <OptionalBadge /></label><select className="input" value={uf} onChange={e => setUf(e.target.value)}><option value="">Selecione</option>{UFS.map(item => <option key={item} value={item}>{item}</option>)}</select></div></div>
            <div><label className="label">Cidade/Município <OptionalBadge /></label><input className="input" placeholder="Ex: Florianópolis" value={city} onChange={e => setCity(e.target.value)} /></div>
            {isAdmin ? <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={useWebSearch} onChange={e => setUseWebSearch(e.target.checked)} /><span>Buscar referências públicas na web com SerpAPI</span></label>{useWebSearch && <div className="space-y-2"><input className="input" placeholder="Ex: edital Florianópolis 2026 banca cargo" value={webQuery} onChange={e => setWebQuery(e.target.value)} /><button type="button" onClick={buscarWebContexto} disabled={searchingWeb} className="btn-secondary text-xs flex items-center gap-1">{searchingWeb ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar agora</button>{webResults.length > 0 && <div className="space-y-1 max-h-40 overflow-y-auto">{webResults.map((r, i) => <div key={i} className="text-[11px] text-zinc-500 border border-white/5 rounded-lg p-2"><div className="text-zinc-300 font-medium">{r.title}</div><div>{r.snippet}</div></div>)}</div>}</div>}</div> : <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-3 text-xs text-zinc-400"><div className="flex items-center justify-between gap-3"><span>Buscar referências públicas na web com SerpAPI</span><span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-300">Em breve</span></div></div>}
            <div className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`} onClick={() => document.getElementById('gerar-edital-file')?.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processEditalFile(f) }}>
              <Upload size={24} className="mx-auto mb-2 text-zinc-500" /><div className="font-heading font-semibold text-sm mb-1">{editalFileName || 'Enviar edital original (opcional)'}</div><div className="text-xs text-zinc-500">PDF ou TXT — tenta reconhecer banca, ano, UF, cidade e cargos</div>{editalText && <div className="mt-2 text-xs text-green-400">✓ {Math.round(editalText.length / 100) / 10}kb de contexto carregado</div>}
            </div>
            <input type="file" id="gerar-edital-file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processEditalFile(f) }} />
            {editalText && <button type="button" className="btn-secondary text-xs" onClick={() => { setEditalText(''); setEditalFileName(''); setDetectedCargos([]) }}>Remover edital carregado</button>}
            {detectedCargos.length > 0 && <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3"><div className="text-xs font-semibold text-brand-300 mb-2">Cargos encontrados no edital</div><div className="flex flex-wrap gap-2">{detectedCargos.map(c => <button key={c} type="button" onClick={() => setCargo(c)} className="chip text-xs">{c}</button>)}</div></div>}
          </div>
          <div className="card p-5 space-y-4">
            <div className="font-heading text-sm font-semibold text-brand-300">4. Configurações <OptionalBadge /></div>
            <div><label className="label">Cargo pretendido <OptionalBadge /></label><input className="input" placeholder="Ex: Agente Administrativo, Analista..." value={cargo} onChange={e => setCargo(e.target.value)} /><p className="text-xs text-zinc-600 mt-2">Opcional, mas recomendado. Ajusta o nível e o contexto da pergunta.</p></div>
            <div><label className="label">Nível de escolaridade <OptionalBadge /></label><div className="flex flex-wrap gap-2">{ESCOLARIDADES.map(e => <button key={e} onClick={() => setEducation(e)} className={`chip text-xs ${education === e ? 'chip-active' : ''}`}>{e}</button>)}</div></div>
            <div><label className="label">Dificuldade</label><div className="flex gap-2">{DIFS.map(d => <button key={d} onClick={() => setDifficulty(d)} className={`chip ${difficulty === d ? 'chip-active' : ''}`}>{d}</button>)}</div></div>
            <div><label className="label">Tipo de questão</label><div className="flex gap-2">{TIPOS.map(t => <button key={t} onClick={() => setType(t)} className={`chip ${type === t ? 'chip-active' : ''}`}>{TIPO_LABELS[t]}</button>)}</div></div>
            <div><label className="label">Formato</label><div className="flex gap-2">{FMTS.map(f => <button key={f} onClick={() => setFormat(f)} className={`chip ${format === f ? 'chip-active' : ''}`}>{f}</button>)}</div></div>
            {isAdmin && <div><label className="label">Provedor de IA</label><div className="flex flex-wrap gap-2">{availableProviders.map(p => { const labels: Record<string,string> = {claude:'🟠 Claude',openai:'🟢 ChatGPT',gemini:'🔵 Gemini',grok:'⚡ Grok',openrouter:'🔶 OpenRouter'}; return <button key={p} onClick={() => setProvider(p)} className={`chip ${provider === p ? 'chip-active' : ''}`}>{labels[p] || p}</button> })}</div></div>}
            <div><label className="label">Quantidade ({maxQtd} máx.)</label><div className="flex flex-wrap gap-2">{Array.from({ length: maxQtd }, (_, i) => i + 1).map(n => <button key={n} onClick={() => setQuantity(n)} className={`w-9 h-9 rounded-xl border text-sm font-semibold transition-all ${quantity === n ? 'bg-brand-600 border-brand-500 text-white' : 'border-white/10 text-zinc-400 hover:border-brand-500'}`}>{n}</button>)}</div></div>
          </div>
          <button onClick={gerar} disabled={loading || searchingWeb || generateLockRef.current} className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-semibold rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40">{loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : searchingWeb ? <><Loader2 size={16} className="animate-spin" />Buscando...</> : '✦ Gerar questões com IA'}</button>
        </div>
        <div>
          {lastError && <div className="card p-4 mb-4 border-red-500/30 bg-red-500/10"><div className="flex items-start gap-3"><AlertTriangle size={18} className="text-red-300 mt-0.5 shrink-0" /><div className="flex-1"><div className="font-semibold text-red-200 text-sm">Ocorreu um erro</div><div className="text-xs text-red-100/80 mt-1">{lastError.message}</div><div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={gerar} className="btn-secondary text-xs">Tentar novamente</button><button type="button" onClick={reportarErro} disabled={reportingError} className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50">{reportingError ? 'Reportando...' : 'Reportar erro'}</button></div></div></div></div>}
          {loading && <div className="card p-8 text-center"><Loader2 size={32} className="animate-spin text-brand-400 mx-auto mb-4" /><div className="text-zinc-400 text-sm">Gerando questões...</div></div>}
          {!loading && questions.length === 0 && <div className="card p-12 text-center"><div className="text-4xl mb-4">✦</div><div className="text-zinc-300 font-medium mb-1">Configure e gere sua questão</div><div className="text-zinc-500 text-sm">A IA cria com origem, gabarito e comentário detalhado</div></div>}
          {questions.map(q => { const sel = answered[q.id]; const isTF = q.type === 'TRUE_FALSE'; const origin = parseOrigin(q); const correctLabel = isTF ? (q.correctIndex === 0 ? 'Certo' : 'Errado') : 'ABCDE'[q.correctIndex]; return <div key={q.id} className="card p-5 mb-4 overflow-hidden"><div className="flex flex-wrap gap-2 mb-4"><span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 uppercase font-semibold">{origin.banca}</span><span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300">{q.area}</span><span className={`text-xs px-2.5 py-1 rounded-full ${q.difficulty === 'Fácil' ? 'bg-green-500/10 text-green-400' : q.difficulty === 'Difícil' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{q.difficulty}</span>{q.isOriginal && <span className="text-xs px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400">Inédita</span>}{q.subtopic && <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">{q.subtopic}</span>}</div><div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 mb-5"><div className="flex items-center gap-2 text-xs font-bold text-brand-300 uppercase tracking-wider mb-3"><FileText size={14} /> Origem da questão</div><div className="grid sm:grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">Banca</div><div className="font-semibold text-zinc-100">{origin.banca}</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">Prova</div><div className="font-semibold text-zinc-100">{origin.prova}</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">Ano</div><div className="font-semibold text-zinc-100">{origin.ano || 'Não informado'}</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">Baseado em</div><div className="font-semibold text-zinc-100">{origin.baseado}</div></div></div></div><div className="mb-4"><div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2"><Target size={13} /> Pergunta</div><p className="text-sm md:text-base leading-relaxed whitespace-pre-line text-zinc-100">{origin.pergunta}</p></div><div className="space-y-2 mb-3">{q.options.map((opt, i) => { let cls = 'flex items-start gap-3 p-3 rounded-xl border transition-all text-sm '; if (sel === undefined) cls += 'cursor-pointer border-white/[0.07] text-zinc-300 hover:border-brand-500/50 hover:bg-brand-500/5'; if (sel !== undefined && i === q.correctIndex) cls += 'border-green-500/50 bg-green-500/10 text-green-200'; else if (sel === i && i !== q.correctIndex) cls += 'border-red-500/50 bg-red-500/10 text-red-200'; return <button key={i} onClick={() => responder(q, i)} className={cls} disabled={sel !== undefined || savingAnswer[q.id]}><span className="font-bold">{isTF ? (i === 0 ? 'C' : 'E') : 'ABCDE'[i]}</span><span>{savingAnswer[q.id] && sel === undefined ? 'Registrando...' : opt}</span></button> })}</div>{sel !== undefined && <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 mt-4"><div className="text-sm font-semibold text-green-300 mb-2">Gabarito: {correctLabel}</div><div className="text-sm text-zinc-300 whitespace-pre-line">{q.comentario}</div></div>}</div> })}
        </div>
      </div>
    </div>
  )
}
