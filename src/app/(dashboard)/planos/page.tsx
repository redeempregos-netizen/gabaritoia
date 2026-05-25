'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle, BookOpen, Sparkles, Crown, Zap } from 'lucide-react'

const CHECKOUT_CADERNOS_URL = process.env.NEXT_PUBLIC_KIWIFY_CADERNOS_500_URL || 'https://pay.kiwify.com.br/kqeCPlG'
const CHECKOUT_CADERNOS_QUESTOES_URL = process.env.NEXT_PUBLIC_KIWIFY_CADERNOS_QUESTOES_URL || ''
const CHECKOUT_FULL_URL = process.env.NEXT_PUBLIC_KIWIFY_FULL_URL || ''

const PLANS = [
  {
    id: 'CADERNOS_500',
    name: 'Caderno PDF',
    subtitle: 'Para estudar por PDFs de questões comentadas',
    price: 'R$ —',
    period: 'pagamento único',
    icon: <BookOpen size={22} className="text-brand-300" />,
    color: 'border-brand-500/60',
    checkout: CHECKOUT_CADERNOS_URL,
    badge: 'Pacote essencial',
    features: [
      'Acesso ao módulo Cadernos PDF',
      'Upload/importação de PDFs incluso',
      '500 correções/respostas com IA',
      'Filtros por banca, ano, estado e tópico',
      'Histórico dos cadernos importados',
    ],
    note: 'Os créditos são consumidos somente ao responder/corrigir questões com IA.',
    cta: 'Comprar Caderno PDF',
  },
  {
    id: 'PRO',
    name: 'Caderno + Questões',
    subtitle: 'Para usar cadernos e gerar questões novas',
    price: 'R$ —',
    period: 'pagamento único',
    icon: <Sparkles size={22} className="text-amber-400" />,
    color: 'border-amber-500/60',
    checkout: CHECKOUT_CADERNOS_QUESTOES_URL,
    badge: 'Mais vendido',
    highlight: true,
    features: [
      'Tudo do pacote Caderno PDF',
      'Gerador de Questões com IA',
      'Meus Gerados e Histórico',
      '1.000 correções/respostas com IA',
      'Ideal para treinar por tema e banca',
    ],
    note: 'Indicado para quem quer importar PDFs e também criar novas questões.',
    cta: 'Comprar Caderno + Questões',
  },
  {
    id: 'ENTERPRISE',
    name: 'Full',
    subtitle: 'Acesso completo à plataforma',
    price: 'R$ —',
    period: 'pagamento único',
    icon: <Crown size={22} className="text-purple-300" />,
    color: 'border-purple-500/60',
    checkout: CHECKOUT_FULL_URL,
    badge: 'Completo',
    features: [
      'Tudo do Caderno + Questões',
      'Edital Verticalizado',
      'Edital Pro',
      'Mapas Mentais',
      '3.000 correções/respostas com IA',
      'Acesso completo às ferramentas atuais',
    ],
    note: 'Plano para quem quer usar todos os recursos do GabaritoIA.',
    cta: 'Comprar Full',
  },
]

export default function PlanosPage() {
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/credits').then(r => r.json()).then(d => setCredits(d.credits)).catch(() => {})
  }, [])

  function handleCheckout(plan: typeof PLANS[number]) {
    if (!plan.checkout) {
      toast.info(`Configure o checkout da Kiwify para o pacote ${plan.name}.`)
      return
    }
    window.open(plan.checkout, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">💎 Pacotes GabaritoIA</h1>
        <p className="text-zinc-400 text-sm mt-1">Escolha o pacote ideal. O acesso é liberado pela Kiwify ou manualmente pelo administrador.</p>
      </div>

      {credits !== null && (
        <div className="card p-4 mb-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Zap size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Seus créditos atuais</div>
            <div className="text-xs text-zinc-500">Upload/importação do PDF está incluso. Créditos são consumidos ao responder/corrigir questões com IA.</div>
          </div>
          <div className="font-heading text-2xl font-bold text-amber-400">{credits}</div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {PLANS.map(plan => (
          <div key={plan.id} className={`card p-5 border ${plan.color} ${plan.highlight ? 'relative bg-amber-500/5' : ''}`}>
            <div className="mb-4 inline-flex rounded-full bg-zinc-800/80 px-3 py-1 text-[11px] font-semibold text-zinc-300 border border-white/10">
              {plan.badge}
            </div>
            <div className="flex items-center gap-2 mb-2">
              {plan.icon}
              <span className="font-heading font-bold text-lg">{plan.name}</span>
            </div>
            <p className="text-xs text-zinc-500 min-h-[34px] mb-4">{plan.subtitle}</p>
            <div className="mb-4">
              <span className="font-heading text-2xl font-bold">{plan.price}</span>
              <span className="text-zinc-500 text-sm ml-1">{plan.period}</span>
            </div>
            <ul className="space-y-2 mb-5 min-h-[210px]">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckCircle size={13} className="text-green-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mb-5 rounded-xl bg-zinc-800/50 border border-white/10 p-3 text-[11px] text-zinc-400 leading-relaxed">
              {plan.note}
            </div>
            <button
              onClick={() => handleCheckout(plan)}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                plan.highlight
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                  : 'bg-gradient-to-r from-brand-600 to-purple-600 text-white hover:opacity-90'
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
