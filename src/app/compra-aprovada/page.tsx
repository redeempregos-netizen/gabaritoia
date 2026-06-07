'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Loader2, LockKeyhole, MessageCircle, Mail } from 'lucide-react'

export default function CompraAprovadaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function claimAccess(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const res = await fetch('/api/auth/claim-purchase-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Não foi possível encontrar sua compra agora.')
        return
      }

      if (data.redirectUrl) {
        setMessage(data.message || 'Compra encontrada. Redirecionando...')
        window.location.href = data.redirectUrl
        return
      }

      setMessage(data.message || 'Acesso encontrado.')
    } catch {
      setError('Erro ao consultar sua compra. Tente novamente em alguns segundos.')
    } finally {
      setLoading(false)
    }
  }

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
            Digite o e-mail usado na compra para liberar seu acesso e criar sua senha agora.
          </p>

          <form onSubmit={claimAccess} className="mt-6 rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-left">
            <label className="label">E-mail usado na compra</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input flex-1"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                required
              />
              <button disabled={loading} className="btn-primary h-11 px-5 inline-flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
                Criar senha
              </button>
            </div>
            {message && <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-200">{message}</div>}
            {error && <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}
            <p className="text-[11px] text-zinc-500 mt-3">
              Se acabou de pagar, aguarde alguns segundos. O webhook precisa confirmar a compra antes de liberar a senha.
            </p>
          </form>

          <div className="grid md:grid-cols-3 gap-3 mt-7 text-left">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <CheckCircle2 className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">1. Pagamento confirmado</div>
              <p className="text-xs text-zinc-400 mt-1">A Mivvo confirma a compra pelo webhook.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <Mail className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">2. Informe seu e-mail</div>
              <p className="text-xs text-zinc-400 mt-1">Use o mesmo e-mail digitado no checkout.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <LockKeyhole className="text-brand-300 mb-3" size={22} />
              <div className="font-bold text-white text-sm">3. Crie sua senha</div>
              <p className="text-xs text-zinc-400 mt-1">Você será levado para a tela de ativação.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
            <Link href="/login" className="btn-secondary h-11 px-6 inline-flex items-center justify-center">
              Já tenho senha
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
