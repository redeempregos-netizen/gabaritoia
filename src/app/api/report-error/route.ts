import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ERROR_EMAIL = 'redeempregos@gmail.com'

const schema = z.object({
  message: z.string().min(1).max(1000),
  page: z.string().optional(),
  action: z.string().optional(),
  details: z.any().optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
  timestamp: z.string().optional(),
})

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

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return JSON.stringify({ error: 'details_not_serializable' })
  }
}

async function sendEmailReport(input: {
  userEmail?: string | null
  message: string
  page?: string
  action?: string
  details?: unknown
  userAgent?: string
  url?: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'missing_RESEND_API_KEY' }

  const html = `
    <h2>Erro reportado no GabaritoIA</h2>
    <p><b>Usuário:</b> ${input.userEmail || 'Não informado'}</p>
    <p><b>Mensagem:</b> ${input.message}</p>
    <p><b>Página:</b> ${input.page || 'Não informada'}</p>
    <p><b>Ação:</b> ${input.action || 'Não informada'}</p>
    <p><b>URL:</b> ${input.url || 'Não informada'}</p>
    <p><b>Navegador:</b> ${input.userAgent || 'Não informado'}</p>
    <pre style="white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:8px;">${safeJson(input.details)}</pre>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ERROR_REPORT_FROM || 'GabaritoIA <onboarding@resend.dev>',
      to: ADMIN_ERROR_EMAIL,
      subject: `Erro reportado no GabaritoIA: ${input.action || input.page || 'sistema'}`,
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { sent: false, reason: text || `resend_status_${res.status}` }
  }

  return { sent: true }
}

export async function POST(req: NextRequest) {
  const session = await getSession().catch(() => null)

  try {
    await ensureTable()
    const body = schema.parse(await req.json())
    const user = session?.userId
      ? await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } }).catch(() => null)
      : null

    const id = crypto.randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO error_reports (id, user_id, user_email, message, page, action, details_json, user_agent, url, admin_email, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, CURRENT_TIMESTAMP)`,
      id,
      session?.userId || null,
      user?.email || null,
      body.message,
      body.page || null,
      body.action || null,
      safeJson(body.details),
      body.userAgent || req.headers.get('user-agent') || null,
      body.url || null,
      ADMIN_ERROR_EMAIL
    )

    const email = await sendEmailReport({
      userEmail: user?.email,
      message: body.message,
      page: body.page,
      action: body.action,
      details: body.details,
      userAgent: body.userAgent || req.headers.get('user-agent') || undefined,
      url: body.url,
    }).catch(e => ({ sent: false, reason: (e as Error).message }))

    if (!email.sent) console.warn('[error report email not sent]', email.reason)

    return NextResponse.json({ ok: true, id, emailSent: email.sent })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    console.error('[report-error]', e)
    return NextResponse.json({ error: 'Erro ao reportar problema.' }, { status: 500 })
  }
}
