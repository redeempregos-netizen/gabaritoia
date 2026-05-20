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

const PROVIDERS: AIProvider[] = ['claude', 'openai', 'gemini', 'openrouter', 'grok']

function isRetryableAIError(e: unknown) {
  const msg = String((e as Error)?.message || e || '').toLowerCase()
  return (
    msg.includes('x-api-key') ||
    msg.includes('api key') ||
    msg.includes('authentication') ||
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('model') ||
    msg.includes('not found') ||
    msg.includes('json válido') ||
    msg.includes('invalid json') ||
    msg.includes('rate') ||
    msg.includes('timeout')
  )
}

async function getEnabledProviders(preferred: AIProvider): Promise<AIProvider[]> {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { isEnabled: true },
      select: { provider: true, keyHash: true },
    })
    const enabled = keys.filter(k => !!k.keyHash).map(k => k.provider as AIProvider).filter(p => PROVIDERS.includes(p))
    const ordered = [preferred, ...enabled, ...PROVIDERS]
    return Array.from(new Set(ordered))
  } catch {
    return [preferred, ...PROVIDERS.filter(p => p !== preferred)]
  }
}

function buildDays(today: string, weeks: number, materias: Array<{ nome: string }>, hoursPerDay: string) {
  const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const start = new Date(`${today}T00:00:00`)
  const horas = Number(String(hoursPerDay).replace(/\D/g, '')) || 2
  const baseMaterias = materias.length ? materias : [{ nome: 'Conhecimentos Gerais' }]

  return Array.from({ length: weeks }, (_, wi) => ({
    semana: wi + 1,
    titulo: `Semana ${wi + 1}`,
    dias: dias.map((dia, di) => {
      const date = new Date(start)
      date.setDate(start.getDate() + wi * 7 + di)
      const descanso = dia === 'Dom'
      const materia = baseMaterias[(wi * 6 + di) % baseMaterias.length]?.nome || 'Revisão'
      return {
        dia,
        date: date.toISOString().split('T')[0],
        materia: descanso ? 'Descanso' : materia,
        subtema: descanso ? 'Recuperação' : 'Teoria + questões',
        tipo: descanso ? 'Descanso' : di % 3 === 2 ? 'Questões' : 'Teoria',
        horas: descanso ? 0 : Math.min(horas, 6),
        meta_questoes: descanso ? 0 : 20,
        descanso,
      }
    }),
  }))
}

function normalizePlanData(raw: any, params: z.infer<typeof schema>, today: string, weeks: number): StudyPlanData {
  const materias = Array.isArray(raw?.materias) && raw.materias.length
    ? raw.materias.map((m: any, i: number) => ({ nome: String(m.nome || m.materia || `Matéria ${i + 1}`), peso: Number(m.peso || 1), horas_sugeridas: Number(m.horas_sugeridas || m.horasSugeridas || 10) }))
    : (Array.isArray(raw?.conteudoVerticalizado) && raw.conteudoVerticalizado.length
      ? raw.conteudoVerticalizado.map((m: any, i: number) => ({ nome: String(m.materia || m.nome || `Matéria ${i + 1}`), peso: Number(m.peso || 1), horas_sugeridas: 10 }))
      : [{ nome: 'Conhecimentos Gerais', peso: 1, horas_sugeridas: 10 }])

  const semanas = Array.isArray(raw?.semanas) && raw.semanas.length
    ? raw.semanas.slice(0, weeks).map((s: any, i: number) => ({
        semana: Number(s.semana || i + 1),
        titulo: String(s.titulo || `Semana ${i + 1}`),
        dias: Array.isArray(s.dias) && s.dias.length === 7 ? s.dias : buildDays(today, 1, materias, params.hoursPerDay)[0].dias,
      }))
    : buildDays(today, weeks, materias, params.hoursPerDay)

  while (semanas.length < weeks) {
    semanas.push(buildDays(today, 1, materias, params.hoursPerDay)[0])
    semanas[semanas.length - 1].semana = semanas.length
    semanas[semanas.length - 1].titulo = `Semana ${semanas.length}`
  }

  const flashcards = Array.isArray(raw?.flashcards) && raw.flashcards.length
    ? raw.flashcards.slice(0, 30).map((f: any) => ({
        topico: String(f.topico || 'Revisão'),
        pergunta: String(f.pergunta || 'Qual é o ponto principal deste tópico?'),
        resposta: String(f.resposta || 'Revisar o conteúdo correspondente no edital.'),
        fonte: String(f.fonte || 'Edital'),
        armadilha: String(f.armadilha || 'Confundir conceitos próximos.'),
      }))
    : materias.slice(0, 10).map((m: any) => ({
        topico: m.nome,
        pergunta: `O que revisar em ${m.nome}?`,
        resposta: `Revise teoria, lei seca quando houver, e resolva questões da banca sobre ${m.nome}.`,
        fonte: 'Edital',
        armadilha: 'Ignorar subtópicos do conteúdo programático.',
      }))

  return {
    ...raw,
    banca: raw?.banca || { nome: raw?.analiseBanca?.nome || raw?.identificacao?.banca || 'Não informado', estilo: raw?.analiseBanca?.estiloQuestoes || 'Não informado', pegadinhas: Array.isArray(raw?.analiseBanca?.pegadinhasComuns) ? raw.analiseBanca.pegadinhasComuns.join('; ') : 'Não informado', foco: 'Estudar conforme pesos e conteúdo programático do edital.' },
    materias,
    semanas,
    flashcards,
  } as StudyPlanData
}

function buildPrompt(params: z.infer<typeof schema>, today: string, weeks: number, compact = false) {
  const editalLimit = compact ? 9000 : 15000
  const minFlashcards = compact ? 6 : 10
  const conteudoInstruction = compact
    ? 'Resuma a verticalização por matéria, preservando os tópicos mais importantes do edital.'
    : 'Extraia todos os tópicos do conteúdo programático sem omitir nenhum quando possível.'

  return `Faça uma análise verticalizada do edital enviado e gere um plano de estudos compatível com a tela do sistema.

CONTEÚDO DO EDITAL:
${params.editalText.substring(0, editalLimit)}

CONFIGURAÇÕES:
- Cargo/vaga pretendida: ${params.cargo || 'Não informado'}
- Horas por dia: ${params.hoursPerDay}
- Nível do candidato: ${params.level}
- Semanas sugeridas: ${weeks}
- Data de hoje: ${today}

Responda SOMENTE com JSON válido neste formato:
{
  "identificacao": {"cargo":"string","banca":"string","orgao":"string","vagas":"string","cadastroReserva":"string","pcd":"string","remuneracao":"string","beneficios":["string"],"requisitos":["string"],"atribuicoes":["string"]},
  "cronogramaCertame": [{"evento":"string","data":"string","observacao":"string"}],
  "etapasConcurso": [{"nome":"string","carater":"string","descricao":"string"}],
  "provasDetalhadas": [{"nome":"string","duracao":"string","totalQuestoes":"string","notaMinima":"string","disciplinas":[{"nome":"string","questoes":"string","peso":"string"}]}],
  "conteudoVerticalizado": [{"materia":"string","questoes":"string","peso":"string","estrategia":"string","topicosQuentes":["string"],"topicos":[{"codigo":"1","nome":"string","subtopicos":[{"codigo":"1.1","nome":"string","subtopicos":[]}]}]}],
  "analiseBanca": {"nome":"string","estiloQuestoes":"string","pegadinhasComuns":["string"],"percentuais":{"leiSeca":"string","jurisprudencia":"string","doutrina":"string"},"fontesPreferidas":["string"]},
  "cronogramaEstudos": [{"semana":1,"titulo":"string","foco":"string","materias":[{"materia":"string","atividades":["string"],"horasSugeridas":"string","metaQuestoes":"string"}]}],
  "bibliografia": [{"materia":"string","obras":[{"titulo":"string","autor":"string","observacao":"string"}]}],
  "observacoesEstrategicas":["string"],
  "banca": {"nome":"string","estilo":"string","pegadinhas":"string","foco":"string"},
  "materias": [{"nome":"matéria","peso":1,"horas_sugeridas":10}],
  "semanas": [{"semana":1,"titulo":"Semana 1","dias":[{"dia":"Seg","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Ter","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Questões","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Qua","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Qui","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Questões","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Sex","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Revisão","horas":2,"meta_questoes":20,"descanso":false},{"dia":"Sáb","date":"${today}","materia":"nome","subtema":"Simulado/revisão","tipo":"Simulado","horas":2,"meta_questoes":40,"descanso":false},{"dia":"Dom","date":"${today}","materia":"Descanso","subtema":"Recuperação","tipo":"Descanso","horas":0,"meta_questoes":0,"descanso":true}]}],
  "flashcards": [{"topico":"tópico","pergunta":"pergunta objetiva","resposta":"resposta completa e didática","fonte":"base legal, doutrinária ou editalícia","armadilha":"pegadinha típica da banca"}]
}

REGRAS:
- Seja fiel ao edital em vagas, datas, requisitos e conteúdo programático. Não invente tópicos factuais.
- Se algo não estiver no edital, use "Não informado" ou array vazio.
- ${conteudoInstruction}
- Para estratégia, tópicos quentes, análise de banca e bibliografia, use conhecimento de concursos de forma conservadora.
- Campo "semanas": exatamente ${weeks} semanas com 7 dias cada; domingo sempre descanso; datas reais sequenciais a partir de hoje.
- Inclua no mínimo ${minFlashcards} flashcards.
- JSON não permite comentários, aspas curvas, vírgula sobrando no final, nem texto fora do objeto.`
}

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
    let weeks = 10
    if (params.examDate) {
      const diff = Math.ceil((new Date(params.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      weeks = Math.max(6, Math.min(12, Math.ceil(diff / 7)))
    }

    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda SOMENTE JSON válido, sem markdown, sem comentários e sem texto fora do JSON.'
    const providersToTry = await getEnabledProviders(provider)
    let lastError: unknown = null

    for (const currentProvider of providersToTry) {
      for (const compact of [false, true]) {
        try {
          const prompt = buildPrompt(params, today, weeks, compact)
          const raw = await callAI({ prompt, systemPrompt, provider: currentProvider, maxTokens: compact ? 6500 : 9500, useCache: false, action: compact ? 'edital_pro_plan_compact' : 'edital_pro_plan' })
          const parsed = parseAIJson<any>(raw)
          const planData = normalizePlanData(parsed, params, today, weeks)

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

          return NextResponse.json({ ok: true, provider: currentProvider, compact, plan: { id: plan.id, ...planData } })
        } catch (e) {
          lastError = e
          console.error(`[edital-pro-plan] provider=${currentProvider} compact=${compact} failed:`, e)
          if (!isRetryableAIError(e) && !compact) continue
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Não foi possível gerar o plano. Tente novamente com outro provedor de IA.')
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    const msg = String((e as Error).message || '')
    if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('authentication') || msg.includes('401')) {
      return NextResponse.json({ error: 'A chave de API do provedor de IA está inválida ou sem acesso ao modelo selecionado. Verifique em Admin > APIs de IA ou escolha outro provedor.' }, { status: 401 })
    }
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
