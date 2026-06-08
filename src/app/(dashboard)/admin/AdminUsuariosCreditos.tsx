'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  plan: string
  streak: number
  credits?: number
  creditsUsed?: number
  creditsRenewedAt?: string | null
  planExpiresAt?: string | null
  planExpired?: boolean
}

type NewUserForm = {
  name: string
  email: string
  password: string
  role: string
  plan: string
  credits: string
  validity: string
}

const PLAN_OPTIONS = [
  { value: 'FREE', label: 'Teste', credits: 300, validity: '7' },
  { value: 'PACK', label: 'Plano Pack', credits: 1000, validity: '180' },
  { value: 'CADERNOS_500', label: 'Mensal', credits: 1000, validity: '30' },
  { value: 'PRO', label: 'Trimestral', credits: 3000, validity: '90' },
  { value: 'ENTERPRISE', label: 'Anual', credits: 8000, validity: '365' },
]

const defaultNewUser: NewUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'USER',
  plan: 'FREE',
  credits: '300',
  validity: '7',
}

function formatDate(value?: string | null) {
  if (!value) return 'Vitalício / sem vencimento'
  return new Date(value).toLocaleDateString('pt-BR')
}

function daysLeft(value?: string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

function getPlanLabel(plan: string) {
  return PLAN_OPTIONS.find(option => option.value === plan)?.label || plan
}

function getPlanCredits(plan: string) {
  return PLAN_OPTIONS.find(option => option.value === plan)?.credits || 0
}

function getPlanValidity(plan: string) {
  return PLAN_OPTIONS.find(option => option.value === plan)?.validity || '30'
}

export default function AdminUsuariosCreditos() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [monthlyFreeCredits, setMonthlyFreeCredits] = useState(1000)
  const [savingConfig, setSavingConfig] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState<NewUserForm>(defaultNewUser)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao carregar usuários'); return }
      const list = data.recentUsers || []
      setUsers(list)
      setMonthlyFreeCredits(Number(data.config?.monthlyFreeCredits || 1000))
      const next: Record<string, string> = {}
      list.forEach((u: UserRow) => { next[u.id] = String(u.credits ?? 0) })
      setDrafts(next)
    } catch {
      toast.error('Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  function changeNewUserPlan(plan: string) {
    setNewUser(prev => ({ ...prev, plan, credits: String(getPlanCredits(plan)), validity: getPlanValidity(plan) }))
  }

  async function createUser() {
    setCreating(true)
    try {
      const payload: Record<string, string | number | boolean> = {
        action: 'create_user',
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role,
        plan: newUser.plan,
        credits: Math.max(0, Number(newUser.credits) || 0),
      }
      if (newUser.validity === 'vitalicio') payload.clearPlanExpiration = true
      else payload.planDurationDays = Math.max(1, Number(newUser.validity) || 30)

      const res = await fetch('/api/admin/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao criar usuário'); return }
      toast.success('Usuário criado com sucesso')
      setNewUser(defaultNewUser)
      await load()
    } catch {
      toast.error('Erro ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  async function updateUser(userId: string, payload: Record<string, string | number | boolean>) {
    setSaving(userId)
    try {
      const res = await fetch('/api/admin/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_user', userId, ...payload }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao atualizar usuário'); return }
      toast.success('Usuário atualizado')
      await load()
    } catch {
      toast.error('Erro ao atualizar usuário')
    } finally {
      setSaving(null)
    }
  }

  async function deleteUser(user: UserRow) {
    const label = user.email || user.name || 'este usuário'
    if (!window.confirm(`Tem certeza que deseja excluir ${label}? Essa ação não pode ser desfeita.`)) return
    setDeleting(user.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir usuário'); return }
      toast.success('Usuário excluído')
      await load()
    } catch {
      toast.error('Erro ao excluir usuário')
    } finally {
      setDeleting(null)
    }
  }

  async function applyPlanToUser(user: UserRow, plan: string) {
    await updateUser(user.id, { plan, credits: getPlanCredits(plan), planDurationDays: Number(getPlanValidity(plan)) })
  }

  async function saveMonthlyConfig() {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/admin/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_config', monthlyFreeCredits }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao salvar renovação'); return }
      toast.success('Renovação mensal salva')
    } catch {
      toast.error('Erro ao salvar renovação')
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) return <div className="card p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={28} /></div>

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading font-semibold text-sm text-brand-300">Adicionar usuário manualmente</h2>
            <p className="text-xs text-zinc-500 mt-1">Crie contas pelo painel. Os planos comerciais são Mensal, Trimestral e Anual.</p>
          </div>
          <Plus className="text-brand-400" size={18} />
        </div>

        <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div><label className="label">Nome</label><input className="input" value={newUser.name} onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))} placeholder="Nome do usuário" /></div>
          <div><label className="label">E-mail</label><input className="input" type="email" value={newUser.email} onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="email@exemplo.com" /></div>
          <div><label className="label">Senha inicial</label><input className="input" type="text" value={newUser.password} onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} placeholder="mín. 6 caracteres" /></div>
          <div><label className="label">Plano</label><select className="input" value={newUser.plan} onChange={e => changeNewUserPlan(e.target.value)}>{PLAN_OPTIONS.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}</select></div>
          <div><label className="label">Validade</label><select className="input" value={newUser.validity} onChange={e => setNewUser(prev => ({ ...prev, validity: e.target.value }))}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">6 meses</option><option value="365">1 ano</option><option value="vitalicio">Vitalício</option></select></div>
          <div><label className="label">Créditos</label><input className="input" type="number" min={0} value={newUser.credits} onChange={e => setNewUser(prev => ({ ...prev, credits: e.target.value }))} /></div>
          <div><label className="label">Role</label><select className="input" value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}><option value="USER">Usuário</option><option value="ADMIN">Admin</option></select></div>
          <div className="md:col-span-2 xl:col-span-5 flex items-end"><button onClick={createUser} disabled={creating} className="btn-primary h-11 w-full md:w-auto flex items-center justify-center gap-2">{creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Criar usuário</button></div>
        </div>
      </div>

      <div className="card p-5">
        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <h2 className="font-heading font-semibold text-sm text-brand-300 mb-3">Renovação automática de créditos</h2>
            <label className="label">Créditos gratuitos a cada 30 dias</label>
            <input className="input max-w-xs" type="number" min={0} value={monthlyFreeCredits} onChange={e => setMonthlyFreeCredits(Number(e.target.value))} />
            <p className="text-xs text-zinc-500 mt-2">Quando o usuário acessar após 30 dias, o sistema renova para este valor e zera os créditos usados.</p>
          </div>
          <button onClick={saveMonthlyConfig} disabled={savingConfig} className="btn-primary flex items-center justify-center gap-2 h-11">{savingConfig ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar renovação</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div><h2 className="font-heading font-semibold text-sm text-brand-300">Usuários cadastrados</h2><p className="text-xs text-zinc-500 mt-1">Ajuste créditos, role, plano, validade e exclusão de acesso de cada usuário.</p></div>
          <button onClick={load} className="btn-secondary text-xs flex items-center gap-1"><RefreshCw size={13} /> Atualizar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">E-mail</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Validade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Renovar plano</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Créditos</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Usados</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Última renovação</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Streak</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const left = daysLeft(user.planExpiresAt)
                const expired = user.planExpired || (left !== null && left < 0)
                const isBusy = saving === user.id || deleting === user.id
                return (
                  <tr key={user.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm text-zinc-100">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{user.email}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{user.role}</td>
                    <td className="px-4 py-3 text-xs text-zinc-300">{getPlanLabel(user.plan)}</td>
                    <td className="px-4 py-3 text-xs"><div className="text-zinc-300">{formatDate(user.planExpiresAt)}</div><div className={expired ? 'text-red-300' : 'text-zinc-500'}>{left === null ? 'Sem prazo' : expired ? 'Expirado' : `${left} dia(s)`}</div></td>
                    <td className="px-4 py-3"><select disabled={isBusy} className="input min-w-[140px]" value={user.plan} onChange={e => applyPlanToUser(user, e.target.value)}>{PLAN_OPTIONS.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}</select></td>
                    <td className="px-4 py-3"><input className="input w-24" type="number" min={0} value={drafts[user.id] ?? String(user.credits ?? 0)} onChange={e => setDrafts(prev => ({ ...prev, [user.id]: e.target.value }))} /></td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{user.creditsUsed ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(user.creditsRenewedAt)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{user.streak}</td>
                    <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => updateUser(user.id, { credits: Math.max(0, Number(drafts[user.id]) || 0) })} disabled={isBusy} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">{saving === user.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar</button><button onClick={() => deleteUser(user)} disabled={isBusy} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 border-red-500/30 text-red-300 hover:bg-red-500/10">{deleting === user.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}Excluir</button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
