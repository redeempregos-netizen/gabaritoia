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
  await prisma.$executeRawUnsafe(`ALTER TABLE user_generated_questions ADD COLUMN IF NOT EXISTS plan_id TEXT;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE user_generated_questions ADD COLUMN IF NOT EXISTS day_number INTEGER;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE user_generated_questions ADD COLUMN IF NOT EXISTS selected_idx INTEGER;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE user_generated_questions ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE user_generated_questions ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS user_generated_questions_user_question_idx ON user_generated_questions(user_id, question_id);`).catch(() => null)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS user_generated_questions_plan_day_idx ON user_generated_questions(user_id, plan_id, day_number);`).catch(() => null)
}

async function linkQuestionsToUser(userId: string, questionIds: string[], planId?: string | null, dayNumber?: number | null) {
  await ensureGeneratedQuestionsTable()
  for (const questionId of questionIds.filter(Boolean)) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO user_generated_questions (id, user_id, question_id, plan_id, day_number, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         plan_id = COALESCE(EXCLUDED.plan_id, user_generated_questions.plan_id),
         day_number = COALESCE(EXCLUDED.day_number, user_generated_questions.day_number)`,
      crypto.randomUUID(),
      userId,
      questionId,
      planId || null,
      dayNumber || null
    ).catch(() => null)
  }
}

async function getDayStats(userId: string, planId: string) {
  await ensureGeneratedQuestionsTable()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      day_number AS "dayNumber",
      COUNT(*)::int AS total,
      COUNT(answered_at)::int AS answered,
      COALESCE(SUM(CASE WHEN is_correct = true THEN 1 ELSE 0 END), 0)::int AS correct,
      COALESCE(SUM(CASE WHEN answered_at IS NOT NULL AND is_correct = false THEN 1 ELSE 0 END), 0)::int AS wrong
    FROM user_generated_questions
    WHERE user_id = $1 AND plan_id = $2 AND day_number IS NOT NULL
    GROUP BY day_number
    ORDER BY day_number ASC
  `, userId, planId)

  const stats: Record<string, any> = {}
  for (const row of rows) {
    const total = Number(row.total || 0)
    const answered = Number(row.answered || 0)
    stats[String(row.dayNumber)] = {
      dayNumber: Number(row.dayNumber),
      total,
      answered,
      correct: Number(row.correct || 0),
      wrong: Number(row.wrong || 0),
      percent: total ? Math.round((answered / total) * 100) : 0,
      done: total > 0 && answered >= total,
    }
  }
  return stats
}

async function syncPlanProgressFromStats(userId: string, planId: string) {
  const existing = await prisma.studyPlan.findFirst({ where: { id: planId, userId }, select: { planJson: true, daysCompleted: true } })
  if (!existing) return null

  const planJson: any = existing.planJson || {}
  const cronograma = Array.isArray(planJson.cronograma) ? planJson.cronograma : []
  const dayStats = await getDayStats(userId, planId)
  const diasComQuestoes = Object.values(dayStats).filter((s: any) => s.total > 0).map((s: any) => s.dayNumber)
  const diasConcluidos = Object.values(dayStats).filter((s: any) => s.done).map((s: any) => s.dayNumber)
  const questoesGeradas = Object.values(dayStats).reduce((acc: number, s: any) => acc + Number(s.total || 0), 0)
  const questoesRespondidas = Object.values(dayStats).reduce((acc: number, s: any) => acc + Number(s.answered || 0), 0)
  const acertos = Object.values(dayStats).reduce((acc: number, s: any) => acc + Number(s.correct || 0), 0)
  const erros = Object.values(dayStats).reduce((acc: number, s: any) => acc + Number(s.wrong || 0), 0)
  const totalDias = cronograma.length || Number(planJson.progresso?.totalDias || 0)
  const percentual = questoesGeradas ? Math.round((questoesRespondidas / questoesGeradas) * 100) : 0
  const progresso = {
    ...(planJson.progresso || {}),
    diasComQuestoes,
    diasConcluidos,
    questoesGeradas,
    questoesRespondidas,
    acertos,
    erros,
    totalDias,
    percentual,
    ultimaAtualizacao: new Date().toISOString(),
  }

  const daysCompleted: any = existing.daysCompleted || {}
  Object.entries(dayStats).forEach(([day, stat]: any) => {
    daysCompleted[day] = {
      ...(daysCompleted[day] || {}),
      completed: stat.done,
      questionsGenerated: stat.total,
      answered: stat.answered,
      correct: stat.correct,
      wrong: stat.wrong,
      percent: stat.percent,
      updatedAt: new Date().toISOString(),
    }
  })

  await prisma.studyPlan.update({
    where: { id: planId },
    data: { planJson: { ...planJson, progresso }, daysCompleted },
  })

  return { progresso, daysCompleted, dayStats }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  await ensureGeneratedQuestionsTable()

  const planId = req.nextUrl.searchParams.get('planId')
  if (planId) {
    await syncPlanProgressFromStats(session.userId, planId).catch(() => null)
    const plan = await prisma.studyPlan.findFirst({
      where: { id: planId, userId: session.userId },
      select: {
        id: true,
        title: true,
        banca: true,
        cargo: true,
        examDate: true,
        hoursPerDay: true,
        level: true,
        editalText: true,
        planJson: true,
        daysCompleted: true,
        createdAt: true,
      },
    })
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
    const dayStats = await getDayStats(session.userId, planId)
    return NextResponse.json({ ok: true, plan, dayStats })
  }

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
      daysCompleted: true,
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
      ugq.plan_id AS "planId",
      ugq.day_number AS "dayNumber",
      ugq.selected_idx AS "selectedIdx",
      ugq.is_correct AS "isCorrect",
      ugq.answered_at AS "answeredAt",
      ugq.created_at AS "savedAt"
    FROM user_generated_questions ugq
    JOIN questions q ON q.id = ugq.question_id
    WHERE ugq.user_id = $1
    ORDER BY ugq.created_at DESC
    LIMIT 300
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

    if (action === 'link_questions') {
      const questionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String) : []
      await linkQuestionsToUser(session.userId, questionIds, body.planId ? String(body.planId) : null, body.dayNumber ? Number(body.dayNumber) : null)
      return NextResponse.json({ ok: true, linked: questionIds.length })
    }

    if (action === 'answer_question') {
      const questionId = String(body.questionId || '')
      const selectedIdx = Number(body.selectedIdx)
      if (!questionId || Number.isNaN(selectedIdx)) return NextResponse.json({ error: 'Questão ou alternativa inválida.' }, { status: 400 })
      const question = await prisma.question.findUnique({ where: { id: questionId }, select: { correctIndex: true } })
      if (!question) return NextResponse.json({ error: 'Questão não encontrada.' }, { status: 404 })
      const isCorrect = selectedIdx === question.correctIndex
      await prisma.$executeRawUnsafe(
        `UPDATE user_generated_questions
         SET selected_idx = $1, is_correct = $2, answered_at = COALESCE(answered_at, CURRENT_TIMESTAMP)
         WHERE user_id = $3 AND question_id = $4`,
        selectedIdx,
        isCorrect,
        session.userId,
        questionId
      )
      const linked = await prisma.$queryRawUnsafe<any[]>(`SELECT plan_id AS "planId" FROM user_generated_questions WHERE user_id = $1 AND question_id = $2 LIMIT 1`, session.userId, questionId)
      const planId = linked?.[0]?.planId
      const synced = planId ? await syncPlanProgressFromStats(session.userId, String(planId)).catch(() => null) : null
      return NextResponse.json({ ok: true, selectedIdx, isCorrect, planProgress: synced?.progresso || null, dayStats: synced?.dayStats || null })
    }

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
            progresso: {
              diasConcluidos: [],
              diasComQuestoes: [],
              questoesGeradas: 0,
              questoesRespondidas: 0,
              acertos: 0,
              erros: 0,
              totalDias: Array.isArray(plan) ? plan.length : 0,
              percentual: 0,
              ultimaAtualizacao: new Date().toISOString(),
            },
          },
          flashcards: [],
          daysCompleted: {},
        },
        select: { id: true, title: true, createdAt: true },
      })

      return NextResponse.json({ ok: true, plan: saved })
    }

    if (action === 'update_question_plan_progress') {
      const planId = String(body.planId || '')
      const dayNumber = Number(body.dayNumber)
      const generated = Math.max(0, Number(body.generated || 0))
      if (!planId || !dayNumber) return NextResponse.json({ error: 'Plano ou dia inválido.' }, { status: 400 })
      const synced = await syncPlanProgressFromStats(session.userId, planId)
      if (!synced) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
      return NextResponse.json({ ok: true, progresso: synced.progresso, daysCompleted: synced.daysCompleted, dayStats: synced.dayStats })
    }

    if (action === 'delete_all_questions') {
      await prisma.$executeRawUnsafe(`DELETE FROM user_generated_questions WHERE user_id = $1`, session.userId)
      return NextResponse.json({ ok: true })
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
      await prisma.$executeRawUnsafe(`DELETE FROM user_generated_questions WHERE user_id = $1 AND plan_id = $2`, session.userId, id).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    if (type === 'question') {
      await prisma.$executeRawUnsafe(`DELETE FROM user_generated_questions WHERE user_id = $1 AND question_id = $2`, session.userId, id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Tipo desconhecido.' }, { status: 400 })
  } catch (e) {
    console.error('[generated item]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro ao processar item.' }, { status: 500 })
  }
}
