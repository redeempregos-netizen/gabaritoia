'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'

interface Question {
  id: string
  area: string
  banca: string
  difficulty: string
  type: string
  enunciado: string
  options: string[]
  correctIndex: number
  comentario: string
  subtopic?: string
}

export default function EditalPage() {
  const [editalText, setEditalText] = useState('')
  const [fileName, setFileName] = useState('')
  const [difficulty, setDifficulty] = useState('Média')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answered, setAnswered] = useState<Record<string, number>>({})
  const [dragging, setDragging] = useState(false)
  const [provider, setProvider] = useState('claude')

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
  }, [])

  function processFile(file: File) {
    setFileName(file.name)
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer)
        let text = ''
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] > 31 && arr[i] < 127) text += String.fromCharCode(arr[i])
        }
        setEditalText(text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{3,}/g, ' ').substring(0, 5000))
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => setEditalText((e.target?.result as string).substring(0, 5000))
      reader.readAsText(file, 'utf-8')
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function gerar() {
    if (!editalText) { toast.error('Faça upload do edital primeiro'); return }
    setLoading(true)
    setQuestions([])
    setAnswered({})
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banca: 'Edital',
          area: 'Conteúdo do edital',
          difficulty,
          type: 'MULTIPLE_CHOICE',
          format: 'Questão inédita',
          quantity,
          editalText,
          provider,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar'); return }
      setQuestions(data.questions)
      toast.success(`${data.questions.length} questão(ões) gerada(s) do edital!`)
    } catch {
      toast.error('Erro ao gerar questões')
    } finally {
      setLoading(false)
    }
  }

  function responder(qId: string, idx: number, correctIndex: number) {
    if (answered[qId] !== undefined) return
    setAnswered(prev => ({ ...prev, [qId]: idx }))
    fetch('/api/ai/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: qId, selectedIdx: idx }),
    }).catch(() => {})
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">📄 Edital Verticalizado</h1>
        <p className="text-zinc-400 text-sm mt-1">Suba seu edital e a IA gera questões personalizadas</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {/* Upload */}
          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-4 ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`}
            onClick={() => document.getElementById('edital-file')?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={32} className="mx-auto mb-3 text-zinc-500" />
            <div className="font-heading font-semibold mb-1">
              {fileName || 'Arraste o edital aqui'}
            </div>
            <div className="text-sm text-zinc-500">
              {editalText ? `${Math.round(editalText.length / 100) / 10}kb extraídos` : 'PDF, TXT ou DOC — ou clique para selecionar'}
            </div>
            {editalText && <div className="mt-2 text-xs text-green-400">✓ Edital carregado com sucesso</div>}
          </div>
          <input type="file" id="edital-file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={handleFile} />

          {/* Config */}
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Dificuldade</label>
              <div className="flex gap-2">
                {['Fácil', 'Média', 'Difícil'].map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`chip ${difficulty === d ? 'chip-active' : ''}`}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Quantidade</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 5, 10].map(n => (
                  <button key={n} onClick={() => setQuantity(n)}
                    className={`w-10 h-10 rounded-xl border text-sm font-semibold transition-all ${quantity === n ? 'bg-brand-600 border-brand-500 text-white' : 'border-white/10 text-zinc-400 hover:border-brand-500'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={gerar} disabled={loading || !editalText}
            className="w-full mt-4 bg-gradient-to-r from-brand-600 to-purple-600 text-white font-semibold rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40">
            {loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : '📄 Gerar questões do edital'}
          </button>

          {/* Passos */}
          {!editalText && (
            <div className="mt-4 space-y-2">
              {[
                { n: 1, t: 'Suba o edital', s: 'PDF ou TXT do programa do concurso' },
                { n: 2, t: 'Configure', s: 'Quantidade e dificuldade' },
                { n: 3, t: 'Estude', s: 'A IA cria questões baseadas no programa' },
                { n: 4, t: 'Progresso salvo', s: 'Registrado no histórico automaticamente' },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-3 p-3 bg-zinc-900 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold flex-shrink-0">{step.n}</div>
                  <div>
                    <div className="text-sm font-medium">{step.t}</div>
                    <div className="text-xs text-zinc-500">{step.s}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Questões */}
        <div>
          {loading && (
            <div className="card p-8 text-center">
              <Loader2 size={32} className="animate-spin text-brand-400 mx-auto mb-4" />
              <div className="text-zinc-400 text-sm">Gerando questões do edital...</div>
            </div>
          )}
          {!loading && questions.length === 0 && editalText && (
            <div className="card p-8 text-center">
              <div className="text-3xl mb-3">📋</div>
              <div className="text-zinc-300 font-medium">Edital carregado!</div>
              <div className="text-zinc-500 text-sm mt-1">Configure e clique em gerar</div>
            </div>
          )}
          {questions.map(q => {
            const sel = answered[q.id]
            return (
              <div key={q.id} className="card p-5 mb-4">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400">Do Edital</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300">{q.area}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full ${q.difficulty === 'Fácil' ? 'bg-green-500/10 text-green-400' : q.difficulty === 'Difícil' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{q.difficulty}</span>
                  {q.subtopic && <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">{q.subtopic}</span>}
                </div>
                <p className="text-sm leading-relaxed mb-4">{q.enunciado}</p>
                <div className="space-y-2 mb-3">
                  {(q.options as string[]).map((opt, i) => {
                    let cls = 'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all text-sm '
                    if (sel === undefined) cls += 'border-white/[0.07] text-zinc-300 hover:border-brand-500/50'
                    else if (i === q.correctIndex) cls += 'border-green-500 bg-green-500/8 text-zinc-100'
                    else if (i === sel && sel !== q.correctIndex) cls += 'border-red-500 bg-red-500/8 text-zinc-100'
                    else cls += 'border-white/[0.04] text-zinc-500'
                    return (
                      <div key={i} className={cls} onClick={() => responder(q.id, i, q.correctIndex)}>
                        <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{'ABCDE'[i]}</span>
                        <span>{opt}</span>
                      </div>
                    )
                  })}
                </div>
                {sel !== undefined && (
                  <div className="bg-zinc-800/60 border-l-2 border-brand-500 rounded-r-xl p-4 text-sm text-zinc-300 leading-relaxed">
                    <span className="font-semibold text-brand-300">💡 Comentário:</span><br />{q.comentario}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
