import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizePlan, PLAN_CREDIT_AMOUNT, PLAN_FREE } from '@/lib/plans'

const DEFAULT_PLAN_DAYS: Record<string, number> = {
  FREE: 7,
  CADERNOS_500: 30,
  PRO: 30,
  ENTERPRISE: 30,
}

const AMOUNT_PLAN_MAP = [
  { amount: 19.9, plan: 'FREE' },
  { amount: 29.9, plan: 'CADERNOS_500' },
  { amount: 47, plan: 'PRO' },
  { amount: 97, plan: 'ENTERPRISE' },
]

async function ensureWebhookTables() {
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`).catch(() => null)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS kirvano_orders (
      id TEXT PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      event_name TEXT,
      product_id TEXT,
      product_name TEXT,
      buyer_email TEXT,
      buyer_name TEXT,
      status TEXT,
      amount NUMERIC,
      plan TEXT,
      action TEXT,
      raw_payload JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => null)
}

function normalizeEmail(email: unknown) {
  return String(email || '').trim().toLowerCase()
}

function getNested(payload: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], payload)
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

function parseAmount(value: unknown) {
  const raw = String(value || '0').replace(/[^0-9,.-]/g, '').replace(',', '.')
  return Number(raw) || null
}

function centsToAmount(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 999 ? n / 100 : n
}

function isApproved(status: string, eventName: string) {
  const s = status.toLowerCase()
  const e = eventName.toLowerCase()
  return ['paid', 'approved', 'complete', 'completed', 'confirmed', 'payment_approved', 'sale_approved', 'order_approved', 'purchase_approved'].some(x => s.includes(x) || e.includes(x))
}

function isRefundOrCancel(status: string, eventName: string) {
  const s = status.toLowerCase()
  const e = eventName.toLowerCase()
  return ['refunded', 'refund', 'chargeback', 'cancelled', 'canceled', 'cancelado', 'reembolso', 'estornado'].some(x => s.includes(x) || e.includes(x))
}

function planFromProduct(productId: string, productName: string, amount: number | null) {
  const id = productId.trim()
  const name = productName.trim().toLowerCase()

  const envMap: Array<{ ids: string[]; plan: string }> = [
    { ids: String(process.env.KIRVANO_PRODUCT_TESTE || '').split(',').map(x => x.trim()).filter(Boolean), plan: 'FREE' },
    { ids: String(process.env.KIRVANO_PRODUCT_BASICO || '').split(',').map(x => x.trim()).filter(Boolean), plan: 'CADERNOS_500' },
    { ids: String(process.env.KIRVANO_PRODUCT_PRO || '').split(',').map(x => x.trim()).filter(Boolean), plan: 'PRO' },
    { ids: String(process.env.KIRVANO_PRODUCT_PREMIUM || '').split(',').map(x => x.trim()).filter(Boolean), plan: 'ENTERPRISE' },
  ]

  const byId = envMap.find(item => id && item.ids.includes(id))
  if (byId) return byId.plan

  if (name.includes('premium') || name.includes('enterprise') || name.includes('full')) return 'ENTERPRISE'
  if (name.includes('pro')) return 'PRO'
  if (name.includes('básico') || name.includes('basico') || name.includes('basic')) return 'CADERNOS_500'
  if (name.includes('teste') || name.includes('trial') || name.includes('7 dias')) return 'FREE'

  if (amount !== null) {
    const byAmount = AMOUNT_PLAN_MAP.find(item => Math.abs(item.amount - amount) < 0.05)
    if (byAmount) return byAmount.plan
  }

  return ''
}

async function getPlanDays(plan: string) {
  const saved = await prisma.adminConfig.findUnique({ where: { key: 'planSettings' } }).catch(() => null)
  if (saved?.value) {
    try {
      const plans = JSON.parse(saved.value)
      if (Array.isArray(plans)) {
        const found = plans.find((p: any) => normalizePlan(p?.id) === plan)
        if (found?.validityDays) return Math.max(1, Number(found.validityDays) || DEFAULT_PLAN_DAYS[plan] || 30)
      }
    } catch {}
  }
  return DEFAULT_PLAN_DAYS[plan] || 30
}

function authorize(req: NextRequest) {
  const secret = process.env.KIRVANO_WEBHOOK_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const token = req.headers.get('x-kirvano-secret') || req.headers.get('x-kirvano-token') || req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('token') || bearer
  return token === secret
}

async function saveKirvanoOrder(params: {
  transactionId: string
  eventName: string
  productId: string
  productName: string
  buyerEmail: string
  buyerName: string
  status: string
  amount: number | null
  plan: string
  action: string
  payload: any
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO kirvano_orders (id, transaction_id, event_name, product_id, product_name, buyer_email, buyer_name, status, amount, plan, action, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (transaction_id) DO UPDATE SET
       event_name = EXCLUDED.event_name,
       product_id = EXCLUDED.product_id,
       product_name = EXCLUDED.product_name,
       buyer_email = EXCLUDED.buyer_email,
       buyer_name = EXCLUDED.buyer_name,
       status = EXCLUDED.status,
       amount = EXCLUDED.amount,
       plan = EXCLUDED.plan,
       action = EXCLUDED.action,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = CURRENT_TIMESTAMP`,
    crypto.randomUUID(), params.transactionId, params.eventName, params.productId, params.productName, params.buyerEmail || null, params.buyerName, params.status, params.amount, params.plan, params.action, JSON.stringify(params.payload)
  )
}

export async function POST(req: NextRequest) {
  try {
    await ensureWebhookTables()
    if (!authorize(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })

    const payload = await req.json()
    const eventName = String(getNested(payload, ['event_name', 'event', 'type', 'webhook_event', 'data.event']) || '')
    const transactionId = String(getNested(payload, [
      'sale.id', 'sale.transaction_id', 'sale.code', 'transaction.id', 'transaction.code',
      'order.id', 'order.transaction_id', 'order.code', 'data.id', 'data.transaction_id', 'id', 'transaction_id'
    ]) || `kirvano-${Date.now()}-${crypto.randomUUID()}`)

    const status = String(getNested(payload, [
      'sale.status', 'transaction.status', 'order.status', 'payment.status', 'data.status', 'status', 'payment_status'
    ]) || '')

    const buyerEmail = normalizeEmail(getNested(payload, [
      'customer.email', 'client.email', 'buyer.email', 'sale.customer.email', 'order.customer.email', 'data.customer.email', 'data.buyer.email', 'email'
    ]))

    const buyerName = String(getNested(payload, [
      'customer.name', 'customer.full_name', 'client.name', 'buyer.name', 'sale.customer.name', 'order.customer.name', 'data.customer.name', 'name'
    ]) || 'Aluno')

    const productId = String(getNested(payload, [
      'product.id', 'product.code', 'offer.id', 'offer.code', 'sale.product.id', 'order.product.id', 'data.product.id', 'product_id'
    ]) || '')

    const productName = String(getNested(payload, [
      'product.name', 'offer.name', 'sale.product.name', 'order.product.name', 'data.product.name', 'product_name'
    ]) || '')

    const amountRaw = getNested(payload, [
      'sale.amount', 'sale.total', 'sale.price', 'transaction.amount', 'order.amount', 'order.total', 'payment.amount', 'data.amount', 'amount'
    ])
    const amountCentsRaw = getNested(payload, ['sale.amount_cents', 'transaction.amount_cents', 'order.amount_cents', 'data.amount_cents'])
    const amount = parseAmount(amountRaw) || centsToAmount(amountCentsRaw)
    const plan = normalizePlan(planFromProduct(productId, productName, amount))

    if (!buyerEmail) {
      await saveKirvanoOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, plan, action: 'missing_buyer_email', payload })
      return NextResponse.json({ ok: false, action: 'missing_buyer_email', message: 'Recebido, mas sem e-mail do comprador.', status, eventName }, { status: 200 })
    }

    if (!plan || !['FREE', 'CADERNOS_500', 'PRO', 'ENTERPRISE'].includes(plan)) {
      await saveKirvanoOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, plan, action: 'unknown_product', payload })
      return NextResponse.json({ ok: true, action: 'unknown_product', email: buyerEmail, productId, productName, amount })
    }

    if (isRefundOrCancel(status, eventName)) {
      await saveKirvanoOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, plan, action: 'access_removed', payload })
      await prisma.user.updateMany({ where: { email: buyerEmail }, data: { plan: PLAN_FREE as any, credits: PLAN_CREDIT_AMOUNT[PLAN_FREE], creditsUsed: 0 } })
      await prisma.$executeRawUnsafe(`UPDATE users SET plan_started_at = NOW(), plan_expires_at = NOW() + INTERVAL '7 days' WHERE email = $1`, buyerEmail).catch(() => null)
      return NextResponse.json({ ok: true, action: 'access_removed', email: buyerEmail, plan: PLAN_FREE })
    }

    if (!isApproved(status, eventName)) {
      await saveKirvanoOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, plan, action: 'ignored_status', payload })
      return NextResponse.json({ ok: true, action: 'ignored_status', status, eventName, email: buyerEmail, productId, productName, amount, plan })
    }

    const credits = PLAN_CREDIT_AMOUNT[plan] ?? PLAN_CREDIT_AMOUNT[PLAN_FREE]
    const validityDays = await getPlanDays(plan)
    const existing = await prisma.user.findUnique({ where: { email: buyerEmail } })

    let userId = existing?.id
    let created = false
    if (!existing) {
      const tempPassword = crypto.randomUUID().slice(0, 12)
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      const user = await prisma.user.create({
        data: {
          name: buyerName || buyerEmail.split('@')[0],
          email: buyerEmail,
          passwordHash,
          role: 'USER',
          plan: plan as any,
          credits,
          creditsUsed: 0,
        },
      })
      userId = user.id
      created = true
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          plan: plan as any,
          credits,
          creditsUsed: 0,
        },
      })
    }

    await prisma.$executeRawUnsafe(`
      UPDATE users
      SET plan_started_at = NOW(), plan_expires_at = NOW() + ($1 || ' days')::INTERVAL
      WHERE email = $2;
    `, String(validityDays), buyerEmail).catch(() => null)

    await saveKirvanoOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, plan, action: 'access_granted', payload })

    if (userId) {
      await prisma.creditLog.create({
        data: {
          userId,
          amount: credits,
          action: 'kirvano_purchase_plan',
          details: `Kirvano ${transactionId} - ${productName || productId || plan}`,
        },
      }).catch(() => null)
    }

    return NextResponse.json({ ok: true, action: 'access_granted', email: buyerEmail, plan, credits, validityDays, created })
  } catch (e) {
    console.error('[kirvano webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook Kirvano.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!authorize(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
    await ensureWebhookTables()
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT transaction_id, event_name, product_id, product_name, buyer_email, buyer_name, status, amount, plan, action, created_at, updated_at
      FROM kirvano_orders
      ORDER BY updated_at DESC
      LIMIT 10
    `)
    return NextResponse.json({ ok: true, webhook: 'kirvano', received: rows.length, latest: rows })
  } catch (e) {
    return NextResponse.json({ ok: true, webhook: 'kirvano', diagnostics_error: (e as Error).message })
  }
}
