'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, ShieldCheck, CalendarDays, Zap, CreditCard, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'

type AccountUser = {
  id: string
  name: string
  email: string
  role: string
  plan: string
  credits: number
  creditsUsed: number
  creditsRenewedAt?: string | null
  planExpiresAt?: string | null
  planDaysLeft?: number | null
  planExpired?: boolean
}

type PlanOption = { id: string; label: string; days: number; description: string }

function formatDate(value?: string | null) {
  if (!value) return 'Sem vencimento'
  return new Date(value).toLocaleDateString('pt-BR')
}

function nextCreditRenewal(value?: string | null) {
  if (!value) return 'Ao acessar a conta'
  const date = new Date(value)
  date.setDate(date.getDate() + 30)
  return date.toLocaleDateString('pt-BR')
}

const CHECKOUT_LINKS: Record<string, string> = {
  mensal: '#',
  trimestral: '#',
  anual: '#',
}

export default function MinhaContaPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [user, setUser] = useState<AccountUser | null>(null)
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => { loadAccount() }, [])

  async function loadAccount() {
    setLoading(true)
    try {
      const res = await fetch('/api/account')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao carregar conta'); return }
      setUser(data.user)
      setPlans(data.plans || [])
      setName(data.user?.name || '')
      setEmail(data.user?.email || '')
    } catch {
      toast.error('Erro ao carregar conta')
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao atualizar conta'); return }
      toast.success(data.message || 'Conta atualizada')
      await loadAccount()
    } catch {
      toast.error('Erro ao atualizar conta')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) { toast.error('A nova senha precisa ter pelo menos 8 caracteres'); return }
    if (newPassword !== confirmPassword) { toast.error('As senhas não conferem'); return }

    setChangingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao alterar senha'); return }
      toast.success(data.message || 'Senha alterada com sucesso')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Erro ao alterar senha')
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>
  if (!user) return <div className="p-8 text-zinc-400">Não foi possível carregar sua conta.</div>

  const expired = user.planExpired
  const daysLeft = user.planDaysLeft

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <ShieldCheck size={13} /> Minha Conta
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Gerencie seu acesso</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Veja seu plano, créditos, vencimento e atualize seus dados de acesso.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><CreditCard size={14} /> Plano atual</div>
          <div className="font-heading text-2xl font-bold text-white">{user.plan}</div>
          <div className={expired ? 'text-red-300 text-sm mt-2' : 'text-green-300 text-sm mt-2'}>{expired ? 'Plano expirado' : 'Plano ativo'}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><CalendarDays size={14} /> Validade</div>
          <div className="font-heading text-xl font-bold text-white">{formatDate(user.planExpiresAt)}</div>
          <div className="text-zinc-500 text-sm mt-2">{daysLeft === null ? 'Acesso vitalício' : expired ? `Expirado há ${Math.abs(daysLeft)} dia(s)` : `${daysLeft} dia(s) restantes`}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><Zap size={14} /> Créditos</div>
          <div className="font-heading text-2xl font-bold text-amber-300">{user.credits}</div>
          <div className="text-zinc-500 text-sm mt-2">Usados: {user.creditsUsed || 0}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-heading font-bold text-lg">Meu perfil</h2>
            <p className="text-xs text-zinc-500 mt-1">Atualize nome e e-mail da sua conta.</p>
          </div>
          <div>
            <label className="label">Nome</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <button onClick={saveProfile} disabled={saving} className="btn-primary flex items-center justify-center gap-2 h-11">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar dados
          </button>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-heading font-bold text-lg flex items-center gap-2"><LockKeyhole size={18} /> Alterar senha</h2>
            <p className="text-xs text-zinc-500 mt-1">Depois de alterar, você precisará entrar novamente.</p>
          </div>
          <div>
            <label className="label">Senha atual</label>
            <input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Nova senha</label>
            <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirmar nova senha</label>
            <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          <button onClick={changePassword} disabled={changingPassword} className="btn-secondary flex items-center justify-center gap-2 h-11 w-full">
            {changingPassword && <Loader2 size={15} className="animate-spin" />}
            Alterar senha
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4">
          <h2 className="font-heading font-bold text-lg">Comprar ou renovar plano</h2>
          <p className="text-xs text-zinc-500 mt-1">Escolha uma opção para renovar seu acesso. Configure os links de checkout depois.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {plans.map(plan => (
            <div key={plan.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="font-heading font-bold text-white">{plan.label}</div>
              <div className="text-sm text-zinc-400 mt-1">{plan.description}</div>
              <div className="text-xs text-zinc-500 mt-3">{plan.days} dias de acesso</div>
              <a href={CHECKOUT_LINKS[plan.id] || '#'} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 hover:bg-brand-500 px-3 py-2 text-sm font-semibold text-white">
                Escolher plano
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100">
        Próxima renovação de créditos: {nextCreditRenewal(user.creditsRenewedAt)}. Os créditos gratuitos renovam automaticamente a cada 30 dias quando você acessa a plataforma.
      </div>
    </div>
  )
}
