import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { callAI, parseAIJson } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import type { AIProvider } from '@/types'

const schema = z.object({
  banca: z.string().min(1),
  area: z.string().min(1),
  cargo: z.string().optional(),
  education: z.string().optional(),
  difficulty: z.enum(['Fácil', 'Média', 'Difícil']),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE']),
  format: z.enum(['Estilo banca', 'Questão inédita']),
  quantity: z.number().min(1).max(10),
  provider: z.enum(['claude', 'openai', 'gemini', 'grok', 'openrouter']).optional(),
  editalText: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json()
    const params = schema.parse(body)

    // Buscar provedor padrão do admin se não especificado
    let provider: AIProvider = (params.provider as AIProvider) || 'claude'
    if (!params.provider) {
      const cfg = await prisma.adminConfig.findUnique({ where: { key: 'defaultProvider' } })
      if (cfg?.value) provider = cfg.value as AIProvider
    }

    const isTF = params.type === 'TRUE_FALSE'
    const isOriginal = params.format === 'Questão inédita'
    const isEdital = !!params.editalText

    const systemPrompt = `Você é especialista em concursos públicos brasileiros com profundo conhecimento sobre diversas bancas organizadoras.
Responda SEMPRE com JSON válido conforme solicitado, sem texto antes ou depois, sem backticks markdown.`

    let prompt: string

    if (isEdital) {
      prompt = `Com base no edital/programa abaixo, crie EXATAMENTE ${params.quantity} questão(ões) de múltipla escolha (5 alternativas A-E) de nível ${params.difficulty}.

CONTEÚDO DO EDITAL:
${params.editalText!.substring(0, 3000)}

Responda SOMENTE com array JSON:
[{"enunciado":"texto completo","options":["A","B","C","D","E"],"correctIndex":0,"comentario":"explicação detalhada","area":"matéria cobrada","subtopic":"subtópico"}]
correctIndex é o índice (0=A,1=B,2=C,3=D,4=E)`
    } else if (isTF) {
      prompt = `Você conhece profundamente a banca "${params.banca}". Adote fielmente seu estilo e linguagem.
Se não conhecer esta banca exatamente, use o estilo CEBRASPE/CESPE como padrão para certo/errado.

Crie EXATAMENTE ${params.quantity} afirmação(ões) do tipo CERTO ou ERRADO:
- Área/Matéria: ${params.area}
- Escolaridade: ${params.education || 'não especificada'}
- Cargo: ${params.cargo || 'não especificado'}
- Dificuldade: ${params.difficulty}
- Formato: ${isOriginal ? 'afirmação inédita e original' : 'imite o estilo autêntico da banca ' + params.banca}

Misture verdadeiras e falsas. Em nível difícil use pegadinhas sutis.
Responda SOMENTE com array JSON:
[{"enunciado":"afirmação completa","options":["Certo","Errado"],"correctIndex":0,"comentario":"explicação com fundamentos legais","subtopic":"subtópico"}]
correctIndex: 0=Certo, 1=Errado`
    } else {
      prompt = `Você conhece profundamente a banca "${params.banca}". Adote fielmente seu estilo, linguagem e estrutura de enunciado.
Se não conhecer exatamente, use o padrão de múltipla escolha das principais bancas brasileiras.

Crie EXATAMENTE ${params.quantity} questão(ões) de múltipla escolha (5 alternativas A-E):
- Área/Matéria: ${params.area}
- Escolaridade: ${params.education || 'não especificada'}
- Cargo: ${params.cargo || 'não especificado'}
- Dificuldade: ${params.difficulty}
- Formato: ${isOriginal ? 'questão inédita e original' : 'imite fielmente o estilo da banca ' + params.banca}

Responda SOMENTE com array JSON:
[{"enunciado":"enunciado completo","options":["alternativa A","alternativa B","alternativa C","alternativa D","alternativa E"],"correctIndex":0,"comentario":"explicação detalhada de cada alternativa com fundamentos legais","subtopic":"subtópico específico"}]
correctIndex é o índice (0=A,1=B,2=C,3=D,4=E). Responda SOMENTE o JSON.`
    }

    const raw = await callAI({ prompt, systemPrompt, provider, maxTokens: 2500 })
    const parsed = parseAIJson<Array<{
      enunciado: string
      options: string[]
      correctIndex: number
      comentario: string
      subtopic?: string
      area?: string
    }>>(raw)

    // Salvar questões no banco
    const questions = await Promise.all(
      parsed.map(q =>
        prisma.question.create({
          data: {
            banca: params.banca,
            area: q.area || params.area,
            subtopic: q.subtopic,
            cargo: params.cargo,
            education: params.education,
            difficulty: params.difficulty,
            type: params.type,
            format: params.format,
            enunciado: q.enunciado,
            options: q.options,
            correctIndex: q.correctIndex,
            comentario: q.comentario,
            isOriginal,
            fromEdital: isEdital,
            aiProvider: provider,
          },
        })
      )
    )

    return NextResponse.json({ ok: true, questions, provider })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao gerar questão.' }, { status: 500 })
  }
}
