'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, CheckCircle2, Filter, Loader2, Trash2, Upload, XCircle } from 'lucide-react'

type Book = { id: string; title: string; area?: string; totalQuestions: number; createdAt: string; answered: number; correct: number }
type Question = { id: string; number: number; externalId?: string; topic?: string; exam?: string; banca?: string; statement: string; options: string[]; correctAnswer?: string; correctIndex: number; comment?: string; selectedIndex?: number | null; isCorrect?: boolean | null }

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function cleanExtractedText(s: string) {
  return String(s || '').replace(/\u0000/g, ' ').replace(/\s{4,}/g, ' ').trim()
}

async function hashBuffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
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

export default function CadernosPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [activeBook, setActiveBook] = useState<Book | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [stats, setStats] = useState({ answered: 0, correct: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [filterBanca, setFilterBanca] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterUf, setFilterUf] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { loadBooks() }, [])

  async function loadBooks() {
    setLoading(true)
    try {
      const data = await fetch('/api/question-books').then(r => r.json())
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
    const data = await fetch(`/api/question-books/${book.id}`).then(r => r.json()).catch(() => null)
    if (!data?.ok) { toast.error(data?.error || 'Erro ao abrir caderno'); return }
    setQuestions(data.questions || [])
    setStats(data.stats || { answered: 0, correct: 0, total: 0 })
  }

  async function importFile(file: File) {
    setImporting(true)
    try {
      let text = ''
      let fileHash = ''
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await file.arrayBuffer()
        fileHash = await hashBuffer(buffer)
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
        const pdf = await pdfjs.getDocument({ data: buffer.slice(0) }).promise
        const parts: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 2500); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const pageText = content.items.map((x: any) => x.str || '').join(' ')
          if (pageText) parts.push(`--- PÁGINA ${i} ---\n${pageText}`)
        }
        text = parts.join('\n\n')
      } else {
        const buffer = await file.arrayBuffer()
        fileHash = await hashBuffer(buffer)
        text = new TextDecoder('utf-8').decode(buffer)
      }

      text = cleanExtractedText(text)
      if (text.length < 50) { toast.error('Não consegui extrair texto do arquivo.'); return }

      const res = await fetch('/api/question-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', title: file.name.replace(/\.pdf$/i, ''), text, fileHash }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao importar'); return }
      if (data.alreadyImported) toast.info('Este caderno já foi importado na sua conta. Não dupliquei o arquivo.')
      else toast.success(`${data.book.totalQuestions} questões importadas${data.book.fromCache ? ' pelo cache' : ''}!`)
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
      const data = await res.json()
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
            <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Importe PDFs comentados, reaproveite cache global e filtre questões por banca, ano, UF e tópico.</p>
          </div>
          <button disabled={importing} onClick={() => document.getElementById('book-file')?.click()} className="btn-primary flex items-center justify-center gap-2">
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar PDF
          </button>
          <input id="book-file" type="file" accept=".pdf,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f) }} />
        </div>
      </div>

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

              {!q ? <div className="card p-10 text-center text-zinc-500">Nenhuma questão encontrada com esses filtros.</div> : <>
              <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900 to-brand-950/30 p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-brand-300 font-bold uppercase tracking-wider">{activeBook.title}</div>
                    <h2 className="font-heading text-xl font-bold mt-1">Questão {q.number}</h2>
                    <div className="text-xs text-zinc-500 mt-1">{safe(q.topic, 'Tópico não informado')} · {safe(q.banca, 'Banca não identificada')} · {inferYear(q) || 'Ano não identificado'} · {inferUf(q) || 'UF não identificada'}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center min-w-full md:min-w-[260px]">
                    <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="font-bold text-white">{percent}%</div><div className="text-[10px] text-zinc-500">Feito</div></div>
                    <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="font-bold text-green-300">{score}%</div><div className="text-[10px] text-zinc-500">Acerto</div></div>
                    <div className="rounded-2xl bg-black/25 border border-white/10 p-3"><div className="font-bold text-brand-300">{current + 1}/{filteredQuestions.length}</div><div className="text-[10px] text-zinc-500">Filtro</div></div>
                  </div>
                </div>
              </div>

              <div className="card p-5 md:p-6 space-y-5">
                <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
                  <div className="text-xs font-bold text-brand-300 mb-3 uppercase tracking-wider">Origem da questão</div>
                  <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl bg-black/20 border border-white/10 p-3"><div className="text-zinc-500 mb-1">ID</div><div className="text-zinc-200 font-semibold">{safe(q.externalId)}</div></div>
                    <div className="rounded-xl bg-black/20 border border-white/10 p-3"><div className="text-zinc-500 mb-1">Tópico</div><div className="text-zinc-200 font-semibold">{safe(q.topic)}</div></div>
                    <div className="rounded-xl bg-black/20 border border-white/10 p-3"><div className="text-zinc-500 mb-1">Banca</div><div className="text-zinc-200 font-semibold">{safe(q.banca, 'Não identificada')}</div></div>
                  </div>
                  <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-3 text-xs"><div className="text-zinc-500 mb-1">Prova</div><div className="text-zinc-200 font-semibold leading-relaxed">{safe(q.exam)}</div></div>
                </div>
                <div><div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Pergunta</div><p className="text-sm md:text-base leading-relaxed whitespace-pre-line text-zinc-100">{q.statement}</p></div>
                <div><div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Alternativas</div><div className="space-y-3">{(q.options || []).map((op, idx) => { const isSelected = q.selectedIndex === idx; const isCorrect = q.correctIndex === idx; const cls = answered && isCorrect ? 'border-green-500/40 bg-green-500/10 text-green-200' : answered && isSelected && !isCorrect ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-brand-500/40'; return <button key={idx} disabled={answering === q.id} onClick={() => answer(q, idx)} className={`w-full text-left rounded-2xl border p-4 text-sm transition-all ${cls}`}><div className="flex gap-3"><span className="font-bold">{'ABCDE'[idx] || idx + 1})</span><span>{op}</span>{answered && isCorrect && <CheckCircle2 size={16} className="ml-auto text-green-400" />}{answered && isSelected && !isCorrect && <XCircle size={16} className="ml-auto text-red-400" />}</div></button> })}</div></div>
                {answered && <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4"><div className="flex flex-wrap items-center gap-2 mb-3"><div className="text-xs font-bold text-brand-300 uppercase tracking-wider">Resposta e comentário</div><span className={`text-[11px] rounded-full px-2 py-1 border ${q.isCorrect ? 'border-green-500/20 bg-green-500/10 text-green-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>{q.isCorrect ? 'Você acertou' : 'Você errou'}</span><span className="text-[11px] rounded-full px-2 py-1 border border-white/10 bg-black/20 text-zinc-300">Resposta: {correctLetter}</span></div><div className="text-sm text-zinc-300 leading-relaxed">{q.comment || 'Comentário não informado.'}</div></div>}
              </div>
              <div className="flex justify-between gap-3"><button className="btn-secondary" disabled={current === 0} onClick={() => setCurrent(c => Math.max(0, c - 1))}>Anterior</button><button className="btn-primary" disabled={current >= filteredQuestions.length - 1} onClick={() => setCurrent(c => Math.min(filteredQuestions.length - 1, c + 1))}>Próxima</button></div>
              </>}
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}
