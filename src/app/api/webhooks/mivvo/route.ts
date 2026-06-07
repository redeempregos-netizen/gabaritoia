import { NextRequest, NextResponse } from 'next/server'
import {
  activationUrl,
  cancelPurchaseAccess,
  createPurchaseAccessToken,
  extractBuyerFromPayload,
  extractProductInfo,
} from '@/lib/purchase-access'
import { normalizePlan, PLAN_CADERNOS_500, PLAN_CADERNOS_QUESTOES, PLAN_FULL } from '@/lib/plans'

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

  const source = String([
    data?.interval,
    data?.product?.id,
    data?.product?.name,
    data?.offer?.id,
    data?.offer?.name,
    data?.offer?.checkout_link_id,
    payload?.product_id,
    payload?.product_name,
    payload?.offer_id,
    payload?.offer_name,
    payload?.checkout_id,
    payload?.checkout_url,
  ].filter(Boolean).join(' ')).toLowerCase()

  if (/anual|annual|yearly|ano|12\s*mes|365/.test(source)) return PLAN_FULL
  if (/trimestral|trimestre|quarter|3\s*mes|90/.test(source)) return PLAN_CADERNOS_QUESTOES
  if (/mensal|monthly|month|mes|mês|30/.test(source)) return PLAN_CADERNOS_500

  return PLAN_CADERNOS_500
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
    productId: String(generic.productId || data?.product?.id || data?.offer?.id || data?.offer?.checkout_link_id || '').trim(),
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendActivationEmail(input: { email: string; name?: string; url: string; plan: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'missing_RESEND_API_KEY' }

  const from = process.env.ACCESS_EMAIL_FROM || process.env.ERROR_REPORT_FROM || 'GabaritoIA <onboarding@resend.dev>'
  const name = escapeHtml(input.name || 'Aluno')
  const url = escapeHtml(input.url)
  const plan = escapeHtml(input.plan)

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:auto;padding:24px;">
      <h2 style="margin:0 0 12px;">Seu acesso ao GabaritoIA foi liberado</h2>
      <p>Olá, <b>${name}</b>.</p>
      <p>Recebemos a confirmação da sua compra e seu plano <b>${plan}</b> já pode ser ativado.</p>
      <p>Clique no botão abaixo para criar sua senha de acesso:</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;display:inline-block;">
          Criar minha senha
        </a>
      </p>
      <p>Se o botão não abrir, copie e cole este link no navegador:</p>
      <p style="word-break:break-all;background:#f4f4f5;padding:12px;border-radius:8px;font-size:13px;">${url}</p>
      <p style="font-size:13px;color:#555;">Este link é temporário. Caso expire, entre em contato com o suporte.</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: 'Crie sua senha de acesso ao GabaritoIA',
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { sent: false, reason: text || `resend_status_${res.status}` }
  }

  return { sent: true }
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
    const emailResult = await sendActivationEmail({ email, name, url, plan: access.plan }).catch(e => ({ sent: false, reason: (e as Error).message }))
    if (!emailResult.sent) console.warn('[mivvo activation email not sent]', emailResult.reason)

    return NextResponse.json({
      ok: true,
      received: true,
      checkout: 'mivvo',
      email,
      event,
      plan: access.plan,
      expiresInHours: access.expiresInHours,
      activationUrl: url,
      emailSent: emailResult.sent,
      message: emailResult.sent ? 'Acesso liberado e e-mail de ativação enviado.' : 'Acesso liberado, mas o e-mail de ativação não foi enviado. Verifique RESEND_API_KEY e domínio verificado.',
    })
  } catch (e) {
    console.error('[mivvo webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook da Mivvo.' }, { status: 500 })
  }
}
