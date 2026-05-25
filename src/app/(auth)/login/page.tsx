'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, LogIn } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})
type Form = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Bem-vindo de volta!')
      router.push('/dashboard')
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
            <LogIn size={22} />
          </div>
          <div className="font-heading font-extrabold text-2xl mb-1 tracking-tight">
            Entrar no Gabarito<span className="text-brand-400">IA</span>
          </div>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            Acesso exclusivo para compradores. Use o e-mail informado na compra e a senha liberada pela administração.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input {...register('email')} type="email" className="input" placeholder="seu@email.com" autoComplete="email" />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Senha</label>
              <input {...register('password')} type="password" className="input" placeholder="••••••••" autoComplete="current-password" />
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2 h-11">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Entrar
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
            Não existe cadastro aberto. O acesso é criado automaticamente pela compra ou manualmente pelo administrador.
          </div>

          <p className="text-center text-xs text-zinc-500 mt-5">
            Ainda não recebeu acesso? Fale com o suporte informando o mesmo e-mail da compra.
          </p>
        </div>
      </div>
    </div>
  )
}
