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

function normalizarCargo(cargo: any): CargoDetectado | null {
  const nome = String(cargo?.nome || cargo?.cargo || cargo?.funcao || cargo?.função || '').trim()
  if (!nome) return null

  const invalido = [
    'diversos cargos',
    'diversas funções',
    'diversas funcoes',
    'nivel superior',
    'nível superior',
    'nivel medio',
    'nível médio',
    'nivel fundamental',
    'nível fundamental',
    'cargos de nivel',
    'cargos de nível',
    'quadro de vagas',
    'vagas disponíveis',
    'vagas disponiveis',
  ]

  const lower = nome.toLowerCase()
  if (invalido.some(t => lower.includes(t))) return null

  return {
    nome,
    vagas: String(cargo?.vagas || cargo?.cadastroReserva || cargo?.cadastro_reserva || 'Não informado'),
    requisitos: String(cargo?.requisitos || cargo?.escolaridade || 'Não informado'),
    remuneracao: String(cargo?.remuneracao || cargo?.remuneração || cargo?.salario || cargo?.salário || 'Não informado'),
  }
}

function normalizarCargos(cargos: any): CargoDetectado[] {
  const lista = Array.isArray(cargos) ? cargos : []
  const vistos = new Set<string>()

  return lista
    .map(normalizarCargo)
    .filter((c): c is CargoDetectado => Boolean(c))
    .filter(c => {
      const key = c.nome.toLowerCase()
      if (vistos.has(key)) return false
      vistos.add(key)
      return true
    })
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
${params.editalText.substring(0, 20000)}

Retorne SOMENTE este JSON:
{
  "banca": "nome da banca ou Não informado",
  "orgao": "nome do órgão ou Não informado",
  "cargos": [
    {
      "nome": "nome exato do cargo individual conforme o edital",
      "vagas": "vagas, CR e PCD quando informado, ou Não informado",
      "requisitos": "requisitos resumidos quando informado, ou Não informado",
      "remuneracao": "remuneração quando informado, ou Não informado"
    }
  ]
}

REGRAS IMPORTANTES:
- Extraia os cargos INDIVIDUAIS do quadro de vagas, tabela de cargos, anexo de cargos ou seção de inscrições.
- NÃO use agrupamentos genéricos como cargo. Exemplos proibidos: "diversos cargos de Nível Superior", "diversos cargos de Nível Médio", "cargos de nível fundamental", "quadro de vagas", "nível superior".
- Se o edital agrupar por escolaridade, entre dentro do grupo e liste cada cargo real separadamente.
- Exemplos de cargos válidos: Advogado, Contador, Engenheiro Civil, Professor de Educação Infantil, Agente Administrativo, Motorista, Técnico em Enfermagem.
- Se houver muitos cargos, retorne todos que conseguir identificar, sem resumir em "diversos cargos".
- Se não conseguir identificar cargos individuais com segurança, retorne "cargos": [] para o usuário preencher manualmente.
- Não invente cargo, banca, órgão, vagas, remuneração ou requisito.
- Use exatamente os nomes dos cargos do edital quando possível.
- Português do Brasil.`

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 3500 })
    const analysis = parseAIJson<EditalAnalysis>(raw)
    const cargos = normalizarCargos(analysis.cargos)

    return NextResponse.json({
      ok: true,
      analysis: {
        banca: analysis.banca || 'Não informado',
        orgao: analysis.orgao || 'Não informado',
        cargos,
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
