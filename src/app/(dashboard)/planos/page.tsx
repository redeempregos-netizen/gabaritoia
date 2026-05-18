'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, CheckCircle, Key, Zap, Crown, Rocket } from 'lucide-react'

const PROVIDERS = [
  { id: 'claude',     name: 'Claude (Anthropic)', hint: 'Começa com sk-ant-...' },
  { id: 'openai',     name: 'ChatGPT (OpenAI)',   hint: 'Começa com sk-proj-...' },
  { id: 'gemini',     name: 'Gemini (Google)',    hint: 'Começa com AIzaSy...' },
  { id: 'grok',       name: 'Grok (xAI)',         hint: 'Começa com xai-...' },
  { id: 'openrouter', name: 'OpenRouter',          hint: 'Começa com sk-or-...' },
]

const PLANS = [
  {
    id: 'FREE',
    name: 'Gratuito',
    price: 'R$0',
    period: 'para sempre',
    icon: <Zap size={20} className="text-zinc-400" />,
    color: 'border-zinc-700',
    features: [
      '30 créditos ao cadastrar',
      '2 créditos de bônus/dia',
      'Gerador de questões',
      'Edital Verticalizado',
      'Histórico completo',
    ],
    cta: 'Plano atual',
    disabled: true,
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 'R$29',
    period: '/mês',
    icon: <Crown size={20} className="text-amber-400" />,
    color: 'border-amber-500/50',
    highlight: true,
    features: [
      '500 créditos/mês',
      '5 créditos de bônus/dia',
      'Edital Pro completo',
      'Flashcards ilimitados',
      'Suporte prioritário',
      'Sem limite de planos de estudo',
    ],
    cta: 'Assinar Pro',
    disabled: false,
  },
  {
    id: 'OWN_KEY',
    name: 'Chave própria',
    price: 'Grátis',
    period: 'use sua API',
    icon: <Key size={20} className="text-brand-400" />,
    color: 'border-brand-500/50',
    features: [
      'Use sua chave de IA',
      'Zero créditos consumidos',
      'Claude, GPT, Gemini, Grok',
      'Controle total dos custos',
      'Acesso a todos recursos',
    ],
    cta: 'Configurar chave',
    disabled: false,
  },
]

export default function PlanosPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'apikey'>('plans')
  const [ownKeyInfo, setOwnKeyInfo] = useState<{ hasOwnKey: boolean; provider: string | null; keyPreview: string | null } | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('claude')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/user/apikey').then(r => r.json()).then(setOwnKeyInfo).catch(() => {})
    fetch('/api/credits').then(r => r.json()).then(d => setCredits(d.credits)).catch(() => {})
  }, [])

  async function saveOwnKey() {
    if (!apiKey.trim()) { toast.error('Informe a chave de API'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/user/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, apiKey: apiKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(data.message)
      setApiKey('')
      const info = await fetch('/api/user/apikey').then(r => r.json())
      setOwnKeyInfo(info)
    } finally {
      setLoading(false)
    }
  }

  async function removeOwnKey() {
    setLoading(true)
    try {
      const res = await fetch('/api/user/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(data.message)
      setOwnKeyInfo({ hasOwnKey: false, provider: null, keyPreview: null })
    } finally {
      setLoading(false)
    }
  }

  function handlePlanCta(planId: string) {
    if (planId === 'OWN_KEY') { setActiveTab('apikey'); return }
    if (planId === 'PRO') {
      toast.info('Integração com pagamento em breve! Entre em contato: contato@gabaritoia.com')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">💎 Planos e Créditos</h1>
        <p className="text-zinc-400 text-sm mt-1">Escolha o melhor plano ou use sua própria chave de IA</p>
      </div>

      {/* Créditos atuais */}
      {credits !== null && (
        <div className="card p-4 mb-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Zap size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Seus créditos atuais</div>
            <div className="text-xs text-zinc-500">1 questão = 1 crédito · 5 questões = 4 créditos · Plano de estudos = 15 créditos</div>
          </div>
          <div className="font-heading text-2xl font-bold text-amber-400">{credits}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.07] mb-6">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'plans' ? 'border-brand-500 text-brand-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          💎 Planos
        </button>
        <button
          onClick={() => setActiveTab('apikey')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'apikey' ? 'border-brand-500 text-brand-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          🔑 Chave própria
          {ownKeyInfo?.hasOwnKey && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Ativa</span>}
        </button>
      </div>

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map(plan => (
            <div key={plan.id} className={`card p-5 border ${plan.color} ${plan.highlight ? 'relative' : ''}`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                  MAIS POPULAR
                </div>
              )}
              <div className="flex items-center gap-2 mb-3">
                {plan.icon}
                <span className="font-heading font-bold">{plan.name}</span>
              </div>
              <div className="mb-4">
                <span className="font-heading text-2xl font-bold">{plan.price}</span>
                <span className="text-zinc-500 text-sm ml-1">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle size={13} className="text-green-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePlanCta(plan.id)}
                disabled={plan.disabled}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  plan.disabled
                    ? 'bg-zinc-800 text-zinc-500 cursor-default'
                    : plan.highlight
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90'
                    : 'bg-brand-600 text-white hover:bg-brand-500'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* API Key Tab */}
      {activeTab === 'apikey' && (
        <div className="max-w-lg">
          {/* Status atual */}
          {ownKeyInfo?.hasOwnKey ? (
            <div className="card p-4 mb-6 border border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-300">Chave própria ativa</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {ownKeyInfo.provider} · {ownKeyInfo.keyPreview}
                  </div>
                  <div className="text-xs text-green-400/70 mt-1">Você não consome créditos do sistema</div>
                </div>
                <button
                  onClick={removeOwnKey}
                  disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <div className="card p-4 mb-6 border border-blue-500/20 bg-blue-500/5">
              <div className="text-sm text-blue-300 font-medium mb-1">Como funciona</div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                Configure sua própria chave de API de qualquer provedor (Claude, ChatGPT, Gemini...) e todas as gerações usarão sua chave diretamente — sem consumir créditos do GabaritoIA. Você paga apenas o que usar no provedor escolhido.
              </div>
            </div>
          )}

          {/* Formulário */}
          <div className="card p-5">
            <div className="font-heading font-semibold mb-4">{ownKeyInfo?.hasOwnKey ? 'Atualizar chave' : 'Configurar chave própria'}</div>

            <div className="mb-4">
              <label className="label">Provedor de IA</label>
              <div className="grid grid-cols-1 gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${
                      selectedProvider === p.id
                        ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-zinc-600">{p.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="label">Chave de API</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={PROVIDERS.find(p => p.id === selectedProvider)?.hint || 'Cole sua API key aqui...'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-1.5">A chave é testada antes de salvar e fica criptografada no banco.</p>
            </div>

            <button
              onClick={saveOwnKey}
              disabled={loading || !apiKey.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Key size={15} />}
              {loading ? 'Testando e salvando...' : 'Salvar chave'}
            </button>
          </div>

          {/* Links para obter chaves */}
          <div className="mt-4 card p-4">
            <div className="text-xs font-medium text-zinc-400 mb-3">Onde obter cada chave:</div>
            <div className="space-y-2 text-xs">
              {[
                { name: 'Claude (Anthropic)', url: 'https://console.anthropic.com/api-keys' },
                { name: 'ChatGPT (OpenAI)', url: 'https://platform.openai.com/api-keys' },
                { name: 'Gemini (Google)', url: 'https://aistudio.google.com/app/apikey' },
                { name: 'Grok (xAI)', url: 'https://console.x.ai' },
                { name: 'OpenRouter (multi-modelo)', url: 'https://openrouter.ai/keys' },
              ].map(item => (
                <a
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <span className="text-zinc-300">{item.name}</span>
                  <span className="text-brand-400 text-[10px]">Obter chave →</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
