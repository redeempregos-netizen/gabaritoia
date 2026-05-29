'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Save, RefreshCw, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  plan: string
  credits: number
  creditsUsed: number
  creditsRenewedAt?: string | null
  createdAt: string
}

export default function AdminCreditosPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [monthlyFreeCredits, setMonthlyFreeCredits] = useState(1000)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Acesso negado'); return }
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

  async function saveMonthlyConfig() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', monthlyFreeCredits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao salvar configuração'); return }
      toast.success('Créditos mensais atualizados')
    } catch {
      toast.error('Erro ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }

  async function saveUserCredits(userId: string) {
    const credits = Math.max(0, Number(drafts[userId] || 0))
    setSaving(true)
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_user', userId, credits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao atualizar créditos'); return }
      toast.success('Créditos atualizados')
      await load()
    } catch {
      toast.error('Erro ao atualizar créditos')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 mb-4"><ArrowLeft size={14} /> Voltar ao admin</Link>
        <h1 className="font-heading text-2xl font-bold">Créditos dos usuários</h1>
        <p className="text-sm text-zinc-400 mt-1">Ajuste créditos manualmente e configure a renovação automática a cada 30 dias.</p>
      </div>

      <div className="card p-5 mb-5">
        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label">Créditos gratuitos renovados a cada 30 dias</label>
            <input className="input max-w-xs" type="number" min={0} value={monthlyFreeCredits} onChange={e => setMonthlyFreeCredits(Number(e.target.value))} />
            <p className="text-xs text-zinc-500 mt-2">Padrão recomendado: 1000 créditos. A renovação acontece automaticamente quando o usuário volta a acessar após 30 dias.</p>
          </div>
          <button onClick={saveMonthlyConfig} disabled={saving} className="btn-primary flex items-center justify-center gap-2 h-11">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar configuração
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div>
            <div className="font-heading font-bold">Usuários cadastrados</div>
            <div className="text-xs text-zinc-500 mt-1">Mostrando os usuários mais recentes.</div>
          </div>
          <button onClick={load} className="btn-secondary text-xs flex items-center gap-1"><RefreshCw size={13} /> Atualizar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">E-mail</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Créditos atuais</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Créditos usados</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Última renovação</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Ação</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-sm">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{user.plan}</td>
                  <td className="px-4 py-3">
                    <input className="w-28 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none" type="number" min={0} value={drafts[user.id] ?? String(user.credits || 0)} onChange={e => setDrafts(prev => ({ ...prev, [user.id]: e.target.value }))} />
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{user.creditsUsed || 0}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{user.creditsRenewedAt ? new Date(user.creditsRenewedAt).toLocaleDateString('pt-BR') : 'Ainda não renovou'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => saveUserCredits(user.id)} disabled={saving} className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Salvar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
