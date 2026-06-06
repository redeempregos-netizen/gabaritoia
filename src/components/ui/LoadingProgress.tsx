'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

type LoadingProgressProps = {
  title?: string
  description?: string
}

export function LoadingProgress({
  title = 'Processando...',
  description = 'Aguarde enquanto preparamos o resultado.',
}: LoadingProgressProps) {
  const [percent, setPercent] = useState(8)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds(prev => prev + 1)
      setPercent(prev => {
        if (prev < 35) return prev + 7
        if (prev < 65) return prev + 4
        if (prev < 84) return prev + 2
        if (prev < 95) return prev + 1
        return prev
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  const step = useMemo(() => {
    if (percent < 30) return 'Preparando contexto e conferindo dados...'
    if (percent < 55) return 'Enviando solicitação para a inteligência artificial...'
    if (percent < 78) return 'Montando questões, alternativas e comentários...'
    if (percent < 95) return 'Finalizando e salvando no seu painel...'
    return 'Quase pronto...'
  }, [percent])

  return (
    <div className="card p-8 text-center">
      <Loader2 size={34} className="animate-spin text-brand-400 mx-auto mb-4" />
      <div className="font-heading text-lg font-bold text-zinc-100 mb-1">{title}</div>
      <div className="text-zinc-400 text-sm mb-5">{description}</div>

      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-zinc-500">{step}</span>
          <span className="font-bold text-brand-300">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-purple-500 transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 text-[11px] text-zinc-600">
          Tempo decorrido: {seconds}s · Pode levar um pouco mais conforme a quantidade de questões.
        </div>
      </div>
    </div>
  )
}
