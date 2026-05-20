import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import type { StudyPlanData, AIProvider } from '@/types'

const schema = z.object({
  editalText: z.string().min(10),
  cargo: z.string().optional(),
  examDate: z.string().optional(),
  hoursPerDay: z.string(),
  level: z.string(),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json()
    const params = schema.parse(body)

    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      try {
        const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } })
        if (cfg?.value) provider = cfg.value as AIProvider
      } catch {}
    }

    const today = new Date().toISOString().split('T')[0]
    let weeks = 12
    if (params.examDate) {
      const diff = Math.ceil((new Date(params.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      weeks = Math.max(10, Math.min(16, Math.ceil(diff / 7)))
    }

    const systemPrompt = `Você é um especialista em concursos públicos brasileiros, com profundo conhecimento de bancas, estilos de prova, jurisprudência e doutrina cobradas. Responda SOMENTE JSON válido. Não escreva explicações, markdown, comentários, texto antes ou depois.`

    const prompt = `Faça uma análise completa e verticalizada do edital enviado.

CONTEÚDO DO EDITAL:
${params.editalText.substring(0, 12000)}

CONFIGURAÇÕES:
- Cargo/vaga pretendida: ${params.cargo || 'Não informado'}
- Horas por dia: ${params.hoursPerDay}
- Nível do candidato: ${params.level}
- Semanas sugeridas: ${weeks}
- Data de hoje: ${today}

Responda SOMENTE com JSON válido neste formato:
{
  "identificacao": {
    "cargo": "string",
    "banca": "string",
    "orgao": "string",
    "vagas": "string",
    "cadastroReserva": "string",
    "pcd": "string",
    "remuneracao": "string",
    "beneficios": ["string"],
    "requisitos": ["string"],
    "atribuicoes": ["string"]
  },
  "cronogramaCertame": [{"evento":"string","data":"string","observacao":"string"}],
  "etapasConcurso": [{"nome":"string","carater":"string","descricao":"string"}],
  "provasDetalhadas": [{"nome":"string","duracao":"string","totalQuestoes":"string","notaMinima":"string","disciplinas":[{"nome":"string","questoes":"string","peso":"string"}]}],
  "conteudoVerticalizado": [{"materia":"string","questoes":"string","peso":"string","estrategia":"string","topicosQuentes":["string"],"topicos":[{"codigo":"1","nome":"string","subtopicos":[{"codigo":"1.1","nome":"string","subtopicos":[{"codigo":"1.1.1","nome":"string"}]}]}]}],
  "analiseBanca": {"nome":"string","estiloQuestoes":"string","pegadinhasComuns":["string"],"percentuais":{"leiSeca":"string","jurisprudencia":"string","doutrina":"string"},"fontesPreferidas":["string"]},
  "cronogramaEstudos": [{"semana":1,"titulo":"string","foco":"string","materias":[{"materia":"string","atividades":["string"],"horasSugeridas":"string","metaQuestoes":"string"}]}],
  "bibliografia": [{"materia":"string","obras":[{"titulo":"string","autor":"string","observacao":"string"}]}],
  "observacoesEstrategicas":["string"],
  "banca": {"nome":"string","estilo":"string","pegadinhas":"string","foco":"string"},
  "materias": [{"nome":"matéria","peso":1,"horas_sugeridas":10}],
  "semanas": [{"semana":1,"titulo":"Semana 1","dias":[{"dia":"Seg","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false}]}],
  "flashcards": [{"topico":"tópico","pergunta":"pergunta objetiva","resposta":"resposta completa e didática","fonte":"base legal, doutrinária ou editalícia","armadilha":"pegadinha típica da banca"}]
}

REGRAS:
- Seja fiel ao edital em vagas, datas, requisitos e conteúdo programático. Não invente tópicos factuais.
- Se algo não estiver no edital, use "Não informado" ou array vazio.
- Extraia todos os tópicos do conteúdo programático sem omitir nenhum.
- Para estratégia, tópicos quentes, análise de banca e bibliografia, use conhecimento de concursos de forma conservadora.
- Campo "semanas": exatamente ${weeks} semanas com 7 dias cada; domingo sempre descanso; datas reais sequenciais a partir de hoje.
- Inclua no mínimo 10 flashcards.
- JSON não permite comentários, aspas curvas, vírgula sobrando no final, nem texto fora do objeto.`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 8000, useCache: false })
    const planData = parseAIJson<StudyPlanData>(raw)

    const plan = await prisma.studyPlan.create({
      data: {
        userId: session.userId,
        title: `Plano — ${params.cargo || 'Concurso'} · ${new Date().toLocaleDateString('pt-BR')}`,
        banca: planData.banca?.nome,
        cargo: params.cargo,
        examDate: params.examDate ? new Date(params.examDate) : undefined,
        hoursPerDay: params.hoursPerDay,
        level: params.level,
        editalText: params.editalText.substring(0, 2000),
        planJson: planData as object,
        flashcards: planData.flashcards as object,
        daysCompleted: {},
      },
    })

    return NextResponse.json({ ok: true, plan: { id: plan.id, ...planData } })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar plano.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const plans = await prisma.studyPlan.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, banca: true, cargo: true, examDate: true, createdAt: true, daysCompleted: true },
  })

  return NextResponse.json({ plans })
}
