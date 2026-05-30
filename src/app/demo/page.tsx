import Link from 'next/link'
import { ArrowRight, BarChart3, Bot, CheckCircle2, FileText, Lock, PlayCircle, Sparkles, UploadCloud } from 'lucide-react'

const steps = [
  {
    icon: UploadCloud,
    title: 'Envie o PDF',
    text: 'O aluno importa o caderno de questões em PDF e o sistema organiza tudo por disciplina, banca e tópico.',
  },
  {
    icon: Bot,
    title: 'IA organiza o estudo',
    text: 'A plataforma ajuda a transformar material bruto em questões, revisões, comentários e trilhas de estudo.',
  },
  {
    icon: CheckCircle2,
    title: 'Aluno responde',
    text: 'O estudante marca a alternativa, vê se acertou ou errou e consulta o comentário somente depois de responder.',
  },
]

const features = [
  'Importação de cadernos PDF',
  'Questões comentadas com IA',
  'Plano de estudos por questões',
  'Meus gerados salvos automaticamente',
  'Controle de créditos e validade',
  'Painel administrativo completo',
]

const demoQuestions = [
  'A dramatização no contexto escolar favorece principalmente:',
  'Segundo a BNCC, o ensino de Arte deve articular:',
  'Em um plano de questões, a revisão de erros serve para:',
]

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      <section className="relative px-5 py-8 md:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),transparent_28%)]" />
        <div className="relative mx-auto max-w-6xl">
          <header className="flex items-center justify-between gap-4 mb-12">
            <Link href="/" className="font-heading text-xl font-black tracking-tight">
              Gabarito<span className="text-brand-400">IA</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.07]">
                Entrar
              </Link>
              <a href="#cta" className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500">
                Quero acessar
              </a>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1fr_460px] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200 mb-5">
                <PlayCircle size={14} /> Demonstração visual do sistema
              </div>
              <h1 className="font-heading text-4xl md:text-6xl font-black leading-tight tracking-tight">
                Veja como o <span className="text-brand-400">GabaritoIA</span> funciona antes de comprar
              </h1>
              <p className="mt-5 max-w-2xl text-base md:text-lg text-zinc-400 leading-relaxed">
                Uma página demo para mostrar ao cliente o fluxo real: importar PDF, gerar questões, montar plano de estudos e acompanhar o progresso — sem liberar uso real da IA.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <a href="#demo" className="rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-500 inline-flex items-center justify-center gap-2">
                  Ver demonstração <ArrowRight size={16} />
                </a>
                <a href="#cta" className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-zinc-100 hover:bg-white/[0.08] inline-flex items-center justify-center gap-2">
                  Solicitar acesso
                </a>
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                <Lock size={14} /> Esta demo é apenas visual. Não consome créditos nem API.
              </div>
            </div>

            <div id="demo" className="rounded-3xl border border-white/10 bg-zinc-900/80 p-4 shadow-2xl shadow-brand-950/30 backdrop-blur">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-zinc-500">Dashboard demo</div>
                    <div className="font-heading font-bold">Plano de Questões</div>
                  </div>
                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-semibold text-green-300">Ativo</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Créditos</div>
                    <div className="text-lg font-black text-brand-300">1000</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Questões</div>
                    <div className="text-lg font-black text-green-300">250</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <div className="text-[10px] text-zinc-500">Progresso</div>
                    <div className="text-lg font-black text-white">38%</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-950/70 p-4 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-300 mb-3">
                    <FileText size={14} /> Questão demo
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed mb-3">
                    Segundo a BNCC, o ensino de Arte deve desenvolver experiências relacionadas à criação, crítica, estesia, expressão, fruição e reflexão. Essa organização favorece:
                  </p>
                  <div className="space-y-2">
                    {['A) memorização mecânica dos conteúdos.', 'B) participação ativa e leitura crítica das linguagens artísticas.', 'C) substituição da prática artística por teoria.', 'D) abandono dos processos criativos.'].map((item, index) => (
                      <div key={item} className={`rounded-xl border p-2 text-xs ${index === 1 ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-white/10 bg-white/[0.03] text-zinc-400'}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-200">
                    Após responder, o aluno vê o gabarito e o comentário explicativo.
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400">
                  Próximo passo: gerar plano de revisão com base nos erros.
                </div>
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
              <Sparkles size={18} /> O que o cliente vê na demo
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
              <BarChart3 size={18} /> Exemplo de plano gerado
            </div>
            <div className="space-y-3">
              {demoQuestions.map((q, i) => (
                <div key={q} className="rounded-2xl bg-black/20 p-4">
                  <div className="text-[11px] text-zinc-500 mb-1">Dia {i + 1} · Questões novas · Noite</div>
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

      <section id="cta" className="px-5 py-16">
        <div className="mx-auto max-w-4xl rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-600/20 to-green-500/10 p-8 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-black">Quer liberar o acesso completo?</h2>
          <p className="mt-3 text-zinc-300">
            Use esta demo para apresentar o produto e leve o usuário para o checkout, WhatsApp ou página de planos.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className="rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-500">
              Entrar no sistema
            </Link>
            <a href="https://wa.me/5500000000000" className="rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-3 text-sm font-bold text-white hover:bg-white/[0.09]">
              Falar no WhatsApp
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Substitua o link do WhatsApp pelo seu número real quando quiser.</p>
        </div>
      </section>
    </main>
  )
}
