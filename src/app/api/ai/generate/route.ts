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
    const isEdital = !!params.editalText?.trim()

    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda SOMENTE JSON válido, sem texto antes ou depois, sem markdown e sem backticks.'

    const contextoBase = `
BANCA: ${params.banca}
ÁREA: ${params.area}
CARGO: ${params.cargo || 'Não informado'}
ESCOLARIDADE: ${params.education || 'Não informado'}
DIFICULDADE: ${params.difficulty}
FORMATO: ${isOriginal ? 'questão inédita' : 'estilo da banca ' + params.banca}
TIPO: ${isTF ? 'Certo ou Errado' : 'Múltipla escolha com 5 alternativas'}
${isEdital ? `\nCONTEXTO DO EDITAL/CONCURSO:\n${params.editalText!.substring(0, 8000)}` : ''}`

    const schemaJson = isTF
      ? '[{"enunciado":"afirmacao completa","options":["Certo","Errado"],"correctIndex":0,"comentario":"explicacao objetiva com fundamento","subtopic":"subtopico","area":"materia"}]'
      : '[{"enunciado":"texto completo da questao","options":["alternativa A","alternativa B","alternativa C","alternativa D","alternativa E"],"correctIndex":0,"comentario":"explicacao detalhada com fundamento","subtopic":"subtopico","area":"materia"}]'

    const prompt = `Crie EXATAMENTE ${params.quantity} questão(ões) para concurso público brasileiro.

${contextoBase}

REGRAS:
- Use o contexto do edital quando fornecido para escolher temas, subtemas, cargo, órgão, banca e nível de cobrança.
- Se o usuário informou apenas uma referência do edital/concurso sem texto completo, use isso apenas como orientação e não invente dados factuais específicos.
- As questões devem ser plausíveis para a banca ${params.banca}, com pegadinhas e linguagem compatíveis.
- Não copie questões reais literalmente.
- Não mencione que usou IA.
- Cada comentário deve explicar por que a resposta está correta e, quando possível, o fundamento legal, técnico ou conceitual.
- Responda SOMENTE com JSON válido no formato: ${schemaJson}`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 3500, useCache: false })
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
