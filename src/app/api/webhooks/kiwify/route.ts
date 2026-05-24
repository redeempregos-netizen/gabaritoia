import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { PLAN_CADERNOS_500, PLAN_CREDIT_AMOUNT } from '@/lib/plans'

const CADERNOS_PRODUCT_IDS = ['cb46e2b0-57ba-11f1-96d3-a30f1df2bc59']
const CADERNOS_PRODUCT_NAMES = ['caderno questoes', 'caderno questões', 'cadernos pdf 500', 'cadernos 500']

async function ensureTablesAndEnum() {
  await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'CADERNOS_500'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS kiwify_orders (
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
  `)
  await prisma.$executeRawUnsafe(`ALTER TABLE kiwify_orders ALTER COLUMN buyer_email DROP NOT NULL;`).catch(() => null)
  await prisma.$executeRawUnsafe(`ALTER TABLE kiwify_orders ADD COLUMN IF NOT EXISTS action TEXT;`).catch(() => null)
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

function isApproved(status: string, eventName: string) {
  const s = status.toLowerCase()
  const e = eventName.toLowerCase()
  return ['paid', 'approved', 'complete', 'completed', 'order_approved'].some(x => s.includes(x) || e.includes(x))
}

function isCadernosProduct(productId: string, productName: string) {
  const id = productId.trim()
  const name = productName.trim().toLowerCase()
  return CADERNOS_PRODUCT_IDS.includes(id) || CADERNOS_PRODUCT_NAMES.some(product => name.includes(product))
}

function shouldGrantAccess(status: string, eventName: string, productId: string, productName: string) {
  if (isApproved(status, eventName)) return true
  return isCadernosProduct(productId, productName) && !status && !eventName
}

function isRefundOrCancel(status: string, eventName: string) {
  const s = status.toLowerCase()
  const e = eventName.toLowerCase()
  return ['refunded', 'refund', 'chargeback', 'cancelled', 'canceled'].some(x => s.includes(x) || e.includes(x))
}

async function saveKiwifyOrder(params: {
  transactionId: string
  eventName: string
  productId: string
  productName: string
  buyerEmail: string
  buyerName: string
  status: string
  amount: number | null
  action: string
  payload: any
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO kiwify_orders (id, transaction_id, event_name, product_id, product_name, buyer_email, buyer_name, status, amount, plan, action, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (transaction_id) DO UPDATE SET
       event_name = EXCLUDED.event_name,
       product_id = EXCLUDED.product_id,
       product_name = EXCLUDED.product_name,
       buyer_email = EXCLUDED.buyer_email,
       buyer_name = EXCLUDED.buyer_name,
       status = EXCLUDED.status,
       amount = EXCLUDED.amount,
       action = EXCLUDED.action,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = CURRENT_TIMESTAMP`,
    crypto.randomUUID(), params.transactionId, params.eventName, params.productId, params.productName, params.buyerEmail || null, params.buyerName, params.status, params.amount, PLAN_CADERNOS_500, params.action, JSON.stringify(params.payload)
  )
}

function authorize(req: NextRequest) {
  const secret = process.env.KIWIFY_WEBHOOK_SECRET
  if (!secret) return true
  const token = req.headers.get('x-kiwify-secret') || req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('token')
  return token === secret
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesAndEnum()

    if (!authorize(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })

    const payload = await req.json()
    const eventName = String(getNested(payload, ['event_name', 'event', 'type']) || '')

    const transactionId = String(getNested(payload, [
      'order.order_id', 'order.id', 'order.checkout_id', 'order.transaction_id',
      'data.id', 'id', 'transaction_id'
    ]) || `kiwify-${Date.now()}-${crypto.randomUUID()}`)

    const status = String(getNested(payload, [
      'order.order_status', 'order.status', 'data.status', 'status', 'payment_status'
    ]) || '')

    const buyerEmail = normalizeEmail(getNested(payload, [
      'order.Customer.email', 'order.customer.email', 'Customer.email', 'customer.email',
      'data.customer.email', 'buyer_email', 'email'
    ]))

    const buyerName = String(getNested(payload, [
      'order.Customer.full_name', 'order.Customer.name', 'order.customer.name', 'Customer.full_name', 'Customer.name',
      'customer.name', 'data.customer.name', 'buyer_name', 'name'
    ]) || 'Aluno')

    const productId = String(getNested(payload, [
      'order.Product.product_id', 'order.Product.id', 'order.product.id', 'Product.product_id', 'Product.id',
      'product.id', 'data.product.id', 'product_id'
    ]) || '')

    const productName = String(getNested(payload, [
      'order.Product.product_name', 'order.Product.name', 'order.product.name', 'Product.product_name', 'Product.name',
      'product.name', 'data.product.name', 'product_name'
    ]) || '')

    const amountRaw = getNested(payload, ['order.price', 'order.total', 'order.total_price', 'amount', 'data.amount'])
    const amount = Number(String(amountRaw || '0').replace(',', '.')) || null

    if (!buyerEmail) {
      await saveKiwifyOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, action: 'missing_buyer_email', payload })
      return NextResponse.json({ ok: false, action: 'missing_buyer_email', message: 'Recebido, mas sem e-mail do comprador.', status, eventName }, { status: 200 })
    }

    if (isRefundOrCancel(status, eventName)) {
      await saveKiwifyOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, action: 'access_removed', payload })
      await prisma.user.updateMany({
        where: { email: buyerEmail, plan: PLAN_CADERNOS_500 as any },
        data: { plan: 'FREE', credits: 0 },
      })
      return NextResponse.json({ ok: true, action: 'access_removed', email: buyerEmail })
    }

    if (!shouldGrantAccess(status, eventName, productId, productName)) {
      await saveKiwifyOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, action: 'ignored_status', payload })
      return NextResponse.json({ ok: true, action: 'ignored_status', status, eventName, email: buyerEmail, productId, productName })
    }

    await saveKiwifyOrder({ transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, action: 'access_granted', payload })

    const credits = PLAN_CREDIT_AMOUNT[PLAN_CADERNOS_500]
    const existing = await prisma.user.findUnique({ where: { email: buyerEmail } })

    let userId = existing?.id
    if (!existing) {
      const tempPassword = crypto.randomUUID().slice(0, 12)
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      const user = await prisma.user.create({
        data: {
          name: buyerName || buyerEmail.split('@')[0],
          email: buyerEmail,
          passwordHash,
          role: 'USER',
          plan: PLAN_CADERNOS_500 as any,
          credits,
        },
      })
      userId = user.id
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          plan: PLAN_CADERNOS_500 as any,
          credits,
        },
      })
    }

    if (userId) {
      await prisma.creditLog.create({
        data: {
          userId,
          amount: credits,
          action: 'kiwify_purchase_cadernos_500',
          details: `Kiwify ${transactionId} - ${productName || productId || 'produto'}`,
        },
      }).catch(() => null)
    }

    return NextResponse.json({ ok: true, action: 'access_granted', email: buyerEmail, plan: PLAN_CADERNOS_500, credits })
  } catch (e) {
    console.error('[kiwify webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook Kiwify.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!authorize(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
    await ensureTablesAndEnum()
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT transaction_id, event_name, product_id, product_name, buyer_email, buyer_name, status, amount, plan, action, created_at, updated_at
      FROM kiwify_orders
      ORDER BY updated_at DESC
      LIMIT 10
    `)
    return NextResponse.json({ ok: true, webhook: 'kiwify', plan: PLAN_CADERNOS_500, received: rows.length, latest: rows })
  } catch (e) {
    return NextResponse.json({ ok: true, webhook: 'kiwify', plan: PLAN_CADERNOS_500, diagnostics_error: (e as Error).message })
  }
}
