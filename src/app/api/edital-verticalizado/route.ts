import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAI, parseAIJson } from '@/lib/ai'
import type { AIProvider } from '@/types'

const postSchema = z.object({
  editalText: z.string().min(10),
  fileName: z.string().optional(),
  cargo: z.string().optional(),
  examDate: z.string().optional(),
  hoursPerDay: z.string().optional(),
  level: z.string().optional(),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
  queueJobId: z.string().optional(),
})

const patchSchema = z.object({ id: z.string(), progress: z.record(z.any()) })

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS verticalized_edicts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      banca TEXT,
      orgao TEXT,
      cargo TEXT,
      exam_date TIMESTAMP(3),
      data_json JSONB NOT NULL,
      progress_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function sanitizeId(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80) || crypto.randomUUID()
}

function isInvalidCargo(nome: string) {
  const lower = nome.toLowerCase()
  return ['diversos cargos', 'nível superior', 'nivel superior', 'nível médio', 'nivel medio', 'quadro de vagas', 'vagas disponíveis', 'cargos de nível', 'cargos de nivel'].some(x => lower.includes(x))
}

function normalizeCargos(raw: any, fallback?: string) {
  const list = Array.isArray(raw) ? raw : []
  const vistos = new Set<string>()
  const cargos = list.map((c: any) => ({
    nome: String(c?.nome || c?.cargo || c?.funcao || c?.função || '').trim(),
    vagas: String(c?.vagas || c?.cadastroReserva || c?.cadastro_reserva || 'Não informado'),
    requisitos: String(c?.requisitos || c?.escolaridade || 'Não informado'),
    remuneracao: String(c?.remuneracao || c?.remuneração || c?.salario || c?.salário || 'Não informado'),
  })).filter(c => {
    const key = c.nome.toLowerCase()
    if (!c.nome || c.nome === 'Não informado' || isInvalidCargo(c.nome) || vistos.has(key)) return false
    vistos.add(key)
    return true
  })
  if (!cargos.length && fallback) return [{ nome: fallback, vagas: 'Não informado', requisitos: 'Não informado', remuneracao: 'Não informado' }]
  return cargos
}

function normalizeVerticalized(raw: any, params: z.infer<typeof postSchema>) {
  const identificacao = raw?.identificacao || {}
  const cargos = normalizeCargos(raw?.cargos || identificacao?.cargos, params.cargo)
  const cargoPrincipal = params.cargo || identificacao.cargo || cargos[0]?.nome || 'Não informado'
  const materiasRaw = Array.isArray(raw?.materias) ? raw.materias : []
  const materias = materiasRaw.map((m: any, mi: number) => {
    const materiaNome = String(m?.nome || m?.materia || `Matéria ${mi + 1}`)
    const topicosRaw = Array.isArray(m?.topicos) ? m.topicos : []
    return {
      id: sanitizeId(materiaNome),
      nome: materiaNome,
      questoes: String(m?.questoes || 'Não informado'),
      peso: String(m?.peso || 'Não informado'),
      prioridade: String(m?.prioridade || 'Média'),
      estrategia: String(m?.estrategia || 'Estude a teoria e resolva questões da banca.'),
      topicosQuentes: Array.isArray(m?.topicosQuentes) ? m.topicosQuentes : [],
      topicos: topicosRaw.map((t: any, ti: number) => ({
        id: sanitizeId(`${materiaNome}-${t?.nome || t?.topico || ti}`),
        nome: String(t?.nome || t?.topico || `Tópico ${ti + 1}`),
        codigo: String(t?.codigo || `${mi + 1}.${ti + 1}`),
        prioridade: String(t?.prioridade || m?.prioridade || 'Média'),
        dificuldade: String(t?.dificuldade || 'Média'),
        questoesFeitas: 0,
        acertos: 0,
        revisado: false,
        revisaoSugeridaDias: Number(t?.revisaoSugeridaDias || 7),
        subtopicos: Array.isArray(t?.subtopicos) ? t.subtopicos.map((s: any, si: number) => ({
          id: sanitizeId(`${materiaNome}-${t?.nome || ti}-${s?.nome || s || si}`),
          nome: String(s?.nome || s),
          codigo: String(s?.codigo || `${mi + 1}.${ti + 1}.${si + 1}`),
        })) : [],
      })),
    }
  })

  return {
    identificacao: {
      banca: identificacao.banca || raw?.banca || 'Não informado',
      orgao: identificacao.orgao || identificacao.orgão || raw?.orgao || 'Não informado',
      cargo: cargoPrincipal,
      cargos,
      vagas: identificacao.vagas || cargos.find((c: any) => c.nome === cargoPrincipal)?.vagas || 'Não informado',
      remuneracao: identificacao.remuneracao || identificacao.remuneração || cargos.find((c: any) => c.nome === cargoPrincipal)?.remuneracao || 'Não informado',
      requisitos: identificacao.requisitos || cargos.find((c: any) => c.nome === cargoPrincipal)?.requisitos || 'Não informado',
      prova: identificacao.prova || 'Não informado',
    },
    cronograma: Array.isArray(raw?.cronograma) ? raw.cronograma : [],
    materias: materias.length ? materias : [{ id: 'conhecimentos-gerais', nome: 'Conhecimentos Gerais', questoes: 'Não informado', peso: 'Não informado', prioridade: 'Média', estrategia: 'Revise o conteúdo programático do edital.', topicosQuentes: [], topicos: [] }],
    analiseBanca: raw?.analiseBanca || { estilo: 'Não informado', pegadinhas: [], foco: 'Não informado', leiSeca: 'Não informado', jurisprudencia: 'Não informado', doutrina: 'Não informado' },
    planoEstudos: Array.isArray(raw?.planoEstudos) ? raw.planoEstudos : [],
    revisoes: Array.isArray(raw?.revisoes) ? raw.revisoes : [],
    estatisticasIniciais: raw?.estatisticasIniciais || {},
    modoRetaFinal: raw?.modoRetaFinal || [],
    observacoes: Array.isArray(raw?.observacoes) ? raw.observacoes : [],
  }
}

function buildPrompt(params: z.infer<typeof postSchema>, weeks: number, daysToExam: number | null) {
  return `Você é especialista em concursos públicos brasileiros. Transforme o edital em um sistema de execução para o candidato.

DADOS DO ALUNO:
- Cargo desejado: ${params.cargo || 'Não informado'}
- Data da prova: ${params.examDate || 'Não informado'}
- Dias até a prova: ${daysToExam ?? 'Não informado'}
- Horas por dia: ${params.hoursPerDay || 'Não informado'}
- Nível: ${params.level || 'Não informado'}
- Semanas de plano: ${weeks}

EDITAL:
${params.editalText.substring(0, 30000)}

Retorne SOMENTE JSON válido neste formato:
{
  "identificacao": {"banca":"","orgao":"","cargo":"","cargos":[{"nome":"","vagas":"","requisitos":"","remuneracao":""}],"vagas":"","remuneracao":"","requisitos":"","prova":""},
  "cronograma": [{"evento":"","data":"","observacao":""}],
  "materias": [{"nome":"Português","questoes":"10","peso":"1","prioridade":"Alta|Média|Baixa","estrategia":"como estudar esta matéria para esta banca em 1 frase","topicosQuentes":["assunto 1"],"topicos":[{"codigo":"1.1","nome":"Interpretação de texto","prioridade":"Alta|Média|Baixa","dificuldade":"Fácil|Média|Difícil","revisaoSugeridaDias":7,"subtopicos":[{"codigo":"1.1.1","nome":"tipologia textual"}]}]}],
  "analiseBanca": {"nome":"","estilo":"","pegadinhas":[""],"foco":"","leiSeca":"","jurisprudencia":"","doutrina":"","assuntosMaisCobrados":[""],"perfilQuestoes":""},
  "planoEstudos": [{"semana":1,"foco":"","tarefas":[""],"metaQuestoes":""}],
  "revisoes": [{"tipo":"24h|7d|30d","descricao":""}],
  "estatisticasIniciais": {"totalMaterias":0,"totalTopicos":0,"prioridadeAlta":0},
  "modoRetaFinal": ["ação prática para os últimos 30 dias"],
  "observacoes": ["dica prática"]
}

REGRAS CRÍTICAS DE IDENTIFICAÇÃO:
- BANCA: procure em expressões como "banca organizadora", "organizadora", "execução técnico-administrativa", "instituto", "fundação", "comissão organizadora", "realização", "responsável pelo certame", "banca examinadora". Exemplos: FGV, Cebraspe, FCC, Cesgranrio, Vunesp, Quadrix, IBFC, IDECAN, Instituto AOCP, FEPESE, FURB, FAU, Fundatec.
- ÓRGÃO: procure no cabeçalho e no texto principal: prefeitura, câmara, tribunal, secretaria, autarquia, universidade, conselho, ministério, polícia, fundação pública.
- CARGOS: extraia cargos individuais do quadro de vagas, tabela de cargos, anexo de cargos, cargos e vagas, escolaridade/requisitos, inscrições, conteúdo programático específico. NÃO retorne agrupamentos como "diversos cargos de nível superior", "nível médio", "quadro de vagas".
- Se houver vários cargos, retorne todos em identificacao.cargos. Se o usuário informou cargo foco, use esse em identificacao.cargo, mas mantenha a lista completa.
- Seja fiel ao edital. Não invente datas, vagas, requisitos ou tópicos factuais.
- Se algo não estiver no edital, use "Não informado".
- Extraia o conteúdo programático em árvore: matéria > tópicos > subtópicos.
- Cada tópico deve ser executável: prioridade, dificuldade e revisão sugerida.
- Na aba banca, preencha estilo, pegadinhas, foco, lei seca, jurisprudência, doutrina, assuntos mais cobrados e perfil das questões usando conhecimento conservador da banca.
- Gere plano de estudos de ${weeks} semanas, equilibrado por peso/prioridade.
- Português do Brasil.`
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureTable()
    const params = postSchema.parse(await req.json())
    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } }).catch(() => null)
      if (cfg?.value) provider = cfg.value as AIProvider
    }

    let daysToExam: number | null = null
    if (params.examDate) daysToExam = Math.max(1, Math.ceil((new Date(params.examDate).getTime() - Date.now()) / 86400000))
    const weeks = daysToExam ? Math.max(4, Math.min(16, Math.ceil(daysToExam / 7))) : 10

    const prompt = buildPrompt(params, weeks, daysToExam)
    const raw = await callAI({ prompt, provider, maxTokens: 9000, systemPrompt: 'Responda somente JSON válido, sem markdown.', useCache: false, action: 'verticalized_edital', queueJobId: params.queueJobId })
    const parsed = parseAIJson<any>(raw)
    const data = normalizeVerticalized(parsed, params)
    const title = `${data.identificacao.orgao || 'Edital'} — ${data.identificacao.cargo || params.cargo || 'Verticalizado'}`
    const id = crypto.randomUUID()

    await prisma.$executeRawUnsafe(
      `INSERT INTO verticalized_edicts (id, user_id, title, banca, orgao, cargo, exam_date, data_json, progress_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, session.userId, title, data.identificacao.banca, data.identificacao.orgao, data.identificacao.cargo, params.examDate ? new Date(params.examDate) : null, JSON.stringify(data)
    )

    return NextResponse.json({ ok: true, edital: { id, title, data, progress: {} } })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao verticalizar edital.' }, { status: 500 })
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, title, banca, orgao, cargo, exam_date AS "examDate", data_json AS data, progress_json AS progress, created_at AS "createdAt"
    FROM verticalized_edicts
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 30
  `, session.userId)
  return NextResponse.json({ ok: true, editais: rows })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTable()
  const params = patchSchema.parse(await req.json())
  await prisma.$executeRawUnsafe(`UPDATE verticalized_edicts SET progress_json = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`, JSON.stringify(params.progress), params.id, session.userId)
  return NextResponse.json({ ok: true })
}
