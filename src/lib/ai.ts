import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { hashPrompt, getCached, setCache } from './cache'

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'grok' | 'openrouter'

interface AICallOptions {
  prompt: string
  provider?: AIProvider
  maxTokens?: number
  systemPrompt?: string
  useCache?: boolean      // padrão: true
  cacheTTL?: number       // ms — padrão 7 dias
}

async function getApiKey(provider: AIProvider): Promise<{ key: string; model: string } | null> {
  try {
    const record = await prisma.apiKey.findUnique({
      where: { provider, isEnabled: true },
    })
    if (!record) return null
    return { key: record.keyHash, model: record.model }
  } catch {
    return null
  }
}

export async function callAI({
  prompt,
  provider = 'claude',
  maxTokens = 2000,
  systemPrompt,
  useCache = true,
  cacheTTL,
}: AICallOptions): Promise<string> {
  const config = await getApiKey(provider)
  const apiKey = config?.key || getEnvKey(provider)
  const model = config?.model || getDefaultModel(provider)

  // Verificar cache primeiro
  if (useCache) {
    const cacheKey = hashPrompt(prompt + (systemPrompt || ''), provider)
    const cached = await getCached(cacheKey)
    if (cached) {
      console.log(`[AI Cache HIT] provider=${provider} hash=${cacheKey.slice(0, 8)}`)
      return cached
    }

    // Chamar IA e salvar no cache
    const response = await callProvider({ provider, prompt, systemPrompt, maxTokens, apiKey, model })
    await setCache(cacheKey, prompt, response, provider, model, cacheTTL)
    return response
  }

  return callProvider({ provider, prompt, systemPrompt, maxTokens, apiKey, model })
}

interface CallProviderOptions {
  provider: AIProvider
  prompt: string
  systemPrompt?: string
  maxTokens: number
  apiKey?: string | null
  model: string
}

async function callProvider({ provider, prompt, systemPrompt, maxTokens, apiKey, model }: CallProviderOptions): Promise<string> {
  if (!apiKey && provider !== 'claude') {
    throw new Error(`Chave de API para ${provider} não configurada. Configure no painel Admin.`)
  }

  switch (provider) {
    case 'claude':
      return callClaude(prompt, systemPrompt, maxTokens, apiKey, model)
    case 'openai':
      return callOpenAI(prompt, systemPrompt, maxTokens, apiKey!, model)
    case 'gemini':
      return callGemini(prompt, maxTokens, apiKey!, model)
    case 'grok':
      return callOpenAICompat(prompt, systemPrompt, maxTokens, apiKey!, model, 'https://api.x.ai/v1')
    case 'openrouter':
      return callOpenRouter(prompt, systemPrompt, maxTokens, apiKey!, model)
    default:
      throw new Error(`Provedor desconhecido: ${provider}`)
  }
}

async function callClaude(prompt: string, system: string | undefined, maxTokens: number, apiKey?: string | null, model?: string): Promise<string> {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    ...(system && { system }),
    messages: [{ role: 'user', content: prompt }],
  })
  return msg.content.map(b => b.type === 'text' ? b.text : '').join('')
}

async function callOpenAI(prompt: string, system: string | undefined, maxTokens: number, apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`)
  return data.choices[0]?.message?.content || ''
}

async function callGemini(prompt: string, maxTokens: number, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`)
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callOpenAICompat(prompt: string, system: string | undefined, maxTokens: number, apiKey: string, model: string, baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`)
  return data.choices[0]?.message?.content || ''
}

async function callOpenRouter(prompt: string, system: string | undefined, maxTokens: number, apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://gabaritoia.com',
      'X-Title': 'GabaritoIA',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `OpenRouter error ${res.status}`)
  return data.choices[0]?.message?.content || ''
}

function getEnvKey(provider: AIProvider): string | undefined {
  const map: Record<AIProvider, string | undefined> = {
    claude: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    grok: process.env.GROK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  }
  return map[provider]
}

function getDefaultModel(provider: AIProvider): string {
  const map: Record<AIProvider, string> = {
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash',
    grok: 'grok-2',
    openrouter: 'google/gemini-2.0-flash-001',
  }
  return map[provider]
}

function sanitizeJsonLike(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .replace(/[\u0000-\u001F\u007F]/g, ch => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''))
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function extractBalancedJson(text: string): string | null {
  const startCandidates = [
    { char: '{', close: '}' },
    { char: '[', close: ']' },
  ]

  for (const candidate of startCandidates) {
    const start = text.indexOf(candidate.char)
    if (start === -1) continue

    const stack: string[] = []
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]

      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue

      if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') {
        const expected = stack.pop()
        if (expected !== ch) return null
        if (stack.length === 0) return text.slice(start, i + 1)
      }
    }
  }

  return null
}

export function parseAIJson<T = unknown>(raw: string): T {
  const cleaned = sanitizeJsonLike(raw)

  const attempts = [cleaned]
  const balanced = extractBalancedJson(cleaned)
  if (balanced) attempts.push(balanced)

  const ia = cleaned.indexOf('['), iz = cleaned.lastIndexOf(']')
  if (ia !== -1 && iz > ia) attempts.push(cleaned.slice(ia, iz + 1))

  const oa = cleaned.indexOf('{'), oz = cleaned.lastIndexOf('}')
  if (oa !== -1 && oz > oa) attempts.push(cleaned.slice(oa, oz + 1))

  for (const attempt of attempts) {
    const s = sanitizeJsonLike(attempt)
    try { return JSON.parse(s) as T } catch {}
  }

  console.error('[AI JSON parse error] raw response preview:', raw.slice(0, 1000))
  throw new Error('A IA não retornou JSON válido. Tente novamente.')
}
