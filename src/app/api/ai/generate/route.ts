import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit'
import { hasCredits, deductCredits, getQuestionCost } from '@/lib/credits'
import type { AIProvider } from '@/types'

const schema = z.object({
  banca: z.string().optional().default(''),
  area: z.string().min(1),
  cargo: z.string().optional(),
  city: z.string().optional(),
  uf: z.string().optional(),
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
const KNOWN_BANCAS = ['INSTITUTO AOCP', 'AVANÇA SP', 'CEBRASPE', 'CONSULPLAN', 'FUNDATEC', 'OBJETIVA', 'QUADRIX', 'VUNESP', 'FEPESE', 'FAURGS', 'FAFIPA', 'IDECAN', 'CESPE', 'AOCP', 'IBFC', 'FURB', 'FGV', 'FCC']
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

async function ensureQuestionOriginColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "examName" TEXT;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "examYear" TEXT;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "basedOn" TEXT;`).catch(() => null)
}

function cleanMeta(value?: string | null, fallback = '') {
  const s = String(value || '').replace(/\s+/g, ' ').trim()
  return s || fallback
}

function normalizeSearch(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findKnownBancas(text?: string | null) {
  const normalized = normalizeSearch(text)
  const found: string[] = []
  for (const banca of KNOWN_BANCAS) {
    const key = normalizeSearch(banca)
    const pattern = new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(key)}(?:[^A-Z0-9]|$)`, 'i')
    if (pattern.test(normalized) && !found.some(existing => normalizeSearch(existing).includes(key) || key.includes(normalizeSearch(existing)))) {
      found.push(banca)
    }
  }
  return found
}

function extractYear(text?: string | null) {
  const source = String(text || '')
  return source.match(/(?:ANO DO EDITAL\/PROVA|ANO|EDITAL)\s*:?\s*(20[0-3][0-9]|19[8-9][0-9])/i)?.[1]
    || source.match(/\b(20[0-3][0-9]|19[8-9][0-9])\b/)?.[1]
    || ''
}

function extractBanca(text?: string | null) {
  const source = String(text || '')
  if (!source.trim()) return ''

  const lines = source.split(/\n|\r/).map(line => line.trim()).filter(Boolean)
  const organizerTerms = [
    'BANCA', 'BANCA ORGANIZADORA', 'ORGANIZADORA', 'EMPRESA ORGANIZADORA', 'INSTITUICAO ORGANIZADORA', 'INSTITUIÇÃO ORGANIZADORA',
    'INSTITUTO ORGANIZADOR', 'EXECUTORA', 'EMPRESA EXECUTORA', 'RESPONSAVEL PELA ORGANIZACAO', 'RESPONSÁVEL PELA ORGANIZAÇÃO',
    'SOB RESPONSABILIDADE', 'A CARGO', 'REALIZACAO', 'REALIZAÇÃO'
  ]

  for (const line of lines) {
    const normalizedLine = normalizeSearch(line)
    const isOrganizerLine = organizerTerms.some(term => normalizedLine.includes(normalizeSearch(term)))
    if (!isOrganizerLine) continue
    const found = findKnownBancas(line)
    if (found.length) return found[0]
  }

  const normalized = normalizeSearch(source)
  const contextRegexes = [
    /(?:BANCA(?: ORGANIZADORA)?|ORGANIZADORA|EMPRESA ORGANIZADORA|INSTITUICAO ORGANIZADORA|INSTITUTO ORGANIZADOR|EXECUTORA|EMPRESA EXECUTORA)\s*(?:E|É|:|\-|–|—|SERA|SERÁ|FICARA|FICARÁ|A CARGO DE|SOB RESPONSABILIDADE DE)?\s*([A-Z0-9 .\/-]{2,160})/g,
    /(?:SOB RESPONSABILIDADE DE|A CARGO DE|REALIZACAO DA|REALIZACAO DO|REALIZAÇÃO DA|REALIZAÇÃO DO)\s*([A-Z0-9 .\/-]{2,160})/g,
  ]

  for (const regex of contextRegexes) {
    const matches = normalized.matchAll(regex)
    for (const match of matches) {
      const windowText = match[0] + ' ' + (match[1] || '')
      const found = findKnownBancas(windowText)
      if (found.length) return found[0]
    }
  }

  const allFound = findKnownBancas(source)
  if (allFound.length === 1) return allFound[0]
  return ''
}

function extractUf(text?: string | null) {
  const source = String(text || '')
  const labeled = source.match(/(?:UF|ESTADO)\s*:?\s*([A-Z]{2}|[A-Za-zÀ-ú\s]{4,30})/i)?.[1]
  if (labeled) {
    const raw = labeled.trim().toUpperCase()
    if (UFS.includes(raw)) return raw
    const map: Record<string, string> = {
      ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAPÁ: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', CEARÁ: 'CE', 'DISTRITO FEDERAL': 'DF', ESPIRITO: 'ES', 'ESPÍRITO SANTO': 'ES', GOIAS: 'GO', GOIÁS: 'GO', MARANHAO: 'MA', MARANHÃO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', MINAS: 'MG', 'MINAS GERAIS': 'MG', PARA: 'PA', PARÁ: 'PA', PARAIBA: 'PB', PARAÍBA: 'PB', PARANA: 'PR', PARANÁ: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI', PIAUÍ: 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RONDÔNIA: 'RO', RORAIMA: 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO'
    }
    const key = Object.keys(map).find(k => raw.includes(k))
    if (key) return map[key]
  }
  const upper = source.toUpperCase()
  return UFS.find(uf => new RegExp(`(?:^|[^A-Z])${uf}(?:[^A-Z]|$)`).test(upper)) || ''
}

function extractCity(text?: string | null) {
  const source = String(text || '')
  const labeled = source.match(/(?:CIDADE|MUNICÍPIO|MUNICIPIO|PREFEITURA MUNICIPAL DE|PREFEITURA DE|CÂMARA MUNICIPAL DE|CAMARA MUNICIPAL DE)\s*:?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú .'-]{2,70})(?:\s*[-/]\s*[A-Z]{2})?/i)?.[1]
  if (labeled) return cleanMeta(labeled).replace(/\b(ESTADO|EDITAL|CONCURSO|PROCESSO SELETIVO)\b.*$/i, '').trim()
  const match = source.match(/\b(?:de|do|da)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú .'-]{2,70})\s*[-/]\s*([A-Z]{2})\b/)
  return cleanMeta(match?.[1])
}

function extractReference(text?: string | null) {
  const source = String(text || '')
  const labeled = source.match(/REFERÊNCIA DO EDITAL\/CONCURSO:\s*([^\n]+)/i)?.[1]
    || source.match(/(?:EDITAL|PROCESSO SELETIVO|CONCURSO PÚBLICO|CONCURSO PUBLICO)\s*(?:N[ºO.]|NÚMERO|NUMERO)?\s*[:º.-]?\s*([^\n]{4,120})/i)?.[0]
  return cleanMeta(labeled).replace(/\s{2,}/g, ' ')
}

function buildExamReference(params: { cargo?: string | null; city?: string | null; uf?: string | null; editalText?: string | null; reference?: string | null }) {
  const explicit = cleanMeta(params.reference) || extractReference(params.editalText)
  if (explicit) return explicit
  const parts = [params.city, params.uf].map(v => cleanMeta(v)).filter(Boolean).join('/')
  const cargo = cleanMeta(params.cargo)
  if (parts && cargo) return `${parts} — ${cargo}`
  if (parts) return parts
  if (cargo) return cargo
  return 'Concurso público'
}

function withOriginHeader(params: { enunciado: string; banca: string; examName: string; examYear: string; basedOn: string; city?: string; uf?: string }) {
  const header = [
    `Banca: ${params.banca || 'Não informada'}`,
    `Prova: ${params.examName || 'Concurso público'}`,
    params.examYear ? `Ano: ${params.examYear}` : '',
    params.city ? `Cidade: ${params.city}` : '',
    params.uf ? `UF: ${params.uf}` : '',
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
  const enabled = await prisma.apiKey.findMany({ where: { isEnabled: true }, select: { provider: true } }).catch(() => [])
  const enabledProviders = enabled.map(k => k.provider as AIProvider).filter(p => ALL_PROVIDERS.includes(p))
  const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } }).catch(() => null)
  const defaultProvider = cfg?.value as AIProvider | undefined
  const order: AIProvider[] = []
  const add = (p?: AIProvider) => { if (p && ALL_PROVIDERS.includes(p) && !order.includes(p)) order.push(p) }
  add(requested); add(defaultProvider); enabledProviders.forEach(add); ALL_PROVIDERS.forEach(add)
  return order
}

async function callAIWithFallback(opts: { prompt: string; systemPrompt: string; provider?: AIProvider; maxTokens: number; queueJobId?: string }) {
  const providers = await getProviderOrder(opts.provider)
  let lastError = ''
  for (const provider of providers) {
    try {
      const raw = await callAI({ prompt: opts.prompt, systemPrompt: opts.systemPrompt, provider, maxTokens: opts.maxTokens, useCache: false, action: 'generate_questions', queueJobId: opts.queueJobId })
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
    const detectedBanca = extractBanca(params.editalText)
    const effectiveBanca = cleanMeta(params.banca, detectedBanca || '')
    if (!effectiveBanca) return NextResponse.json({ error: 'Não consegui identificar a banca com segurança. Informe a banca manualmente para evitar gerar questões com banca errada.' }, { status: 400 })

    const effectiveCity = cleanMeta(params.city, extractCity(params.editalText))
    const effectiveUf = cleanMeta(params.uf, extractUf(params.editalText))
    const effectiveYear = extractYear(params.editalText) || extractYear(params.cargo) || ''
    const effectiveReference = extractReference(params.editalText)

    const cost = getQuestionCost(params.quantity)
    const sufficient = await hasCredits(session.userId, cost)
    if (!sufficient) return NextResponse.json({ error: `Créditos insuficientes. Precisa de ${cost} crédito(s).`, code: 'insufficient_credits' }, { status: 402 })

    const isTF = params.type === 'TRUE_FALSE'
    const isOriginal = params.format === 'Questão inédita'
    const isEdital = !!params.editalText?.trim()
    const defaultExamName = buildExamReference({ cargo: params.cargo, city: effectiveCity, uf: effectiveUf, editalText: params.editalText, reference: effectiveReference })
    const defaultExamYear = effectiveYear
    const defaultBasedOn = cleanMeta(params.area)
    const systemPrompt = 'Você é uma banca examinadora sênior e especialista em concursos públicos brasileiros. Gere questões tecnicamente corretas, contextualizadas ao edital e fiéis ao estilo da banca. Responda SOMENTE JSON válido, sem texto antes ou depois, sem markdown e sem backticks.'

    const contextoBase = `BANCA IDENTIFICADA: ${effectiveBanca}
REFERÊNCIA DO EDITAL/CONCURSO IDENTIFICADA: ${defaultExamName}
ÁREA DO CONHECIMENTO: ${params.area}
CARGO/FUNÇÃO: ${params.cargo || 'Não informado'}
CIDADE/MUNICÍPIO IDENTIFICADO: ${effectiveCity || 'Não informado'}
UF/ESTADO IDENTIFICADO: ${effectiveUf || 'Não informado'}
ANO DO EDITAL/PROVA IDENTIFICADO: ${defaultExamYear || 'Não informado'}
ESCOLARIDADE: ${params.education || 'Não informado'}
DIFICULDADE: ${params.difficulty}
FORMATO: ${isOriginal ? 'questão inédita inspirada no perfil real da banca ' + effectiveBanca : 'estilo da banca ' + effectiveBanca}
TIPO: ${isTF ? 'Certo ou Errado' : 'Múltipla escolha com 5 alternativas'}${isEdital ? `
CONTEXTO DO EDITAL/CONCURSO:
${params.editalText!.substring(0, 10000)}` : ''}`
    const schemaJson = isTF
      ? '[{"enunciado":"afirmacao completa","options":["Certo","Errado"],"correctIndex":0,"comentario":"explicacao objetiva com fundamento","subtopic":"subtopico","area":"materia","examName":"referência do edital/concurso identificada","examYear":"ano identificado","basedOn":"tema, tópico ou item do edital usado como base"}]'
      : '[{"enunciado":"texto completo da questao","options":["alternativa A","alternativa B","alternativa C","alternativa D","alternativa E"],"correctIndex":0,"comentario":"explicacao detalhada com fundamento","subtopic":"subtopico","area":"materia","examName":"referência do edital/concurso identificada","examYear":"ano identificado","basedOn":"tema, tópico ou item do edital usado como base"}]'

    const prompt = `Crie EXATAMENTE ${params.quantity} questão(ões) para concurso público brasileiro.

${contextoBase}

IDENTIFICAÇÃO OBRIGATÓRIA DE ORIGEM:
1. Use sempre a BANCA IDENTIFICADA como banca da questão: ${effectiveBanca}.
2. Use sempre a REFERÊNCIA DO EDITAL/CONCURSO IDENTIFICADA como origem da prova: ${defaultExamName}.
3. Use sempre o ANO IDENTIFICADO quando houver: ${defaultExamYear || 'não informado'}.
4. Use sempre a CIDADE e UF identificadas quando houver: ${effectiveCity || 'não informada'} ${effectiveUf || ''}.
5. Se o texto do edital tiver órgão, prefeitura, câmara, secretaria, cargo ou número do edital, use isso em examName.
6. Se houver conflito entre campos manuais e o texto do edital, priorize o campo manual e use o edital só para completar.

PROTOCOLO PROFISSIONAL OBRIGATÓRIO:
1. Use a banca como filtro principal de estilo: tamanho do enunciado, nível de literalidade, pegadinhas, profundidade, vocabulário, alternativas e padrão de comentário.
2. Use a área do conhecimento como limite técnico. Não misture matéria fora da área informada.
3. Use o cargo/função para calibrar atribuições, situações práticas, linguagem e profundidade esperada.
4. Use cidade/UF apenas quando fizer sentido jurídico, administrativo, educacional, municipal ou contextual. Não invente leis locais, números, datas ou fatos não informados.
5. Use o ano para manter atualidade normativa e estilo de prova. Não cite legislação desatualizada quando houver referência temporal mais recente.
6. Use o contexto do edital para escolher temas, subtópicos e nível de cobrança. Priorize itens textuais do edital quando existirem.
7. Se o edital trouxer conteúdo programático, a questão deve nascer de um item real do conteúdo programático.
8. Não copie questões reais literalmente. Gere questão inédita, plausível e profissional.
9. O comentário deve explicar por que a alternativa correta está correta, por que as principais armadilhas estão erradas e qual ponto do edital foi cobrado.
10. Preencha obrigatoriamente examName, examYear e basedOn.
11. examName deve combinar órgão/concurso/cidade/UF/cargo quando essas informações existirem.
12. examYear deve ser o ano identificado; se não existir, deixe string vazia.
13. basedOn deve indicar o tópico, subtópico ou item do edital usado como base.
14. Nunca invente cargo, cidade, UF, órgão, lei local ou número de edital se não estiver no contexto.
15. A resposta deve ser SOMENTE JSON válido no formato: ${schemaJson}`

    const aiResult = await callAIWithFallback({ prompt, systemPrompt, provider: params.provider as AIProvider | undefined, maxTokens: 5000, queueJobId: params.queueJobId })
    const provider = aiResult.provider
    const parsed = parseAIJson<Array<{ enunciado: string; options: string[]; correctIndex: number; comentario: string; subtopic?: string; area?: string; examName?: string; examYear?: string; basedOn?: string }>>(aiResult.raw)

    await deductCredits(session.userId, cost, 'generate_question', `${params.quantity}x ${effectiveBanca}`)

    const questions = await Promise.all(parsed.map((q) => {
      const examName = cleanMeta(q.examName, defaultExamName)
      const examYear = cleanMeta(q.examYear, defaultExamYear)
      const basedOn = cleanMeta(q.basedOn, q.subtopic || defaultBasedOn)
      return prisma.question.create({ data: {
        banca: effectiveBanca,
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
        enunciado: withOriginHeader({ enunciado: q.enunciado, banca: effectiveBanca, examName, examYear, basedOn, city: effectiveCity, uf: effectiveUf }),
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
    return NextResponse.json({ ok: true, questions, provider, creditsUsed: cost, creditsRemaining: user?.credits ?? 0, detected: { banca: effectiveBanca, city: effectiveCity, uf: effectiveUf, year: defaultExamYear, reference: defaultExamName } }, { headers: rateLimitHeaders(userLimit.remaining, userLimit.resetAt) })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar.' }, { status: 500 })
  }
}
