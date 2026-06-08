import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_PLANS = [
  { id: 'FREE', name: 'Teste', price: '19,90', credits: 300, validityDays: 7, active: true, checkoutUrl: 'https://app.mivvo.io/checkout/monmubbmq4duiyo', description: 'Plano de entrada para testar o sistema.' },
  { id: 'PACK', name: 'Plano Pack', price: '69,90', credits: 1000, validityDays: 180, active: true, checkoutUrl: 'https://pay.kiwify.com.br/3SY0sIx', description: 'Inclui o Pack com 400 mil questões + acesso por 6 meses, com 1.000 créditos iniciais e 20 créditos de bônus por dia.' },
  { id: 'CADERNOS_500', name: 'Mensal', price: '29,90', credits: 2000, validityDays: 30, active: true, checkoutUrl: 'https://pay.cakto.com.br/epr62sh_915964', description: 'Acesso mensal com todos os recursos e 2.000 créditos.' },
  { id: 'PRO', name: 'Trimestral', price: '47,00', credits: 7000, validityDays: 90, active: true, checkoutUrl: 'https://pay.cakto.com.br/smhnbod', description: 'Acesso trimestral com todos os recursos e 7.000 créditos.' },
  { id: 'ENTERPRISE', name: 'Anual', price: '97,00', credits: 30000, validityDays: 365, active: true, checkoutUrl: 'https://pay.cakto.com.br/7c9386a', description: 'Acesso anual com todos os recursos e 30.000 créditos.' },
]

const MIN_PLAN_CREDITS: Record<string, number> = {
  FREE: 300,
  PACK: 1000,
  CADERNOS_500: 2000,
  PRO: 7000,
  ENTERPRISE: 30000,
}

function normalizeCheckoutUrl(value: unknown, fallback: string) {
  const url = String(value || '').trim()
  if (!url) return fallback
  if (!/^https?:\/\//i.test(url)) return fallback
  return url
}

function normalizePlans(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return DEFAULT_PLANS
    return DEFAULT_PLANS.map(defaultPlan => {
      const found = parsed.find((p: any) => p?.id === defaultPlan.id) || {}
      const credits = Math.max(Number(MIN_PLAN_CREDITS[defaultPlan.id] || defaultPlan.credits), Number(found.credits ?? defaultPlan.credits) || 0)
      return {
        ...defaultPlan,
        name: defaultPlan.id === 'PACK' ? defaultPlan.name : String(found.name || defaultPlan.name),
        price: defaultPlan.id === 'PACK' ? defaultPlan.price : String(found.price || defaultPlan.price),
        credits,
        validityDays: defaultPlan.id === 'PACK' ? 180 : Math.max(1, Number(found.validityDays ?? defaultPlan.validityDays) || defaultPlan.validityDays),
        active: found.active !== false,
        checkoutUrl: normalizeCheckoutUrl(found.checkoutUrl, defaultPlan.checkoutUrl),
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
