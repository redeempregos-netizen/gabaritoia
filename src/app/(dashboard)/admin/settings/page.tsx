import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Settings, Brain, DollarSign, CreditCard, HelpCircle } from 'lucide-react'

export default async function AdminSettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN') redirect('/dashboard')

  const cards = [
    {
      href: '/admin',
      title: 'Configurações gerais',
      desc: 'APIs, limites, planos, usuários e segurança.',
      icon: Settings,
    },
    {
      href: '/admin/ia-recursos',
      title: 'IA por recurso',
      desc: 'Escolher o provedor de IA para cada funcionalidade.',
      icon: Brain,
    },
    {
      href: '/admin/custos',
      title: 'Custos da IA',
      desc: 'Acompanhar gastos, chamadas e tokens.',
      icon: DollarSign,
    },
    {
      href: '/admin/assinaturas',
      title: 'Assinaturas',
      desc: 'Gerenciar planos, créditos e acessos.',
      icon: CreditCard,
    },
    {
      href: '/admin/suporte',
      title: 'Suporte',
      desc: 'Ver solicitações e problemas enviados pelos usuários.',
      icon: HelpCircle,
    },
  ]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-36 md:pb-6">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <Settings size={13} /> Admin
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Configurações</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">
          Central de atalhos para todas as configurações administrativas do GabaritoIA.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <Link prefetch={false} key={card.href} href={card.href} className="card p-5 flex items-start gap-4 hover:border-brand-500/30 active:scale-[0.99] transition-all">
              <div className="w-11 h-11 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-300 shrink-0">
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="font-heading font-bold text-zinc-100">{card.title}</div>
                <div className="text-sm text-zinc-500 mt-1 leading-relaxed">{card.desc}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
