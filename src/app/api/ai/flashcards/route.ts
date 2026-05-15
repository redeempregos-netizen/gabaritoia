import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import type { AIProvider } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const { materias, banca, provider: reqProvider } = await req.json()

    let provider: AIProvider = (reqProvider as AIProvider) || 'claude'
    if (!reqProvider) {
      try {
        const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } })
        if (cfg?.value) provider = cfg.value as AIProvider
      } catch {}
    }

    const prompt = `Gere mais 10 flashcards variados para concurso público.
Matérias do plano: ${(materias || []).join(', ')}
Banca: ${banca || 'não identificada'}
Cubra tópicos diferentes e importantes.
Responda SOMENTE com array JSON, SEM texto extra, SEM backticks:
[{"topico":"tópico","pergunta":"pergunta objetiva","resposta":"resposta completa e didática","fonte":"base legal ou doutrinária","armadilha":"pegadinha típica da banca"}]`

    const raw = await callAI({ prompt, provider, maxTokens: 1500 })
    const flashcards = parseAIJson(raw)
    return NextResponse.json({ ok: true, flashcards })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
