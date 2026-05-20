import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import type { AIProvider } from '@/types'

const schema = z.object({
  editalText: z.string().min(10),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
})

type CargoDetectado = {
  nome: string
  vagas?: string
  requisitos?: string
  remuneracao?: string
}

type EditalAnalysis = {
  banca: string
  orgao: string
  cargos: CargoDetectado[]
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

    const systemPrompt = 'Você é especialista em concursos públicos brasileiros. Responda SEMPRE com JSON válido, sem texto antes ou depois, sem markdown.'

    const prompt = `Analise o edital abaixo e identifique apenas as informações necessárias para configurar a geração do Edital Pro.

EDITAL:
${params.editalText.substring(0, 12000)}

Retorne SOMENTE este JSON:
{
  "banca": "nome da banca ou Não informado",
  "orgao": "nome do órgão ou Não informado",
  "cargos": [
    {
      "nome": "nome exato do cargo conforme o edital",
      "vagas": "vagas, CR e PCD quando informado, ou Não informado",
      "requisitos": "requisitos resumidos quando informado, ou Não informado",
      "remuneracao": "remuneração quando informado, ou Não informado"
    }
  ]
}

REGRAS:
- Extraia todos os cargos/funções/vagas encontrados no edital.
- Se o edital tiver apenas um cargo, retorne um único item em cargos.
- Não invente cargo, banca, órgão, vagas, remuneração ou requisito.
- Use exatamente os nomes dos cargos do edital quando possível.
- Se não encontrar cargos, retorne "cargos": [].
- Português do Brasil.`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 2000 })
    const analysis = parseAIJson<EditalAnalysis>(raw)

    return NextResponse.json({
      ok: true,
      analysis: {
        banca: analysis.banca || 'Não informado',
        orgao: analysis.orgao || 'Não informado',
        cargos: Array.isArray(analysis.cargos) ? analysis.cargos : [],
      },
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao analisar edital.' }, { status: 500 })
  }
}
