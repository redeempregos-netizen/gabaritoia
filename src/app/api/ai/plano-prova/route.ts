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

async function callAIWithFallback(prompt: string, systemPrompt: string) {
  let lastError = ''
  const enabled = await prisma.apiKey.findMany({ where: { isEnabled: true }, select: { provider: true } }).catch(() => [])
  const enabledProviders = enabled.map(k => k.provider).filter((p): p is typeof PROVIDERS[number] => PROVIDERS.includes(p as any))
  const order = [...enabledProviders, ...PROVIDERS.filter(p => !enabledProviders.includes(p))]

  for (const provider of order) {
    try {
      const result = await callAI({ prompt, systemPrompt, provider, maxTokens: 7000, useCache: false, action: 'treino_por_prova_real' })
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

    const systemPrompt = `Você é um professor especialista em concursos públicos brasileiros. Sua função principal é transformar uma PROVA REAL enviada pelo usuário em um PLANO DE TREINO para o aluno responder primeiro, sem ver o gabarito no começo. Depois do bloco de treino, forneça o gabarito comentado e um plano de revisão dos erros. Responda em português do Brasil. Não prometa aprovação garantida.`

    const prompt = `Abaixo estão uma PROVA REAL enviada pelo usuário e o GABARITO OFICIAL.

OBJETIVO PRINCIPAL:
Criar um PLANO DE TREINO por prova real para o aluno responder as questões primeiro.

DADOS:
Concurso/prova: ${params.concurso}
Banca: ${params.banca}
Cargo: ${params.cargo || 'Não informado'}
Prazo do plano: ${params.dias} dias

REGRAS OBRIGATÓRIAS:
1. Use as QUESTÕES REAIS que aparecem no texto da prova enviada.
2. NÃO mostre o gabarito nem o comentário antes do aluno responder.
3. Primeiro organize um bloco chamado "Caderno de treino" com as questões reais para o aluno resolver.
4. No "Caderno de treino", cada questão deve aparecer com enunciado e alternativas, mas SEM gabarito e SEM comentário.
5. Inclua uma "Folha de respostas do aluno" para ele marcar A, B, C, D ou E.
6. Só depois crie uma seção separada chamada "Correção e gabarito comentado".
7. Na correção, cruze cada questão com o gabarito oficial informado.
8. Para cada questão corrigida, apresente:
   - número da questão;
   - disciplina ou assunto provável;
   - gabarito oficial;
   - comentário explicando por que a resposta está correta;
   - explicação das alternativas erradas, quando possível;
   - o que o aluno deve revisar.
9. Depois da correção, monte um plano de revisão por questões para ${params.dias} dias.
10. Não invente questões como conteúdo principal. Se o texto permitir poucas questões reais, avise claramente e só gere questões extras no final, em seção separada.
11. Se o texto extraído do PDF estiver bagunçado, não tente fingir certeza. Avise que algumas questões podem exigir conferência humana.

FORMATO DA RESPOSTA:
# Plano de treino por prova real

## Como usar este treino
Explique que o aluno deve responder primeiro o caderno de treino sem olhar o gabarito comentado.

## Caderno de treino: questões reais para responder
### Questão 1
- Disciplina/assunto provável:
- Enunciado:
- Alternativas:
  A)
  B)
  C)
  D)
  E)
- Sua resposta: ____

### Questão 2
...

## Folha de respostas do aluno
Monte uma tabela com Questão | Minha resposta | Acertei? | Assunto para revisar.

## Correção e gabarito comentado
### Questão 1
- Gabarito oficial:
- Comentário:
- Por que as outras alternativas estão erradas, se possível:
- O que revisar:

## Diagnóstico da prova
## Assuntos mais cobrados
## Plano de revisão de ${params.dias} dias
## Questões extras inspiradas na prova, somente se necessário

PROVA REAL EXTRAÍDA:
${prova}

GABARITO OFICIAL:
${gabarito}`

    const ai = await callAIWithFallback(prompt, systemPrompt)
    const deduction = await deductCredits(session.userId, COST, 'treino_por_prova_real', `${params.banca} — ${params.concurso}`)
    await savePlan({
      userId: session.userId,
      title: `Plano de treino por Prova Real — ${params.concurso}`,
      result: ai.result,
      banca: params.banca,
      cargo: params.cargo,
      concurso: params.concurso,
    })

    return NextResponse.json({ ok: true, result: ai.result, provider: ai.provider, creditsUsed: COST, creditsRemaining: deduction.remaining })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos.' }, { status: 400 })
    console.error('[treino prova real]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar treino por prova real.' }, { status: 500 })
  }
}
