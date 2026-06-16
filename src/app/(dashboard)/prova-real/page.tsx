'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clipboard, FileText, Loader2, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const PROGRESS_STEPS = ['Preparando arquivos', 'Lendo prova e gabarito', 'Enviando para a IA', 'Montando simulado clicável', 'Preparando correção', 'Finalizando']
type AlternativeKey = 'A' | 'B' | 'C' | 'D' | 'E'
type Question = { number: number; discipline: string; statement: string; alternatives: Record<AlternativeKey, string>; answer: AlternativeKey; explanation: string; wrongAlternatives: string; reviewTopic: string }
type InteractivePlan = { title: string; instructions: string; questions: Question[]; diagnosis?: { topics?: string[]; profile?: string; attention?: string }; revisionPlan?: { day: string; task: string; questionsToRedo?: string; topics?: string }[] }

function isReadableExamText(text: string) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 500) return false
  const letters = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length
  const words = (cleaned.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length
  const markers = (cleaned.match(/quest[aã]o|\b\d{1,3}\s*[.)-]|alternativa|assinale|correta|incorreta|gabarito/gi) || []).length
  const bad = (cleaned.match(/[�□■●◆◇�]|[\uE000-\uF8FF]/g) || []).length
  return bad <= 30 && letters / cleaned.length >= 0.32 && words >= 80 && (markers >= 3 || cleaned.length >= 5000)
}

function unreadablePdfMessage(fileName?: string) {
  return `Não consegui ler a prova com qualidade suficiente${fileName ? ` (${fileName})` : ''}. O texto veio quebrado/ilegível. Envie um PDF pesquisável, TXT, ou cole o texto da prova.`
}

async function extractPdfText(file: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  const pdf = await pdfjs.getDocument({ data: (await file.arrayBuffer()).slice(0) }).promise
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
    parts.push(`\n\n[Página ${pageNumber}]\n${pageParts.join(' ')}`)
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
  const lines = [plan.title, '', plan.instructions, '', 'CADERNO DE TREINO']
  for (const q of plan.questions) {
    lines.push('', `QUESTÃO ${q.number}`, `Disciplina/assunto: ${q.discipline}`, q.statement)
    for (const key of ['A', 'B', 'C', 'D', 'E'] as AlternativeKey[]) if (q.alternatives?.[key]) lines.push(`${key}) ${q.alternatives[key]}`)
    lines.push(`Minha resposta: ${answers[q.number] || '(   )'}`)
  }
  if (corrected) {
    lines.push('', 'CORREÇÃO E GABARITO COMENTADO')
    for (const q of plan.questions) lines.push('', `QUESTÃO ${q.number}`, `Gabarito oficial: ${q.answer}`, `Comentário: ${q.explanation}`, q.wrongAlternatives ? `Alternativas erradas: ${q.wrongAlternatives}` : '', `O que revisar: ${q.reviewTopic}`)
  }
  return lines.filter(Boolean).join('\n')
}

function normalizeClientPlan(value: any): InteractivePlan | null {
  if (!value) return null
  const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value) } catch { return null } })() : value
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null
  return parsed as InteractivePlan
}

export default function ProvaRealPage() {
  const [concurso, setConcurso] = useState('')
  const [banca, setBanca] = useState('')
  const [cargo, setCargo] = useState('')
  const [dias, setDias] = useState<'7' | '15' | '30'>('7')
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
  const [generationError, setGenerationError] = useState('')

  const hasInfo = concurso.trim().length > 1 && banca.trim().length > 1
  const hasProva = provaText.trim().length >= 500 && isReadableExamText(provaText)
  const hasGabarito = gabaritoText.trim().length >= 10
  const readyToGenerate = hasInfo && hasProva && hasGabarito
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
        const next = Math.min(current + (current < 35 ? 5 : current < 70 ? 3 : 1), 95)
        setProgressStep(PROGRESS_STEPS[Math.min(PROGRESS_STEPS.length - 1, Math.floor((next / 100) * PROGRESS_STEPS.length))])
        return next
      })
    }, 1200)
    return () => window.clearInterval(timer)
  }, [generating])

  async function loadFile(file: File | undefined, type: 'prova' | 'gabarito') {
    if (!file) return
    setLoadingFile(type)
    setGenerationError('')
    try {
      const text = await extractFileText(file)
      if (!text || text.length < 20) throw new Error('Não consegui extrair texto suficiente deste arquivo.')
      if (type === 'prova' && !isReadableExamText(text)) throw new Error(unreadablePdfMessage(file.name))
      if (type === 'prova') { setProvaText(text); setProvaName(file.name) } else { setGabaritoText(text); setGabaritoName(file.name) }
      toast.success(`${type === 'prova' ? 'Prova' : 'Gabarito'} carregado com sucesso.`)
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao ler arquivo.')
    } finally {
      setLoadingFile('')
    }
  }

  async function generatePlan() {
    if (!hasInfo) return toast.error('Preencha o nome da prova e a banca.')
    if (!hasProva) return toast.error('Envie ou cole uma prova legível.')
    if (!hasGabarito) return toast.error('Envie ou cole o gabarito oficial.')
    setGenerating(true); setProgress(8); setPlan(null); setAnswers({}); setCorrected(false); setGenerationError('')
    try {
      const res = await fetch('/api/ai/plano-prova', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concurso, banca, cargo, dias, provaText, gabaritoText }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar simulado.')
      const nextPlan = normalizeClientPlan(data.plan) || normalizeClientPlan(data.result)
      if (!nextPlan) throw new Error('A IA terminou, mas não conseguiu montar questões clicáveis. Confira se o gabarito está no formato 1-A, 2-B, 3-C e se a prova tem enunciados e alternativas legíveis.')
      setProgress(100); setProgressStep('Simulado clicável gerado com sucesso'); setPlan(nextPlan); setCreditsRemaining(typeof data.creditsRemaining === 'number' ? data.creditsRemaining : null)
      toast.success('Simulado clicável gerado com sucesso.')
    } catch (e) {
      const message = (e as Error).message || 'Erro ao gerar.'
      setProgress(0); setProgressStep(PROGRESS_STEPS[0]); setGenerationError(message); toast.error(message)
    } finally { setGenerating(false) }
  }

  async function copyResult() { if (!plan) return; await navigator.clipboard.writeText(buildCopyText(plan, answers, corrected)); toast.success('Material copiado.') }
  function answerQuestion(questionNumber: number, option: AlternativeKey) { if (!corrected) setAnswers(current => ({ ...current, [questionNumber]: option })) }
  function correctNow() { if (!plan) return; if (!score.answered) return toast.error('Responda pelo menos uma questão antes de corrigir.'); setCorrected(true); toast.success(`Correção finalizada: ${score.correct}/${score.total} acertos.`) }
  function resetAnswers() { setAnswers({}); setCorrected(false); toast.success('Respostas apagadas. Pode refazer o simulado.') }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3"><Sparkles size={13} /> Novo recurso</div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Simulado Clicável por Prova Real</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">Siga os passos abaixo: preencha os dados, envie a prova, envie o gabarito e clique em gerar. O gabarito só aparece depois que o aluno responder.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        {[['1', 'Dados da prova', hasInfo], ['2', 'Prova real', hasProva], ['3', 'Gabarito oficial', hasGabarito], ['4', 'Gerar simulado', readyToGenerate]].map(([n, label, ok]) => (
          <div key={String(n)} className={`rounded-2xl border p-3 text-sm ${ok ? 'border-green-500/30 bg-green-500/10 text-green-100' : 'border-white/10 bg-zinc-900 text-zinc-400'}`}>
            <div className="flex items-center gap-2 font-semibold">{ok ? '✅' : '⏳'} Passo {n}</div>
            <div className="mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[0.85fr_1.15fr] gap-5">
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-xs text-brand-100">PASSO 1: preencha os dados básicos da prova.</div>
            <div><label className="label">Nome do concurso/prova</label><input className="input" value={concurso} onChange={e => setConcurso(e.target.value)} placeholder="Ex: Professor - Prefeitura de Nova Trento" /></div>
            <div className="grid md:grid-cols-2 gap-3"><div><label className="label">Banca</label><input className="input" value={banca} onChange={e => setBanca(e.target.value)} placeholder="Ex: FURB, FGV, Cebraspe" /></div><div><label className="label">Cargo</label><input className="input" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Professor" /></div></div>
            <div><label className="label">Prazo do plano de revisão</label><select className="input" value={dias} onChange={e => setDias(e.target.value as '7' | '15' | '30')}><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option></select></div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-xs text-brand-100">PASSO 2: envie ou cole a prova real. Sem isso o simulado não aparece.</div>
            <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-5 text-center hover:border-brand-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('prova-file')?.click()}><Upload size={28} className="mx-auto mb-3 text-brand-300" /><div className="font-heading font-bold text-white">Enviar prova real</div><p className="text-xs text-zinc-500 mt-1">PDF pesquisável ou TXT. {provaName ? `Arquivo carregado: ${provaName}` : 'Nenhuma prova carregada ainda.'}</p><button type="button" className="btn-primary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'prova'}>{loadingFile === 'prova' ? 'Lendo...' : 'Selecionar prova'}</button></div>
            <input id="prova-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'prova')} />
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100">Se o PDF estiver quebrado/ilegível, o sistema bloqueia antes de gastar créditos.</div>
            <div><label className="label">Ou cole o texto da prova real</label><textarea className="input min-h-[130px] resize-y" value={provaText} onChange={e => { setProvaText(e.target.value); setGenerationError('') }} placeholder="Cole aqui as questões reais da prova..." /><div className="text-[11px] text-zinc-500 mt-1">Texto atual: {provaText.length.toLocaleString('pt-BR')} caracteres</div></div>
          </div>

          <div className="card p-5 space-y-4"><div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-100">PASSO 3: envie ou cole o gabarito oficial. A correção depende dele.</div><div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-5 text-center hover:border-green-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('gabarito-file')?.click()}><FileText size={28} className="mx-auto mb-3 text-green-300" /><div className="font-heading font-bold text-white">Enviar gabarito oficial</div><p className="text-xs text-zinc-500 mt-1">PDF ou TXT. {gabaritoName ? `Arquivo carregado: ${gabaritoName}` : 'Nenhum gabarito carregado ainda.'}</p><button type="button" className="btn-secondary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'gabarito'}>{loadingFile === 'gabarito' ? 'Lendo...' : 'Selecionar gabarito'}</button></div><input id="gabarito-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'gabarito')} /><div><label className="label">Ou cole o gabarito oficial</label><textarea className="input min-h-[110px] resize-y" value={gabaritoText} onChange={e => { setGabaritoText(e.target.value); setGenerationError('') }} placeholder="Ex: 1-B, 2-C, 3-E..." /></div></div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><div>PASSO 4: esta análise usa 80 créditos somente quando o simulado é gerado com sucesso.</div></div>
          <button onClick={generatePlan} disabled={generating || loadingFile !== '' || !readyToGenerate} className="btn-primary w-full h-14 text-base disabled:opacity-50 disabled:cursor-not-allowed">{generating ? <><Loader2 size={16} className="animate-spin" /> Gerando simulado... {progress}%</> : readyToGenerate ? <>Gerar simulado clicável agora</> : <>Preencha prova + gabarito para gerar</>}</button>
        </div>

        <div className="card p-5 min-h-[600px]"><div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="font-heading text-xl font-bold">Simulado</h2><p className="text-xs text-zinc-500 mt-1">As questões aparecerão aqui depois do Passo 4.</p></div><div className="flex gap-2">{plan && <button onClick={copyResult} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><Clipboard size={14} /> Copiar</button>}{plan && <button onClick={resetAnswers} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><RotateCcw size={14} /> Refazer</button>}</div></div>
          {creditsRemaining !== null && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Créditos restantes: {creditsRemaining}</div>}
          {generationError && !generating && !plan && <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100"><div className="font-semibold mb-1">Não foi possível montar o simulado clicável.</div><div>{generationError}</div><div className="mt-3 text-xs text-red-200">Dica: use gabarito no formato 1-A, 2-B, 3-C e confira se a prova tem alternativas A, B, C, D e E legíveis.</div></div>}
          {(generating || progress > 0) && !plan && <div className="mb-4 rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4"><div className="flex items-center justify-between gap-3 mb-2"><div className="flex items-center gap-2 text-sm font-semibold text-brand-100"><Loader2 size={16} className="animate-spin text-brand-300" />{progressStep}</div><div className="font-heading text-lg font-bold text-white">{progress}%</div></div><div className="h-3 rounded-full bg-zinc-800 overflow-hidden border border-white/10"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-green-400 transition-all duration-700" style={{ width: `${progress}%` }} /></div></div>}
          {plan ? <div className="space-y-4"><div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4"><h3 className="font-heading text-lg font-bold text-white">{plan.title}</h3><p className="text-sm text-zinc-400 mt-1">{plan.instructions}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Questões</div><div className="font-bold text-white">{score.total}</div></div><div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Respondidas</div><div className="font-bold text-white">{score.answered}</div></div><div className="rounded-xl bg-zinc-900 border border-white/10 p-2"><div className="text-zinc-500">Acertos</div><div className="font-bold text-white">{corrected ? `${score.correct}/${score.total}` : '---'}</div></div></div>{!corrected ? <button onClick={correctNow} className="btn-primary w-full mt-4 h-11 text-sm">Corrigir simulado</button> : <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-100">Resultado: {score.correct}/{score.total} acertos ({score.percent}%).</div>}</div>{plan.questions.map(q => { const selected = answers[q.number]; const isCorrect = selected === q.answer; return <div key={q.number} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs text-brand-300 font-semibold">QUESTÃO {q.number}</div><div className="text-xs text-zinc-500 mt-1">{q.discipline}</div></div>{corrected && <div className={isCorrect ? 'text-green-300' : 'text-red-300'}>{isCorrect ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div>}</div><p className="text-sm leading-6 text-zinc-100 whitespace-pre-wrap">{q.statement}</p><div className="space-y-2">{(['A', 'B', 'C', 'D', 'E'] as AlternativeKey[]).map(key => { const text = q.alternatives?.[key]; if (!text) return null; const active = selected === key; const right = corrected && q.answer === key; const wrong = corrected && active && q.answer !== key; return <button key={key} type="button" onClick={() => answerQuestion(q.number, key)} disabled={corrected} className={`w-full text-left rounded-xl border px-3 py-3 text-sm transition-colors ${right ? 'border-green-500/50 bg-green-500/15 text-green-100' : wrong ? 'border-red-500/50 bg-red-500/15 text-red-100' : active ? 'border-brand-500/60 bg-brand-500/15 text-white' : 'border-white/10 bg-zinc-900/70 text-zinc-200 hover:border-brand-500/40'}`}><span className="font-bold mr-2">{key})</span>{text}</button> })}</div>{!corrected && <div className="text-xs text-zinc-500">Sua resposta: {selected || 'não respondida'}</div>}{corrected && <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm space-y-2"><div className="font-semibold text-white">Gabarito oficial: {q.answer}</div>{selected && <div className={isCorrect ? 'text-green-300' : 'text-red-300'}>{isCorrect ? 'Você acertou.' : `Você marcou ${selected}.`}</div>}{!selected && <div className="text-amber-300">Você não respondeu esta questão.</div>}<div className="text-zinc-300 whitespace-pre-wrap">{q.explanation}</div>{q.wrongAlternatives && <div className="text-zinc-400 whitespace-pre-wrap">{q.wrongAlternatives}</div>}{q.reviewTopic && <div className="text-brand-200">Revisar: {q.reviewTopic}</div>}</div>}</div> })}{corrected && <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-4"><h3 className="font-heading text-lg font-bold text-white">Plano de revisão</h3>{plan.diagnosis?.topics?.length ? <div className="text-sm text-zinc-300">Assuntos mais cobrados: {plan.diagnosis.topics.join(', ')}</div> : null}{plan.diagnosis?.profile ? <div className="text-sm text-zinc-300">Perfil da banca: {plan.diagnosis.profile}</div> : null}{(plan.revisionPlan || []).map((item, index) => <div key={`${item.day}-${index}`} className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm"><div className="font-semibold text-white">{item.day}</div><div className="text-zinc-300">Tarefa: {item.task}</div>{item.questionsToRedo && <div className="text-zinc-400">Refazer: {item.questionsToRedo}</div>}{item.topics && <div className="text-zinc-400">Revisar: {item.topics}</div>}</div>)}</div>}</div> : !generating && !generationError ? <div className="h-[520px] rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 flex items-center justify-center text-center p-6"><div><Sparkles className="mx-auto mb-3 text-brand-300" size={34} /><div className="font-heading font-bold text-white">Ainda falta concluir os passos</div><p className="text-sm text-zinc-500 mt-2 max-w-md">{!hasInfo ? 'Preencha o nome da prova e a banca.' : !hasProva ? 'Prova carregada? Confira se o texto está legível.' : !hasGabarito ? 'Agora envie ou cole o gabarito oficial.' : 'Tudo pronto. Clique em Gerar simulado clicável agora.'}</p></div></div> : null}
        </div>
      </div>
    </div>
  )
}
