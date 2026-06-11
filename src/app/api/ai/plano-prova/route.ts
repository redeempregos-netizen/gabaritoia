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

async function callAIWithFallback(prompt: string, systemPrompt: string) {
  let lastError = ''
  const enabled = await prisma.apiKey.findMany({ where: { isEnabled: true }, select: { provider: true } }).catch(() => [])
  const enabledProviders = enabled.map(k => k.provider).filter((p): p is typeof PROVIDERS[number] => PROVIDERS.includes(p as any))
  const order = [...enabledProviders, ...PROVIDERS.filter(p => !enabledProviders.includes(p))]

  for (const provider of order) {
    try {
      const result = await callAI({ prompt, systemPrompt, provider, maxTokens: 6000, useCache: false, action: 'plano_por_prova_real' })
      return { result, provider }
    } catch (e) {
      lastError = (e as Error).message || String(e)
      console.error(`[plano prova fallback] provider=${provider} error=${lastError}`)
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
    const sufficient = await hasCredits(session.userId, COST)
    if (!sufficient) return NextResponse.json({ error: `Créditos insuficientes. Esta análise usa ${COST} créditos.`, code: 'insufficient_credits' }, { status: 402 })

    const prova = cut(params.provaText, 45000)
    const gabarito = cut(params.gabaritoText, 12000)

    const systemPrompt = `Você é um especialista sênior em concursos públicos brasileiros, análise de provas, gabaritos oficiais e planejamento de estudos por questões. Responda em português do Brasil, com linguagem clara e prática. Não prometa aprovação garantida.`

    const prompt = `Analise a PROVA REAL e o GABARITO OFICIAL abaixo e gere um plano de estudos com questões comentadas.

DADOS:
Concurso/prova: ${params.concurso}
Banca: ${params.banca}
Cargo: ${params.cargo || 'Não informado'}
Prazo do plano: ${params.dias} dias

TAREFA OBRIGATÓRIA:
1. Identifique as disciplinas e assuntos mais cobrados.
2. Estime o peso/recorrência por disciplina com base na prova.
3. Aponte o padrão da banca: estilo de enunciado, nível, pegadinhas e temas recorrentes.
4. Compare a prova com o gabarito oficial quando possível.
5. Monte um plano de estudos por questões para ${params.dias} dias.
6. Informe quantidade de questões por dia, revisões e simulados.
7. Gere 10 questões comentadas inéditas inspiradas na prova, com alternativas A-E, gabarito e comentário.
8. Separe o resultado em blocos fáceis de copiar.

FORMATO DA RESPOSTA:
# Plano por Prova Real
## Diagnóstico da prova
## Assuntos mais cobrados
## Perfil da banca
## Plano de estudos de ${params.dias} dias
## Lista diária de tarefas
## 10 questões comentadas para treino
## Como revisar os erros

PROVA REAL EXTRAÍDA:
${prova}

GABARITO OFICIAL:
${gabarito}`

    const ai = await callAIWithFallback(prompt, systemPrompt)
    const deduction = await deductCredits(session.userId, COST, 'plano_por_prova_real', `${params.banca} — ${params.concurso}`)
    await savePlan({
      userId: session.userId,
      title: `Plano por Prova Real — ${params.concurso}`,
      result: ai.result,
      banca: params.banca,
      cargo: params.cargo,
      concurso: params.concurso,
    })

    return NextResponse.json({ ok: true, result: ai.result, provider: ai.provider, creditsUsed: COST, creditsRemaining: deduction.remaining })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos.' }, { status: 400 })
    console.error('[plano prova real]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar plano por prova.' }, { status: 500 })
  }
}
