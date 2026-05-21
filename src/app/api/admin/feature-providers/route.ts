import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const FEATURES = [
  { key: 'editalVerticalizado', configKey: 'provider_edital_verticalizado', label: 'Edital Verticalizado', recommended: 'claude' },
  { key: 'editalPro', configKey: 'provider_edital_pro', label: 'Edital Pro', recommended: 'claude' },
  { key: 'gerarQuestoes', configKey: 'provider_gerar_questoes', label: 'Gerar Questões', recommended: 'openai' },
  { key: 'mapasMentais', configKey: 'provider_mapas_mentais', label: 'Mapas Mentais', recommended: 'claude' },
  { key: 'flashcards', configKey: 'provider_flashcards', label: 'Flashcards', recommended: 'gemini' },
  { key: 'tutorIA', configKey: 'provider_tutor_ia', label: 'Tutor IA', recommended: 'openai' },
]

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const [configs, apiKeys] = await Promise.all([
    prisma.adminConfig.findMany(),
    prisma.apiKey.findMany({ select: { provider: true, isEnabled: true, keyHash: true, model: true } }),
  ])

  const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]))
  const providers = apiKeys.map(k => ({ provider: k.provider, enabled: k.isEnabled, hasKey: !!k.keyHash, model: k.model }))

  const values = Object.fromEntries(FEATURES.map(f => [f.key, configMap[f.configKey] || f.recommended]))

  return NextResponse.json({ ok: true, features: FEATURES, values, providers })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await req.json()
  const values = body.values || {}

  for (const feature of FEATURES) {
    const value = values[feature.key]
    if (!value) continue
    await prisma.adminConfig.upsert({
      where: { key: feature.configKey },
      create: { key: feature.configKey, value },
      update: { value },
    })
  }

  return NextResponse.json({ ok: true })
}
