import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { PLAN_CADERNOS_500, PLAN_CREDIT_AMOUNT } from '@/lib/plans'

async function ensureTablesAndEnum() {
  await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'CADERNOS_500'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS kiwify_orders (
      id TEXT PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      event_name TEXT,
      product_id TEXT,
      product_name TEXT,
      buyer_email TEXT NOT NULL,
      buyer_name TEXT,
      status TEXT,
      amount NUMERIC,
      plan TEXT,
      raw_payload JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
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

function isRefundOrCancel(status: string, eventName: string) {
  const s = status.toLowerCase()
  const e = eventName.toLowerCase()
  return ['refunded', 'refund', 'chargeback', 'cancelled', 'canceled'].some(x => s.includes(x) || e.includes(x))
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesAndEnum()

    const secret = process.env.KIWIFY_WEBHOOK_SECRET
    if (secret) {
      const token = req.headers.get('x-kiwify-secret') || req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('token')
      if (token !== secret) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
    }

    const payload = await req.json()
    const eventName = String(getNested(payload, ['event_name', 'event', 'type']) || '')
    const order = payload.order || payload.Order || payload.data || payload
    const customer = order.Customer || order.customer || payload.Customer || payload.customer || {}
    const product = order.Product || order.product || payload.Product || payload.product || {}

    const transactionId = String(getNested(payload, [
      'order.order_id', 'order.id', 'order.checkout_id', 'order.transaction_id',
      'data.id', 'id', 'transaction_id'
    ]) || crypto.randomUUID())

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
      return NextResponse.json({ error: 'E-mail do comprador não encontrado.' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO kiwify_orders (id, transaction_id, event_name, product_id, product_name, buyer_email, buyer_name, status, amount, plan, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT (transaction_id) DO UPDATE SET
         event_name = EXCLUDED.event_name,
         product_id = EXCLUDED.product_id,
         product_name = EXCLUDED.product_name,
         buyer_email = EXCLUDED.buyer_email,
         buyer_name = EXCLUDED.buyer_name,
         status = EXCLUDED.status,
         amount = EXCLUDED.amount,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = CURRENT_TIMESTAMP`,
      crypto.randomUUID(), transactionId, eventName, productId, productName, buyerEmail, buyerName, status, amount, PLAN_CADERNOS_500, JSON.stringify(payload)
    )

    if (isRefundOrCancel(status, eventName)) {
      await prisma.user.updateMany({
        where: { email: buyerEmail, plan: PLAN_CADERNOS_500 as any },
        data: { plan: 'FREE', credits: 0 },
      })
      return NextResponse.json({ ok: true, action: 'access_removed', email: buyerEmail })
    }

    if (!isApproved(status, eventName)) {
      return NextResponse.json({ ok: true, action: 'ignored_status', status, eventName })
    }

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

export async function GET() {
  return NextResponse.json({ ok: true, webhook: 'kiwify', plan: PLAN_CADERNOS_500 })
}
