'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2 } from 'lucide-react'

const schema = z.object({
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  confirmPassword: z.string().min(8, 'Confirme a senha'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
})

type Form = z.infer<typeof schema>

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [valid, setValid] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    async function check() {
      if (!token) { setChecking(false); setValid(false); return }
      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      const data = await res.json().catch(() => ({}))
      setValid(res.ok)
      setEmail(data.email || '')
      setChecking(false)
    }
    void check()
  }, [token])

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newValue: data.password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Não foi possível redefinir a senha.'); return }
      toast.success(json.message || 'Senha redefinida com sucesso.')
      router.push('/login')
      router.refresh()
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
          <h1 className="font-heading text-2xl font-bold mb-2">Criar nova senha</h1>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Escolha uma nova senha para acessar sua conta.</p>

          {checking ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={16} className="animate-spin" /> Validando link...</div>
          ) : !valid ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">Link inválido ou expirado.</div>
              <Link href="/esqueci-senha" className="btn-primary w-full flex items-center justify-center h-11">Solicitar novo link</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {email && <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3 text-xs text-zinc-400">Conta: <b className="text-zinc-200">{email}</b></div>}
              <div>
                <label className="label">Nova senha</label>
                <input {...register('password')} type="password" className="input" placeholder="mínimo 8 caracteres" autoComplete="new-password" />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="label">Confirmar senha</label>
                <input {...register('confirmPassword')} type="password" className="input" placeholder="repita a senha" autoComplete="new-password" />
                {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
                {loading && <Loader2 size={16} className="animate-spin" />}
                Salvar nova senha
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-brand-300 hover:text-brand-200">Voltar para o login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
