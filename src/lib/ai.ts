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
  action?: string
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

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4))
}

function estimateCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const key = `${provider}:${model}`.toLowerCase()
  let inPerM = 3
  let outPerM = 15

  if (key.includes('haiku')) { inPerM = 1; outPerM = 5 }
  else if (key.includes('opus')) { inPerM = 15; outPerM = 75 }
  else if (key.includes('gpt-5.5')) { inPerM = 3; outPerM = 15 }
  else if (key.includes('gpt-5.4-mini')) { inPerM = 0.25; outPerM = 2 }
  else if (key.includes('gpt-5.4-nano')) { inPerM = 0.05; outPerM = 0.4 }
  else if (key.includes('gpt-5.4')) { inPerM = 2; outPerM = 8 }
  else if (key.includes('gpt-4o-mini')) { inPerM = 0.15; outPerM = 0.6 }
  else if (key.includes('gpt-4o')) { inPerM = 2.5; outPerM = 10 }
  else if (key.includes('gemini') || provider === 'gemini') { inPerM = 0.35; outPerM = 1.05 }
  else if (key.includes('grok')) { inPerM = 2; outPerM = 10 }
  else if (provider === 'openrouter') { inPerM = 1; outPerM = 3 }

  return Number(((inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM).toFixed(6))
}

async function logAIUsage(opts: { provider: string; model: string; prompt: string; systemPrompt?: string; response: string; action?: string; cached?: boolean }) {
  try {
    const inputTokens = estimateTokens((opts.systemPrompt || '') + '\n' + opts.prompt)
    const outputTokens = estimateTokens(opts.response)
    const totalTokens = inputTokens + outputTokens
    const costUsd = opts.cached ? 0 : estimateCostUsd(opts.provider, opts.model, inputTokens, outputTokens)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT,
        action TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        cached BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await prisma.$executeRawUnsafe(
      `INSERT INTO ai_usage (id, provider, model, action, prompt_tokens, completion_tokens, total_tokens, cost_usd, cached, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
      crypto.randomUUID(), opts.provider, opts.model, opts.action || 'unknown', inputTokens, outputTokens, totalTokens, costUsd, !!opts.cached
    )
  } catch (e) {
    console.error('[AI usage log error]', e)
  }
}

export async function callAI({
  prompt,
  provider = 'claude',
  maxTokens = 2000,
  systemPrompt,
  useCache = true,
  cacheTTL,
  action = 'unknown',
}: AICallOptions): Promise<string> {
  const config = await getApiKey(provider)
  const apiKey = config?.key || getEnvKey(provider)
  const model = config?.model || getDefaultModel(provider)

  if (useCache) {
    const cacheKey = hashPrompt(prompt + (systemPrompt || ''), provider)
    const cached = await getCached(cacheKey)
    if (cached) {
      console.log(`[AI Cache HIT] provider=${provider} hash=${cacheKey.slice(0, 8)}`)
      void logAIUsage({ provider, model, prompt, systemPrompt, response: cached, action, cached: true })
      return cached
    }

    const response = await callProvider({ provider, prompt, systemPrompt, maxTokens, apiKey, model })
    await setCache(cacheKey, prompt, response, provider, model, cacheTTL)
    void logAIUsage({ provider, model, prompt, systemPrompt, response, action, cached: false })
    return response
  }

  const response = await callProvider({ provider, prompt, systemPrompt, maxTokens, apiKey, model })
  void logAIUsage({ provider, model, prompt, systemPrompt, response, action, cached: false })
  return response
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

function isGPT5Model(model: string): boolean {
  return model.toLowerCase().startsWith('gpt-5')
}

async function callOpenAI(prompt: string, system: string | undefined, maxTokens: number, apiKey: string, model: string): Promise<string> {
  if (isGPT5Model(model)) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_output_tokens: maxTokens,
        input: [
          ...(system ? [{ role: 'system', content: [{ type: 'input_text', text: system }] }] : []),
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`)
    if (typeof data.output_text === 'string') return data.output_text
    const text = data.output?.flatMap((item: any) => item.content || [])?.map((c: any) => c.text || '').join('')
    return text || ''
  }

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
    openai: 'gpt-5.5',
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
