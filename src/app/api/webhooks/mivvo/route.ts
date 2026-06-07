import { NextRequest, NextResponse } from 'next/server'
import {
  activationUrl,
  cancelPurchaseAccess,
  createPurchaseAccessToken,
  extractBuyerFromPayload,
  extractProductInfo,
  extractPurchaseStatus,
  isApprovedPurchaseStatus,
  isCanceledPurchaseStatus,
} from '@/lib/purchase-access'
import { normalizePlan, PLAN_CADERNOS_500, PLAN_CADERNOS_QUESTOES, PLAN_FULL } from '@/lib/plans'

function isAuthorized(req: NextRequest) {
  const secret = process.env.MIVVO_WEBHOOK_SECRET || process.env.CAKTO_WEBHOOK_SECRET
  if (!secret) return true

  const auth = req.headers.get('authorization') || ''
  const headerSecret =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-mivvo-secret') ||
    req.headers.get('x-mivvo-token') ||
    req.headers.get('x-api-key') ||
    req.headers.get('webhook-secret') ||
    ''
  const querySecret = req.nextUrl.searchParams.get('secret') || ''

  return auth === `Bearer ${secret}` || headerSecret === secret || querySecret === secret
}

function isTestPayload(payload: any, status: string) {
  const event = String(payload?.event || payload?.event_type || payload?.type || payload?.test || payload?.data?.event || payload?.data?.type || '').toLowerCase()
  return !status || event.includes('test') || event.includes('ping') || payload?.test === true
}

function inferMivvoPlan(payload: any) {
  const explicit = String(
    payload?.plan ||
    payload?.metadata?.plan ||
    payload?.custom_fields?.plan ||
    payload?.data?.plan ||
    payload?.data?.metadata?.plan ||
    ''
  ).trim()
  if (explicit) return normalizePlan(explicit)

  const source = String([
    payload?.product_id,
    payload?.product_name,
    payload?.offer_id,
    payload?.offer_name,
    payload?.checkout_id,
    payload?.checkout_url,
    payload?.subscription?.plan,
    payload?.subscription?.interval,
    payload?.product?.id,
    payload?.product?.name,
    payload?.offer?.id,
    payload?.offer?.name,
    payload?.data?.product_id,
    payload?.data?.product_name,
    payload?.data?.offer_id,
    payload?.data?.offer_name,
    payload?.data?.checkout_id,
    payload?.data?.checkout_url,
    payload?.data?.subscription?.plan,
    payload?.data?.subscription?.interval,
    payload?.data?.product?.id,
    payload?.data?.product?.name,
    payload?.data?.offer?.id,
    payload?.data?.offer?.name,
  ].filter(Boolean).join(' ')).toLowerCase()

  if (/anual|annual|yearly|ano|12\s*mes|365/.test(source)) return PLAN_FULL
  if (/trimestral|trimestre|quarter|3\s*mes|90/.test(source)) return PLAN_CADERNOS_QUESTOES
  if (/mensal|monthly|month|mes|mês|30/.test(source)) return PLAN_CADERNOS_500

  return PLAN_CADERNOS_500
}

function getMivvoProductInfo(payload: any) {
  const generic = extractProductInfo(payload)
  return {
    productId: String(generic.productId || payload?.checkout_id || payload?.offer_id || payload?.data?.checkout_id || payload?.data?.offer_id || '').trim(),
    productName: String(generic.productName || payload?.offer_name || payload?.checkout_name || payload?.data?.offer_name || payload?.data?.checkout_name || '').trim(),
    purchaseId: String(
      generic.purchaseId ||
      payload?.payment_id ||
      payload?.charge_id ||
      payload?.invoice_id ||
      payload?.transaction?.id ||
      payload?.payment?.id ||
      payload?.order?.id ||
      payload?.data?.payment_id ||
      payload?.data?.charge_id ||
      payload?.data?.invoice_id ||
      payload?.data?.transaction?.id ||
      payload?.data?.payment?.id ||
      payload?.data?.order?.id ||
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
    const status = extractPurchaseStatus(payload)

    if (isTestPayload(payload, status)) {
      return NextResponse.json({ ok: true, webhook: 'mivvo', test: true, message: 'Evento de teste recebido com sucesso.' })
    }

    const { email, name } = extractBuyerFromPayload(payload)
    const product = getMivvoProductInfo(payload)

    if (isCanceledPurchaseStatus(status)) {
      if (!email) return NextResponse.json({ error: 'E-mail do comprador não encontrado no cancelamento.' }, { status: 400 })
      const result = await cancelPurchaseAccess({ email, checkout: 'mivvo', purchaseId: product.purchaseId })
      return NextResponse.json({ ok: true, checkout: 'mivvo', email, status, action: 'canceled', ...result })
    }

    if (!isApprovedPurchaseStatus(status)) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'status_not_approved', status })
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
      checkout: 'mivvo',
      email,
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
