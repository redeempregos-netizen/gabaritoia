import { NextRequest, NextResponse } from 'next/server'
import {
  activationUrl,
  cancelPurchaseAccess,
  createPurchaseAccessToken,
  extractBuyerFromPayload,
  extractProductInfo,
  extractPurchaseStatus,
  inferCaktoPlan,
  isApprovedPurchaseStatus,
  isCanceledPurchaseStatus,
} from '@/lib/purchase-access'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CAKTO_WEBHOOK_SECRET
  if (!secret) return true

  const auth = req.headers.get('authorization') || ''
  const headerSecret =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-cakto-secret') ||
    req.headers.get('x-cakto-token') ||
    req.headers.get('x-api-key') ||
    req.headers.get('webhook-secret') ||
    ''
  const querySecret = req.nextUrl.searchParams.get('secret') || ''

  return auth === `Bearer ${secret}` || headerSecret === secret || querySecret === secret
}

function isTestPayload(payload: any, status: string) {
  const event = String(payload?.event || payload?.event_type || payload?.type || payload?.test || payload?.data?.event || '').toLowerCase()
  return !status || event.includes('test') || event.includes('ping') || payload?.test === true
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
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, webhook: 'cakto', method: 'GET', message: 'Webhook ativo.' })
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
    }

    const payload = await req.json().catch(() => ({}))
    const status = extractPurchaseStatus(payload)

    if (isTestPayload(payload, status)) {
      return NextResponse.json({ ok: true, webhook: 'cakto', test: true, message: 'Evento de teste recebido com sucesso.' })
    }

    const { email, name } = extractBuyerFromPayload(payload)
    const product = extractProductInfo(payload)

    if (isCanceledPurchaseStatus(status)) {
      if (!email) return NextResponse.json({ error: 'E-mail do comprador não encontrado no cancelamento.' }, { status: 400 })
      const result = await cancelPurchaseAccess({ email, checkout: 'cakto', purchaseId: product.purchaseId })
      return NextResponse.json({ ok: true, checkout: 'cakto', email, status, action: 'canceled', ...result })
    }

    if (!isApprovedPurchaseStatus(status)) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'status_not_approved', status })
    }

    if (!email) {
      return NextResponse.json({ error: 'E-mail do comprador não encontrado no webhook.' }, { status: 400 })
    }

    const plan = inferCaktoPlan(payload)

    const access = await createPurchaseAccessToken({
      email,
      name,
      plan,
      checkout: 'cakto',
      productId: product.productId,
      productName: product.productName,
      purchaseId: product.purchaseId,
    })

    const url = activationUrl(access.token)
    const emailResult = await sendActivationEmail({ email, name, url, plan: access.plan }).catch(e => ({ sent: false, reason: (e as Error).message }))
    if (!emailResult.sent) console.warn('[cakto activation email not sent]', emailResult.reason)

    return NextResponse.json({
      ok: true,
      checkout: 'cakto',
      email,
      plan: access.plan,
      expiresInHours: access.expiresInHours,
      activationUrl: url,
      emailSent: emailResult.sent,
      message: emailResult.sent ? 'Acesso liberado e e-mail de ativação enviado.' : 'Acesso liberado, mas o e-mail de ativação não foi enviado. Verifique RESEND_API_KEY.',
    })
  } catch (e) {
    console.error('[cakto webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook da Cakto.' }, { status: 500 })
  }
}
