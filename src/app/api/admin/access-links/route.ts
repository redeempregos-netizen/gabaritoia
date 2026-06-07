import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { activationUrl, createPurchaseAccessToken, ensurePurchaseAccessTables } from '@/lib/purchase-access'
import { normalizePlan } from '@/lib/plans'

async function requireAdmin() {
  const session = await getSession()
  if (!session?.userId) return null
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || user.role !== 'ADMIN') return null
  return session
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendAccessEmail(input: { email: string; name?: string | null; plan: string; url: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'missing_RESEND_API_KEY' }

  const from = process.env.ACCESS_EMAIL_FROM || process.env.ERROR_REPORT_FROM || 'GabaritoIA <onboarding@resend.dev>'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:auto;padding:24px;">
      <h2>Seu acesso ao GabaritoIA</h2>
      <p>Olá, <b>${escapeHtml(input.name || 'Aluno')}</b>.</p>
      <p>Seu link de ativação do plano <b>${escapeHtml(input.plan)}</b> está pronto.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(input.url)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;display:inline-block;">Criar minha senha</a>
      </p>
      <p>Se o botão não abrir, copie e cole este link no navegador:</p>
      <p style="word-break:break-all;background:#f4f4f5;padding:12px;border-radius:8px;font-size:13px;">${escapeHtml(input.url)}</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: input.email, subject: 'Seu link de acesso ao GabaritoIA', html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { sent: false, reason: text || `resend_status_${res.status}` }
  }
  return { sent: true }
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  await ensurePurchaseAccessTables()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, email, name, plan, checkout, product_name AS "productName", purchase_id AS "purchaseId", status, expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM purchase_access_tokens
    ORDER BY created_at DESC
    LIMIT 100;
  `)

  return NextResponse.json({ ok: true, accesses: rows })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  try {
    await ensurePurchaseAccessTables()
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const id = String(body.id || '').trim()

    if (!email && !id) return NextResponse.json({ error: 'Informe o e-mail ou ID do acesso.' }, { status: 400 })

    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, email, name, plan, checkout, product_id AS "productId", product_name AS "productName", purchase_id AS "purchaseId", status
      FROM purchase_access_tokens
      WHERE ($1::text = '' OR id = $1)
        AND ($2::text = '' OR email = $2)
      ORDER BY created_at DESC
      LIMIT 1;
    `, id, email)

    const access = rows[0]
    if (!access) return NextResponse.json({ error: 'Acesso não encontrado.' }, { status: 404 })

    const recreated = await createPurchaseAccessToken({
      email: access.email,
      name: access.name || undefined,
      plan: normalizePlan(access.plan),
      checkout: access.checkout || 'cakto',
      productId: access.productId || undefined,
      productName: access.productName || undefined,
      purchaseId: access.purchaseId || undefined,
    })

    const url = activationUrl(recreated.token)
    const emailResult = await sendAccessEmail({ email: access.email, name: access.name, plan: recreated.plan, url }).catch(e => ({ sent: false, reason: (e as Error).message }))

    return NextResponse.json({
      ok: true,
      email: access.email,
      plan: recreated.plan,
      activationUrl: url,
      emailSent: emailResult.sent,
      emailReason: emailResult.sent ? null : emailResult.reason,
    })
  } catch (e) {
    console.error('[admin access-links]', e)
    return NextResponse.json({ error: 'Erro ao reenviar link de acesso.' }, { status: 500 })
  }
}
