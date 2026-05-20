'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, RefreshCw, Save, Users, BarChart3, Zap, Settings, DollarSign } from 'lucide-react'

const PROVIDERS = [
  { id: 'claude',      name: 'Claude (Anthropic)', icon: '🟠', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'] },
  { id: 'openai',      name: 'ChatGPT (OpenAI)',   icon: '🟢', models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'gemini',      name: 'Gemini (Google)',    icon: '🔵', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'grok',        name: 'Grok (xAI)',         icon: '⚡', models: ['grok-2', 'grok-2-mini', 'grok-beta'] },
  { id: 'openrouter',  name: 'OpenRouter',         icon: '🔶', models: ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'] },
]

interface Stats {
  totalUsers: number
  totalAnswers: number
  totalPlans: number
  configuredApis: number
  todayAnswers: number
  weekAnswers: number
}

interface ApiKey {
  provider: string
  isEnabled: boolean
  hasKey: boolean
  model: string
  lastTested?: string
  testStatus?: string
}

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  plan: string
  createdAt: string
  streak: number
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [maxQtd, setMaxQtd] = useState(10)
  const [defaultProvider, setDefaultProvider] = useState('claude')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'apis' | 'limites' | 'usuarios' | 'seguranca'>('apis')
  const [newAdminPass, setNewAdminPass] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) { toast.error('Acesso negado'); return }
      const data = await res.json()
      setStats(data.stats)
      setUsers(data.recentUsers || [])
      const ak = data.apiKeys || []
      setApiKeys(ak)
      const k: Record<string, string> = {}
      const m: Record<string, string> = {}
      const e: Record<string, boolean> = {}
      ak.forEach((a: ApiKey) => { k[a.provider] = ''; m[a.provider] = a.model; e[a.provider] = a.isEnabled })
      setKeys(k); setModels(m); setEnabled(e)
    } catch { toast.error('Erro ao carregar dados') }
    setLoading(false)
  }

  async function saveAll() {
    setSaving(true)
    try {
      for (const p of PROVIDERS) {
        if (keys[p.id] !== undefined) {
          await fetch('/api/admin/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_api_key', provider: p.id, key: keys[p.id], model: models[p.id] || p.models[0], enabled: enabled[p.id] ?? true }),
          })
        }
      }
      await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', maxQtd, defaultProvider }),
      })
      toast.success('✓ Configurações salvas!')
      loadData()
    } catch { toast.error('Erro ao salvar') }
    setSaving(false)
  }

  async function testAPI(provider: string) {
    if (keys[provider] === '' && !apiKeys.find(a => a.provider === provider)?.hasKey) {
      toast.error('Configure a chave antes de testar')
      return
    }
    setTesting(provider)
    try {
      if (keys[provider]) {
        await fetch('/api/admin/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_api_key', provider, key: keys[provider], model: models[provider], enabled: enabled[provider] ?? true }),
        })
      }
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_api', provider }),
      })
      const data = await res.json()
      if (data.ok) toast.success(`✓ ${provider} funcionando!`)
      else toast.error(`✗ ${provider}: ${data.message}`)
      loadData()
    } catch { toast.error('Erro no teste') }
    setTesting(null)
  }

  async function updateUser(userId: string, field: string, value: string) {
    await fetch('/api/admin/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_user', userId, [field]: value }),
    })
    toast.success('Usuário atualizado')
    loadData()
  }

  async function saveAdminPass() {
    if (newAdminPass.length < 4) { toast.error('Mínimo 4 caracteres'); return }
    await fetch('/api/admin/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_config', adminPass: btoa(newAdminPass) }),
    })
    toast.success('✓ Senha atualizada')
    setNewAdminPass('')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full p-8">
      <Loader2 className="animate-spin text-brand-400" size={32} />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">⚙ Administração</h1>
        <p className="text-zinc-400 text-sm mt-1">Gerencie APIs, limites e usuários da plataforma</p>
      </div>

      <Link
        href="/admin/custos"
        className="card p-4 mb-6 flex items-center gap-3 border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center text-green-400">
          <DollarSign size={20} />
        </div>
        <div className="flex-1">
          <div className="font-heading font-bold text-sm text-zinc-100">Gráficos de gastos da IA</div>
          <div className="text-xs text-zinc-500 mt-0.5">Veja custos, tokens, chamadas por provedor e últimos 7 dias</div>
        </div>
        <div className="text-zinc-500 text-lg">›</div>
      </Link>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Usuários', value: stats.totalUsers, icon: Users, color: 'text-brand-400' },
            { label: 'Questões respondidas', value: stats.totalAnswers, icon: BarChart3, color: 'text-green-400' },
            { label: 'APIs configuradas', value: stats.configuredApis, icon: Zap, color: 'text-amber-400' },
            { label: 'Planos gerados', value: stats.totalPlans, icon: Settings, color: 'text-blue-400' },
          ].map(m => {
            const Icon = m.icon
            return (
              <div key={m.label} className="card p-4">
                <Icon size={16} className={m.color + ' mb-2'} />
                <div className="font-heading text-2xl font-bold">{m.value}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{m.label}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-0 border-b border-white/[0.07] mb-6 overflow-x-auto">
        {[
          { id: 'apis', label: '🔑 APIs de IA' },
          { id: 'limites', label: '⚙ Limites' },
          { id: 'usuarios', label: '👥 Usuários' },
          { id: 'seguranca', label: '🔒 Segurança' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'apis' && (
        <div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 mb-4">
            ⚠ As chaves são salvas no banco de dados. Em produção real, use variáveis de ambiente no servidor.
          </div>
          {PROVIDERS.map(p => {
            const existing = apiKeys.find(a => a.provider === p.id)
            const status = existing?.testStatus
            return (
              <div key={p.id} className="card p-5 mb-3">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <div className="font-heading font-bold text-sm">{p.name}</div>
                      <div className={`text-xs mt-0.5 ${existing?.hasKey || keys[p.id] ? 'text-green-400' : 'text-zinc-500'}`}>
                        {existing?.hasKey || keys[p.id] ? '● Chave configurada' : '○ Sem chave'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'ok' && <CheckCircle size={16} className="text-green-400" />}
                    {status === 'error' && <XCircle size={16} className="text-red-400" />}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setEnabled(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className={`w-10 h-5 rounded-full transition-colors relative ${enabled[p.id] !== false ? 'bg-brand-600' : 'bg-zinc-700'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${enabled[p.id] !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-zinc-400">{enabled[p.id] !== false ? 'Ativo' : 'Inativo'}</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Chave de API</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="input flex-1"
                        placeholder={existing?.hasKey ? '••••••••••••••• (salva)' : 'Cole sua API key aqui...'}
                        value={keys[p.id] || ''}
                        onChange={e => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => testAPI(p.id)}
                        disabled={testing === p.id}
                        className="btn-secondary flex items-center gap-1.5 px-3 whitespace-nowrap"
                      >
                        {testing === p.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Testar
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Modelo</label>
                    <select
                      className="input"
                      value={models[p.id] || p.models[0]}
                      onChange={e => setModels(prev => ({ ...prev, [p.id]: e.target.value }))}
                    >
                      {p.models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {p.id === 'openai' && (
                      <p className="text-[11px] text-zinc-500 mt-2">Modelos GPT-5.x usam a Responses API. GPT-4o e antigos continuam compatíveis com Chat Completions.</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <div className="mt-4">
            <label className="label">Provedor padrão da plataforma</label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setDefaultProvider(p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                    defaultProvider === p.id
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  {p.icon} {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <button onClick={saveAll} disabled={saving} className="btn-primary flex items-center gap-2 mt-6">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar configurações
          </button>
        </div>
      )}

      {activeTab === 'limites' && (
        <div className="card p-6">
          <h2 className="font-heading font-semibold text-sm text-brand-300 mb-4">Máximo de questões por geração</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                onClick={() => setMaxQtd(n)}
                className={`w-10 h-10 rounded-xl border font-semibold text-sm transition-all ${
                  maxQtd === n
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-white/10 text-zinc-400 hover:border-brand-500 hover:text-brand-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mb-6">Define quantas questões cada usuário pode gerar de uma vez.</p>
          <button onClick={saveAll} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar
          </button>
        </div>
      )}

      {activeTab === 'usuarios' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07]">
            <h2 className="font-heading font-semibold text-sm text-brand-300">Usuários cadastrados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Plano</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Streak</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm">{u.name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none"
                        value={u.role}
                        onChange={e => updateUser(u.id, 'role', e.target.value)}
                      >
                        <option value="USER">Usuário</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none"
                        value={u.plan}
                        onChange={e => updateUser(u.id, 'plan', e.target.value)}
                      >
                        <option value="FREE">Free</option>
                        <option value="PRO">Pro</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{u.streak} dias</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'seguranca' && (
        <div className="card p-6">
          <h2 className="font-heading font-semibold text-sm text-brand-300 mb-4">Senha de administrador</h2>
          <div className="max-w-sm">
            <label className="label">Nova senha</label>
            <input
              type="password"
              className="input mb-3"
              placeholder="Mínimo 4 caracteres"
              value={newAdminPass}
              onChange={e => setNewAdminPass(e.target.value)}
            />
            <button onClick={saveAdminPass} className="btn-primary">
              Atualizar senha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
