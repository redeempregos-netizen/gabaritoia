import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_renewed_at TIMESTAMP(3);`).catch(() => null)
}

function daysLeft(value?: Date | string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

function planOptions() {
  return [
    { id: 'mensal', label: 'Plano Mensal', days: 30, description: 'Acesso por 30 dias' },
    { id: 'trimestral', label: 'Plano 90 dias', days: 90, description: 'Acesso por 3 meses' },
    { id: 'anual', label: 'Plano Anual', days: 365, description: 'Acesso por 1 ano' },
  ]
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

    const left = daysLeft(user.planExpiresAt)

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name || 'Usuário',
        email: user.email,
        role: user.role,
        plan: user.plan || 'FREE',
        credits: Number(user.credits || 0),
        creditsUsed: Number(user.creditsUsed || 0),
        creditsRenewedAt: user.creditsRenewedAt || null,
        planExpiresAt: user.planExpiresAt || null,
        planDaysLeft: left,
        planExpired: left !== null && left < 0,
      },
      plans: planOptions(),
    })
  } catch (e) {
    console.error('[account get]', e)

    const fallback = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, plan: true, credits: true, creditsUsed: true },
    }).catch(() => null)

    if (!fallback) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

    return NextResponse.json({
      ok: true,
      user: {
        id: fallback.id,
        name: fallback.name || 'Usuário',
        email: fallback.email,
        role: fallback.role,
        plan: fallback.plan || 'FREE',
        credits: Number(fallback.credits || 0),
        creditsUsed: Number(fallback.creditsUsed || 0),
        creditsRenewedAt: null,
        planExpiresAt: null,
        planDaysLeft: null,
        planExpired: false,
      },
      plans: planOptions(),
    })
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
