import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizePlan, PLAN_CREDIT_AMOUNT, PLAN_FREE } from '@/lib/plans'

const DEFAULT_PLAN_DAYS: Record<string, number> = {
  FREE: 7,
  CADERNOS_500: 30,
  PRO: 30,
  ENTERPRISE: 30,
}

async function assertAdmin() {
  const session = await getSession()
  return !!session && session.role === 'ADMIN'
}

async function ensurePlanColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP(3);`).catch(() => null)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + Math.max(1, Number(days || 1)))
  return date
}

function daysLeft(value?: Date | string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

async function getPlanDays(plan: string) {
  const saved = await prisma.adminConfig.findUnique({ where: { key: 'planSettings' } }).catch(() => null)
  if (saved?.value) {
    try {
      const plans = JSON.parse(saved.value)
      if (Array.isArray(plans)) {
        const found = plans.find((p: any) => normalizePlan(p?.id) === plan)
        if (found?.validityDays) return Math.max(1, Number(found.validityDays) || DEFAULT_PLAN_DAYS[plan] || 30)
      }
    } catch {}
  }
  return DEFAULT_PLAN_DAYS[plan] || 30
}

export async function GET(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  await ensurePlanColumns()
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''

  const users = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, name, email, role, plan, credits, "createdAt", streak,
      plan_started_at AS "planStartedAt",
      plan_expires_at AS "planExpiresAt"
    FROM users
    WHERE ($1 = '' OR email ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
    ORDER BY "createdAt" DESC
    LIMIT 50;
  `, q)

  return NextResponse.json({
    ok: true,
    users: users.map(user => ({
      ...user,
      plan: normalizePlan(user.plan),
      planDaysLeft: daysLeft(user.planExpiresAt),
      planExpired: user.planExpiresAt ? daysLeft(user.planExpiresAt)! < 0 : false,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  await ensurePlanColumns()

  const body = await req.json()
  const email = String(body.email || '').trim().toLowerCase()
  const userId = String(body.userId || '').trim()
  const rawPlan = body.plan ? String(body.plan) : undefined
  const plan = rawPlan ? normalizePlan(rawPlan) : undefined
  const role = body.role ? String(body.role).toUpperCase() : undefined
  const creditsWasEdited = body.creditsWasEdited === true
  const credits = body.credits !== undefined && body.credits !== '' ? Number(body.credits) : undefined

  if (!email && !userId) {
    return NextResponse.json({ error: 'Informe o e-mail ou ID do usuário.' }, { status: 400 })
  }

  if (plan && !['FREE', 'CADERNOS_500', 'PRO', 'ENTERPRISE'].includes(plan)) {
    return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 })
  }
  if (role && !['USER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Permissão inválida.' }, { status: 400 })
  }
  if (credits !== undefined && (!Number.isFinite(credits) || credits < 0)) {
    return NextResponse.json({ error: 'Créditos inválidos.' }, { status: 400 })
  }

  const whereSql = userId ? 'id = $1' : 'email = $1'
  const whereValue = userId || email
  const currentRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, plan, credits FROM users WHERE ${whereSql} LIMIT 1;
  `, whereValue)
  const current = currentRows[0]
  if (!current) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const currentPlan = normalizePlan(current.plan)
  const nextPlan = plan || currentPlan
  const planChanged = !!plan && nextPlan !== currentPlan
  const data: any = {}
  if (plan) data.plan = nextPlan
  if (role) data.role = role

  if (creditsWasEdited && credits !== undefined) {
    data.credits = Math.floor(credits)
  } else if (planChanged) {
    data.credits = PLAN_CREDIT_AMOUNT[nextPlan] ?? PLAN_CREDIT_AMOUNT[PLAN_FREE]
    data.creditsUsed = 0
  } else if (credits !== undefined) {
    data.credits = Math.floor(credits)
  }

  if (!Object.keys(data).length && !plan) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: (userId ? { id: userId } : { email }) as any,
    data,
    select: { id: true, name: true, email: true, role: true, plan: true, credits: true },
  })

  let expiresAt: Date | null = null
  if (plan) {
    const validityDays = await getPlanDays(nextPlan)
    expiresAt = addDays(validityDays)
    await prisma.$executeRawUnsafe(`
      UPDATE users
      SET plan_started_at = NOW(), plan_expires_at = $1
      WHERE id = $2;
    `, expiresAt, updated.id)
  }

  if (data.credits !== undefined) {
    await prisma.creditLog.create({
      data: {
        userId: updated.id,
        amount: Number(data.credits),
        action: planChanged ? 'admin_plan_credit_reset' : 'admin_manual_credit_set',
        details: planChanged ? `Admin alterou plano para ${nextPlan} e resetou créditos para ${data.credits}` : `Admin definiu créditos para ${data.credits}`,
      },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, user: { ...updated, plan: normalizePlan(updated.plan), planExpiresAt: expiresAt } })
}
