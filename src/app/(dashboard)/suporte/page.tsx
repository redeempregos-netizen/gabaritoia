'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Bug, HelpCircle, Loader2, Send } from 'lucide-react'

export default function SuportePage() {
  const [type, setType] = useState('Dúvida')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function sendSupport() {
    if (message.trim().length < 10) {
      toast.error('Descreva sua dúvida ou bug com pelo menos 10 caracteres.')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[${type}] ${message.trim()}`,
          page: 'Suporte',
          action: type === 'Bug' ? 'support_bug' : 'support_question',
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          details: { type },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível enviar sua mensagem.')
        return
      }
      toast.success('Mensagem enviada para o suporte.')
      setMessage('')
    } catch {
      toast.error('Não foi possível enviar sua mensagem.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <HelpCircle size={24} className="text-brand-400" /> Suporte
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Envie dúvidas, bugs ou problemas de acesso para o suporte do GabaritoIA.</p>
      </div>

      <div className="card p-5 space-y-5">
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-100">
          Sua mensagem será enviada para <strong>impulsodigital925@gmail.com</strong> junto com informações técnicas básicas da página para facilitar a correção.
        </div>

        <div>
          <label className="label">Tipo de mensagem</label>
          <div className="flex flex-wrap gap-2">
            {['Dúvida', 'Bug', 'Problema de acesso', 'Sugestão'].map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`chip ${type === item ? 'chip-active' : ''}`}
              >
                {item === 'Bug' && <Bug size={13} />}
                {item}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Mensagem</label>
          <textarea
            className="input min-h-[180px] resize-y"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Descreva sua dúvida ou bug. Ex: cliquei em gerar questões e apareceu tal erro..."
          />
          <p className="text-xs text-zinc-500 mt-2">Quanto mais detalhes você informar, mais rápido fica para identificar o problema.</p>
        </div>

        <button
          onClick={sendSupport}
          disabled={sending}
          className="btn-primary h-11 px-5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Enviar para o suporte
        </button>
      </div>
    </div>
  )
}
