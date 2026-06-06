'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'

export default function AtivarAcessoPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    async function load() {
      const currentToken = new URLSearchParams(window.location.search).get('token') || ''
      setToken(currentToken)

      if (!currentToken) {
        setError('Link inválido.')
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/auth/activate-purchase?token=${encodeURIComponent(currentToken)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'Link inválido.')
          return
        }
        setEmail(data.access?.email || '')
        setPlan(data.access?.plan || '')
        setExpiresAt(data.access?.expiresAt || '')
      } catch {
        setError('Erro ao validar link.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não conferem.')
      return
    }
    if (!token) {
      toast.error('Link inválido.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/activate-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível ativar.')
        return
      }
      toast.success('Acesso ativado. Entre com seu e-mail e senha.')
      router.push('/login')
    } catch {
      toast.error('Erro ao ativar acesso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-950/30 via-transparent to-purple-950/20 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="card p-6 sm:p-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/20 flex items-center justify-center mb-4 text-brand-300">
            <LockKeyhole size={22} />
          </div>
          <div className="font-heading font-extrabold text-3xl mb-2 tracking-tight">Ativar acesso</div>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Use o link recebido após a compra para definir sua senha.</p>

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-300 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-brand-300" /> Validando link...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
          )}

          {!loading && !error && (
            <form onSubmit={submit} className="space-y-4">
              <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-xs text-green-100 leading-relaxed">
                Login: <strong>{email}</strong><br />
                Plano: <strong>{plan}</strong><br />
                Link válido até: <strong>{expiresAt ? new Date(expiresAt).toLocaleString('pt-BR') : '24 horas'}</strong>
              </div>
              <div>
                <label className="label">E-mail da compra</label>
                <input className="input opacity-80" value={email} disabled />
              </div>
              <div>
                <label className="label">Senha</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="mínimo 8 caracteres" />
              </div>
              <div>
                <label className="label">Confirmar senha</label>
                <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="repita sua senha" />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 h-11">
                {saving && <Loader2 size={16} className="animate-spin" />} Ativar acesso
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
