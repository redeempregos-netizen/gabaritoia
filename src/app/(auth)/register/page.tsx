'use client'
import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-950/30 via-transparent to-purple-950/20 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="card p-8 text-center">
          <div className="font-heading font-extrabold text-2xl mb-2 tracking-tight">
            Gabarito<span className="text-brand-400">IA</span>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed mb-6">
            O cadastro público está fechado. O acesso é liberado após a compra pela Kiwify ou criado manualmente pela administração.
          </p>
          <Link href="/login" className="btn-primary w-full inline-flex items-center justify-center">
            Entrar na conta
          </Link>
          <p className="text-xs text-zinc-500 mt-5">
            Após a compra, use o mesmo e-mail informado no checkout.
          </p>
        </div>
      </div>
    </div>
  )
}
