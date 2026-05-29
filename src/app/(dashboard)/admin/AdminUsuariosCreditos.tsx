'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Save } from 'lucide-react'
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

function formatDate(value?: string | null) {
  if (!value) return 'Vitalício / sem vencimento'
  return new Date(value).toLocaleDateString('pt-BR')
}

function daysLeft(value?: string | null) {
  if (!value) return null
  const diff = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
  return diff
}

export default function AdminUsuariosCreditos() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [monthlyFreeCredits, setMonthlyFreeCredits] = useState(1000)
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao carregar usuários')
        return
      }
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

  async function updateUser(userId: string, payload: Record<string, string | number | boolean>) {
    setSaving(userId)
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_user', userId, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao atualizar usuário')
        return
      }
      toast.success('Usuário atualizado')
      await load()
    } catch {
      toast.error('Erro ao atualizar usuário')
    } finally {
      setSaving(null)
    }
  }

  async function saveMonthlyConfig() {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', monthlyFreeCredits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar renovação')
        return
      }
      toast.success('Renovação mensal salva')
    } catch {
      toast.error('Erro ao salvar renovação')
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) {
    return <div className="card p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={28} /></div>
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <h2 className="font-heading font-semibold text-sm text-brand-300 mb-3">Renovação automática de créditos</h2>
            <label className="label">Créditos gratuitos a cada 30 dias</label>
            <input
              className="input max-w-xs"
              type="number"
              min={0}
              value={monthlyFreeCredits}
              onChange={e => setMonthlyFreeCredits(Number(e.target.value))}
            />
            <p className="text-xs text-zinc-500 mt-2">
              Quando o usuário acessar após 30 dias, o sistema renova para este valor e zera os créditos usados.
            </p>
          </div>
          <button onClick={saveMonthlyConfig} disabled={savingConfig} className="btn-primary flex items-center justify-center gap-2 h-11">
            {savingConfig ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar renovação
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold text-sm text-brand-300">Usuários cadastrados</h2>
            <p className="text-xs text-zinc-500 mt-1">Ajuste créditos, role, plano e validade de acesso de cada usuário.</p>
          </div>
          <button onClick={load} className="btn-secondary text-xs flex items-center gap-1"><RefreshCw size={13} /> Atualizar</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px]">
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
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const left = daysLeft(user.planExpiresAt)
                const expired = user.planExpired || (left !== null && left < 0)
                return (
                  <tr key={user.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm">{user.name || 'Sem nome'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{user.email}</td>
                    <td className="px-4 py-3">
                      <select className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none" value={user.role} onChange={e => updateUser(user.id, { role: e.target.value })}>
                        <option value="USER">Usuário</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none" value={user.plan} onChange={e => updateUser(user.id, { plan: e.target.value })}>
                        <option value="FREE">Free</option>
                        <option value="PRO">Pro</option>
                        <option value="ENTERPRISE">Enterprise</option>
                        <option value="CADERNOS_500">Cadernos 500</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className={expired ? 'text-red-300 font-semibold' : 'text-zinc-300'}>{formatDate(user.planExpiresAt)}</div>
                      {left !== null && <div className={expired ? 'text-red-400 mt-1' : 'text-zinc-500 mt-1'}>{expired ? `Expirado há ${Math.abs(left)} dia(s)` : `${left} dia(s) restantes`}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button disabled={saving === user.id} onClick={() => updateUser(user.id, { planDurationDays: 30 })} className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-brand-500/50 hover:text-brand-200 disabled:opacity-50">30 dias</button>
                        <button disabled={saving === user.id} onClick={() => updateUser(user.id, { planDurationDays: 90 })} className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-brand-500/50 hover:text-brand-200 disabled:opacity-50">90 dias</button>
                        <button disabled={saving === user.id} onClick={() => updateUser(user.id, { planDurationDays: 365 })} className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-brand-500/50 hover:text-brand-200 disabled:opacity-50">1 ano</button>
                        <button disabled={saving === user.id} onClick={() => updateUser(user.id, { clearPlanExpiration: true })} className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] text-green-300 disabled:opacity-50">Vitalício</button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          className="w-28 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none"
                          type="number"
                          min={0}
                          value={drafts[user.id] ?? String(user.credits ?? 0)}
                          onChange={e => setDrafts(prev => ({ ...prev, [user.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => updateUser(user.id, { credits: Math.max(0, Number(drafts[user.id] || 0)) })}
                          disabled={saving === user.id}
                          className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {saving === user.id ? '...' : 'Salvar'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{user.creditsUsed ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{user.creditsRenewedAt ? new Date(user.creditsRenewedAt).toLocaleDateString('pt-BR') : 'Pendente'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{user.streak || 0} dias</td>
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
