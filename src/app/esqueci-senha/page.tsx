'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2 } from 'lucide-react'

const schema = z.object({
  email: z.string().email('Informe um e-mail válido'),
})

type Form = z.infer<typeof schema>

export default function EsqueciSenhaPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailSent, setEmailSent] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Form) {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Não foi possível solicitar recuperação.'); return }
      setSent(true)
      setEmailSent(json.emailSent === true)
      setMessage(json.message || 'Solicitação registrada.')
      toast.success(json.message || 'Solicitação registrada.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-950/30 via-transparent to-purple-950/20 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="card p-6 sm:p-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/20 flex items-center justify-center mb-4 text-brand-300">
            <KeyRound size={22} />
          </div>
          <h1 className="font-heading text-2xl font-bold mb-2">Esqueci minha senha</h1>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Informe o e-mail da sua conta para receber o link de redefinição.</p>

          {!sent ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">E-mail</label>
                <input {...register('email')} type="email" className="input" placeholder="seu@email.com" autoComplete="email" />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
                {loading && <Loader2 size={16} className="animate-spin" />}
                Enviar link de redefinição
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {emailSent ? (
                <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-100">
                  {message || 'Link enviado. Verifique seu e-mail e a caixa de spam.'}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100 leading-relaxed">
                  <div className="font-semibold mb-1">Não foi possível enviar o e-mail automaticamente.</div>
                  <div>{message || 'A solicitação foi registrada, mas o envio automático de e-mail precisa ser configurado.'}</div>
                  <div className="mt-3 text-xs text-amber-200">Entre em contato com o suporte para receber ajuda na redefinição da senha.</div>
                </div>
              )}
              <button type="button" onClick={() => { setSent(false); setEmailSent(null); setMessage('') }} className="btn-secondary w-full h-11">Tentar outro e-mail</button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-brand-300 hover:text-brand-200">Voltar para o login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
