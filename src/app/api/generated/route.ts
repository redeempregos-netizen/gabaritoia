import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_generated_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const plans = await prisma.studyPlan.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      banca: true,
      cargo: true,
      examDate: true,
      hoursPerDay: true,
      level: true,
      planJson: true,
      createdAt: true,
    },
  })

  const questions = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      q.id,
      q.banca,
      q.area,
      q.subtopic,
      q.cargo,
      q.education,
      q.difficulty,
      q.type,
      q.format,
      q.enunciado,
      q.options,
      q."correctIndex",
      q.comentario,
      q."createdAt",
      ugq.created_at AS "savedAt"
    FROM user_generated_questions ugq
    JOIN questions q ON q.id = ugq.question_id
    WHERE ugq.user_id = $1
    ORDER BY ugq.created_at DESC
    LIMIT 100
  `, session.userId)

  return NextResponse.json({ ok: true, plans, questions })
}
