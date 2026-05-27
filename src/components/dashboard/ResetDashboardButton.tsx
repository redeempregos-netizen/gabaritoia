'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

export function ResetDashboardButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function resetar() {
    const ok = window.confirm('Resetar seu painel? Isso apaga respostas, histórico de desempenho e planos de estudo. Suas questões geradas e créditos não serão apagados.')
    if (!ok) return

    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/reset', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao resetar painel')
        return
      }
      toast.success('Painel resetado')
      router.refresh()
    } catch {
      toast.error('Erro ao resetar painel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={resetar}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
    >
      <RotateCcw size={14} />
      {loading ? 'Resetando...' : 'Resetar painel'}
    </button>
  )
}
