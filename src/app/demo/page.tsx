'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, Bot, CheckCircle2, FileText, Lock, Loader2, PlayCircle, Sparkles, UploadCloud } from 'lucide-react'

const features = [
  'Geração de exemplo em segundos',
  'Questão no estilo banca',
  'Aluno responde antes do gabarito',
  'Comentário liberado após resposta',
  'Plano de questões demonstrativo',
  'Bloqueio para desbloquear acesso',
]

const cachedQuestion = {
  banca: 'FGV',
  cargo: 'Assistente Administrativo',
  area: 'Direito Administrativo',
  difficulty: 'Média',
  statement:
    'No âmbito da Administração Pública, o princípio que impõe ao agente público atuar conforme a finalidade prevista em lei, impedindo favorecimentos pessoais e perseguições, é conhecido como:',
  options: [
    'Princípio da autotutela.',
    'Princípio da impessoalidade.',
    'Princípio da publicidade.',
    'Princípio da continuidade do serviço público.',
    'Princípio da especialidade.',
  ],
  correctIndex: 1,
  comment:
    'A alternativa correta é B. A impessoalidade exige que a atuação administrativa seja voltada ao interesse público, sem favorecimentos, perseguições ou promoção pessoal do agente.',
}

const steps = [
  {
    icon: UploadCloud,
    title: '1. Configure o estudo',
    text: 'O usuário informa banca, cargo e matéria. Na demo, esses dados já vêm preenchidos para acelerar a experiência.',
  },
  {
    icon: Bot,
    title: '2. Gere uma amostra',
    text: 'A questão demonstrativa aparece como se fosse gerada pela IA, mas vem de cache fixo para não consumir API.',
  },
  {
    icon: Lock,
    title: '3. Desbloqueie o restante',
    text: 'Depois da primeira questão, o sistema mostra o bloqueio e chama o visitante para contratar o acesso completo.',
  },
]

export default function DemoPage() {
  const [generated, setGenerated] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [showUnlock, setShowUnlock] = useState(false)

  useEffect(() => {
    const alreadyGenerated = typeof window !== 'undefined' && window.localStorage.getItem('gabaritoia-demo-generated') === '1'
    if (alreadyGenerated) {
      setGenerated(true)
      setShowUnlock(true)
    }
  }, [])

  function generateExample() {
    if (generated) return
    setGenerating(true)
    setTimeout(() => {
      setGenerated(true)
      setGenerating(false)
      window.localStorage.setItem('gabaritoia-demo-generated', '1')
    }, 900)
  }

  function answer(index: number) {
    if (selected !== null) return
    setSelected(index)
    setTimeout(() => setShowUnlock(true), 500)
  }

  const answered = selected !== null
  const isCorrect = selected === cachedQuestion.correctIndex

  return (
    <main className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      <section className="relative px-5 py-8 md:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),transparent_28%)]" />
        <div className="relative mx-auto max-w-6xl">
          <header className="flex items-center justify-between gap-4 mb-10">
            <Link href="/" className="font-heading text-xl font-black tracking-tight">
              Gabarito<span className="text-brand-400">IA</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.07]">
                Entrar
              </Link>
              <a href="#desbloquear" className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500">
                Desbloquear
              </a>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1fr_520px] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200 mb-5">
                <PlayCircle size={14} /> Demo interativa com exemplo cacheado
              </div>
              <h1 className="font-heading text-4xl md:text-6xl font-black leading-tight tracking-tight">
                Gere uma questão demo e veja como o <span className="text-brand-400">GabaritoIA</span> funciona
              </h1>
              <p className="mt-5 max-w-2xl text-base md:text-lg text-zinc-400 leading-relaxed">
                A pessoa testa uma amostra realista do fluxo: configurar, gerar uma questão, responder e ver o comentário. Depois disso, o acesso completo fica bloqueado para conversão.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <a href="#demo" onClick={generateExample} className="rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-500 inline-flex items-center justify-center gap-2">
                  Gerar exemplo agora <Sparkles size={16} />
                </a>
                <a href="#desbloquear" className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-zinc-100 hover:bg-white/[0.08] inline-flex items-center justify-center gap-2">
                  Quero acesso completo <ArrowRight size={16} />
                </a>
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                <Lock size={14} /> O exemplo fica em cache no navegador. Não consome IA, crédito ou banco.
              </div>
            </div>

            <div id="demo" className="rounded-3xl border border-white/10 bg-zinc-900/80 p-4 shadow-2xl shadow-brand-950/30 backdrop-blur">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-zinc-500">Gerador demo</div>
                    <div className="font-heading font-bold">Questão no estilo banca</div>
                  </div>
                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-semibold text-green-300">Cache grátis</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Banca</div>
                    <div className="text-lg font-black text-brand-300">FGV</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Matéria</div>
                    <div className="text-sm font-black text-green-300">Adm.</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Créditos</div>
                    <div className="text-lg font-black text-white">0</div>
                  </div>
                </div>

                {!generated && (
                  <div className="rounded-2xl bg-zinc-950/70 p-5 text-center">
                    <Bot size={34} className="mx-auto mb-3 text-brand-300" />
                    <div className="font-heading text-lg font-bold">Clique para gerar uma amostra</div>
                    <p className="text-sm text-zinc-500 mt-2">A demo libera 1 questão cacheada para o visitante sentir o sistema.</p>
                    <button onClick={generateExample} disabled={generating} className="mt-5 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-500 inline-flex items-center justify-center gap-2 disabled:opacity-60">
                      {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {generating ? 'Gerando exemplo...' : 'Gerar questão demo'}
                    </button>
                  </div>
                )}

                {generated && (
                  <div className="rounded-2xl bg-zinc-950/70 p-4 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-brand-300 mb-3">
                      <FileText size={14} /> {cachedQuestion.banca} · {cachedQuestion.area} · {cachedQuestion.difficulty}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed mb-3">{cachedQuestion.statement}</p>
                    <div className="space-y-2">
                      {cachedQuestion.options.map((item, index) => {
                        const isRight = answered && index === cachedQuestion.correctIndex
                        const isWrongSelected = answered && selected === index && index !== cachedQuestion.correctIndex
                        const className = answered
                          ? isRight
                            ? 'border-green-500/30 bg-green-500/10 text-green-200'
                            : isWrongSelected
                              ? 'border-red-500/30 bg-red-500/10 text-red-200'
                              : 'border-white/10 bg-white/[0.03] text-zinc-500'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-brand-500/40 hover:text-brand-200 cursor-pointer'
                        return (
                          <button key={item} onClick={() => answer(index)} disabled={answered} className={`w-full text-left rounded-xl border p-2 text-xs transition-colors disabled:cursor-default ${className}`}>
                            {'ABCDE'[index]}) {item}
                          </button>
                        )
                      })}
                    </div>

                    {!answered && <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400">Marque uma alternativa para liberar o comentário.</div>}

                    {answered && (
                      <div className={`mt-3 rounded-xl border p-3 text-xs ${isCorrect ? 'border-green-500/20 bg-green-500/10 text-green-200' : 'border-red-500/20 bg-red-500/10 text-red-200'}`}>
                        <div className="font-bold mb-1">{isCorrect ? 'Você acertou!' : `Você errou. Gabarito: ${'ABCDE'[cachedQuestion.correctIndex]}`}</div>
                        <div className="text-zinc-300 leading-relaxed">{cachedQuestion.comment}</div>
                      </div>
                    )}
                  </div>
                )}

                {showUnlock && (
                  <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-600/20 to-green-500/10 p-4">
                    <div className="absolute inset-0 backdrop-blur-[1px]" />
                    <div className="relative">
                      <div className="flex items-center gap-2 text-sm font-bold text-white mb-1">
                        <Lock size={16} /> Desbloqueie o acesso completo
                      </div>
                      <p className="text-xs text-zinc-300 mb-4">Na demo você viu 1 questão. No acesso completo, o usuário gera planos, cadernos e questões ilimitadas conforme o pacote.</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a href="#desbloquear" className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500 text-center">Quero desbloquear</a>
                        <Link href="/login" className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white hover:bg-white/[0.09] text-center">Já tenho acesso</Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-4">
            {steps.map(step => {
              const Icon = step.icon
              return (
                <div key={step.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
                    <Icon size={22} />
                  </div>
                  <h2 className="font-heading text-lg font-bold">{step.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-12">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-6 items-start">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-300 mb-4">
              <Sparkles size={18} /> O que fica bloqueado após a amostra
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {features.map(feature => (
                <div key={feature} className="flex items-center gap-2 rounded-2xl bg-black/20 p-3 text-sm text-zinc-300">
                  <CheckCircle2 size={16} className="text-green-400 shrink-0" /> {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-green-300 mb-4">
              <BarChart3 size={18} /> Exemplo de plano liberado no acesso completo
            </div>
            <div className="space-y-3">
              {['Dia 1 · Direito Administrativo · 30 questões', 'Dia 2 · Português · 30 questões', 'Dia 3 · Revisão de erros · 20 questões'].map((q, i) => (
                <div key={q} className="rounded-2xl bg-black/20 p-4">
                  <div className="text-[11px] text-zinc-500 mb-1">Plano de Questões</div>
                  <div className="text-sm font-semibold text-zinc-100">{q}</div>
                  <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${35 + i * 20}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="desbloquear" className="px-5 py-16">
        <div className="mx-auto max-w-4xl rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-600/20 to-green-500/10 p-8 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-black">Gostou da amostra?</h2>
          <p className="mt-3 text-zinc-300">
            Libere o acesso completo para gerar planos, questões, comentários, cadernos e revisões com IA.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className="rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-500">
              Entrar no sistema
            </Link>
            <a href="https://wa.me/5500000000000" className="rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-3 text-sm font-bold text-white hover:bg-white/[0.09]">
              Falar no WhatsApp
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Troque o link do WhatsApp pelo seu número real quando quiser.</p>
        </div>
      </section>
    </main>
  )
}
