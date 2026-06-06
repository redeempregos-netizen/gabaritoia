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

    return NextResponse.json({
      ok: true,
      checkout: 'cakto',
      email,
      plan: access.plan,
      expiresInHours: access.expiresInHours,
      activationUrl: activationUrl(access.token),
      message: 'Acesso liberado. Use a activationUrl como link de criação de senha.',
    })
  } catch (e) {
    console.error('[cakto webhook]', e)
    return NextResponse.json({ error: (e as Error).message || 'Erro no webhook da Cakto.' }, { status: 500 })
  }
}
