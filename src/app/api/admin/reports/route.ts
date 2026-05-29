import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS error_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_email TEXT,
      message TEXT NOT NULL,
      page TEXT,
      action TEXT,
      details_json JSONB,
      user_agent TEXT,
      url TEXT,
      admin_email TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  await ensureTable()

  const reports = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, message, page, action, created_at AS "createdAt"
    FROM error_reports
    ORDER BY created_at DESC
    LIMIT 100
  `)

  return NextResponse.json({ ok: true, reports })
}
