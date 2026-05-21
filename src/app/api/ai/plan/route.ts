import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import type { AIProvider, StudyPlanData } from '@/types'

const schema = z.object({
  editalText: z.string().min(10),
  cargo: z.string().optional(),
  examDate: z.string().optional(),
  hoursPerDay: z.string(),
  level: z.string(),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
  queueJobId: z.string().optional(),
})

function buildDays(today: string, weeks: number, materias: Array<{ nome: string }>, hoursPerDay: string) {
  const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const start = new Date(`${today}T00:00:00`)
  const horas = Number(String(hoursPerDay).replace(/\D/g, '')) || 2
  const base = materias.length ? materias : [{ nome: 'Conhecimentos Gerais' }]
  return Array.from({ length: weeks }, (_, wi) => ({
    semana: wi + 1,
    titulo: `Semana ${wi + 1}`,
    dias: dias.map((dia, di) => {
      const date = new Date(start)
      date.setDate(start.getDate() + wi * 7 + di)
      const descanso = dia === 'Dom'
      const materia = base[(wi * 6 + di) % base.length]?.nome || 'Revisão'
      return { dia, date: date.toISOString().split('T')[0], materia: descanso ? 'Descanso' : materia, subtema: descanso ? 'Recuperação' : 'Teoria + questões', tipo: descanso ? 'Descanso' : di % 3 === 2 ? 'Questões' : 'Teoria', horas: descanso ? 0 : Math.min(horas, 6), meta_questoes: descanso ? 0 : 20, descanso }
    }),
  }))
}

function normalizePlan(raw: any, params: z.infer<typeof schema>, today: string, weeks: number): StudyPlanData {
  const materias = Array.isArray(raw?.materias) && raw.materias.length
    ? raw.materias.map((m: any, i: number) => ({ nome: String(m.nome || m.materia || `Matéria ${i + 1}`), peso: Number(m.peso || 1), horas_sugeridas: Number(m.horas_sugeridas || 10) }))
    : [{ nome: 'Conhecimentos Gerais', peso: 1, horas_sugeridas: 10 }]
  const semanas = Array.isArray(raw?.semanas) && raw.semanas.length ? raw.semanas : buildDays(today, weeks, materias, params.hoursPerDay)
  const flashcards = Array.isArray(raw?.flashcards) && raw.flashcards.length ? raw.flashcards : materias.slice(0, 8).map((m: any) => ({ topico: m.nome, pergunta: `O que revisar em ${m.nome}?`, resposta: `Revise teoria e resolva questões da banca sobre ${m.nome}.`, fonte: 'Edital', armadilha: 'Ignorar subtópicos do edital.' }))
  return { ...raw, banca: raw?.banca || { nome: raw?.identificacao?.banca || 'Não informado', estilo: 'Conforme padrão da banca.', pegadinhas: 'Atenção aos detalhes do edital.', foco: 'Priorizar matérias com maior peso.' }, materias, semanas, flashcards } as StudyPlanData
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const params = schema.parse(await req.json())
    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } }).catch(() => null)
      if (cfg?.value) provider = cfg.value as AIProvider
    }

    const today = new Date().toISOString().split('T')[0]
    const weeks = params.examDate ? Math.max(6, Math.min(12, Math.ceil((new Date(params.examDate).getTime() - Date.now()) / 604800000))) : 10
    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda somente JSON válido.'
    const prompt = `Analise o edital e gere plano de estudos para o cargo informado.

Cargo: ${params.cargo || 'Não informado'}
Horas por dia: ${params.hoursPerDay}
Nível: ${params.level}
Semanas: ${weeks}
Hoje: ${today}

Edital:
${params.editalText.substring(0, 14000)}

Retorne apenas JSON com este formato:
{
  "identificacao":{"cargo":"","banca":"","orgao":"","vagas":"","remuneracao":"","requisitos":[],"atribuicoes":[]},
  "conteudoVerticalizado":[{"materia":"","questoes":"","peso":"","estrategia":"","topicosQuentes":[],"topicos":[{"codigo":"1","nome":"","subtopicos":[]}]}],
  "analiseBanca":{"nome":"","estiloQuestoes":"","pegadinhasComuns":[],"percentuais":{"leiSeca":"","jurisprudencia":"","doutrina":""},"fontesPreferidas":[]},
  "observacoesEstrategicas":[],
  "banca":{"nome":"","estilo":"","pegadinhas":"","foco":""},
  "materias":[{"nome":"","peso":1,"horas_sugeridas":10}],
  "semanas":[{"semana":1,"titulo":"Semana 1","dias":[{"dia":"Seg","date":"${today}","materia":"","subtema":"","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Ter","date":"${today}","materia":"","subtema":"","tipo":"Questões","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Qua","date":"${today}","materia":"","subtema":"","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Qui","date":"${today}","materia":"","subtema":"","tipo":"Questões","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Sex","date":"${today}","materia":"","subtema":"","tipo":"Revisão","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Sáb","date":"${today}","materia":"","subtema":"Simulado","tipo":"Simulado","horas":2,"meta_questoes":40,"descanso":false},{"dia":"Dom","date":"${today}","materia":"Descanso","subtema":"Recuperação","tipo":"Descanso","horas":0,"meta_questoes":0,"descanso":true}]}],
  "flashcards":[{"topico":"","pergunta":"","resposta":"","fonte":"","armadilha":""}]
}
Regras: seja fiel ao edital; se não informado, use "Não informado"; gere exatamente ${weeks} semanas com 7 dias cada; domingo descanso.`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 8500, useCache: false, action: 'edital_pro_plan', queueJobId: params.queueJobId })
    const planData = normalizePlan(parseAIJson<any>(raw), params, today, weeks)

    const plan = await prisma.studyPlan.create({ data: { userId: session.userId, title: `Plano — ${params.cargo || 'Concurso'} · ${new Date().toLocaleDateString('pt-BR')}`, banca: planData.banca?.nome, cargo: params.cargo, examDate: params.examDate ? new Date(params.examDate) : undefined, hoursPerDay: params.hoursPerDay, level: params.level, editalText: params.editalText.substring(0, 2000), planJson: planData as object, flashcards: planData.flashcards as object, daysCompleted: {} } })
    return NextResponse.json({ ok: true, provider, plan: { id: plan.id, ...planData } })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar plano.' }, { status: 500 })
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const plans = await prisma.studyPlan.findMany({ where: { userId: session.userId }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, banca: true, cargo: true, examDate: true, createdAt: true, daysCompleted: true } })
  return NextResponse.json({ plans })
}
