'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'

const DIFS = ['Fácil', 'Média', 'Difícil']
const TIPOS = ['MULTIPLE_CHOICE', 'TRUE_FALSE']
const TIPO_LABELS: Record<string, string> = { MULTIPLE_CHOICE: 'Múltipla escolha', TRUE_FALSE: 'Certo ou Errado' }
const FMTS = ['Estilo banca', 'Questão inédita']
const ESCOLARIDADES = ['Fundamental incompleto', 'Fundamental completo', 'Médio completo', 'Técnico (curso técnico específico)', 'Nível Superior', 'Pós-graduação']

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
  isOriginal?: boolean
  aiProvider?: string
}

export default function GerarPage() {
  const [banca, setBanca] = useState('')
  const [area, setArea] = useState('')
  const [cargo, setCargo] = useState('')
  const [education, setEducation] = useState('Nível Superior')
  const [difficulty, setDifficulty] = useState('Média')
  const [type, setType] = useState('MULTIPLE_CHOICE')
  const [format, setFormat] = useState('Estilo banca')
  const [quantity, setQuantity] = useState(1)
  const [maxQtd, setMaxQtd] = useState(10)
  const [provider, setProvider] = useState('claude')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['claude'])
  const [loading, setLoading] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answered, setAnswered] = useState<Record<string, number>>({})
  const [editalRef, setEditalRef] = useState('')
  const [editalText, setEditalText] = useState('')
  const [editalFileName, setEditalFileName] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(data => {
      const cfg = data.config?.maxQtd
      if (cfg) setMaxQtd(Number(cfg))
      const keys = (data.apiKeys || []).filter((k: any) => k.hasKey && k.isEnabled).map((k: any) => k.provider)
      if (keys.length > 0) {
        setAvailableProviders(keys)
        const def = data.config?.defaultProvider
        setProvider(def && keys.includes(def) ? def : keys[0])
      }
    }).catch(() => {})
  }, [])

  function processEditalFile(file: File) {
    setEditalFileName(file.name)
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = e => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer)
        let text = ''
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] > 31 && arr[i] < 127) text += String.fromCharCode(arr[i])
        }
        const cleaned = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{3,}/g, ' ').substring(0, 8000)
        setEditalText(cleaned)
        toast.success('Edital carregado para contexto das questões')
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        setEditalText(String(e.target?.result || '').replace(/\s{3,}/g, ' ').substring(0, 8000))
        toast.success('Edital carregado para contexto das questões')
      }
      reader.readAsText(file, 'utf-8')
    }
  }

  async function gerar() {
    if (!banca.trim()) { toast.error('Informe o nome da banca'); return }
    if (!area.trim()) { toast.error('Informe a área do conhecimento'); return }
    setLoading(true)
    setQuestions([])
    setAnswered({})
    try {
      const contextoEdital = [
        editalRef.trim() ? `REFERÊNCIA DO EDITAL/CONCURSO: ${editalRef.trim()}` : '',
        editalText.trim() ? `TRECHO EXTRAÍDO DO EDITAL ORIGINAL: ${editalText.trim()}` : '',
      ].filter(Boolean).join('\n\n')

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banca, area, cargo, education, difficulty, type, format, quantity, provider, editalText: contextoEdital || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao gerar'); return }
      setQuestions(data.questions)
      toast.success(`${data.questions.length} questão(ões) gerada(s)!`)
    } catch (e) {
      toast.error('Erro ao gerar questão')
    } finally {
      setLoading(false)
    }
  }

  async function responder(qId: string, idx: number, correctIndex: number) {
    if (answered[qId] !== undefined) return
    setAnswered(prev => ({ ...prev, [qId]: idx }))
    try {
      await fetch('/api/ai/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId, selectedIdx: idx }),
      })
    } catch {}
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">✦ Gerar Questão</h1>
        <p className="text-zinc-400 text-sm mt-1">A IA cria questões no estilo de qualquer banca</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Config */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-heading text-sm font-semibold text-brand-300 mb-4">1. Banca</div>
            <input
              className="input"
              placeholder="Ex: CEBRASPE, FCC, FGV, FEPESE, FAURGS..."
              value={banca}
              onChange={e => setBanca(e.target.value)}
            />
            <p className="text-xs text-zinc-600 mt-2">A IA conhece centenas de bancas e imita o estilo de cada uma</p>
          </div>

          <div className="card p-5">
            <div className="font-heading text-sm font-semibold text-brand-300 mb-4">2. Área do conhecimento</div>
            <input
              className="input"
              placeholder="Ex: Direito Constitucional, Matemática, Informática..."
              value={area}
              onChange={e => setArea(e.target.value)}
            />
          </div>

          <div className="card p-5 space-y-4">
            <div className="font-heading text-sm font-semibold text-brand-300">3. Contexto do edital</div>
            <div>
              <label className="label">Referência do edital/concurso</label>
              <input
                className="input"
                placeholder="Ex: Prefeitura de Florianópolis 2023 FEPESE — Professor"
                value={editalRef}
                onChange={e => setEditalRef(e.target.value)}
              />
              <p className="text-xs text-zinc-600 mt-2">Use para orientar a IA sobre órgão, ano, cidade ou cargo. Busca automática na web pode ser adicionada depois.</p>
            </div>

            <div
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'}`}
              onClick={() => document.getElementById('gerar-edital-file')?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processEditalFile(f) }}
            >
              <Upload size={24} className="mx-auto mb-2 text-zinc-500" />
              <div className="font-heading font-semibold text-sm mb-1">{editalFileName || 'Enviar edital original'}</div>
              <div className="text-xs text-zinc-500">PDF ou TXT — aumenta a precisão das questões</div>
              {editalText && <div className="mt-2 text-xs text-green-400">✓ {Math.round(editalText.length / 100) / 10}kb de contexto carregado</div>}
            </div>
            <input type="file" id="gerar-edital-file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processEditalFile(f) }} />
            {editalText && (
              <button type="button" className="btn-secondary text-xs" onClick={() => { setEditalText(''); setEditalFileName('') }}>
                Remover edital carregado
              </button>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <div className="font-heading text-sm font-semibold text-brand-300">4. Configurações</div>

            <div>
              <label className="label">Cargo pretendido</label>
              <input className="input" placeholder="Ex: Agente Administrativo, Analista..." value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>

            <div>
              <label className="label">Nível de escolaridade</label>
              <div className="flex flex-wrap gap-2">
                {ESCOLARIDADES.map(e => (
                  <button key={e} onClick={() => setEducation(e)}
                    className={`chip text-xs ${education === e ? 'chip-active' : ''}`}>{e}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Dificuldade</label>
              <div className="flex gap-2">
                {DIFS.map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`chip ${difficulty === d ? 'chip-active' : ''}`}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Tipo de questão</label>
              <div className="flex gap-2">
                {TIPOS.map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`chip ${type === t ? 'chip-active' : ''}`}>{TIPO_LABELS[t]}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Formato</label>
              <div className="flex gap-2">
                {FMTS.map(f => (
                  <button key={f} onClick={() => setFormat(f)}
                    className={`chip ${format === f ? 'chip-active' : ''}`}>{f}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Provedor de IA</label>
              <div className="flex flex-wrap gap-2">
                {availableProviders.map(p => {
                  const labels: Record<string,string> = {claude:'🟠 Claude',openai:'🟢 ChatGPT',gemini:'🔵 Gemini',grok:'⚡ Grok',openrouter:'🔶 OpenRouter'}
                  return (
                    <button key={p} onClick={() => setProvider(p)}
                      className={`chip ${provider === p ? 'chip-active' : ''}`}>{labels[p] || p}</button>
                  )
                })}
                {availableProviders.length === 0 && (
                  <span className="text-xs text-zinc-500">Configure chaves no painel Admin</span>
                )}
              </div>
            </div>

            <div>
              <label className="label">Quantidade ({maxQtd} máx.)</label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxQtd }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setQuantity(n)}
                    className={`w-9 h-9 rounded-xl border text-sm font-semibold transition-all ${quantity === n ? 'bg-brand-600 border-brand-500 text-white' : 'border-white/10 text-zinc-400 hover:border-brand-500'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={gerar} disabled={loading}
            className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-semibold rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40">
            {loading ? <><Loader2 size={16} className="animate-spin" />Gerando...</> : '✦ Gerar questões com IA'}
          </button>
        </div>

        {/* Questões */}
        <div>
          {loading && (
            <div className="card p-8 text-center">
              <Loader2 size={32} className="animate-spin text-brand-400 mx-auto mb-4" />
              <div className="text-zinc-400 text-sm">Gerando questões...</div>
            </div>
          )}

          {!loading && questions.length === 0 && (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-4">✦</div>
              <div className="text-zinc-300 font-medium mb-1">Configure e gere sua questão</div>
              <div className="text-zinc-500 text-sm">A IA cria com gabarito e comentário detalhado</div>
            </div>
          )}

          {questions.map(q => {
            const sel = answered[q.id]
            const isTF = q.type === 'TRUE_FALSE'
            return (
              <div key={q.id} className="card p-5 mb-4">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400">{q.banca}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300">{q.area}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full ${q.difficulty === 'Fácil' ? 'bg-green-500/10 text-green-400' : q.difficulty === 'Difícil' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{q.difficulty}</span>
                  {q.isOriginal && <span className="text-xs px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400">Inédita</span>}
                  {q.subtopic && <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">{q.subtopic}</span>}
                </div>

                <p className="text-sm leading-relaxed mb-4">{q.enunciado}</p>

                <div className="space-y-2 mb-3">
                  {(q.options as string[]).map((opt, i) => {
                    let cls = 'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all text-sm '
                    if (sel === undefined) cls += 'border-white/[0.07] text-zinc-300 hover:border-brand-500/50 hover:bg-brand-500/5'
                    else if (i === q.correctIndex) cls += 'border-green-500 bg-green-500/8 text-zinc-100'
                    else if (i === sel && sel !== q.correctIndex) cls += 'border-red-500 bg-red-500/8 text-zinc-100'
                    else cls += 'border-white/[0.04] text-zinc-500'
                    return (
                      <div key={i} className={cls} onClick={() => responder(q.id, i, q.correctIndex)}>
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isTF ? (i === 0 ? 'border-blue-400 text-blue-400' : 'border-red-400 text-red-400') : 'border-current'}`}>
                          {isTF ? (i === 0 ? 'C' : 'E') : 'ABCDE'[i]}
                        </span>
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

                {sel !== undefined && (
                  <button onClick={gerar} className="mt-3 btn-secondary text-sm w-full">
                    + Gerar nova questão
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
