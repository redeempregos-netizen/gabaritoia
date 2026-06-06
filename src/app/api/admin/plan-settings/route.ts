import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_PLANS = [
  { id: 'FREE', name: 'Teste', price: '19,90', credits: 300, validityDays: 7, active: true, description: 'Plano de entrada para testar o sistema.' },
  { id: 'PACK', name: 'Plano Pack', price: '69,90', credits: 300, validityDays: 180, active: true, description: 'Inclui o Pack com 400 mil questões + acesso por 6 meses, com 300 créditos iniciais e 20 créditos de bônus por dia.' },
  { id: 'CADERNOS_500', name: 'Mensal', price: '29,90', credits: 1000, validityDays: 30, active: true, description: 'Acesso mensal para estudar com IA e plano de questões.' },
  { id: 'PRO', name: 'Trimestral', price: '47,00', credits: 3000, validityDays: 90, active: true, description: 'Acesso trimestral para estudar com mais créditos e recursos avançados.' },
  { id: 'ENTERPRISE', name: 'Anual', price: '97,00', credits: 8000, validityDays: 365, active: true, description: 'Acesso anual com todos os recursos e mais créditos.' },
]

function normalizePlans(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return DEFAULT_PLANS
    return DEFAULT_PLANS.map(defaultPlan => {
      const found = parsed.find((p: any) => p?.id === defaultPlan.id) || {}
      return {
        ...defaultPlan,
        name: defaultPlan.id === 'PACK' ? defaultPlan.name : String(found.name || defaultPlan.name),
        price: defaultPlan.id === 'PACK' ? defaultPlan.price : String(found.price || defaultPlan.price),
        credits: defaultPlan.id === 'PACK' ? defaultPlan.credits : Math.max(0, Number(found.credits ?? defaultPlan.credits) || 0),
        validityDays: defaultPlan.id === 'PACK' ? 180 : Math.max(1, Number(found.validityDays ?? defaultPlan.validityDays) || defaultPlan.validityDays),
        active: found.active !== false,
        description: defaultPlan.id === 'PACK' ? defaultPlan.description : String(found.description || defaultPlan.description),
      }
    })
  } catch {
    return DEFAULT_PLANS
  }
}

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const saved = await prisma.adminConfig.findUnique({ where: { key: 'planSettings' } })
  return NextResponse.json({ plans: normalizePlans(saved?.value) })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const plans = normalizePlans(body.plans)

  await prisma.adminConfig.upsert({
    where: { key: 'planSettings' },
    create: { key: 'planSettings', value: JSON.stringify(plans) },
    update: { value: JSON.stringify(plans) },
  })

  return NextResponse.json({ ok: true, plans })
}
