import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureGeneratedQuestionsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_generated_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await ensureGeneratedQuestionsTable()

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

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await ensureGeneratedQuestionsTable()

  try {
    const body = await req.json()
    const { action, type, id } = body || {}

    if (action === 'save_question_plan') {
      const plan = body.plan || {}
      const title = String(body.title || `Plano de Questões — ${body.cargo || 'Concurso'}`).slice(0, 120)
      const saved = await prisma.studyPlan.create({
        data: {
          userId: session.userId,
          title,
          banca: body.banca || null,
          cargo: body.cargo || null,
          examDate: body.examDate ? new Date(`${body.examDate}T12:00:00`) : null,
          hoursPerDay: String(body.hoursPerDay || '2'),
          level: 'Plano de Questões',
          editalText: body.materiasText || null,
          planJson: {
            tipo: 'plano_questoes',
            banca: body.banca || '',
            cargo: body.cargo || '',
            examDate: body.examDate || '',
            selectedDays: body.selectedDays || [],
            turno: body.turno || '',
            hoursPerDay: body.hoursPerDay || 2,
            questionsPerDay: body.questionsPerDay || 30,
            source: body.source || 'ambos',
            materias: body.materias || [],
            cronograma: Array.isArray(plan) ? plan : [],
            progresso: {},
          },
          flashcards: [],
          daysCompleted: {},
        },
        select: { id: true, title: true, createdAt: true },
      })

      return NextResponse.json({ ok: true, plan: saved })
    }

    if (action !== 'delete_item') {
      return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
    }

    if (!id || !['plan', 'question'].includes(type)) {
      return NextResponse.json({ error: 'Tipo ou ID inválido.' }, { status: 400 })
    }

    if (type === 'plan') {
      const deleted = await prisma.studyPlan.deleteMany({ where: { id, userId: session.userId } })
      if (!deleted.count) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    if (type === 'question') {
      await prisma.$executeRawUnsafe(
        `DELETE FROM user_generated_questions WHERE user_id = $1 AND question_id = $2`,
        session.userId,
        id
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Tipo desconhecido.' }, { status: 400 })
  } catch (e) {
    console.error('[generated item]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao processar item.' }, { status: 500 })
  }
}
