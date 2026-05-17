'use client'
import { useEffect, useState } from 'react'
import { Zap, Gift } from 'lucide-react'
import { toast } from 'sonner'

export function CreditsWidget() {
  const [credits, setCredits] = useState<number | null>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => setCredits(d.credits))
      .catch(() => {})
  }, [])

  async function claimBonus() {
    setClaiming(true)
    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'daily_bonus' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      setCredits(data.credits)
      toast.success(`+${data.amount} créditos! Bônus diário resgatado 🎉`)
    } finally {
      setClaiming(false)
    }
  }

  if (credits === null) return null

  return (
    <div className="mx-3 mb-2">
      <div className="bg-zinc-800/60 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Zap size={13} className="text-amber-400" />
            <span className="text-xs font-medium text-zinc-300">Créditos</span>
          </div>
          <span className="font-heading font-bold text-amber-400 text-sm">{credits}</span>
        </div>
        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
            style={{ width: `${Math.min(credits / 50 * 100, 100)}%` }}
          />
        </div>
        <button
          onClick={claimBonus}
          disabled={claiming}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
        >
          <Gift size={11} />
          {claiming ? 'Resgatando...' : 'Bônus diário'}
        </button>
      </div>
    </div>
  )
}

// Hook para usar créditos em qualquer página
export function useCredits() {
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/credits').then(r => r.json()).then(d => setCredits(d.credits)).catch(() => {})
  }, [])

  function refresh() {
    fetch('/api/credits').then(r => r.json()).then(d => setCredits(d.credits)).catch(() => {})
  }

  return { credits, refresh }
}
