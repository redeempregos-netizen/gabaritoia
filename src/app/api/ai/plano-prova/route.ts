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

    const systemPrompt = `Você é um professor especialista em concursos públicos brasileiros. Sua função principal é transformar uma PROVA REAL enviada pelo usuário em um MATERIAL EDITÁVEL DE TREINO para o aluno responder primeiro, sem ver o gabarito no começo. Depois do bloco de treino, forneça o gabarito comentado e um plano de revisão dos erros. Responda em português do Brasil. Não prometa aprovação garantida. Não use Markdown com #, ##, ###, asteriscos, tabelas Markdown ou listas com hífen. Use texto limpo, campos editáveis e separadores simples.`

    const prompt = `Abaixo estão uma PROVA REAL enviada pelo usuário e o GABARITO OFICIAL.

OBJETIVO PRINCIPAL:
Criar um MATERIAL EDITÁVEL DE TREINO por prova real para o aluno responder as questões primeiro.

DADOS:
Concurso/prova: ${params.concurso}
Banca: ${params.banca}
Cargo: ${params.cargo || 'Não informado'}
Prazo do plano: ${params.dias} dias

REGRAS OBRIGATÓRIAS:
1. Use as QUESTÕES REAIS que aparecem no texto da prova enviada.
2. NÃO mostre o gabarito nem o comentário antes do aluno responder.
3. Primeiro organize um bloco chamado CADERNO DE TREINO com as questões reais para o aluno resolver.
4. No CADERNO DE TREINO, cada questão deve aparecer com enunciado e alternativas, mas SEM gabarito e SEM comentário.
5. Inclua campos editáveis como: Minha resposta: (   ), Acertei: (   ), Revisar: ____________.
6. Inclua uma FOLHA DE RESPOSTAS DO ALUNO em formato editável, linha por linha, sem tabela Markdown.
7. Só depois crie uma seção separada chamada CORREÇÃO E GABARITO COMENTADO.
8. Na correção, cruze cada questão com o gabarito oficial informado.
9. Para cada questão corrigida, apresente: número da questão, disciplina, gabarito oficial, comentário, alternativas erradas quando possível e o que revisar.
10. Depois da correção, monte um plano de revisão por questões para ${params.dias} dias.
11. Não invente questões como conteúdo principal. Se o texto permitir poucas questões reais, avise claramente e só gere questões extras no final, em seção separada.
12. Se o texto extraído do PDF estiver bagunçado, não tente fingir certeza. Avise que algumas questões podem exigir conferência humana.
13. FORMATAÇÃO: não use #, ##, ###, markdown, negrito, asteriscos ou tabelas markdown. O resultado deve ser fácil de copiar, colar e editar.

FORMATO OBRIGATÓRIO DA RESPOSTA:

PLANO DE TREINO POR PROVA REAL

Concurso/prova: ${params.concurso}
Banca: ${params.banca}
Cargo: ${params.cargo || 'Não informado'}
Prazo de revisão: ${params.dias} dias

COMO USAR ESTE TREINO
1. Responda primeiro todas as questões do CADERNO DE TREINO.
2. Preencha sua resposta em cada questão.
3. Só depois confira a seção CORREÇÃO E GABARITO COMENTADO.
4. Marque os assuntos que errou para revisar no plano final.

==================================================
CADERNO DE TREINO - QUESTÕES REAIS PARA RESPONDER
==================================================

QUESTÃO 1
Disciplina/assunto provável:
Enunciado:

Alternativas:
A)
B)
C)
D)
E)

Minha resposta: (   )
Acertei: (   )
Revisar: ______________________________________

QUESTÃO 2
...

==================================================
FOLHA DE RESPOSTAS DO ALUNO
==================================================

Questão 1 | Minha resposta: (   ) | Acertei: (   ) | Assunto para revisar: ______________________
Questão 2 | Minha resposta: (   ) | Acertei: (   ) | Assunto para revisar: ______________________
Questão 3 | Minha resposta: (   ) | Acertei: (   ) | Assunto para revisar: ______________________

==================================================
CORREÇÃO E GABARITO COMENTADO
==================================================

QUESTÃO 1
Gabarito oficial:
Comentário:
Por que as outras alternativas estão erradas, se possível:
O que revisar:

QUESTÃO 2
...

==================================================
DIAGNÓSTICO DA PROVA
==================================================

Assuntos mais cobrados:
Perfil da banca:
Pontos de atenção:

==================================================
PLANO DE REVISÃO DE ${params.dias} DIAS
==================================================

DIA 1
Tarefa:
Questões para refazer:
Assuntos para revisar:

DIA 2
...

==================================================
QUESTÕES EXTRAS INSPIRADAS NA PROVA, SOMENTE SE NECESSÁRIO
==================================================

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
