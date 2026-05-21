'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Brain, Loader2, Save, Sparkles } from 'lucide-react'

const PROVIDER_LABELS: Record<string, string> = {
  claude: '🟠 Claude',
  openai: '🟢 ChatGPT/OpenAI',
  gemini: '🔵 Gemini',
  grok: '⚡ Grok',
  openrouter: '🔶 OpenRouter',
}

const REASONS: Record<string, string> = {
  editalVerticalizado: 'Melhor para ler textos longos, organizar tópicos em árvore e retornar JSON estruturado.',
  editalPro: 'Melhor para análise completa de edital, cronograma, estratégia e plano de estudos.',
  gerarQuestoes: 'Melhor para criar questões inéditas, comentários e explicações com linguagem natural.',
  mapasMentais: 'Melhor para organizar conteúdo em blocos, hierarquia e revisão visual.',
  flashcards: 'Gemini costuma ser econômico e rápido para alto volume de cards curtos.',
  tutorIA: 'OpenAI é forte para conversa, explicação de erros e tutoria interativa.',
}

export default function IARecursosPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [features, setFeatures] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/feature-providers')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao carregar'); return }
      setFeatures(data.features || [])
      setProviders(data.providers || [])
      setValues(data.values || {})
    } catch {
      toast.error('Erro ao carregar recomendações')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/feature-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao salvar'); return }
      toast.success('Configuração por funcionalidade salva!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const available = providers.filter(p => p.hasKey && p.enabled).map(p => p.provider)
  const providerOptions = available.length ? available : ['claude', 'openai', 'gemini', 'grok', 'openrouter']

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-400" size={32} /></div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 mb-5">
        <ArrowLeft size={14} /> Voltar para Administração
      </Link>

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">🧠 Melhor IA por funcionalidade</h1>
        <p className="text-zinc-400 text-sm mt-1">Escolha qual provedor satisfaz melhor cada recurso do GabaritoIA.</p>
      </div>

      <div className="card p-5 mb-6 border border-brand-500/20 bg-brand-500/5">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center"><Sparkles size={20} /></div>
          <div>
            <div className="font-heading font-bold text-sm text-zinc-100">Recomendação prática</div>
            <p className="text-sm text-zinc-400 mt-1">Use Claude para edital e organização pesada, OpenAI para questões e tutor, Gemini para tarefas baratas em massa. Você pode alterar por recurso abaixo.</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {features.map(feature => {
          const selected = values[feature.key] || feature.recommended
          const isRecommended = selected === feature.recommended
          return (
            <div key={feature.key} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-heading font-bold text-sm text-zinc-100">{feature.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">Recomendado: {PROVIDER_LABELS[feature.recommended] || feature.recommended}</div>
                </div>
                <Brain size={18} className={isRecommended ? 'text-green-400' : 'text-amber-400'} />
              </div>

              <p className="text-xs text-zinc-500 mb-4 min-h-10">{REASONS[feature.key]}</p>

              <label className="label">Provedor para este recurso</label>
              <select className="input" value={selected} onChange={e => setValues(prev => ({ ...prev, [feature.key]: e.target.value }))} style={{ colorScheme: 'dark' }}>
                {providerOptions.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>)}
              </select>

              <div className={`mt-3 text-[11px] rounded-lg px-3 py-2 ${isRecommended ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {isRecommended ? '✓ Usando a opção recomendada para melhor qualidade.' : '⚠ Opção diferente da recomendada. Pode fazer sentido por custo ou fallback.'}
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 mt-6">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar IA por funcionalidade
      </button>
    </div>
  )
}
