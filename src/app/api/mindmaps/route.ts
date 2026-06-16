import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAI, parseAIJson } from '@/lib/ai'
import type { AIProvider } from '@/types'

const postSchema = z.object({
  tema: z.string().min(3),
  banca: z.string().optional(),
  cargo: z.string().optional(),
  nivel: z.string().optional(),
  objetivo: z.string().optional(),
  contexto: z.string().optional(),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
  queueJobId: z.string().optional(),
})

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mind_maps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      data_json JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function cleanShort(value: any, fallback: string, maxWords = 4, maxChars = 34) {
  const text = String(value || fallback || '')
    .replace(/^\s*\d+[.)-]?\s*/g, '')
    .replace(/^\s*[IVXLCDM]+\s*[-.)]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(' ').filter(Boolean)
  return (words.slice(0, maxWords).join(' ') || fallback).slice(0, maxChars).trim()
}

function cleanSummary(value: any, fallback = '', maxChars = 160) {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function asArray(value: any, max = 8, itemMax = 170) {
  return Array.isArray(value) ? value.slice(0, max).map((x: any) => cleanSummary(x, '', itemMax)).filter(Boolean) : []
}

function normalize(raw: any, tema: string) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  const normalizedNodes = nodes.slice(0, 8).map((n: any, idx: number) => ({
    titulo: cleanShort(n?.titulo, `Tópico ${idx + 1}`, 4, 34),
    resumo: cleanSummary(n?.resumo, 'Ponto essencial para prova.', 150),
    prioridade: ['Alta', 'Média', 'Baixa'].includes(n?.prioridade) ? n.prioridade : 'Média',
    palavrasChave: Array.isArray(n?.palavrasChave) ? n.palavrasChave.slice(0, 5).map((p: any) => cleanShort(p, '', 3, 24)).filter(Boolean) : [],
    exemplos: asArray(n?.exemplos, 3, 130),
    dica: cleanSummary(n?.dica, '', 150),
    filhos: (Array.isArray(n?.filhos) ? n.filhos : []).slice(0, 4).map((f: any, fidx: number) => ({
      titulo: cleanShort(f?.titulo, `Item ${fidx + 1}`, 4, 30),
      resumo: cleanSummary(f?.resumo, 'Detalhe importante.', 120),
      palavrasChave: Array.isArray(f?.palavrasChave) ? f.palavrasChave.slice(0, 3).map((p: any) => cleanShort(p, '', 3, 22)).filter(Boolean) : [],
      filhos: [],
    })),
  }))

  return {
    titulo: cleanShort(raw?.titulo, `Mapa Mental — ${tema}`, 6, 48),
    subtitulo: cleanSummary(raw?.subtitulo, 'Resumo visual para concursos.', 130),
    resumo: cleanSummary(raw?.resumo, 'Resumo objetivo para revisão.', 220),
    nodes: normalizedNodes.length ? normalizedNodes : [{ titulo: cleanShort(tema, 'Tema'), resumo: 'Tema central.', prioridade: 'Média', palavrasChave: [], exemplos: [], dica: '', filhos: [] }],
    blocos: Array.isArray(raw?.blocos) ? raw.blocos.slice(0, 8).map((b: any, i: number) => ({
      titulo: cleanShort(b?.titulo, `Bloco ${i + 1}`, 5, 42),
      texto: cleanSummary(b?.texto, '', 280),
      itens: asArray(b?.itens, 5, 160),
    })) : [],
    comparacoes: Array.isArray(raw?.comparacoes) ? raw.comparacoes.slice(0, 5).map((c: any) => ({
      titulo: cleanShort(c?.titulo, 'Comparação', 5, 42),
      esquerda: cleanSummary(c?.esquerda, '', 100),
      direita: cleanSummary(c?.direita, '', 100),
    })) : [],
    revisaoRapida: asArray(raw?.revisaoRapida, 8, 160),
    pegadinhas: asArray(raw?.pegadinhas, 6, 180),
    dicas: asArray(raw?.dicas, 6, 180),
    mnemônicos: asArray(raw?.mnemônicos || raw?.mnemonicos, 5, 170),
    questoesProvaveis: asArray(raw?.questoesProvaveis, 8, 180),
    exercicios: asArray(raw?.exercicios, 6, 220),
  }
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

    const recentDuplicate = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, title, topic, data_json AS data, created_at AS "createdAt"
      FROM mind_maps
      WHERE user_id = $1
        AND lower(trim(topic)) = lower(trim($2))
        AND created_at > NOW() - INTERVAL '90 seconds'
      ORDER BY created_at DESC
      LIMIT 1
    `, session.userId, params.tema)

    if (recentDuplicate?.[0]) {
      const row = recentDuplicate[0]
      return NextResponse.json({ ok: true, reused: true, mindMap: { id: row.id, title: row.title, topic: row.topic, data: row.data, createdAt: row.createdAt } })
    }

    const prompt = `Crie um MAPA MENTAL VISUAL no estilo apostila de concurso, parecido com páginas de cards: blocos curtos, exemplos, comparação, dicas, mnemônicos e exercícios.

Tema: ${params.tema}
Banca: ${params.banca || 'Não informado'}
Cargo: ${params.cargo || 'Não informado'}
Nível do aluno: ${params.nivel || 'Intermediário'}
Objetivo: ${params.objetivo || 'Revisão e memorização'}
Contexto adicional:
${(params.contexto || '').substring(0, 14000)}

Retorne SOMENTE JSON válido neste formato:
{
  "titulo":"tema curto",
  "subtitulo":"frase curta de apoio",
  "resumo":"visão geral em até 2 linhas",
  "nodes":[
    {
      "titulo":"bloco principal curto",
      "resumo":"conceito essencial para concurso",
      "prioridade":"Alta|Média|Baixa",
      "palavrasChave":["termo","termo"],
      "exemplos":["exemplo prático curto"],
      "dica":"dica objetiva para concurseiro",
      "filhos":[
        {"titulo":"subtema curto","resumo":"explicação curta","palavrasChave":["termo"],"filhos":[]}
      ]
    }
  ],
  "blocos":[
    {"titulo":"Conceito principal","texto":"explicação em linguagem simples","itens":["item de prova","item de prova"]}
  ],
  "comparacoes":[
    {"titulo":"Diferença importante","esquerda":"conceito A","direita":"conceito B"}
  ],
  "revisaoRapida":["ponto essencial"],
  "pegadinhas":["erro comum em prova"],
  "dicas":["dica para concurseiro"],
  "mnemônicos":["mnemônico com explicação"],
  "questoesProvaveis":["forma provável de cobrança pela banca"],
  "exercicios":["exercício de fixação sem gabarito"]
}

REGRAS:
- Gere conteúdo visual e didático, não apenas lista seca.
- Use linguagem de concurso público.
- Inclua exemplos práticos quando o tema permitir.
- Inclua pelo menos 1 comparação importante.
- Inclua pelo menos 2 dicas para concurseiro.
- Inclua pelo menos 1 mnemônico.
- Inclua exercícios de fixação.
- Títulos curtos, resumos claros.
- Não invente lei específica se não tiver contexto suficiente.
- Português do Brasil.`

    const raw = await callAI({ prompt, provider, maxTokens: 5200, systemPrompt: 'Responda somente JSON válido, sem markdown. Crie mapas mentais visuais em estilo apostila de concurso, com cards, dicas, mnemônicos e exercícios.', useCache: false, action: 'mind_map', queueJobId: params.queueJobId })
    const data = normalize(parseAIJson<any>(raw), params.tema)
    const id = crypto.randomUUID()
    const title = data.titulo || `Mapa Mental — ${params.tema}`

    await prisma.$executeRawUnsafe(
      `INSERT INTO mind_maps (id, user_id, title, topic, data_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, session.userId, title, params.tema, JSON.stringify(data)
    )

    return NextResponse.json({ ok: true, mindMap: { id, title, topic: params.tema, data, createdAt: new Date().toISOString() } })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar mapa mental.' }, { status: 500 })
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, title, topic, data_json AS data, created_at AS "createdAt"
    FROM mind_maps
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, session.userId)
  return NextResponse.json({ ok: true, mindMaps: rows })
}
