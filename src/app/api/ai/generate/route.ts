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
  queueJobId: z.string().optional(),
})

const ALL_PROVIDERS: AIProvider[] = ['openai', 'gemini', 'openrouter', 'grok', 'claude']

async function ensureQuestionOriginColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "examName" TEXT;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "examYear" TEXT;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "basedOn" TEXT;`).catch(() => null)
}

function extractYear(text?: string | null) {
  return String(text || '').match(/\b(20\d{2}|19\d{2})\b/)?.[1] || ''
}

function cleanMeta(value?: string | null, fallback = '') {
  const s = String(value || '').replace(/\s+/g, ' ').trim()
  return s || fallback
}

function withOriginHeader(params: { enunciado: string; banca: string; examName: string; examYear: string; basedOn: string }) {
  const header = [
    `Banca: ${params.banca || 'Não informada'}`,
    `Prova: ${params.examName || 'Concurso público'}`,
    params.examYear ? `Ano: ${params.examYear}` : '',
    `Baseado em: ${params.basedOn || 'Conteúdo programático informado'}`,
  ].filter(Boolean).join(' | ')
  const enunciado = String(params.enunciado || '').trim()
  if (enunciado.toLowerCase().startsWith('banca:')) return enunciado
  return `${header}\n\n${enunciado}`
}

async function saveGeneratedQuestionLinks(userId: string, questionIds: string[]) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_generated_questions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS user_generated_questions_user_question_idx ON user_generated_questions(user_id, question_id);`).catch(() => null)
    for (const questionId of questionIds) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO user_generated_questions (id, user_id, question_id, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, question_id) DO NOTHING`,
        crypto.randomUUID(), userId, questionId
      ).catch(() => null)
    }
  } catch (e) {
    console.error('[generated questions link error]', e)
  }
}

async function getProviderOrder(requested?: AIProvider): Promise<AIProvider[]> {
  const enabled = await prisma.apiKey.findMany({
    where: { isEnabled: true },
    select: { provider: true },
  }).catch(() => [])

  const enabledProviders = enabled.map(k => k.provider as AIProvider).filter(p => ALL_PROVIDERS.includes(p))
  const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } }).catch(() => null)
  const defaultProvider = cfg?.value as AIProvider | undefined

  const order: AIProvider[] = []
  const add = (p?: AIProvider) => {
    if (p && ALL_PROVIDERS.includes(p) && !order.includes(p)) order.push(p)
  }

  add(requested)
  add(defaultProvider)
  enabledProviders.forEach(add)
  ALL_PROVIDERS.forEach(add)

  return order
}

async function callAIWithFallback(opts: { prompt: string; systemPrompt: string; provider?: AIProvider; maxTokens: number; queueJobId?: string }) {
  const providers = await getProviderOrder(opts.provider)
  let lastError = ''

  for (const provider of providers) {
    try {
      const raw = await callAI({
        prompt: opts.prompt,
        systemPrompt: opts.systemPrompt,
        provider,
        maxTokens: opts.maxTokens,
        useCache: false,
        action: 'generate_questions',
        queueJobId: opts.queueJobId,
      })
      return { raw, provider }
    } catch (e) {
      lastError = (e as Error).message || String(e)
      console.error(`[AI fallback] provider=${provider} error=${lastError}`)
      continue
    }
  }

  throw new Error(`Nenhuma chave de IA ativa funcionou. Último erro: ${lastError || 'erro desconhecido'}`)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const ip = getClientIP(req)
  const ipLimit = await checkRateLimit(ip, 'generate_ip')
  if (!ipLimit.allowed) return NextResponse.json({ error: `Muitas requisições. Tente em ${Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 60000)} min.` }, { status: 429, headers: rateLimitHeaders(0, ipLimit.resetAt) })

  const userLimit = await checkRateLimit(session.userId, 'generate')
  if (!userLimit.allowed) return NextResponse.json({ error: `Limite atingido. Tente em ${Math.ceil((userLimit.resetAt.getTime() - Date.now()) / 60000)} min.` }, { status: 429, headers: rateLimitHeaders(0, userLimit.resetAt) })

  try {
    await ensureQuestionOriginColumns()
    const params = schema.parse(await req.json())
    const cost = getQuestionCost(params.quantity)
    const sufficient = await hasCredits(session.userId, cost)
    if (!sufficient) return NextResponse.json({ error: `Créditos insuficientes. Precisa de ${cost} crédito(s).`, code: 'insufficient_credits' }, { status: 402 })

    const isTF = params.type === 'TRUE_FALSE'
    const isOriginal = params.format === 'Questão inédita'
    const isEdital = !!params.editalText?.trim()
    const defaultExamName = cleanMeta(params.editalText?.match(/REFERÊNCIA DO EDITAL\/CONCURSO:\s*([^\n]+)/i)?.[1], params.cargo ? `${params.cargo}` : 'Concurso público')
    const defaultExamYear = extractYear(params.editalText) || extractYear(params.cargo) || ''
    const defaultBasedOn = cleanMeta(params.area)
    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda SOMENTE JSON válido, sem texto antes ou depois, sem markdown e sem backticks.'

    const contextoBase = `BANCA: ${params.banca}\nÁREA: ${params.area}\nCARGO: ${params.cargo || 'Não informado'}\nESCOLARIDADE: ${params.education || 'Não informado'}\nDIFICULDADE: ${params.difficulty}\nFORMATO: ${isOriginal ? 'questão inédita' : 'estilo da banca ' + params.banca}\nTIPO: ${isTF ? 'Certo ou Errado' : 'Múltipla escolha com 5 alternativas'}${isEdital ? `\nCONTEXTO DO EDITAL/CONCURSO:\n${params.editalText!.substring(0, 8000)}` : ''}`
    const schemaJson = isTF
      ? '[{"enunciado":"afirmacao completa","options":["Certo","Errado"],"correctIndex":0,"comentario":"explicacao objetiva com fundamento","subtopic":"subtopico","area":"materia","examName":"nome da prova/concurso/órgão quando informado","examYear":"ano quando informado","basedOn":"tema, tópico ou item do edital usado como base"}]'
      : '[{"enunciado":"texto completo da questao","options":["alternativa A","alternativa B","alternativa C","alternativa D","alternativa E"],"correctIndex":0,"comentario":"explicacao detalhada com fundamento","subtopic":"subtopico","area":"materia","examName":"nome da prova/concurso/órgão quando informado","examYear":"ano quando informado","basedOn":"tema, tópico ou item do edital usado como base"}]'

    const prompt = `Crie EXATAMENTE ${params.quantity} questão(ões) para concurso público brasileiro.\n\n${contextoBase}\n\nREGRAS:\n- Use o contexto do edital quando fornecido para escolher temas, subtemas, cargo, órgão, banca e nível de cobrança.\n- Em cada questão, preencha examName, examYear e basedOn.\n- examName deve ser o nome da prova/concurso/órgão/cargo quando houver referência; se não houver, use "Concurso público".\n- examYear deve ser o ano citado no edital/referência; se não houver ano, deixe string vazia.\n- basedOn deve indicar o tópico/subtópico/item de edital que inspirou a questão.\n- Se houver apenas referência do edital/concurso, use apenas como orientação e não invente dados factuais específicos.\n- As questões devem ser plausíveis para a banca ${params.banca}, com pegadinhas e linguagem compatíveis.\n- Não copie questões reais literalmente.\n- Cada comentário deve explicar a resposta correta.\n- Responda SOMENTE com JSON válido no formato: ${schemaJson}`

    const aiResult = await callAIWithFallback({ prompt, systemPrompt, provider: params.provider as AIProvider | undefined, maxTokens: 3500, queueJobId: params.queueJobId })
    const provider = aiResult.provider
    const parsed = parseAIJson<Array<{ enunciado: string; options: string[]; correctIndex: number; comentario: string; subtopic?: string; area?: string; examName?: string; examYear?: string; basedOn?: string }>>(aiResult.raw)

    await deductCredits(session.userId, cost, 'generate_question', `${params.quantity}x ${params.banca}`)

    const questions = await Promise.all(parsed.map((q) => {
      const examName = cleanMeta(q.examName, defaultExamName)
      const examYear = cleanMeta(q.examYear, defaultExamYear)
      const basedOn = cleanMeta(q.basedOn, q.subtopic || defaultBasedOn)
      return prisma.question.create({ data: {
        banca: params.banca,
        area: q.area || params.area,
        subtopic: q.subtopic,
        cargo: params.cargo,
        education: params.education,
        examName,
        examYear,
        basedOn,
        difficulty: params.difficulty,
        type: params.type,
        format: params.format,
        enunciado: withOriginHeader({ enunciado: q.enunciado, banca: params.banca, examName, examYear, basedOn }),
        options: q.options,
        correctIndex: q.correctIndex,
        comentario: q.comentario,
        isOriginal,
        fromEdital: isEdital,
        aiProvider: provider,
      } })
    }))
    await saveGeneratedQuestionLinks(session.userId, questions.map(q => q.id))

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { credits: true } })
    return NextResponse.json({ ok: true, questions, provider, creditsUsed: cost, creditsRemaining: user?.credits ?? 0 }, { headers: rateLimitHeaders(userLimit.remaining, userLimit.resetAt) })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar.' }, { status: 500 })
  }
}
