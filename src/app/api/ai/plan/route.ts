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
    let weeks = 12
    if (params.examDate) {
      const diff = Math.ceil((new Date(params.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      weeks = Math.max(10, Math.min(16, Math.ceil(diff / 7)))
    }

    const systemPrompt = `Você é um especialista em concursos públicos brasileiros, com profundo conhecimento de bancas (Cebraspe, FGV, FCC, Cesgranrio, Vunesp, Quadrix, IBFC, IDECAN, etc.), estilos de prova, jurisprudência e doutrina cobradas.
Responda SEMPRE com JSON válido, sem texto antes ou depois, sem backticks markdown.`

    const prompt = `Sua tarefa é fazer uma ANÁLISE COMPLETA e VERTICALIZADA do edital enviado. Vá MUITO além de copiar tópicos: extraia tudo, organize hierarquicamente e adicione inteligência prática para o candidato.

Use a ferramenta return_verticalized_edital conceitualmente, mas responda SOMENTE com JSON válido no formato abaixo, porque o sistema consumirá esse JSON.

CONTEÚDO DO EDITAL:
${params.editalText.substring(0, 12000)}

CONFIGURAÇÕES DO CANDIDATO:
- Cargo/vaga pretendida: ${params.cargo || 'Não informado'}
- Horas por dia: ${params.hoursPerDay}
- Nível do candidato: ${params.level}
- Semanas sugeridas: ${weeks}
- Data de hoje: ${today}

O que entregar:
1. Identificação completa: cargo, banca, órgão, vagas (incluindo cadastro reserva e PCD), remuneração detalhada, benefícios, requisitos, atribuições do cargo.
2. Cronograma do certame: datas importantes (publicação, inscrições, prova objetiva, discursiva, TAF, resultado, etc.) na ordem cronológica.
3. Etapas do concurso: cada fase (objetiva, discursiva, TAF, psicotécnico, investigação social, curso de formação) com caráter (eliminatório/classificatório) e descrição.
4. Provas detalhadas: para cada prova, liste disciplinas com nº de questões e peso, duração, total de questões e nota mínima.
5. Conteúdo programático verticalizado em árvore (matéria > tópico > subtópicos). EXTRAIA TODOS OS TÓPICOS sem omitir nenhum. Quebre em subtópicos sempre que possível (1.1.1, 1.1.2). Para cada matéria, indique nº de questões e peso quando informados.
6. Para cada matéria, adicione "estrategia" (1-2 frases sobre como estudar essa matéria nesta banca) e "topicosQuentes" (3-6 assuntos historicamente mais cobrados pela banca nesse cargo/área).
7. Análise da banca: estilo de questões, pegadinhas comuns, % de letra de lei vs jurisprudência vs doutrina, fontes preferidas.
8. Cronograma de estudos sugerido (10-16 semanas) equilibrado por peso das matérias.
9. Bibliografia recomendada por matéria (autores e títulos consagrados; só cite obras realmente usadas para concurso, sem inventar).
10. Observações estratégicas finais (de 3 a 6 dicas práticas).

Responda SOMENTE com este JSON:
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
  "cronogramaCertame": [
    {"evento":"string","data":"string","observacao":"string"}
  ],
  "etapasConcurso": [
    {"nome":"string","carater":"string","descricao":"string"}
  ],
  "provasDetalhadas": [
    {
      "nome":"string",
      "duracao":"string",
      "totalQuestoes":"string",
      "notaMinima":"string",
      "disciplinas":[{"nome":"string","questoes":"string","peso":"string"}]
    }
  ],
  "conteudoVerticalizado": [
    {
      "materia":"string",
      "questoes":"string",
      "peso":"string",
      "estrategia":"string",
      "topicosQuentes":["string"],
      "topicos":[
        {"codigo":"1","nome":"string","subtopicos":[{"codigo":"1.1","nome":"string","subtopicos":[{"codigo":"1.1.1","nome":"string"}]}]}
      ]
    }
  ],
  "analiseBanca": {
    "nome":"string",
    "estiloQuestoes":"string",
    "pegadinhasComuns":["string"],
    "percentuais":{"leiSeca":"string","jurisprudencia":"string","doutrina":"string"},
    "fontesPreferidas":["string"]
  },
  "cronogramaEstudos": [
    {"semana":1,"titulo":"string","foco":"string","materias":[{"materia":"string","atividades":["string"],"horasSugeridas":"string","metaQuestoes":"string"}]}
  ],
  "bibliografia": [
    {"materia":"string","obras":[{"titulo":"string","autor":"string","observacao":"string"}]}
  ],
  "observacoesEstrategicas":["string"],

  "banca": {"nome":"string","estilo":"string","pegadinhas":"string","foco":"string"},
  "materias": [{"nome":"matéria","peso":1,"horas_sugeridas":10}],
  "semanas": [{"semana":1,"titulo":"Semana 1","dias":[{"dia":"Seg","date":"${today}","materia":"nome","subtema":"subtema específico","tipo":"Teoria","horas":2,"meta_questoes":20,"descanso":false}]}],
  "flashcards": [{"topico":"tópico","pergunta":"pergunta objetiva","resposta":"resposta completa e didática","fonte":"base legal, doutrinária ou editalícia","armadilha":"pegadinha típica da banca"}]
}

REGRAS:
- Seja FIEL ao texto do edital nas informações factuais (vagas, datas, requisitos, conteúdo programático). NÃO invente tópicos.
- Para análise de banca, estratégia, tópicos quentes e bibliografia, use seu conhecimento de mercado de concursos — mas seja conservador e realista.
- Use linguagem objetiva, técnica, sem floreio.
- Se alguma informação não estiver no edital, escreva "Não informado" em campos string ou retorne array vazio.
- Português do Brasil.
- Extraia TODOS os tópicos do conteúdo programático sem omitir nenhum.
- O cronograma de estudos deve ter entre 10 e 16 semanas, equilibrado por peso das matérias.
- No campo "semanas", mantenha exatamente ${weeks} semanas com 7 dias cada para compatibilidade com a tela atual; domingo sempre descanso.
- Use datas reais sequenciais a partir de hoje no campo "semanas".
- Inclua no mínimo 15 flashcards.`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 8000 })
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
