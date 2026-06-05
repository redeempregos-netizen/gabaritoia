'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, Save, Trash2, UserCog } from 'lucide-react'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  plan: string
  credits: number
  createdAt: string
  streak: number
  planStartedAt?: string | null
  planExpiresAt?: string | null
  planDaysLeft?: number | null
  planExpired?: boolean
}

const PLANS = [
  { value: 'FREE', label: 'Teste — 7 dias' },
  { value: 'PACK', label: 'Plano Pack — 180 dias' },
  { value: 'CADERNOS_500', label: 'Básico — 30 dias' },
  { value: 'PRO', label: 'Pro — 30 dias' },
  { value: 'ENTERPRISE', label: 'Premium — 30 dias' },
]

function formatDate(value?: string | null) {
  if (!value) return 'Sem validade'
  return new Date(value).toLocaleDateString('pt-BR')
}

function planStatus(user: UserRow) {
  if (user.planDaysLeft === null || user.planDaysLeft === undefined) return 'Sem prazo'
  if (user.planExpired) return 'Expirado'
  if (user.planDaysLeft === 0) return 'Vence hoje'
  return `${user.planDaysLeft} dia(s)`
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<UserRow>>>({})

  useEffect(() => { loadUsers() }, [])

  async function loadUsers(q = query) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao carregar usuários')
        return
      }
      setUsers(data.users || [])
    } finally {
      setLoading(false)
    }
  }

  function updateEdit(userId: string, field: keyof UserRow, value: string | number) {
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }))
  }

  async function saveUser(user: UserRow) {
    const edit = edits[user.id] || {}
    const plan = String(edit.plan ?? user.plan)
    const role = String(edit.role ?? user.role)
    const credits = Number(edit.credits ?? user.credits)
    const creditsWasEdited = edit.credits !== undefined && Number(edit.credits) !== Number(user.credits)

    setSaving(user.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, plan, role, credits, creditsWasEdited }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar usuário')
        return
      }
      toast.success('Usuário atualizado')
      setEdits(prev => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      loadUsers()
    } finally {
      setSaving(null)
    }
  }

  async function deleteUser(user: UserRow) {
    const label = user.email || user.name || 'este usuário'
    const confirmed = window.confirm(`Tem certeza que deseja excluir ${label}? Essa ação não pode ser desfeita.`)
    if (!confirmed) return

    setDeleting(user.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao excluir usuário')
        return
      }
      toast.success('Usuário excluído')
      setEdits(prev => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      await loadUsers()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <UserCog size={24} className="text-brand-400" /> Usuários
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Altere plano, créditos, permissão, confira a validade e exclua usuários quando necessário.</p>
      </div>

      <div className="card p-4 mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-zinc-500" />
          <input className="input pl-9" placeholder="Buscar por nome ou e-mail..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadUsers() }} />
        </div>
        <button onClick={() => loadUsers()} className="btn-secondary px-4">Buscar</button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-brand-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Usuário</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Plano</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Validade</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Créditos</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 min-w-[190px]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const edit = edits[user.id] || {}
                  const isBusy = saving === user.id || deleting === user.id
                  return (
                    <tr key={user.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-zinc-100">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{user.email}</td>
                      <td className="px-4 py-3">
                        <select className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none" value={String(edit.role ?? user.role)} onChange={e => updateEdit(user.id, 'role', e.target.value)}>
                          <option value="USER">Usuário</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none" value={String(edit.plan ?? user.plan)} onChange={e => updateEdit(user.id, 'plan', e.target.value)}>
                          {PLANS.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
                        </select>
                        {edit.plan && edit.plan !== user.plan && <div className="text-[10px] text-amber-400 mt-1">Ao salvar, reinicia a validade e redefine créditos do plano.</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className={user.planExpired ? 'text-red-300 font-semibold' : 'text-green-300 font-semibold'}>{planStatus(user)}</div>
                        <div className="text-zinc-500">Vence: {formatDate(user.planExpiresAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} className="w-24 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none" value={Number(edit.credits ?? user.credits)} onChange={e => updateEdit(user.id, 'credits', Number(e.target.value))} />
                      </td>
                      <td className="px-4 py-3 min-w-[190px]">
                        <div className="flex items-center gap-2">
                          <button onClick={() => saveUser(user)} disabled={isBusy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold disabled:opacity-50">
                            {saving === user.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            Salvar
                          </button>
                          <button onClick={() => deleteUser(user)} disabled={isBusy} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-sm shadow-red-950/40 disabled:opacity-50">
                            {deleting === user.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            EXCLUIR
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!users.length && <div className="p-8 text-center text-sm text-zinc-500">Nenhum usuário encontrado.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
