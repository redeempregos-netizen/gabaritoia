import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  query: z.string().min(3).max(300),
  maxResults: z.number().min(1).max(8).optional(),
  source: z.enum(['web', 'pci', 'qconcursos', 'pci_qconcursos', 'all']).optional(),
})

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS web_search_cache (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL UNIQUE,
      result_json JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function normalizeQuery(q: string) {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

function buildSearchQuery(query: string, source: string) {
  const clean = query.trim().replace(/\s+/g, ' ')

  if (source === 'pci') {
    return `site:pciconcursos.com.br/simulados ${clean}`
  }

  if (source === 'qconcursos') {
    return `site:qconcursos.com/questoes-de-concursos/questoes ${clean}`
  }

  if (source === 'pci_qconcursos') {
    return `(site:pciconcursos.com.br/simulados OR site:qconcursos.com/questoes-de-concursos/questoes) ${clean}`
  }

  if (source === 'all') {
    return `(site:pciconcursos.com.br/simulados OR site:qconcursos.com/questoes-de-concursos/questoes OR site:questoesestrategicas.com.br/questoes OR site:tecconcursos.com.br/questoes) ${clean}`
  }

  return clean
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureTable()
    const params = schema.parse(await req.json())
    const source = params.source || 'web'
    const searchQuery = buildSearchQuery(params.query, source)
    const cacheKey = normalizeQuery(`${source}:${searchQuery}`)
    const maxResults = params.maxResults || 5

    const cached = await prisma.$queryRawUnsafe<any[]>(
      `SELECT result_json AS result, created_at AS "createdAt"
       FROM web_search_cache
       WHERE query = $1
       AND created_at > NOW() - INTERVAL '7 days'
       LIMIT 1`,
      cacheKey
    )

    if (cached[0]?.result) {
      return NextResponse.json({ ok: true, cached: true, source, query: searchQuery, results: cached[0].result })
    }

    const key = process.env.SERPAPI_KEY
    if (!key) {
      return NextResponse.json({ error: 'SERPAPI_KEY não configurada no ambiente da Vercel.' }, { status: 500 })
    }

    const url = new URL('https://serpapi.com/search.json')
    url.searchParams.set('engine', 'google')
    url.searchParams.set('q', searchQuery)
    url.searchParams.set('api_key', key)
    url.searchParams.set('hl', 'pt-br')
    url.searchParams.set('gl', 'br')
    url.searchParams.set('num', String(maxResults))

    const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' })
    const data = await res.json()

    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error || 'Erro ao buscar na web.' }, { status: 500 })
    }

    const results = (data.organic_results || []).slice(0, maxResults).map((r: any) => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
      source: r.source || source,
      displayedLink: r.displayed_link || '',
      date: r.date || '',
      kind: 'public_exam_reference',
    })).filter((r: any) => r.title || r.snippet)

    await prisma.$executeRawUnsafe(
      `INSERT INTO web_search_cache (id, query, result_json, created_at)
       VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (query) DO UPDATE SET result_json = EXCLUDED.result_json, created_at = CURRENT_TIMESTAMP`,
      crypto.randomUUID(), cacheKey, JSON.stringify(results)
    )

    return NextResponse.json({ ok: true, cached: false, source, query: searchQuery, results })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro na busca web.' }, { status: 500 })
  }
}
