import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function assertAdmin() {
  const session = await getSession()
  return !!session && session.role === 'ADMIN'
}

export async function GET(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() || ''

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      plan: true,
      credits: true,
      createdAt: true,
      streak: true,
    },
  })

  return NextResponse.json({ ok: true, users })
}

export async function POST(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const email = String(body.email || '').trim().toLowerCase()
  const userId = String(body.userId || '').trim()
  const plan = body.plan ? String(body.plan) : undefined
  const role = body.role ? String(body.role) : undefined
  const credits = body.credits !== undefined && body.credits !== '' ? Number(body.credits) : undefined

  if (!email && !userId) {
    return NextResponse.json({ error: 'Informe o e-mail ou ID do usuário.' }, { status: 400 })
  }

  const data: any = {}
  if (plan) data.plan = plan
  if (role) data.role = role
  if (credits !== undefined) {
    if (!Number.isFinite(credits) || credits < 0) {
      return NextResponse.json({ error: 'Créditos inválidos.' }, { status: 400 })
    }
    data.credits = Math.floor(credits)
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const where = userId ? { id: userId } : { email }
  const user = await prisma.user.update({
    where: where as any,
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      plan: true,
      credits: true,
    },
  })

  if (credits !== undefined) {
    await prisma.creditLog.create({
      data: {
        userId: user.id,
        amount: credits,
        action: 'admin_manual_credit_set',
        details: `Admin definiu créditos para ${credits}`,
      },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, user })
}
