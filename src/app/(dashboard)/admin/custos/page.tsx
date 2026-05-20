'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, DollarSign, Activity, Zap, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'

type AIUsage = {
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalCostUsd: number
    totalCalls: number
  }
  last7Days: Array<{ day: string; tokens: number; cost: number; calls: number }>
  byProvider: Array<{ provider: string; tokens: number; cost: number; calls: number }>
  byAction: Array<{ action: string; tokens: number; cost: number; calls: number }>
}

export default function AdminCustosPage() {
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<AIUsage | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/stats')
        if (!res.ok) { toast.error('Acesso negado'); return }
        const data = await res.json()
        setUsage(data.aiUsage)
      } catch {
        toast.error('Erro ao carregar custos de IA')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmtUsd = (v: number) => `$${Number(v || 0).toFixed(4)}`
  const fmtInt = (v: number) => Number(v || 0).toLocaleString('pt-BR')

  if (loading) return (
    <div className="flex items-center justify-center h-full p-8">
      <Loader2 className="animate-spin text-brand-400" size={32} />
    </div>
  )

  if (!usage) return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="card p-8 text-center text-zinc-400">Nenhum dado de custo encontrado.</div>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">💰 Custos de IA</h1>
        <p className="text-zinc-400 text-sm mt-1">Acompanhe tokens, chamadas e custo estimado por provedor</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 mb-6">
        Valores são estimativas calculadas por tamanho aproximado de tokens e tabela média por modelo. Para cobrança oficial, confira o painel de cada provedor.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <DollarSign size={16} className="text-green-400 mb-2" />
          <div className="font-heading text-2xl font-bold">{fmtUsd(usage.totals.totalCostUsd)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Custo estimado total</div>
        </div>
        <div className="card p-4">
          <Zap size={16} className="text-brand-400 mb-2" />
          <div className="font-heading text-2xl font-bold">{fmtInt(usage.totals.totalTokens)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Tokens totais</div>
        </div>
        <div className="card p-4">
          <Activity size={16} className="text-blue-400 mb-2" />
          <div className="font-heading text-2xl font-bold">{fmtInt(usage.totals.totalCalls)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Chamadas de IA</div>
        </div>
        <div className="card p-4">
          <BarChart3 size={16} className="text-amber-400 mb-2" />
          <div className="font-heading text-2xl font-bold">{fmtInt(usage.totals.promptTokens)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Tokens de entrada</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h2 className="font-heading font-semibold text-sm text-brand-300 mb-4">Custo estimado — últimos 7 dias</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usage.last7Days}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value: any) => fmtUsd(Number(value))} />
                <Line type="monotone" dataKey="cost" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-heading font-semibold text-sm text-brand-300 mb-4">Tokens — últimos 7 dias</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usage.last7Days}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value: any) => fmtInt(Number(value))} />
                <Bar dataKey="tokens" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07]">
            <h2 className="font-heading font-semibold text-sm text-brand-300">Por provedor</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Provedor</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Chamadas</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Tokens</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Custo</th>
                </tr>
              </thead>
              <tbody>
                {usage.byProvider.map(row => (
                  <tr key={row.provider} className="border-b border-white/[0.04]">
                    <td className="px-4 py-3 text-sm font-medium">{row.provider}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 text-right">{fmtInt(row.calls)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 text-right">{fmtInt(row.tokens)}</td>
                    <td className="px-4 py-3 text-sm text-green-400 text-right">{fmtUsd(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07]">
            <h2 className="font-heading font-semibold text-sm text-brand-300">Por recurso</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Recurso</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Chamadas</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Tokens</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Custo</th>
                </tr>
              </thead>
              <tbody>
                {usage.byAction.map(row => (
                  <tr key={row.action} className="border-b border-white/[0.04]">
                    <td className="px-4 py-3 text-sm font-medium">{row.action}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 text-right">{fmtInt(row.calls)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 text-right">{fmtInt(row.tokens)}</td>
                    <td className="px-4 py-3 text-sm text-green-400 text-right">{fmtUsd(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
