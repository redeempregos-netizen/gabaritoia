import { NextRequest, NextResponse } from 'next/server'
import {
  activationUrl,
  cancelPurchaseAccess,
  createPurchaseAccessToken,
  extractBuyerFromPayload,
  extractProductInfo,
} from '@/lib/purchase-access'
import { normalizePlan, PLAN_FREE, PLAN_CADERNOS_500, PLAN_CADERNOS_QUESTOES, PLAN_FULL } from '@/lib/plans'

const APPROVED_EVENTS = new Set([
  'sale.paid',
  'subscription.created',
  'subscription.invoice_paid',
  'trial.started',
])

const CANCELED_EVENTS = new Set([
  'sale.canceled',
  'sale.refunded',
  'sale.chargedback',
  'sale.failed',
  'subscription.canceled',
  'subscription.inactive',
  'subscription.auto_canceled',
  'trial.expired_unpaid',
])

const IGNORED_EVENTS = new Set([
  'sale.pending',
  'sale.abandoned',
  'subscription.reminder',
  'subscription.due',
  'subscription.overdue_5',
  'subscription.overdue_10',
  'subscription.overdue_30',
  'trial.expiring_soon',
  'trial.expired',
])

const MIVVO_CHECKOUT_PLAN_MAP: Record<string, string> = {
  monmubbmq4duiyo: PLAN_FREE,
}

function getToken(req: NextRequest) {
  return process.env.MIVVO_WEBHOOK_TOKEN || process.env.MIVVO_WEBHOOK_SECRET || process.env.CAKTO_WEBHOOK_SECRET || ''
}

function isAuthorized(req: NextRequest) {
  const token = getToken(req)
  if (!token) return true

  const auth = req.headers.get('authorization') || ''
  const headerToken =
    req.headers.get('x-mivvo-token') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-mivvo-secret') ||
    req.headers.get('x-api-key') ||
    req.headers.get('webhook-secret') ||
    ''
  const queryToken = req.nextUrl.searchParams.get('secret') || req.nextUrl.searchParams.get('token') || ''

  return auth === `Bearer ${token}` || headerToken === token || queryToken === token
}

function getEvent(payload: any) {
  return String(payload?.event || payload?.event_type || payload?.type || '').trim().toLowerCase()
}

function isTestPayload(payload: any, event: string) {
  return !event || event.includes('test') || event.includes('ping') || payload?.test === true
}

function collectPlanSource(payload: any) {
  const data = payload?.data || {}
  return String([
    data?.interval,
    data?.product?.id,
    data?.product?.name,
    data?.offer?.id,
    data?.offer?.name,
    data?.offer?.checkout_link_id,
    data?.checkout_link_id,
    data?.checkout_url,
    payload?.product_id,
    payload?.product_name,
    payload?.offer_id,
    payload?.offer_name,
    payload?.checkout_id,
    payload?.checkout_link_id,
    payload?.checkout_url,
  ].filter(Boolean).join(' ')).toLowerCase()
}

function inferMivvoPlan(payload: any) {
  const data = payload?.data || {}
  const explicit = String(
    payload?.plan ||
    payload?.metadata?.plan ||
    payload?.custom_fields?.plan ||
    data?.plan ||
    data?.metadata?.plan ||
    ''
  ).trim()
  if (explicit) return normalizePlan(explicit)

  const source = collectPlanSource(payload)

  for (const [checkoutId, plan] of Object.entries(MIVVO_CHECKOUT_PLAN_MAP)) {
    if (source.includes(checkoutId.toLowerCase())) return plan
  }

  if (/teste|trial|free|7\s*dias|7\s*days/.test(source)) return PLAN_FREE
  if (/anual|annual|yearly|ano|12\s*mes|365/.test(source)) return PLAN_FULL
  if (/trimestral|trimestre|quarter|3\s*mes|90/.test(source)) return PLAN_CADERNOS_QUESTOES
  if (/mensal|monthly|month|mes|mês|30|basico|básico|basic/.test(source)) return PLAN_CADERNOS_500

  return PLAN_FREE
}

function getMivvoBuyer(payload: any) {
  const generic = extractBuyerFromPayload(payload)
  const data = payload?.data || {}
  return {
    email: String(generic.email || data?.customer?.email || data?.credentials?.email || '').trim().toLowerCase(),
    name: String(generic.name || data?.customer?.name || '').trim(),
  }
}

function getMivvoProductInfo(payload: any) {
  const generic = extractProductInfo(payload)
  const data = payload?.data || {}
  return {
    productId: String(generic.productId || data?.product?.id || data?.offer?.id || data?.offer?.checkout_link_id || data?.checkout_link_id || '').trim(),
    productName: String(generic.productName || data?.product?.name || data?.offer?.name || '').trim(),
    purchaseId: String(
      data?.sale_id ||
      data?.subscription_id ||
      data?.trial_id ||
      generic.purchaseId ||
      ''
    ).trim(),
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
  return NextResponse.json({ ok: true, webhook: 'mivvo', method: 'GET', message: 'Webhook ativo.' })
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })

    const payload = await req.json().catch(() => ({}))
    const event = getEvent(payload)

    if (isTestPayload(payload, event)) {
      return NextResponse.json({ ok: true, webhook: 'mivvo', test: true, message: 'Evento de teste recebido com sucesso.' })
    }

    const { email, name } = getMivvoBuyer(payload)
    const product = getMivvoProductInfo(payload)

    if (CANCELED_EVENTS.has(event)) {
      if (!email) return NextResponse.json({ error: 'E-mail do comprador não encontrado no cancelamento.' }, { status: 400 })
      const result = await cancelPurchaseAccess({ email, checkout: 'mivvo', purchaseId: product.purchaseId })
      return NextResponse.json({ ok: true, received: true, checkout: 'mivvo', email, event, action: 'canceled', ...result })
    }

    if (IGNORED_EVENTS.has(event) || !APPROVED_EVENTS.has(event)) {
      return NextResponse.json({ ok: true, received: true, ignored: true, reason: 'event_not_releasing_access', event })
    }

    if (!email) {
      return NextResponse.json({ error: 'E-mail do comprador não encontrado no webhook.' }, { status: 400 })
    }

    const plan = inferMivvoPlan(payload)
    const access = await createPurchaseAccessToken({
      email,
      name,
      plan,
      checkout: 'mivvo',
      productId: product.productId,
      productName: product.productName,
      purchaseId: product.purchaseId,
    })

    const url = activationUrl(access.token)

    return NextResponse.json({
      ok: true,
      received: true,
      checkout: 'mivvo',
      email,
      event,
      plan: access.plan,
      expiresInHours: access.expiresInHours,
      activationUrl: url,
      emailSent: false,
      emailSkipped: true,
      message: 'Acesso liberado. O cliente deve criar a senha pela página de compra aprovada informando o e-mail usado na compra.',
    })
  } catch (e) {
    console.error('[mivvo webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook da Mivvo.' }, { status: 500 })
  }
}
