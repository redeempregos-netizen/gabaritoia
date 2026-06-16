'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clipboard, FileText, Loader2, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const PROGRESS_STEPS = [
  'Preparando arquivos',
  'Organizando prova e gabarito',
  'Enviando para a IA',
  'Lendo questões reais da prova',
  'Cruzando com o gabarito oficial',
  'Montando simulado clicável',
  'Preparando correção comentada',
  'Finalizando resultado',
]

type AlternativeKey = 'A' | 'B' | 'C' | 'D' | 'E'
type Question = {
  number: number
  discipline: string
  statement: string
  alternatives: Record<AlternativeKey, string>
  answer: AlternativeKey
  explanation: string
  wrongAlternatives: string
  reviewTopic: string
}
type InteractivePlan = {
  title: string
  instructions: string
  questions: Question[]
  diagnosis?: { topics?: string[]; profile?: string; attention?: string }
  revisionPlan?: { day: string; task: string; questionsToRedo?: string; topics?: string }[]
}

function isReadableExamText(text: string) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 500) return false
  const letters = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length
  const words = (cleaned.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length
  const questionMarkers = (cleaned.match(/quest[aã]o|\b\d{1,3}\s*[.)-]|alternativa|assinale|correta|incorreta|gabarito/gi) || []).length
  const badChars = (cleaned.match(/[�□■●◆◇�]|[\uE000-\uF8FF]/g) || []).length
  const letterRatio = letters / cleaned.length
  if (badChars > 30) return false
  if (letterRatio < 0.32) return false
  if (words < 80) return false
  if (questionMarkers < 3 && cleaned.length < 5000) return false
  return true
}

function unreadablePdfMessage(fileName?: string) {
  return `Não consegui ler a prova com qualidade suficiente${fileName ? ` (${fileName})` : ''}. O texto extraído veio quebrado/ilegível. Envie um PDF pesquisável, TXT, ou copie e cole o texto da prova diretamente.`
}

async function extractPdfText(file: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer.slice(0) }).promise
  const parts: string[] = []
  const total = Math.min(pdf.numPages, 80)

  for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageParts: string[] = []
    for (const item of textContent.items as any[]) {
      const value = String(item?.str || '').trim()
      if (!value) continue
      pageParts.push(value)
      if (item?.hasEOL) pageParts.push('\n')
    }
    const text = pageParts.join(' ').replace(/[ \t]{2,}/g, ' ').replace(/\n\s+/g, '\n').trim()
    parts.push(`\n\n[Página ${pageNumber}]\n${text}`)
  }

  return parts.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

async function extractFileText(file: File) {
  const lower = file.name.toLowerCase()
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return extractPdfText(file)
  if (file.type.startsWith('text/') || lower.endsWith('.txt')) return file.text()
  throw new Error('Envie PDF ou TXT.')
}

function buildCopyText(plan: InteractivePlan, answers: Record<number, string>, corrected: boolean) {
  const lines: string[] = []
  lines.push(plan.title)
  lines.push('')
  lines.push(plan.instructions)
  lines.push('')
  lines.push('CADERNO DE TREINO')
  for (const q of plan.questions) {
    lines.push('')
    lines.push(`QUESTÃO ${q.number}`)
    lines.push(`Disciplina/assunto: ${q.discipline}`)
    lines.push(q.statement)
    for (const key of ['A', 'B', 'C', 'D', 'E'] as AlternativeKey[]) {
      if (q.alternatives?.[key]) lines.push(`${key}) ${q.alternatives[key]}`)
    }
    lines.push(`Minha resposta: ${answers[q.number] || '(   )'}`)
  }
  if (corrected) {
    lines.push('')
    lines.push('CORREÇÃO E GABARITO COMENTADO')
    for (const q of plan.questions) {
      lines.push('')
      lines.push(`QUESTÃO ${q.number}`)
      lines.push(`Gabarito oficial: ${q.answer}`)
      lines.push(`Comentário: ${q.explanation}`)
      if (q.wrongAlternatives) lines.push(`Alternativas erradas: ${q.wrongAlternatives}`)
      lines.push(`O que revisar: ${q.reviewTopic}`)
    }
  }
  return lines.join('\n')
}

export default function ProvaRealPage() {
  const [concurso, setConcurso] = useState('')
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [dias, setDias] = useState<'7' | '15' | '30'>('30')
  const [provaText, setProvaText] = useState('')
  const [gabaritoText, setGabaritoText] = useState('')
  const [provaName, setProvaName] = useState('')
  const [gabaritoName, setGabaritoName] = useState('')
  const [loadingFile, setLoadingFile] = useState<'prova' | 'gabarito' | ''>('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressStep, setProgressStep] = useState(PROGRESS_STEPS[0])
  const [plan, setPlan] = useState<InteractivePlan | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [corrected, setCorrected] = useState(false)
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)

  const score = useMemo(() => {
    if (!plan) return { total: 0, answered: 0, correct: 0, percent: 0 }
    const total = plan.questions.length
    const answered = plan.questions.filter(q => answers[q.number]).length
    const correct = plan.questions.filter(q => answers[q.number] === q.answer).length
    return { total, answered, correct, percent: total ? Math.round((correct / total) * 100) : 0 }
  }, [plan, answers])

  useEffect(() => {
    if (!generating) return
    setProgress(8)
    setProgressStep(PROGRESS_STEPS[0])
    const timer = window.setInterval(() => {
      setProgress(current => {
        if (current >= 95) return current
        const next = current + (current < 35 ? 5 : current < 70 ? 3 : 1)
        const safeNext = Math.min(next, 95)
        const stepIndex = Math.min(PROGRESS_STEPS.length - 1, Math.floor((safeNext / 100) * PROGRESS_STEPS.length))
        setProgressStep(PROGRESS_STEPS[stepIndex])
        return safeNext
      })
    }, 1200)
    return () => window.clearInterval(timer)
  }, [generating])

  async function loadFile(file: File | undefined, type: 'prova' | 'gabarito') {
    if (!file) return
    setLoadingFile(type)
    try {
      const text = await extractFileText(file)
      if (!text || text.length < 20) throw new Error('Não consegui extrair texto suficiente deste arquivo.')
      if (type === 'prova' && !isReadableExamText(text)) {
        setProvaText('')
        setProvaName('')
        throw new Error(unreadablePdfMessage(file.name))
      }
      if (type === 'prova') {
        setProvaText(text)
        setProvaName(file.name)
      } else {
        setGabaritoText(text)
        setGabaritoName(file.name)
      }
      toast.success(`${type === 'prova' ? 'Prova' : 'Gabarito'} carregado com sucesso.`)
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao ler arquivo.')
    } finally {
      setLoadingFile('')
    }
  }

  async function generatePlan() {
    if (!concurso.trim()) return toast.error('Informe o nome do concurso ou prova.')
    if (!banca.trim()) return toast.error('Informe a banca.')
    if (provaText.trim().length < 500) return toast.error('Envie ou cole o texto da prova.')
    if (!isReadableExamText(provaText)) return toast.error(unreadablePdfMessage(provaName))
    if (gabaritoText.trim().length < 10) return toast.error('Envie ou cole o gabarito oficial.')

    setGenerating(true)
    setProgress(8)
    setProgressStep(PROGRESS_STEPS[0])
    setPlan(null)
    setAnswers({})
    setCorrected(false)
    try {
      const res = await fetch('/api/ai/plano-prova', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurso, banca, cargo, dias, provaText, gabaritoText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar simulado.')
      setProgress(100)
      setProgressStep('Simulado clicável gerado com sucesso')
      setPlan(data.plan)
      setCreditsRemaining(typeof data.creditsRemaining === 'number' ? data.creditsRemaining : null)
      toast.success('Simulado clicável gerado com sucesso.')
    } catch (e) {
      setProgress(0)
      setProgressStep(PROGRESS_STEPS[0])
      toast.error((e as Error).message || 'Erro ao gerar.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyResult() {
    if (!plan) return
    await navigator.clipboard.writeText(buildCopyText(plan, answers, corrected))
    toast.success('Material copiado.')
  }

  function answerQuestion(questionNumber: number, option: AlternativeKey) {
    if (corrected) return
    setAnswers(current => ({ ...current, [questionNumber]: option }))
  }

  function correctNow() {
    if (!plan) return
    if (!score.answered) return toast.error('Responda pelo menos uma questão antes de corrigir.')
    setCorrected(true)
    toast.success(`Correção finalizada: ${score.correct}/${score.total} acertos.`)
  }

  function resetAnswers() {
    setAnswers({})
    setCorrected(false)
    toast.success('Respostas apagadas. Pode refazer o simulado.')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Sparkles size={13} /> Novo recurso
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Simulado Clicável por Prova Real</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">
          Envie uma prova real e o gabarito oficial. A IA organiza as questões em um simulado clicável, o aluno responde e só depois confere gabarito comentado e plano de revisão.
        </p>
      </div>

      <div className="grid xl:grid-cols-[0.85fr_1.15fr] gap-5">
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Nome do concurso/prova</label>
              <input className="input" value={concurso} onChange={e => setConcurso(e.target.value)} placeholder="Ex: Guarda Municipal de Itajaí 2026" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Banca</label>
                <input className="input" value={banca} onChange={e => setBanca(e.target.value)} placeholder="Ex: FEPESE, FGV, Cebraspe" />
              </div>
              <div>
                <label className="label">Cargo</label>
                <input className="input" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Assistente Administrativo" />
              </div>
            </div>
            <div>
              <label className="label">Prazo do plano de revisão</label>
              <select className="input" value={dias} onChange={e => setDias(e.target.value as '7' | '15' | '30')}>
                <option value="7">7 dias</option>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
              </select>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-5 text-center hover:border-brand-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('prova-file')?.click()}>
              <Upload size={28} className="mx-auto mb-3 text-brand-300" />
              <div className="font-heading font-bold text-white">Enviar prova real</div>
              <p className="text-xs text-zinc-500 mt-1">PDF pesquisável ou TXT com as questões reais. {provaName ? `Arquivo: ${provaName}` : ''}</p>
              <button type="button" className="btn-primary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'prova'}>{loadingFile === 'prova' ? 'Lendo...' : 'Selecionar prova'}</button>
            </div>
            <input id="prova-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'prova')} />
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100">
              Se o PDF vier quebrado ou ilegível, o sistema bloqueia antes de gastar créditos. Envie PDF pesquisável, TXT ou cole o texto da prova.
            </div>
            <div>
              <label className="label">Ou cole o texto da prova real</label>
              <textarea className="input min-h-[130px] resize-y" value={provaText} onChange={e => setProvaText(e.target.value)} placeholder="Cole aqui as questões reais da prova..." />
              <div className="text-[11px] text-zinc-500 mt-1">Texto atual: {provaText.length.toLocaleString('pt-BR')} caracteres</div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-5 text-center hover:border-green-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('gabarito-file')?.click()}>
              <FileText size={28} className="mx-auto mb-3 text-green-300" />
              <div className="font-heading font-bold text-white">Enviar gabarito oficial</div>
              <p className="text-xs text-zinc-500 mt-1">PDF ou TXT do gabarito oficial. {gabaritoName ? `Arquivo: ${gabaritoName}` : ''}</p>
              <button type="button" className="btn-secondary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'gabarito'}>{loadingFile === 'gabarito' ? 'Lendo...' : 'Selecionar gabarito'}</button>
            </div>
            <input id="gabarito-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'gabarito')} />
            <div>
              <label className="label">Ou cole o gabarito oficial</label>
              <textarea className="input min-h-[110px] resize-y" value={gabaritoText} onChange={e => setGabaritoText(e.target.value)} placeholder="Ex: 1-B, 2-C, 3-E..." />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>Esta análise usa 80 créditos. A correção depende da qualidade da prova e do gabarito oficial enviados.</div>
          </div>

          <button onClick={generatePlan} disabled={generating || loadingFile !== ''} className="btn-primary w-full h-12 text-sm">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Gerando simulado... {progress}%</> : <>Gerar simulado clicável</>}
          </button>
        </div>

        <div className="card p-5 min-h-[600px]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading text-xl font-bold">Simulado</h2>
              <p className="text-xs text-zinc-500 mt-1">Responda clicando nas alternativas. O gabarito só aparece após corrigir.</p>
            </div>
            <div className="flex gap-2">
              {plan && <button onClick={copyResult} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><Clipboard size={14} /> Copiar</button>}
              {plan && <button onClick={resetAnswers} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><RotateCcw size={14} /> Refazer</button>}
            </div>
          </div>

          {creditsRemaining !== null && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Créditos restantes: {creditsRemaining}</div>}

          {(generating || progress > 0) && !plan && (
            <div className="mb-4 rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-100">
                  {progress >= 100 ? <CheckCircle2 size={16} className="text-green-300" /> : <Loader2 size={16} className="animate-spin text-brand-300" />}
                  {progressStep}
                </div>
                <div className="font-heading text-lg font-bold text-white">{progress}%</div>
              </div>
              <div className="h-3 rounded-full bg-zinc-800 overflow-hidden border border-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-green-400 transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[11px] text-zinc-500 mt-3">A porcentagem é uma estimativa enquanto a IA organiza as questões.</p>
            </div>
          )}

          {plan ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                <h3 className="font-heading text-lg font-bold text-white">{plan.title}</h3>
                <p className="text-sm text-zinc-400 mt-1">{plan.instructions}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Questões</div><div className="font-bold text-white">{score.total}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Respondidas</div><div className="font-bold text-white">{score.answered}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Acertos</div><div className="font-bold text-white">{corrected ? `${score.correct}/${score.total}` : '---'}</div></div>
                </div>
                {!corrected ? (
                  <button onClick={correctNow} className="btn-primary w-full mt-4 h-11 text-sm">Corrigir simulado</button>
                ) : (
                  <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-100">Resultado: {score.correct}/{score.total} acertos ({score.percent}%).</div>
                )}
              </div>

              {plan.questions.map(q => {
                const selected = answers[q.number]
                const isCorrect = selected === q.answer
                return (
                  <div key={q.number} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-brand-300 font-semibold">QUESTÃO {q.number}</div>
                        <div className="text-xs text-zinc-500 mt-1">{q.discipline}</div>
                      </div>
                      {corrected && (
                        <div className={isCorrect ? 'text-green-300' : 'text-red-300'}>
                          {isCorrect ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                        </div>
                      )}
                    </div>
                    <p className="text-sm leading-6 text-zinc-100 whitespace-pre-wrap">{q.statement}</p>
                    <div className="space-y-2">
                      {(['A', 'B', 'C', 'D', 'E'] as AlternativeKey[]).map(key => {
                        const text = q.alternatives?.[key]
                        if (!text) return null
                        const active = selected === key
                        const shouldShowRight = corrected && q.answer === key
                        const shouldShowWrong = corrected && active && q.answer !== key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => answerQuestion(q.number, key)}
                            className={[
                              'w-full text-left rounded-xl border px-3 py-3 text-sm transition-colors',
                              shouldShowRight ? 'border-green-500/50 bg-green-500/15 text-green-100' : '',
                              shouldShowWrong ? 'border-red-500/50 bg-red-500/15 text-red-100' : '',
                              !shouldShowRight && !shouldShowWrong && active ? 'border-brand-500/60 bg-brand-500/15 text-white' : '',
                              !shouldShowRight && !shouldShowWrong && !active ? 'border-white/10 bg-zinc-900/70 text-zinc-200 hover:border-brand-500/40' : '',
                            ].join(' ')}
                            disabled={corrected}
                          >
                            <span className="font-bold mr-2">{key})</span>{text}
                          </button>
                        )
                      })}
                    </div>
                    {!corrected && <div className="text-xs text-zinc-500">Sua resposta: {selected || 'não respondida'}</div>}
                    {corrected && (
                      <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm space-y-2">
                        <div className="font-semibold text-white">Gabarito oficial: {q.answer}</div>
                        {selected && <div className={isCorrect ? 'text-green-300' : 'text-red-300'}>{isCorrect ? 'Você acertou.' : `Você marcou ${selected}.`}</div>}
                        {!selected && <div className="text-amber-300">Você não respondeu esta questão.</div>}
                        <div className="text-zinc-300 whitespace-pre-wrap">{q.explanation}</div>
                        {q.wrongAlternatives && <div className="text-zinc-400 whitespace-pre-wrap">{q.wrongAlternatives}</div>}
                        {q.reviewTopic && <div className="text-brand-200">Revisar: {q.reviewTopic}</div>}
                      </div>
                    )}
                  </div>
                )
              })}

              {corrected && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-4">
                  <h3 className="font-heading text-lg font-bold text-white">Plano de revisão</h3>
                  {plan.diagnosis?.topics?.length ? <div className="text-sm text-zinc-300">Assuntos mais cobrados: {plan.diagnosis.topics.join(', ')}</div> : null}
                  {plan.diagnosis?.profile ? <div className="text-sm text-zinc-300">Perfil da banca: {plan.diagnosis.profile}</div> : null}
                  {plan.diagnosis?.attention ? <div className="text-sm text-zinc-300">Atenção: {plan.diagnosis.attention}</div> : null}
                  <div className="space-y-2">
                    {(plan.revisionPlan || []).map((item, index) => (
                      <div key={`${item.day}-${index}`} className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm">
                        <div className="font-semibold text-white">{item.day}</div>
                        <div className="text-zinc-300">Tarefa: {item.task}</div>
                        {item.questionsToRedo && <div className="text-zinc-400">Refazer: {item.questionsToRedo}</div>}
                        {item.topics && <div className="text-zinc-400">Revisar: {item.topics}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !generating ? (
            <div className="h-[520px] rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 flex items-center justify-center text-center p-6">
              <div>
                <Sparkles className="mx-auto mb-3 text-brand-300" size={34} />
                <div className="font-heading font-bold text-white">Gere o simulado clicável</div>
                <p className="text-sm text-zinc-500 mt-2 max-w-md">As questões aparecerão aqui com alternativas clicáveis. O gabarito comentado só aparece depois da correção.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
