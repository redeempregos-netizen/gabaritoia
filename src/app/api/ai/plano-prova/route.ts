import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI } from '@/lib/ai'
import { deductCredits, hasCredits } from '@/lib/credits'
import { prisma } from '@/lib/prisma'

const COST = 80
const PROVIDERS = ['openai', 'gemini', 'openrouter', 'grok', 'claude'] as const

const schema = z.object({
  concurso: z.string().min(2).max(180),
  banca: z.string().min(2).max(80),
  cargo: z.string().optional().default(''),
  dias: z.enum(['7', '15', '30']).default('30'),
  provaText: z.string().min(500, 'Envie uma prova com texto suficiente para análise.'),
  gabaritoText: z.string().min(10, 'Informe ou envie o gabarito oficial.'),
})

function cut(value: string, max: number) {
  return String(value || '').replace(/\s+\n/g, '\n').trim().slice(0, max)
}

function isReadableExamText(text: string) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 500) return false
  const letters = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length
  const words = (cleaned.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length
  const questionMarkers = (cleaned.match(/quest[aã]o|\b\d{1,3}\s*[.)-]|alternativa|assinale|correta|incorreta|gabarito/gi) || []).length
  const badChars = (cleaned.match(/[�□■●◆◇�]|[\uE000-\uF8FF]/g) || []).length
  const letterRatio = letters / cleaned.length
  if (badChars > 30) return false
  if (letterRatio < 0.32) return false
  if (words < 80) return false
  if (questionMarkers < 3 && cleaned.length < 5000) return false
  return true
}

function extractJson(text: string) {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('A IA não devolveu um JSON válido.')
  return JSON.parse(raw.slice(start, end + 1))
}

function normalizePlanData(data: any) {
  const questions = Array.isArray(data?.questions) ? data.questions : []
  const validQuestions = questions
    .map((q: any, index: number) => {
      const alternatives = q?.alternatives || {}
      const normalizedAlternatives = {
        A: String(alternatives.A || alternatives.a || '').trim(),
        B: String(alternatives.B || alternatives.b || '').trim(),
        C: String(alternatives.C || alternatives.c || '').trim(),
        D: String(alternatives.D || alternatives.d || '').trim(),
        E: String(alternatives.E || alternatives.e || '').trim(),
      }
      return {
        number: Number(q?.number || index + 1),
        discipline: String(q?.discipline || 'Não identificado').trim(),
        statement: String(q?.statement || '').trim(),
        alternatives: normalizedAlternatives,
        answer: String(q?.answer || '').trim().toUpperCase().slice(0, 1),
        explanation: String(q?.explanation || '').trim(),
        wrongAlternatives: String(q?.wrongAlternatives || '').trim(),
        reviewTopic: String(q?.reviewTopic || '').trim(),
      }
    })
    .filter((q: any) => q.statement && ['A', 'B', 'C', 'D', 'E'].includes(q.answer))

  if (!validQuestions.length) throw new Error('Não consegui estruturar questões clicáveis. Envie um PDF pesquisável ou cole o texto da prova.')

  return {
    title: String(data?.title || 'Simulado por Prova Real').trim(),
    instructions: String(data?.instructions || 'Responda as questões primeiro. Depois clique em Corrigir para ver o gabarito comentado.').trim(),
    questions: validQuestions,
    diagnosis: {
      topics: Array.isArray(data?.diagnosis?.topics) ? data.diagnosis.topics.map(String) : [],
      profile: String(data?.diagnosis?.profile || '').trim(),
      attention: String(data?.diagnosis?.attention || '').trim(),
    },
    revisionPlan: Array.isArray(data?.revisionPlan) ? data.revisionPlan.map((item: any, index: number) => ({
      day: String(item?.day || `Dia ${index + 1}`).trim(),
      task: String(item?.task || '').trim(),
      questionsToRedo: String(item?.questionsToRedo || '').trim(),
      topics: String(item?.topics || '').trim(),
    })) : [],
  }
}

async function callAIWithFallback(prompt: string, systemPrompt: string) {
  let lastError = ''
  const enabled = await prisma.apiKey.findMany({ where: { isEnabled: true }, select: { provider: true } }).catch(() => [])
  const enabledProviders = enabled.map(k => k.provider).filter((p): p is typeof PROVIDERS[number] => PROVIDERS.includes(p as any))
  const order = [...enabledProviders, ...PROVIDERS.filter(p => !enabledProviders.includes(p))]

  for (const provider of order) {
    try {
      const result = await callAI({ prompt, systemPrompt, provider, maxTokens: 8000, useCache: false, action: 'simulado_interativo_prova_real' })
      return { result, provider }
    } catch (e) {
      lastError = (e as Error).message || String(e)
      console.error(`[prova real fallback] provider=${provider} error=${lastError}`)
    }
  }
  throw new Error(`Nenhuma IA configurada funcionou. Último erro: ${lastError || 'erro desconhecido'}`)
}

async function savePlan(input: { userId: string; title: string; result: string; banca: string; cargo?: string; concurso: string }) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS generated_study_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        banca TEXT,
        cargo TEXT,
        concurso TEXT,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'prova_real',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS generated_study_plans_user_idx ON generated_study_plans(user_id);`).catch(() => null)
    await prisma.$executeRawUnsafe(
      `INSERT INTO generated_study_plans (id, user_id, title, banca, cargo, concurso, content, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'prova_real',CURRENT_TIMESTAMP)`,
      crypto.randomUUID(), input.userId, input.title, input.banca, input.cargo || null, input.concurso, input.result
    )
  } catch (e) {
    console.error('[save generated study plan]', e)
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const params = schema.parse(await req.json())
    const prova = cut(params.provaText, 45000)
    const gabarito = cut(params.gabaritoText, 12000)

    if (!isReadableExamText(prova)) {
      return NextResponse.json({ error: 'O texto da prova está ilegível ou foi extraído do PDF com caracteres quebrados. Envie um PDF pesquisável, um TXT, ou cole o texto da prova diretamente. Nenhum crédito foi cobrado.' }, { status: 400 })
    }

    const sufficient = await hasCredits(session.userId, COST)
    if (!sufficient) return NextResponse.json({ error: `Créditos insuficientes. Esta análise usa ${COST} créditos.`, code: 'insufficient_credits' }, { status: 402 })

    const systemPrompt = `Você transforma uma prova real de concurso em um simulado interativo. Responda SOMENTE com JSON válido. Não use markdown, não use crases, não use texto fora do JSON.`
    const prompt = `Crie um simulado interativo usando as questões reais abaixo e o gabarito oficial. O aluno deve responder clicando nas alternativas na interface, então coloque o gabarito somente no campo answer de cada questão.

Retorne SOMENTE este JSON:
{
  "title": "Simulado por Prova Real - ${params.concurso}",
  "instructions": "Texto curto dizendo para responder primeiro e só depois corrigir.",
  "questions": [
    {
      "number": 1,
      "discipline": "Disciplina ou assunto provável",
      "statement": "Enunciado limpo da questão real",
      "alternatives": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
      "answer": "A",
      "explanation": "Comentário claro do gabarito",
      "wrongAlternatives": "Explique as erradas quando possível",
      "reviewTopic": "Assunto para revisar"
    }
  ],
  "diagnosis": {
    "topics": ["assunto 1", "assunto 2"],
    "profile": "perfil da banca nesta prova",
    "attention": "pontos de atenção"
  },
  "revisionPlan": [
    { "day": "Dia 1", "task": "tarefa", "questionsToRedo": "questões", "topics": "assuntos" }
  ]
}

Regras:
1. Use apenas questões reais que conseguir identificar na prova.
2. Preserve enunciado e alternativas o máximo possível.
3. Se uma alternativa não aparecer no texto, deixe o campo vazio.
4. answer deve ser somente A, B, C, D ou E.
5. Não invente gabarito. Use o gabarito oficial.
6. Se houver poucas questões legíveis, retorne somente as legíveis.
7. Não revele o comentário dentro do enunciado.
8. Gere no máximo 20 questões para não ficar pesado.

DADOS:
Concurso/prova: ${params.concurso}
Banca: ${params.banca}
Cargo: ${params.cargo || 'Não informado'}
Prazo de revisão: ${params.dias} dias

PROVA REAL EXTRAÍDA:
${prova}

GABARITO OFICIAL:
${gabarito}`

    const ai = await callAIWithFallback(prompt, systemPrompt)
    const plan = normalizePlanData(extractJson(ai.result))
    const deduction = await deductCredits(session.userId, COST, 'simulado_interativo_prova_real', `${params.banca} — ${params.concurso}`)
    await savePlan({
      userId: session.userId,
      title: `Simulado interativo por Prova Real — ${params.concurso}`,
      result: JSON.stringify(plan, null, 2),
      banca: params.banca,
      cargo: params.cargo,
      concurso: params.concurso,
    })

    return NextResponse.json({ ok: true, plan, provider: ai.provider, creditsUsed: COST, creditsRemaining: deduction.remaining })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos.' }, { status: 400 })
    console.error('[simulado prova real]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar simulado interativo.' }, { status: 500 })
  }
}
