import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_PLANS = [
  { id: 'FREE', name: 'Teste', price: '19,90', credits: 300, validityDays: 7, active: true, description: 'Plano de entrada para testar o sistema.' },
  { id: 'PACK', name: 'Plano Pack', price: '47,00', credits: 300, validityDays: 180, active: true, description: 'Pague R$47 uma única vez e use por 6 meses, com 300 créditos iniciais + 20 créditos de bônus por dia.' },
  { id: 'CADERNOS_500', name: 'Básico', price: '29,90', credits: 1000, validityDays: 30, active: true, description: 'Para uso leve e estudo inicial.' },
  { id: 'PRO', name: 'Pro', price: '47,00', credits: 3000, validityDays: 30, active: true, description: 'Plano principal para estudar com frequência.' },
  { id: 'ENTERPRISE', name: 'Premium', price: '97,00', credits: 8000, validityDays: 30, active: true, description: 'Para uso pesado com mais créditos.' },
]

function normalizePlans(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return DEFAULT_PLANS
    return DEFAULT_PLANS.map(defaultPlan => {
      const found = parsed.find((p: any) => p?.id === defaultPlan.id) || {}
      return {
        ...defaultPlan,
        name: String(found.name || defaultPlan.name),
        price: String(found.price || defaultPlan.price),
        credits: Math.max(0, Number(found.credits ?? defaultPlan.credits) || 0),
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
