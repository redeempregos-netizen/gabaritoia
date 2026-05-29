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

function cleanShort(value: any, fallback: string, maxWords = 5, maxChars = 34) {
  const text = String(value || fallback || '')
    .replace(/^\s*\d+[.)-]?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(' ').filter(Boolean)
  const short = words.slice(0, maxWords).join(' ')
  return (short || fallback).slice(0, maxChars).trim()
}

function cleanSummary(value: any, fallback = '', maxChars = 80) {
  return String(value || fallback || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

function normalize(raw: any, tema: string) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  const normalizedNodes = nodes.slice(0, 8).map((n: any, idx: number) => ({
    titulo: cleanShort(n?.titulo, `Tópico ${idx + 1}`, 4, 30),
    resumo: cleanSummary(n?.resumo, 'Ponto essencial para revisão.', 72),
    prioridade: ['Alta', 'Média', 'Baixa'].includes(n?.prioridade) ? n.prioridade : 'Média',
    palavrasChave: Array.isArray(n?.palavrasChave) ? n.palavrasChave.slice(0, 4).map((p: any) => cleanShort(p, '', 3, 24)).filter(Boolean) : [],
    filhos: (Array.isArray(n?.filhos) ? n.filhos : []).slice(0, 3).map((f: any, fidx: number) => ({
      titulo: cleanShort(f?.titulo, `Item ${fidx + 1}`, 4, 28),
      resumo: cleanSummary(f?.resumo, 'Detalhe importante.', 70),
      palavrasChave: Array.isArray(f?.palavrasChave) ? f.palavrasChave.slice(0, 3).map((p: any) => cleanShort(p, '', 3, 22)).filter(Boolean) : [],
      filhos: [],
    })),
  }))

  return {
    titulo: cleanShort(raw?.titulo, `Mapa Mental — ${tema}`, 6, 42),
    resumo: cleanSummary(raw?.resumo, 'Resumo objetivo para revisão.', 180),
    nodes: normalizedNodes.length ? normalizedNodes : [{ titulo: cleanShort(tema, 'Tema'), resumo: 'Tema central.', prioridade: 'Média', filhos: [] }],
    revisaoRapida: Array.isArray(raw?.revisaoRapida) ? raw.revisaoRapida.slice(0, 8).map((x: any) => cleanSummary(x, '', 120)).filter(Boolean) : [],
    pegadinhas: Array.isArray(raw?.pegadinhas) ? raw.pegadinhas.slice(0, 6).map((x: any) => cleanSummary(x, '', 120)).filter(Boolean) : [],
    mnemônicos: Array.isArray(raw?.mnemônicos) ? raw.mnemônicos.slice(0, 5).map((x: any) => cleanSummary(x, '', 120)).filter(Boolean) : (Array.isArray(raw?.mnemonicos) ? raw.mnemonicos.slice(0, 5).map((x: any) => cleanSummary(x, '', 120)).filter(Boolean) : []),
    questoesProvaveis: Array.isArray(raw?.questoesProvaveis) ? raw.questoesProvaveis.slice(0, 6).map((x: any) => cleanSummary(x, '', 140)).filter(Boolean) : [],
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

    const prompt = `Crie um mapa mental VISUAL para estudo de concursos públicos.

Tema: ${params.tema}
Banca: ${params.banca || 'Não informado'}
Cargo: ${params.cargo || 'Não informado'}
Nível do aluno: ${params.nivel || 'Intermediário'}
Objetivo: ${params.objetivo || 'Revisão e memorização'}
Contexto adicional:
${(params.contexto || '').substring(0, 12000)}

Retorne SOMENTE JSON válido neste formato:
{
  "titulo":"tema curto",
  "resumo":"resumo objetivo do tema em até 2 linhas",
  "nodes":[
    {
      "titulo":"2 a 4 palavras",
      "resumo":"explicação curta em até 9 palavras",
      "prioridade":"Alta|Média|Baixa",
      "palavrasChave":["termo curto","termo curto"],
      "filhos":[
        {"titulo":"2 a 4 palavras","resumo":"explicação curta","palavrasChave":["termo","termo"],"filhos":[]}
      ]
    }
  ],
  "revisaoRapida":["ponto essencial"],
  "pegadinhas":["erro comum em prova"],
  "mnemônicos":["frase ou técnica de memória"],
  "questoesProvaveis":["como a banca pode cobrar"]
}

REGRAS OBRIGATÓRIAS PARA O MAPA VISUAL:
- O título de cada bloco principal deve ter no máximo 4 palavras.
- O título de cada subtópico deve ter no máximo 4 palavras.
- Não use numeração nos títulos. Proibido: "1.", "2.", "3.", "I -".
- Não use frases longas nos títulos.
- Não use títulos como "Classificação dos atos administrativos quanto ao conteúdo".
- Prefira: "Classificação", "Atributos", "Poderes", "Controle", "Responsabilidade".
- Coloque detalhes no resumo e nas palavras-chave, não no título.
- Gere entre 6 e 8 blocos principais.
- Cada bloco deve ter de 2 a 3 subtópicos.
- Palavras-chave devem ter no máximo 3 palavras cada.
- Foque em memorização, revisão e prova.
- Se houver banca, adapte ao estilo dela.
- Não invente lei específica se não tiver contexto suficiente.
- Português do Brasil.`

    const raw = await callAI({ prompt, provider, maxTokens: 5000, systemPrompt: 'Responda somente JSON válido, sem markdown. Use títulos muito curtos próprios para mapa mental visual.', useCache: false, action: 'mind_map', queueJobId: params.queueJobId })
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
