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

    // Usar provider enviado ou buscar padrão do admin
    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      try {
        const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } })
        if (cfg?.value) provider = cfg.value as AIProvider
      } catch {}
    }

    const today = new Date().toISOString().split('T')[0]
    let weeks = 8
    if (params.examDate) {
      const diff = Math.ceil((new Date(params.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      weeks = Math.max(1, Math.min(20, Math.ceil(diff / 7)))
    }

    const systemPrompt = `Você é especialista em concursos públicos brasileiros e elaboração de planos de estudos personalizados.
Responda SEMPRE com JSON válido, sem texto antes ou depois, sem backticks markdown.`

    const prompt = `Com base no edital/conteúdo abaixo, gere um plano de estudos COMPLETO em JSON.

CONTEÚDO DO EDITAL:
${params.editalText.substring(0, 4000)}

CONFIGURAÇÕES:
- Cargo/vaga: ${params.cargo || 'não especificado'}
- Horas por dia: ${params.hoursPerDay}
- Nível do candidato: ${params.level}
- Semanas disponíveis: ${weeks}
- Data de hoje: ${today}

Responda SOMENTE com este JSON (${weeks} semanas, 7 dias cada, mínimo 15 flashcards):
{
  "banca": {"nome":"nome identificado","estilo":"como cobra as matérias","pegadinhas":"armadilhas típicas","foco":"o que mais cai"},
  "materias": [{"nome":"matéria","peso":1,"horas_sugeridas":10}],
  "semanas": [{"semana":1,"titulo":"Semana 1 — Fundamentos","dias":[{"dia":"Seg","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false}]}],
  "flashcards": [{"topico":"tópico","pergunta":"pergunta objetiva","resposta":"resposta completa e didática","fonte":"base legal ou doutrinária","armadilha":"pegadinha típica da banca"}]
}

REGRAS:
- Exatamente ${weeks} semanas com 7 dias cada
- Domingo sempre descanso
- Use datas reais sequenciais a partir de hoje
- Priorize matérias pelo peso no edital
- Alterne: Teoria → Questões → Revisão
- Mínimo 15 flashcards`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 4000 })
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
