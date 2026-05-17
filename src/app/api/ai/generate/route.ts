import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit'
import { hasCredits, deductCredits, getQuestionCost } from '@/lib/credits'
import type { AIProvider } from '@/types'

const schema = z.object({
  banca: z.string().min(1),
  area: z.string().min(1),
  cargo: z.string().optional(),
  education: z.string().optional(),
  difficulty: z.enum(['Fácil', 'Média', 'Difícil']),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE']),
  format: z.enum(['Estilo banca', 'Questão inédita']),
  quantity: z.number().min(1).max(10),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
  editalText: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const ip = getClientIP(req)

  const ipLimit = await checkRateLimit(ip, 'generate_ip')
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente em ${Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 60000)} min.` },
      { status: 429, headers: rateLimitHeaders(0, ipLimit.resetAt) }
    )
  }

  const userLimit = await checkRateLimit(session.userId, 'generate')
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: `Limite atingido. Tente em ${Math.ceil((userLimit.resetAt.getTime() - Date.now()) / 60000)} min.` },
      { status: 429, headers: rateLimitHeaders(0, userLimit.resetAt) }
    )
  }

  try {
    const body = await req.json()
    const params = schema.parse(body)

    const cost = getQuestionCost(params.quantity)
    const sufficient = await hasCredits(session.userId, cost)
    if (!sufficient) {
      return NextResponse.json(
        { error: `Créditos insuficientes. Precisa de ${cost} crédito(s).`, code: 'insufficient_credits' },
        { status: 402 }
      )
    }

    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      try {
        const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } })
        if (cfg?.value) provider = cfg.value as AIProvider
      } catch {}
    }

    const isTF = params.type === 'TRUE_FALSE'
    const isOriginal = params.format === 'Questão inédita'
    const isEdital = !!params.editalText

    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda SEMPRE com JSON válido, sem texto antes ou depois, sem backticks.'

    let prompt: string
    if (isEdital) {
      prompt = `Com base no edital abaixo crie EXATAMENTE ${params.quantity} questao nivel ${params.difficulty}. EDITAL: ${params.editalText!.substring(0, 3000)}. JSON: [{"enunciado":"texto","options":["A","B","C","D","E"],"correctIndex":0,"comentario":"explicacao","area":"materia","subtopic":"subtopico"}]`
    } else if (isTF) {
      prompt = `Banca ${params.banca}. Crie EXATAMENTE ${params.quantity} afirmacao CERTO ou ERRADO. Area: ${params.area}. Dificuldade: ${params.difficulty}. Formato: ${isOriginal ? 'inedita' : 'estilo ' + params.banca}. JSON: [{"enunciado":"afirmacao","options":["Certo","Errado"],"correctIndex":0,"comentario":"explicacao com fundamentos","subtopic":"subtopico"}]`
    } else {
      prompt = `Banca ${params.banca}. Crie EXATAMENTE ${params.quantity} questao multipla escolha 5 alternativas. Area: ${params.area}. Dificuldade: ${params.difficulty}. Formato: ${isOriginal ? 'inedita' : 'estilo ' + params.banca}. JSON: [{"enunciado":"texto completo","options":["A","B","C","D","E"],"correctIndex":0,"comentario":"explicacao detalhada com fundamentos legais","subtopic":"subtopico"}]`
    }

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 2500 })
    const parsed = parseAIJson<Array<{
      enunciado: string
      options: string[]
      correctIndex: number
      comentario: string
      subtopic?: string
      area?: string
    }>>(raw)

    await deductCredits(session.userId, cost, 'generate_question', `${params.quantity}x ${params.banca}`)

    const questions = await Promise.all(
      parsed.map((q) =>
        prisma.question.create({
          data: {
            banca: params.banca,
            area: q.area || params.area,
            subtopic: q.subtopic,
            cargo: params.cargo,
            education: params.education,
            difficulty: params.difficulty,
            type: params.type,
            format: params.format,
            enunciado: q.enunciado,
            options: q.options,
            correctIndex: q.correctIndex,
            comentario: q.comentario,
            isOriginal,
            fromEdital: isEdital,
            aiProvider: provider,
          },
        })
      )
    )

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { credits: true },
    })

    return NextResponse.json(
      { ok: true, questions, provider, creditsUsed: cost, creditsRemaining: user?.credits ?? 0 },
      { headers: rateLimitHeaders(userLimit.remaining, userLimit.resetAt) }
    )
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar.' }, { status: 500 })
  }
}
