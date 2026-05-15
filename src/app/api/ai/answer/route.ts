import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  questionId: z.string(),
  selectedIdx: z.number(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json()
    const { questionId, selectedIdx } = schema.parse(body)

    const question = await prisma.question.findUnique({ where: { id: questionId } })
    if (!question) return NextResponse.json({ error: 'Questão não encontrada.' }, { status: 404 })

    const isCorrect = selectedIdx === question.correctIndex

    const answer = await prisma.answer.create({
      data: { userId: session.userId, questionId, selectedIdx, isCorrect },
    })

    // Atualizar streak
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const user = await prisma.user.findUnique({ where: { id: session.userId } })
    if (user) {
      const lastStudy = user.lastStudyAt
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const newStreak = lastStudy && lastStudy >= yesterday && lastStudy < today
        ? user.streak + 1
        : lastStudy && lastStudy >= today
        ? user.streak
        : 1
      await prisma.user.update({
        where: { id: session.userId },
        data: { lastStudyAt: new Date(), streak: newStreak },
      })
    }

    return NextResponse.json({ ok: true, isCorrect, answer })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
