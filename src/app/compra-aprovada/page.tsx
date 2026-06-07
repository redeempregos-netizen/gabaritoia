import Link from 'next/link'
import { CheckCircle2, Mail, LockKeyhole, MessageCircle } from 'lucide-react'

export default function CompraAprovadaPage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-green-950/30 via-transparent to-brand-950/30 pointer-events-none" />
      <section className="w-full max-w-2xl relative z-10">
        <div className="card p-6 sm:p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-green-500/15 border border-green-500/20 flex items-center justify-center text-green-300 mb-5">
            <CheckCircle2 size={34} />
          </div>

          <h1 className="font-heading text-3xl md:text-4xl font-black tracking-tight text-white">
            Compra aprovada!
          </h1>

          <p className="text-zinc-300 mt-3 leading-relaxed">
            Seu pagamento foi confirmado. O GabaritoIA está liberando seu acesso automaticamente pelo e-mail usado na compra.
          </p>

          <div className="grid md:grid-cols-3 gap-3 mt-7 text-left">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <Mail className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">1. Confira seu e-mail</div>
              <p className="text-xs text-zinc-400 mt-1">Procure o link de ativação enviado após a confirmação.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <LockKeyhole className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">2. Crie sua senha</div>
              <p className="text-xs text-zinc-400 mt-1">Abra o link recebido e defina sua senha de acesso.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <CheckCircle2 className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">3. Entre no painel</div>
              <p className="text-xs text-zinc-400 mt-1">Depois entre com o mesmo e-mail usado na compra.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100 mt-6 text-left">
            O e-mail pode levar alguns minutos. Verifique também a caixa de spam, promoções ou lixo eletrônico.
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
            <Link href="/login" className="btn-primary h-11 px-6 inline-flex items-center justify-center">
              Ir para o login
            </Link>
            <Link href="/suporte" className="btn-secondary h-11 px-6 inline-flex items-center justify-center gap-2">
              <MessageCircle size={16} /> Preciso de ajuda
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
