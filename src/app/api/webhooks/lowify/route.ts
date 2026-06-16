import { NextRequest, NextResponse } from 'next/server'
import {
  activationUrl,
  cancelPurchaseAccess,
  createPurchaseAccessToken,
} from '@/lib/purchase-access'
import { normalizePlan, PLAN_CADERNOS_500, PLAN_CADERNOS_QUESTOES, PLAN_FREE, PLAN_FULL } from '@/lib/plans'

const APPROVED_EVENTS = new Set(['sale.paid'])
const PENDING_EVENTS = new Set(['sale.pending'])
const CANCELED_EVENTS = new Set(['sale.refund', 'sale.refunded', 'sale.canceled', 'sale.cancelled', 'sale.chargeback'])
const DEFAULT_LOWIFY_TEST_PRODUCT_IDS = ['Msk8PB']

function getSecret(req: NextRequest) {
  return process.env.LOWIFY_WEBHOOK_TOKEN || process.env.LOWIFY_WEBHOOK_SECRET || ''
}

function isAuthorized(req: NextRequest) {
  const secret = getSecret(req)
  if (!secret) return true

  const auth = req.headers.get('authorization') || ''
  const headerSecret =
    req.headers.get('x-lowify-token') ||
    req.headers.get('x-lowify-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-key') ||
    req.headers.get('webhook-secret') ||
    ''
  const querySecret = req.nextUrl.searchParams.get('secret') || req.nextUrl.searchParams.get('token') || ''

  return auth === `Bearer ${secret}` || headerSecret === secret || querySecret === secret
}

function normalizeEvent(payload: any) {
  return String(payload?.event || payload?.event_type || payload?.type || '').trim().toLowerCase()
}

function normalizeId(value: string) {
  return String(value || '').trim().toLowerCase()
}

function parseIds(value?: string) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean)
}

function matchesId(ids: string[], productId: string) {
  const normalizedProductId = normalizeId(productId)
  return ids.some(id => normalizeId(id) === normalizedProductId)
}

function getBuyer(payload: any) {
  return {
    email: String(payload?.customer?.email || payload?.email || payload?.customer_email || '').trim().toLowerCase(),
    name: String(payload?.customer?.name || payload?.name || payload?.customer_name || '').trim(),
    phone: String(payload?.customer?.phone || payload?.phone || '').trim(),
  }
}

function getProduct(payload: any) {
  return {
    productId: String(payload?.product?.id || payload?.product_id || '').trim(),
    productName: String(payload?.product?.name || payload?.product_name || '').trim(),
    purchaseId: String(payload?.sale_id || payload?.order_id || payload?.transaction_id || payload?.id || '').trim(),
  }
}

function inferLowifyPlan(payload: any) {
  const explicit = String(payload?.plan || payload?.metadata?.plan || payload?.custom_fields?.plan || payload?.tracking?.plan || '').trim()
  if (explicit) return normalizePlan(explicit)

  const product = getProduct(payload)
  const source = `${product.productId} ${product.productName} ${payload?.tracking?.campaign_id || ''} ${payload?.tracking?.utm_source || ''}`.toLowerCase()

  // IDs podem ser configurados por ENV, separados por vírgula.
  const testIds = [...DEFAULT_LOWIFY_TEST_PRODUCT_IDS, ...parseIds(process.env.LOWIFY_TEST_PRODUCT_IDS)]
  const mensalIds = parseIds(process.env.LOWIFY_MENSAL_PRODUCT_IDS)
  const trimestralIds = parseIds(process.env.LOWIFY_TRIMESTRAL_PRODUCT_IDS)
  const anualIds = parseIds(process.env.LOWIFY_ANUAL_PRODUCT_IDS)

  if (matchesId(testIds, product.productId)) return PLAN_FREE
  if (matchesId(mensalIds, product.productId)) return PLAN_CADERNOS_500
  if (matchesId(trimestralIds, product.productId)) return PLAN_CADERNOS_QUESTOES
  if (matchesId(anualIds, product.productId)) return PLAN_FULL

  if (/teste|trial|7\s*dias|7\s*days|free/.test(source)) return PLAN_FREE
  if (/anual|annual|yearly|ano|12\s*mes|365/.test(source)) return PLAN_FULL
  if (/trimestral|trimestre|quarter|3\s*mes|90/.test(source)) return PLAN_CADERNOS_QUESTOES
  if (/mensal|monthly|month|m[eê]s|30|basico|básico|basic/.test(source)) return PLAN_CADERNOS_500

  // Por segurança comercial, se não identificar, libera o plano mensal em vez de teste.
  return PLAN_CADERNOS_500
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
  return NextResponse.json({ ok: true, webhook: 'lowify', main: true, method: 'GET', message: 'Webhook Lowify ativo.' })
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })

    const payload = await req.json().catch(() => ({}))
    const event = normalizeEvent(payload)
    const buyer = getBuyer(payload)
    const product = getProduct(payload)

    if (PENDING_EVENTS.has(event)) {
      return NextResponse.json({ ok: true, received: true, checkout: 'lowify', ignored: true, event, reason: 'sale_pending_no_access' })
    }

    if (CANCELED_EVENTS.has(event)) {
      if (!buyer.email) return NextResponse.json({ error: 'E-mail do comprador não encontrado no reembolso/cancelamento.' }, { status: 400 })
      const result = await cancelPurchaseAccess({ email: buyer.email, checkout: 'lowify', purchaseId: product.purchaseId })
      return NextResponse.json({ ok: true, received: true, checkout: 'lowify', event, email: buyer.email, action: 'canceled', ...result })
    }

    if (!APPROVED_EVENTS.has(event)) {
      return NextResponse.json({ ok: true, received: true, checkout: 'lowify', ignored: true, event, reason: 'event_not_releasing_access' })
    }

    if (!buyer.email) {
      return NextResponse.json({ error: 'E-mail do comprador não encontrado no webhook.' }, { status: 400 })
    }

    const plan = inferLowifyPlan(payload)
    const access = await createPurchaseAccessToken({
      email: buyer.email,
      name: buyer.name,
      plan,
      checkout: 'lowify',
      productId: product.productId,
      productName: product.productName,
      purchaseId: product.purchaseId,
    })

    const url = activationUrl(access.token)

    return NextResponse.json({
      ok: true,
      received: true,
      checkout: 'lowify',
      main: true,
      email: buyer.email,
      event,
      plan: access.plan,
      productId: product.productId,
      productName: product.productName,
      purchaseId: product.purchaseId,
      expiresInHours: access.expiresInHours,
      activationUrl: url,
      message: 'Acesso Lowify liberado. O cliente deve ativar/criar senha usando o link de ativação.',
    })
  } catch (e) {
    console.error('[lowify webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook da Lowify.' }, { status: 500 })
  }
}
