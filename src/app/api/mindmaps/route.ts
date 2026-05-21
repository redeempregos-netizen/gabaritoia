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

function normalize(raw: any, tema: string) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  return {
    titulo: raw?.titulo || `Mapa Mental — ${tema}`,
    resumo: raw?.resumo || 'Resumo não informado.',
    nodes: nodes.length ? nodes : [{ titulo: tema, resumo: 'Tema central.', filhos: [] }],
    revisaoRapida: Array.isArray(raw?.revisaoRapida) ? raw.revisaoRapida : [],
    pegadinhas: Array.isArray(raw?.pegadinhas) ? raw.pegadinhas : [],
    mnemônicos: Array.isArray(raw?.mnemônicos) ? raw.mnemônicos : (Array.isArray(raw?.mnemonicos) ? raw.mnemonicos : []),
    questoesProvaveis: Array.isArray(raw?.questoesProvaveis) ? raw.questoesProvaveis : [],
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

    const prompt = `Crie um mapa mental premium para estudo de concursos públicos.

Tema: ${params.tema}
Banca: ${params.banca || 'Não informado'}
Cargo: ${params.cargo || 'Não informado'}
Nível do aluno: ${params.nivel || 'Intermediário'}
Objetivo: ${params.objetivo || 'Revisão e memorização'}
Contexto adicional:
${(params.contexto || '').substring(0, 12000)}

Retorne SOMENTE JSON válido neste formato:
{
  "titulo":"Mapa Mental — tema",
  "resumo":"resumo objetivo do tema em até 4 linhas",
  "nodes":[
    {
      "titulo":"Bloco principal",
      "resumo":"explicação curta",
      "prioridade":"Alta|Média|Baixa",
      "filhos":[
        {"titulo":"Subtópico","resumo":"explicação curta","palavrasChave":["termo 1","termo 2"],"filhos":[]}
      ]
    }
  ],
  "revisaoRapida":["ponto essencial"],
  "pegadinhas":["erro comum em prova"],
  "mnemônicos":["frase ou técnica de memória"],
  "questoesProvaveis":["como a banca pode cobrar"]
}

Regras:
- Organize em árvore clara: tema central > blocos > subtópicos.
- Foque em memorização, revisão e prova.
- Se houver banca, adapte ao estilo dela.
- Não invente lei específica se não tiver contexto suficiente.
- Português do Brasil.`

    const raw = await callAI({ prompt, provider, maxTokens: 5000, systemPrompt: 'Responda somente JSON válido, sem markdown.', useCache: false, action: 'mind_map', queueJobId: params.queueJobId })
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
