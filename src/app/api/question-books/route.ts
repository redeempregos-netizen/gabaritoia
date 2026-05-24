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

function cleanText(s: string) {
  return String(s || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function letterToIndex(letter?: string | null) {
  const l = String(letter || '').trim().toUpperCase()
  return ['A', 'B', 'C', 'D', 'E'].indexOf(l)
}

function inferBanca(exam: string) {
  const known = ['CEBRASPE', 'FGV', 'FCC', 'CESGRANRIO', 'VUNESP', 'QUADRIX', 'IBFC', 'IDECAN', 'FUNDATEC', 'UNESC', 'OBJETIVA', 'AMEOSC', 'Avança SP', 'IDHTEC']
  const lower = exam.toLowerCase()
  return known.find(k => lower.includes(k.toLowerCase())) || ''
}

function extractNumber(q: string, externalId?: string) {
  const patterns = [
    /(?:^|\n)\s*(\d{1,4})\s*\n/,
    /Questões\s+(\d{1,4})\s+/i,
    /Quest[ãa]o\s+(\d{1,4})\b/i,
    /(?:^|\s)(\d{1,4})\s+(?:Avalie|De acordo|Considerando|Acerca|Sobre|Leia|Relacione|No que|Usando|Qualquer|O artista|A respeito|Em\s+\d{4}|“|\")/i,
  ]
  for (const p of patterns) {
    const m = q.match(p)
    if (m?.[1]) return Number(m[1])
  }
  const idNum = String(externalId || '').match(/\d+/)?.[0]
  return idNum ? Number(idNum.slice(-4)) : 0
}

function cutAfterHeader(text: string, number: number) {
  let s = text
  s = s.replace(/^[\s\S]*?Caderno de Questões Comentadas[^\n]*Questões\s*/i, '')
  s = s.replace(/^\s*Artes Visuais\s*/i, '')
  s = s.replace(/^\s*ID:\s*[^\n]+/i, '')
  if (number) {
    s = s.replace(new RegExp(`^\\s*${number}\\s+`), '')
    s = s.replace(new RegExp(`^[\\s\\S]*?Questões\\s+${number}\\s+`, 'i'), '')
  }
  return cleanText(s)
}

function parseQuestionBlock(questionText: string, answerText?: string) {
  const q = cleanText(questionText)
  const a = cleanText(answerText || '')
  const idMatch = q.match(/ID:\s*([^|\n]+)/i)
  const topicMatch = q.match(/T[ÓO]PICO:\s*([^|\n]+)/i)
  const examMatch = q.match(/PROVA:\s*([^\n]+)/i)
  const externalId = idMatch ? cleanText(idMatch[1]) : ''
  const number = extractNumber(q, externalId)

  const options: string[] = []
  const optRegex = /\(([A-E])\)\s*([\s\S]*?)(?=\s*\([A-E]\)\s|\s*Caderno de Questões|\s*Questões\s+\d{1,4}\s|$)/g
  let om: RegExpExecArray | null
  while ((om = optRegex.exec(q)) !== null) {
    options[letterToIndex(om[1])] = cleanText(om[2])
  }
  const normalizedOptions = options.filter(v => typeof v === 'string' && v.trim())

  let statement = q
  statement = statement.replace(/Alternativas[\s\S]*?(?=\s*\([A-E]\)\s)/i, '')
  statement = statement.replace(optRegex, '')
  statement = statement.replace(/Caderno de Questões Comentadas[^\n]*Questões/g, '')
  statement = statement.replace(/Artes Visuais\s*/g, '')
  statement = statement.replace(/ID:\s*[^\n]+/i, '')
  statement = cutAfterHeader(statement, number)
  statement = statement.replace(new RegExp(`^${number}\\s+`), '')
  statement = cleanText(statement)

  const answerMatch = a.match(/Resposta:\s*([A-E]|Certo|Errado|C|E)/i)
  const answer = answerMatch ? answerMatch[1].toUpperCase().replace('CERTO', 'C').replace('ERRADO', 'E') : ''
  const commentMatch = a.match(/Coment[áa]rio\s*([\s\S]*)/i)
  let comment = commentMatch ? cleanText(commentMatch[1]) : ''
  comment = comment.replace(/Caderno de Questões Comentadas[\s\S]*?Questões/g, '').trim()

  const exam = examMatch ? cleanText(examMatch[1]) : ''
  const correctIndex = normalizedOptions.length ? letterToIndex(answer) : answer === 'C' ? 0 : answer === 'E' ? 1 : -1

  return {
    number,
    externalId,
    topic: topicMatch ? cleanText(topicMatch[1]) : '',
    exam,
    banca: inferBanca(exam),
    statement,
    options: normalizedOptions.length ? normalizedOptions : ['Certo', 'Errado'],
    correctAnswer: answer,
    correctIndex,
    comment,
  }
}

function extractQuestions(fullText: string) {
  const text = cleanText(fullText)
  const pageChunks = text.split(/---\s*P[ÁA]GINA\s+\d+\s*---/i).map(cleanText).filter(Boolean)
  const questions: any[] = []

  for (let i = 0; i < pageChunks.length; i++) {
    const current = pageChunks[i]
    if (!/ID:\s*/i.test(current) || !/Alternativas/i.test(current)) continue
    const next = pageChunks[i + 1] || ''
    const parsed = parseQuestionBlock(current, /Gabarito Comentado/i.test(next) ? next : '')
    if (parsed.statement && parsed.number) questions.push(parsed)
  }

  if (!questions.length) {
    const blocks = text.split(/(?=\s*ID:\s*)/i)
    for (const block of blocks) {
      if (!/ID:\s*/i.test(block)) continue
      const parsed = parseQuestionBlock(block, '')
      if (parsed.statement && parsed.number) questions.push(parsed)
    }
  }

  const seen = new Set<string>()
  return questions.filter(q => {
    const key = q.externalId || `${q.number}-${q.statement.slice(0, 40)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTables()
  const books = await prisma.$queryRawUnsafe<any[]>(`
    SELECT b.id, b.title, b.area, b.total_questions AS "totalQuestions", b.created_at AS "createdAt",
      COALESCE(SUM(CASE WHEN a.is_correct = true THEN 1 ELSE 0 END), 0)::int AS correct,
      COUNT(a.id)::int AS answered
    FROM imported_question_books b
    LEFT JOIN imported_questions q ON q.book_id = b.id
    LEFT JOIN imported_question_answers a ON a.question_id = q.id AND a.user_id = $1
    WHERE b.user_id = $1
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `, session.userId)
  return NextResponse.json({ ok: true, books })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  await ensureTables()
  const body = await req.json()

  if (body?.action === 'import') {
    const title = String(body.title || 'Caderno de questões importado')
    const extractedText = String(body.text || '')
    if (extractedText.length < 50) return NextResponse.json({ error: 'Texto insuficiente para importar.' }, { status: 400 })
    const parsed = extractQuestions(extractedText)
    if (!parsed.length) return NextResponse.json({ error: 'Não encontrei questões neste PDF.' }, { status: 400 })

    const bookId = crypto.randomUUID()
    const area = parsed[0]?.topic?.split(' ')[0] || 'Questões'
    await prisma.$executeRawUnsafe(
      `INSERT INTO imported_question_books (id, user_id, title, area, total_questions) VALUES ($1, $2, $3, $4, $5)`,
      bookId, session.userId, title, area, parsed.length
    )

    for (const q of parsed) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO imported_questions (id, book_id, user_id, number, external_id, topic, exam, banca, statement, options_json, correct_answer, correct_index, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
        crypto.randomUUID(), bookId, session.userId, q.number, q.externalId, q.topic, q.exam, q.banca, q.statement,
        JSON.stringify(q.options), q.correctAnswer, q.correctIndex, q.comment
      )
    }

    return NextResponse.json({ ok: true, book: { id: bookId, title, totalQuestions: parsed.length } })
  }

  if (body?.action === 'delete') {
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
    await prisma.$executeRawUnsafe(`DELETE FROM imported_question_answers WHERE user_id = $1 AND question_id IN (SELECT id FROM imported_questions WHERE book_id = $2 AND user_id = $1)`, session.userId, id)
    await prisma.$executeRawUnsafe(`DELETE FROM imported_questions WHERE book_id = $1 AND user_id = $2`, id, session.userId)
    await prisma.$executeRawUnsafe(`DELETE FROM imported_question_books WHERE id = $1 AND user_id = $2`, id, session.userId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}
