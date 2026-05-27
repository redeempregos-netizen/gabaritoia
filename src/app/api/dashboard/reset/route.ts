import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await prisma.answer.deleteMany({ where: { userId: session.userId } })
  await prisma.studyPlan.deleteMany({ where: { userId: session.userId } })
  await prisma.user.update({
    where: { id: session.userId },
    data: { streak: 0, lastStudyAt: null },
  })

  return NextResponse.json({ ok: true })
}
