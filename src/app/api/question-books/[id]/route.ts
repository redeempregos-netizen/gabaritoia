import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS imported_question_books (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      area TEXT,
      total_questions INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS imported_questions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      external_id TEXT,
      topic TEXT,
      exam TEXT,
      banca TEXT,
      statement TEXT NOT NULL,
      options_json JSONB NOT NULL DEFAULT '[]',
      correct_answer TEXT,
      correct_index INTEGER,
      comment TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS imported_question_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_index INTEGER NOT NULL,
      is_correct BOOLEAN NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTables()

  const books = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, title, area, total_questions AS "totalQuestions", created_at AS "createdAt"
    FROM imported_question_books
    WHERE id = $1 AND user_id = $2
    LIMIT 1
  `, params.id, session.userId)
  const book = books[0]
  if (!book) return NextResponse.json({ error: 'Caderno não encontrado.' }, { status: 404 })

  const questions = await prisma.$queryRawUnsafe<any[]>(`
    SELECT q.id, q.number, q.external_id AS "externalId", q.topic, q.exam, q.banca, q.statement,
      q.options_json AS options, q.correct_answer AS "correctAnswer", q.correct_index AS "correctIndex", q.comment,
      a.selected_index AS "selectedIndex", a.is_correct AS "isCorrect", a.created_at AS "answeredAt"
    FROM imported_questions q
    LEFT JOIN LATERAL (
      SELECT selected_index, is_correct, created_at
      FROM imported_question_answers
      WHERE user_id = $2 AND question_id = q.id
      ORDER BY created_at DESC
      LIMIT 1
    ) a ON true
    WHERE q.book_id = $1 AND q.user_id = $2
    ORDER BY q.number ASC
  `, params.id, session.userId)

  const answered = questions.filter(q => q.selectedIndex !== null && q.selectedIndex !== undefined).length
  const correct = questions.filter(q => q.isCorrect === true).length

  return NextResponse.json({ ok: true, book, questions, stats: { answered, correct, total: questions.length } })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTables()

  const body = await req.json()
  if (body?.action !== 'answer') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })

  const questionId = String(body.questionId || '')
  const selectedIndex = Number(body.selectedIndex)
  if (!questionId || Number.isNaN(selectedIndex)) return NextResponse.json({ error: 'Resposta inválida.' }, { status: 400 })

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, correct_index AS "correctIndex"
    FROM imported_questions
    WHERE id = $1 AND book_id = $2 AND user_id = $3
    LIMIT 1
  `, questionId, params.id, session.userId)
  const question = rows[0]
  if (!question) return NextResponse.json({ error: 'Questão não encontrada.' }, { status: 404 })

  const isCorrect = Number(question.correctIndex) === selectedIndex
  await prisma.$executeRawUnsafe(
    `INSERT INTO imported_question_answers (id, user_id, question_id, selected_index, is_correct) VALUES ($1,$2,$3,$4,$5)`,
    crypto.randomUUID(), session.userId, questionId, selectedIndex, isCorrect
  )

  return NextResponse.json({ ok: true, isCorrect, correctIndex: question.correctIndex })
}
