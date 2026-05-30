import { NextResponse } from 'next/server'
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

export async function GET() {
  const session = await getSession()
  if (!session?.userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await ensureColumns()

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
      ...user,
      planDaysLeft: left,
      planExpired: left !== null && left < 0,
    },
    plans: [
      { id: 'mensal', label: 'Plano Mensal', days: 30, description: 'Acesso por 30 dias' },
      { id: 'trimestral', label: 'Plano 90 dias', days: 90, description: 'Acesso por 3 meses' },
      { id: 'anual', label: 'Plano Anual', days: 365, description: 'Acesso por 1 ano' },
    ],
  })
}
