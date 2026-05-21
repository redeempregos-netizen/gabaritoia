'use client'

import { Loader2 } from 'lucide-react'

interface AIQueueNoticeProps {
  message?: string
}

export function AIQueueNotice({ message }: AIQueueNoticeProps) {
  return (
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-sm text-brand-200 flex items-start gap-3">
      <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-semibold">Solicitação na fila de IA</div>
        <div className="text-xs text-brand-200/80 mt-0.5">
          {message || 'Estamos processando em ordem para evitar sobrecarga. Mantenha esta tela aberta.'}
        </div>
      </div>
    </div>
  )
}
