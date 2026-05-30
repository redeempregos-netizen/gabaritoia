'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

type PlanSetting = {
  id: string
  name: string
  price: string
  credits: number
  validityDays: number
  active: boolean
  description: string
}

export default function AdminPlanos() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plans, setPlans] = useState<PlanSetting[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plan-settings')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao carregar planos')
        return
      }
      setPlans(data.plans || [])
    } catch {
      toast.error('Erro ao carregar planos')
    } finally {
      setLoading(false)
    }
  }

  function updatePlan(id: string, field: keyof PlanSetting, value: string | number | boolean) {
    setPlans(prev => prev.map(plan => plan.id === id ? { ...plan, [field]: value } : plan))
  }

  async function savePlans() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plan-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar planos')
        return
      }
      setPlans(data.plans || plans)
      toast.success('Planos salvos')
    } catch {
      toast.error('Erro ao salvar planos')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={28} /></div>

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-heading font-semibold text-sm text-brand-300">Planos comerciais</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Ajuste preço, créditos e validade exibidos/considerados nos fluxos manuais. Os códigos dos planos seguem fixos para compatibilidade com o sistema.
        </p>
      </div>

      <div className="grid gap-4">
        {plans.map(plan => (
          <div key={plan.id} className="card p-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">{plan.id}</div>
                <input
                  className="mt-1 w-full max-w-xs rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-lg font-bold text-zinc-100 outline-none focus:border-brand-500/60"
                  value={plan.name}
                  onChange={e => updatePlan(plan.id, 'name', e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={plan.active}
                  onChange={e => updatePlan(plan.id, 'active', e.target.checked)}
                />
                Ativo
              </label>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <label className="label">Preço</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">R$</span>
                  <input className="input" value={plan.price} onChange={e => updatePlan(plan.id, 'price', e.target.value)} placeholder="47,00" />
                </div>
              </div>
              <div>
                <label className="label">Créditos</label>
                <input className="input" type="number" min={0} value={plan.credits} onChange={e => updatePlan(plan.id, 'credits', Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div>
                <label className="label">Validade em dias</label>
                <input className="input" type="number" min={1} value={plan.validityDays} onChange={e => updatePlan(plan.id, 'validityDays', Math.max(1, Number(e.target.value) || 30))} />
              </div>
              <div>
                <label className="label">Resumo</label>
                <input className="input" value={plan.description} onChange={e => updatePlan(plan.id, 'description', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={savePlans} disabled={saving} className="btn-primary flex items-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar planos
      </button>
    </div>
  )
}
