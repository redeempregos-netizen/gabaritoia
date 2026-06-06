import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_PLANS = [
  { id: 'FREE', name: 'Teste', price: '19,90', credits: 300, validityDays: 7, active: true, description: 'Plano de entrada para testar o sistema.' },
  { id: 'PACK', name: 'Plano Pack', price: '69,90', credits: 300, validityDays: 180, active: true, description: 'Inclui o Pack com 400 mil questões + acesso por 6 meses, com 300 créditos iniciais e 20 créditos de bônus por dia.' },
  { id: 'CADERNOS_500', name: 'Mensal', price: '29,90', credits: 1000, validityDays: 30, active: true, description: 'Acesso mensal para estudar com IA e plano de questões.' },
  { id: 'PRO', name: 'Semestral', price: '47,00', credits: 3000, validityDays: 180, active: true, description: 'Acesso semestral para estudar com mais créditos e recursos avançados.' },
  { id: 'ENTERPRISE', name: 'Anual', price: '97,00', credits: 8000, validityDays: 365, active: true, description: 'Acesso anual com todos os recursos e mais créditos.' },
]

async function ensureColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_renewed_at TIMESTAMP(3);`).catch(() => null)
}

function daysLeft(value?: Date | string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

function normalizePlans(value?: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : DEFAULT_PLANS
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

async function getConfiguredPlans() {
  const saved = await prisma.adminConfig.findUnique({ where: { key: 'planSettings' } }).catch(() => null)
  return normalizePlans(saved?.value)
}

export async function GET() {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await ensureColumns()

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, email, role, plan, credits, "creditsUsed" AS "creditsUsed",
        credits_renewed_at AS "creditsRenewedAt",
        plan_expires_at AS "planExpiresAt"
      FROM users
      WHERE id = $1
      LIMIT 1;
    `, session.userId)

    const user = rows[0]
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

    const allPlans = await getConfiguredPlans()
    const activePlans = allPlans.filter(plan => plan.active)
    const currentPlan = allPlans.find(plan => plan.id === (user.plan || 'FREE')) || DEFAULT_PLANS[0]
    const left = daysLeft(user.planExpiresAt)

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name || 'Usuário',
        email: user.email,
        role: user.role,
        plan: user.plan || 'FREE',
        planName: currentPlan.name,
        planPrice: currentPlan.price,
        planCredits: currentPlan.credits,
        planValidityDays: currentPlan.validityDays,
        credits: Number(user.credits || 0),
        creditsUsed: Number(user.creditsUsed || 0),
        creditsRenewedAt: user.creditsRenewedAt || null,
        planExpiresAt: user.planExpiresAt || null,
        planDaysLeft: left,
        planExpired: left !== null && left < 0,
      },
      plans: activePlans,
    })
  } catch (e) {
    console.error('[account get]', e)
    return NextResponse.json({ error: 'Não foi possível carregar sua conta.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()

    if (name.length < 2) return NextResponse.json({ error: 'Informe um nome válido.' }, { status: 400 })
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing && existing.id !== session.userId) {
      return NextResponse.json({ error: 'Este e-mail já está em uso.' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { name, email },
      select: { id: true, name: true, email: true, role: true, plan: true },
    })

    return NextResponse.json({ ok: true, user, message: 'Dados atualizados com sucesso.' })
  } catch (e) {
    console.error('[account update]', e)
    return NextResponse.json({ error: 'Não foi possível atualizar sua conta.' }, { status: 500 })
  }
}
