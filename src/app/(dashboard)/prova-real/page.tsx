'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clipboard, FileText, Loader2, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'

const PROGRESS_STEPS = [
  'Preparando arquivos',
  'Organizando prova e gabarito',
  'Enviando para a IA',
  'Analisando padrão da banca',
  'Identificando assuntos cobrados',
  'Montando plano de estudos',
  'Gerando questões comentadas',
  'Finalizando resultado',
]

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
    const text = textContent.items.map((item: any) => item.str || '').join(' ')
    parts.push(`\n\n[Página ${pageNumber}]\n${text}`)
  }

  return parts.join('\n').replace(/\s+/g, ' ').trim()
}

async function extractFileText(file: File) {
  const lower = file.name.toLowerCase()
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return extractPdfText(file)
  if (file.type.startsWith('text/') || lower.endsWith('.txt')) return file.text()
  throw new Error('Envie PDF ou TXT.')
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
  const [result, setResult] = useState('')
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)

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
    if (gabaritoText.trim().length < 10) return toast.error('Envie ou cole o gabarito oficial.')

    setGenerating(true)
    setProgress(8)
    setProgressStep(PROGRESS_STEPS[0])
    setResult('')
    try {
      const res = await fetch('/api/ai/plano-prova', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurso, banca, cargo, dias, provaText, gabaritoText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar plano.')
      setProgress(100)
      setProgressStep('Plano gerado com sucesso')
      setResult(data.result || '')
      setCreditsRemaining(typeof data.creditsRemaining === 'number' ? data.creditsRemaining : null)
      toast.success('Plano por prova real gerado com sucesso.')
    } catch (e) {
      setProgress(0)
      setProgressStep(PROGRESS_STEPS[0])
      toast.error((e as Error).message || 'Erro ao gerar.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyResult() {
    if (!result) return
    await navigator.clipboard.writeText(result)
    toast.success('Resultado copiado.')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Sparkles size={13} /> Novo recurso
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Plano por Prova Real</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">
          Envie uma prova real e o gabarito oficial. A IA identifica o padrão da banca, os assuntos mais cobrados e cria um plano de estudos com questões comentadas.
        </p>
      </div>

      <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-5">
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
              <label className="label">Prazo do plano</label>
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
              <p className="text-xs text-zinc-500 mt-1">PDF ou TXT da prova. {provaName ? `Arquivo: ${provaName}` : ''}</p>
              <button type="button" className="btn-primary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'prova'}>{loadingFile === 'prova' ? 'Lendo...' : 'Selecionar prova'}</button>
            </div>
            <input id="prova-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'prova')} />

            <div>
              <label className="label">Ou cole o texto da prova</label>
              <textarea className="input min-h-[130px] resize-y" value={provaText} onChange={e => setProvaText(e.target.value)} placeholder="Cole aqui o texto extraído da prova, se preferir..." />
              <div className="text-[11px] text-zinc-500 mt-1">Texto atual: {provaText.length.toLocaleString('pt-BR')} caracteres</div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-5 text-center hover:border-green-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('gabarito-file')?.click()}>
              <FileText size={28} className="mx-auto mb-3 text-green-300" />
              <div className="font-heading font-bold text-white">Enviar gabarito oficial</div>
              <p className="text-xs text-zinc-500 mt-1">PDF ou TXT do gabarito. {gabaritoName ? `Arquivo: ${gabaritoName}` : ''}</p>
              <button type="button" className="btn-secondary mt-4 px-5 py-2 text-xs" disabled={loadingFile === 'gabarito'}>{loadingFile === 'gabarito' ? 'Lendo...' : 'Selecionar gabarito'}</button>
            </div>
            <input id="gabarito-file" type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={e => void loadFile(e.target.files?.[0], 'gabarito')} />

            <div>
              <label className="label">Ou cole o gabarito</label>
              <textarea className="input min-h-[110px] resize-y" value={gabaritoText} onChange={e => setGabaritoText(e.target.value)} placeholder="Ex: 1-B, 2-C, 3-E..." />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>Esta análise usa 80 créditos. A IA ajuda a organizar o estudo, mas não substitui conferência humana do edital, da prova e do gabarito oficial.</div>
          </div>

          <button onClick={generatePlan} disabled={generating || loadingFile !== ''} className="btn-primary w-full h-12 text-sm">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Gerando plano... {progress}%</> : <>Gerar plano por prova real</>}
          </button>
        </div>

        <div className="card p-5 min-h-[600px]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading text-xl font-bold">Resultado</h2>
              <p className="text-xs text-zinc-500 mt-1">Diagnóstico, plano e questões comentadas.</p>
            </div>
            {result && <button onClick={copyResult} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><Clipboard size={14} /> Copiar</button>}
          </div>

          {creditsRemaining !== null && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Créditos restantes: {creditsRemaining}</div>}

          {(generating || progress > 0) && !result && (
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
              <div className="mt-3 grid gap-2 text-xs text-zinc-300">
                {PROGRESS_STEPS.map((step, index) => {
                  const done = progress >= ((index + 1) / PROGRESS_STEPS.length) * 100
                  const current = step === progressStep
                  return (
                    <div key={step} className={done || current ? 'text-zinc-100' : 'text-zinc-500'}>
                      {done ? '✅' : current ? '⏳' : '•'} {step}
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-3">A porcentagem é uma estimativa enquanto a IA processa a prova. Em provas grandes, pode levar um pouco mais.</p>
            </div>
          )}

          {result ? (
            <pre className="whitespace-pre-wrap text-sm leading-7 text-zinc-100 bg-zinc-950/70 border border-white/10 rounded-2xl p-4 overflow-auto max-h-[75vh]">{result}</pre>
          ) : !generating ? (
            <div className="h-[520px] rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 flex items-center justify-center text-center p-6">
              <div>
                <Sparkles className="mx-auto mb-3 text-brand-300" size={34} />
                <div className="font-heading font-bold text-white">Envie a prova e o gabarito</div>
                <p className="text-sm text-zinc-500 mt-2 max-w-md">O plano será exibido aqui com diagnóstico da prova, temas mais cobrados, cronograma e questões comentadas para treino.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
