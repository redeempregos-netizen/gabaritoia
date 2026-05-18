import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAI } from '@/lib/ai'
import type { AIProvider } from '@/types'

const VALID_PROVIDERS = ['claude', 'openai', 'gemini', 'grok', 'openrouter'] as const

const schema = z.object({
  provider: z.enum(VALID_PROVIDERS),
  apiKey: z.string().min(10),
})

// GET — busca chave atual do usuário (mascarada)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { ownApiKey: true, ownApiProvider: true },
  })

  return NextResponse.json({
    hasOwnKey: !!user?.ownApiKey,
    provider: user?.ownApiProvider || null,
    // Mostrar só os últimos 4 caracteres por segurança
    keyPreview: user?.ownApiKey
      ? '••••••••' + user.ownApiKey.slice(-4)
      : null,
  })
}

// POST — salvar chave própria
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json()
    const { action } = body

    // Remover chave própria
    if (action === 'remove') {
      await prisma.user.update({
        where: { id: session.userId },
        data: { ownApiKey: null, ownApiProvider: null },
      })
      return NextResponse.json({ ok: true, message: 'Chave removida. Usando créditos do sistema.' })
    }

    // Salvar e testar chave
    const { provider, apiKey } = schema.parse(body)

    // Testar a chave antes de salvar
    try {
      await callAI({
        prompt: 'Responda apenas: OK',
        provider: provider as AIProvider,
        maxTokens: 10,
        useCache: false,
        // Usar a chave que o usuário forneceu para testar
      })
    } catch {
      // Tentar direto com a chave fornecida
      const testRes = await testKeyDirect(provider as AIProvider, apiKey)
      if (!testRes.ok) {
        return NextResponse.json(
          { error: `Chave inválida para ${provider}: ${testRes.error}` },
          { status: 400 }
        )
      }
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { ownApiKey: apiKey, ownApiProvider: provider },
    })

    return NextResponse.json({
      ok: true,
      message: `Chave ${provider} configurada! Você não consumirá créditos do sistema.`,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

async function testKeyDirect(provider: AIProvider, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'OK' }] }),
      })
      if (!res.ok) { const d = await res.json(); return { ok: false, error: d.error?.message } }
      return { ok: true }
    }
    if (provider === 'openai' || provider === 'grok' || provider === 'openrouter') {
      const endpoints: Record<string, string> = {
        openai: 'https://api.openai.com/v1/chat/completions',
        grok: 'https://api.x.ai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      }
      const models: Record<string, string> = { openai: 'gpt-4o-mini', grok: 'grok-2-mini', openrouter: 'google/gemini-2.0-flash-001' }
      const res = await fetch(endpoints[provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: models[provider], max_tokens: 5, messages: [{ role: 'user', content: 'OK' }] }),
      })
      if (!res.ok) { const d = await res.json(); return { ok: false, error: d.error?.message } }
      return { ok: true }
    }
    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }] }),
      })
      if (!res.ok) { const d = await res.json(); return { ok: false, error: d.error?.message } }
      return { ok: true }
    }
    return { ok: false, error: 'Provedor desconhecido' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
