'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, CheckCircle2, Filter, Loader2, Trash2, Upload, XCircle } from 'lucide-react'

type Book = { id: string; title: string; area?: string; totalQuestions: number; createdAt: string; answered: number; correct: number }
type Question = { id: string; number: number; externalId?: string; topic?: string; exam?: string; banca?: string; statement: string; options: string[]; correctAnswer?: string; correctIndex: number; comment?: string; selectedIndex?: number | null; isCorrect?: boolean | null }

type ImportSummary = {
  title: string
  totalQuestions: number
  alreadyImported?: boolean
  fromCache?: boolean
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function cleanExtractedText(s: string) {
  return String(s || '').replace(/\u0000/g, ' ').replace(/\s{4,}/g, ' ').trim()
}

async function hashBuffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function readJsonSafe(res: Response) {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try { return JSON.parse(raw) } catch { return { error: raw.slice(0, 180) } }
}

function safe(v?: string | null, fallback = 'Não informado') {
  const s = String(v || '').trim()
  return s || fallback
}

function inferYear(q: Question) {
  return String(q.exam || '').match(/\b(20\d{2}|19\d{2})\b/)?.[1] || ''
}

function inferUf(q: Question) {
  const exam = String(q.exam || '')
  return UFS.find(uf => new RegExp(`(?:^|[^A-Z])${uf}(?:[^A-Z]|$)`, 'i').test(exam)) || ''
}

function ImportProgressBox({ percent, stage, seconds }: { percent: number; stage: string; seconds: number }) {
  return (
    <div className="mb-6 rounded-3xl border border-brand-500/20 bg-brand-500/10 p-5">
      <div className="flex items-center gap-3 mb-4">
        <Loader2 size={22} className="animate-spin text-brand-300" />
        <div>
          <div className="font-heading font-bold text-zinc-100">Importando PDF...</div>
          <div className="text-xs text-zinc-400 mt-1">{stage}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-zinc-500">Progresso da importação</span>
        <span className="font-bold text-brand-300">{percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-800 overflow-hidden border border-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-purple-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 text-[11px] text-zinc-500">Tempo decorrido: {seconds}s · PDFs grandes podem demorar mais.</div>
    </div>
  )
}

export default function CadernosPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [activeBook, setActiveBook] = useState<Book | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [stats, setStats] = useState({ answered: 0, correct: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStage, setImportStage] = useState('Preparando arquivo...')
  const [importSeconds, setImportSeconds] = useState(0)
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [filterBanca, setFilterBanca] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterUf, setFilterUf] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { loadBooks() }, [])

  useEffect(() => {
    if (!importing) return
    setImportSeconds(0)
    const timer = window.setInterval(() => setImportSeconds(prev => prev + 1), 1000)
    return () => window.clearInterval(timer)
  }, [importing])

  async function loadBooks() {
    setLoading(true)
    try {
      const res = await fetch('/api/question-books')
      const data = await readJsonSafe(res)
      if (data?.books) setBooks(data.books)
    } catch { toast.error('Erro ao carregar cadernos') }
    setLoading(false)
  }

  async function openBook(book: Book) {
    setActiveBook(book)
    setCurrent(0)
    setQuestions([])
    setFilterBanca('')
    setFilterYear('')
    setFilterUf('')
    setSearch('')
    const res = await fetch(`/api/question-books/${book.id}`).catch(() => null)
    const data = res ? await readJsonSafe(res) : null
    if (!data?.ok) { toast.error(data?.error || 'Erro ao abrir caderno'); return }
    setQuestions(data.questions || [])
    setStats(data.stats || { answered: 0, correct: 0, total: 0 })
  }

  async function importFile(file: File) {
    setImporting(true)
    setImportProgress(2)
    setImportStage('Preparando arquivo...')
    setLastImport(null)
    try {
      let text = ''
      let fileHash = ''
      const isPdf = file.name.toLowerCase().endsWith('.pdf')

      setImportStage('Lendo arquivo...')
      setImportProgress(5)

      if (isPdf) {
        const buffer = await file.arrayBuffer()
        setImportStage('Calculando identificação do arquivo...')
        setImportProgress(8)
        fileHash = await hashBuffer(buffer)

        setImportStage('Abrindo PDF...')
        setImportProgress(12)
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
        const pdf = await pdfjs.getDocument({ data: buffer.slice(0) }).promise
        const parts: string[] = []
        const totalPages = Math.min(pdf.numPages, 2500)

        for (let i = 1; i <= totalPages; i++) {
          setImportStage(`Lendo página ${i} de ${totalPages}...`)
          setImportProgress(Math.min(72, 12 + Math.round((i / totalPages) * 60)))
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const pageText = content.items.map((x: any) => x.str || '').join(' ')
          if (pageText) parts.push(`--- PÁGINA ${i} ---\n${pageText}`)
        }
        text = parts.join('\n\n')
      } else {
        const buffer = await file.arrayBuffer()
        setImportStage('Calculando identificação do arquivo...')
        setImportProgress(25)
        fileHash = await hashBuffer(buffer)
        setImportStage('Lendo texto do arquivo...')
        setImportProgress(50)
        text = new TextDecoder('utf-8').decode(buffer)
      }

      setImportStage('Limpando texto extraído...')
      setImportProgress(75)
      text = cleanExtractedText(text)
      if (text.length < 50) { toast.error('Não consegui extrair texto do arquivo.'); return }

      setImportStage('Enviando para identificar e salvar questões...')
      setImportProgress(82)
      const res = await fetch('/api/question-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', title: file.name.replace(/\.pdf$/i, ''), text, fileHash }),
      })

      setImportStage('Finalizando caderno...')
      setImportProgress(94)
      const data = await readJsonSafe(res)
      if (!res.ok) { toast.error(data.error || 'Erro ao importar'); return }

      const summary: ImportSummary = {
        title: data.book?.title || file.name.replace(/\.pdf$/i, ''),
        totalQuestions: Number(data.book?.totalQuestions || 0),
        alreadyImported: Boolean(data.alreadyImported),
        fromCache: Boolean(data.book?.fromCache),
      }
      setLastImport(summary)
      setImportStage('Importação concluída.')
      setImportProgress(100)

      if (data.alreadyImported) toast.info('Este caderno já foi importado na sua conta. Não dupliquei o arquivo.')
      else toast.success(`${summary.totalQuestions} questões importadas${summary.fromCache ? ' pelo cache' : ''}!`)
      await loadBooks()
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao importar PDF')
    } finally {
      setImporting(false)
    }
  }

  async function answer(q: Question, idx: number) {
    if (!activeBook) return
    setAnswering(q.id)
    try {
      const res = await fetch(`/api/question-books/${activeBook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', questionId: q.id, selectedIndex: idx }),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) { toast.error(data.error || 'Erro ao responder'); return }
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, selectedIndex: idx, isCorrect: data.isCorrect } : item))
      const wasAnswered = q.selectedIndex !== null && q.selectedIndex !== undefined
      setStats(prev => ({ ...prev, answered: wasAnswered ? prev.answered : prev.answered + 1, correct: prev.correct + (data.isCorrect ? 1 : 0) - (q.isCorrect ? 1 : 0) }))
    } catch { toast.error('Erro ao responder') }
    finally { setAnswering(null) }
  }

  async function deleteBook(book: Book) {
    if (!confirm('Excluir este caderno importado? O cache global continua salvo para reaproveitamento.')) return
    const res = await fetch('/api/question-books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: book.id }) })
    if (!res.ok) { toast.error('Erro ao excluir'); return }
    if (activeBook?.id === book.id) { setActiveBook(null); setQuestions([]) }
    setBooks(prev => prev.filter(b => b.id !== book.id))
    toast.success('Caderno excluído da sua conta')
  }

  const bancos = useMemo(() => Array.from(new Set(questions.map(q => q.banca).filter(Boolean))).sort() as string[], [questions])
  const years = useMemo(() => Array.from(new Set(questions.map(inferYear).filter(Boolean))).sort().reverse(), [questions])
  const ufs = useMemo(() => Array.from(new Set(questions.map(inferUf).filter(Boolean))).sort(), [questions])

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return questions.filter(q => {
      if (filterBanca && q.banca !== filterBanca) return false
      if (filterYear && inferYear(q) !== filterYear) return false
      if (filterUf && inferUf(q) !== filterUf) return false
      if (term && !`${q.statement} ${q.topic} ${q.exam} ${q.externalId}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [questions, filterBanca, filterYear, filterUf, search])

  useEffect(() => { setCurrent(0) }, [filterBanca, filterYear, filterUf, search])

  const q = filteredQuestions[current]
  const percent = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0
  const score = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0
  const answered = q?.selectedIndex !== null && q?.selectedIndex !== undefined
  const correctLetter = q ? (q.correctAnswer || 'ABCDE'[q.correctIndex] || '') : ''

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6 rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3"><BookOpen size={13} /> Caderno com cache</div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold">Cadernos de Questões PDF</h1>
            <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Importe PDFs comentados, não importe mais que um por vez, pode acontecer de não importar todas as questões.</p>
          </div>
          <button disabled={importing} onClick={() => document.getElementById('book-file')?.click()} className="btn-primary flex items-center justify-center gap-2">
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {importing ? 'Importando...' : 'Importar PDF'}
          </button>
          <input id="book-file" type="file" accept=".pdf,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = '' }} />
        </div>
      </div>

      {importing && <ImportProgressBox percent={importProgress} stage={importStage} seconds={importSeconds} />}

      {!importing && lastImport && (
        <div className="mb-6 rounded-3xl border border-green-500/20 bg-green-500/10 p-5 text-sm text-green-100">
          <div className="font-semibold mb-1">Caderno carregado</div>
          <div>{lastImport.title} · {lastImport.totalQuestions} questão(ões) {lastImport.alreadyImported ? 'já estavam importadas' : 'importadas'}{lastImport.fromCache ? ' pelo cache' : ''}.</div>
        </div>
      )}

      {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" /></div> : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-6">
          <div className="space-y-3">
            <div className="text-xs font-bold text-brand-300 uppercase tracking-wider">Cadernos importados</div>
            {!books.length && <div className="card p-6 text-sm text-zinc-500 text-center">Nenhum caderno importado ainda.</div>}
            {books.map(book => {
              const p = book.totalQuestions ? Math.round((book.answered / book.totalQuestions) * 100) : 0
              return <div key={book.id} className={`rounded-2xl border p-4 transition-all ${activeBook?.id === book.id ? 'border-brand-500/40 bg-brand-500/10' : 'border-white/10 bg-zinc-900 hover:border-white/20'}`}>
                <button onClick={() => openBook(book)} className="w-full text-left">
                  <div className="font-semibold text-sm text-zinc-100 leading-snug">{book.title}</div>
                  <div className="text-xs text-zinc-500 mt-1">{book.totalQuestions} questões · {book.answered} respondidas</div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-3"><div className="h-full bg-brand-500" style={{ width: `${p}%` }} /></div>
                </button>
                <button onClick={() => deleteBook(book)} className="mt-3 text-[11px] text-red-300 border border-red-500/20 bg-red-500/10 rounded-lg px-2 py-1 flex items-center gap-1"><Trash2 size={12} /> Excluir</button>
              </div>
            })}
          </div>

          <div>
            {!activeBook ? <div className="card p-12 text-center text-zinc-500">Selecione um caderno importado ou envie um PDF para começar.</div> : <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-300 uppercase tracking-wider mb-3"><Filter size={13} /> Filtros</div>
                <div className="grid md:grid-cols-4 gap-3">
                  <select className="input" value={filterBanca} onChange={e => setFilterBanca(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todas as bancas</option>{bancos.map(b => <option key={b} value={b}>{b}</option>)}</select>
                  <select className="input" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todos os anos</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                  <select className="input" value={filterUf} onChange={e => setFilterUf(e.target.value)} style={{ colorScheme: 'dark' }}><option value="">Todos os estados</option>{ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select>
                  <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tópico ou texto" />
                </div>
                <div className="text-xs text-zinc-500 mt-3">Mostrando {filteredQuestions.length} de {questions.length} questões.</div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="card p-4"><div className="text-xs text-zinc-500">Progresso</div><div className="font-heading text-2xl font-bold text-white">{percent}%</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Respondidas</div><div className="font-heading text-2xl font-bold text-brand-300">{stats.answered}/{stats.total}</div></div>
                <div className="card p-4"><div className="text-xs text-zinc-500">Acertos</div><div className="font-heading text-2xl font-bold text-green-300">{score}%</div></div>
              </div>

              {!q ? <div className="card p-8 text-center text-zinc-500">Nenhuma questão encontrada com os filtros atuais.</div> : <div className="card p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-xs text-zinc-500">Questão {current + 1} de {filteredQuestions.length}</div>
                    <div className="font-heading font-bold text-lg text-white">{safe(q.topic, 'Questão importada')}</div>
                    <div className="text-xs text-zinc-500 mt-1">{safe(q.banca)} · {safe(q.exam)} · ID {safe(q.externalId, q.number ? String(q.number) : '—')}</div>
                  </div>
                  <div className="text-xs text-zinc-400">Progresso: {percent}% · Acertos: {score}%</div>
                </div>

                <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">{q.statement}</div>

                <div className="space-y-2 mt-5">
                  {q.options.map((op, idx) => {
                    const selected = q.selectedIndex === idx
                    const isCorrect = q.correctIndex === idx
                    return <button key={idx} disabled={answering === q.id} onClick={() => answer(q, idx)} className={`w-full text-left rounded-2xl border px-4 py-3 text-sm transition ${answered && isCorrect ? 'border-green-500/40 bg-green-500/10 text-green-100' : answered && selected && !isCorrect ? 'border-red-500/40 bg-red-500/10 text-red-100' : 'border-white/10 bg-zinc-900 hover:border-brand-500/30'}`}>
                      <span className="font-bold mr-2">{'ABCDE'[idx]}.</span>{op}
                    </button>
                  })}
                </div>

                {answered && <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-900 p-4">
                  <div className="flex items-center gap-2 font-bold text-sm mb-2">{q.isCorrect ? <CheckCircle2 className="text-green-400" size={17} /> : <XCircle className="text-red-400" size={17} />} Gabarito: {correctLetter}</div>
                  {q.comment && <div className="text-sm text-zinc-300 whitespace-pre-wrap">{q.comment}</div>}
                </div>}

                <div className="flex justify-between gap-3 mt-6">
                  <button className="btn-secondary" disabled={current <= 0} onClick={() => setCurrent(c => Math.max(0, c - 1))}>Anterior</button>
                  <button className="btn-primary" disabled={current >= filteredQuestions.length - 1} onClick={() => setCurrent(c => Math.min(filteredQuestions.length - 1, c + 1))}>Próxima</button>
                </div>
              </div>}
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}
