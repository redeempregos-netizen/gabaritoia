import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { activationUrl, createPurchaseAccessToken, ensurePurchaseAccessTables } from '@/lib/purchase-access'
import { normalizePlan } from '@/lib/plans'

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Informe o e-mail usado na compra.' }, { status: 400 })
    }

    await ensurePurchaseAccessTables()

    const existingUsers = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM users WHERE email = $1 LIMIT 1;
    `, email).catch(() => [])

    if (existingUsers[0]) {
      return NextResponse.json({
        ok: true,
        alreadyRegistered: true,
        redirectUrl: '/login',
        message: 'Este e-mail já possui conta. Entre pelo login.',
      })
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, email, name, plan, checkout, product_id AS "productId", product_name AS "productName", purchase_id AS "purchaseId", expires_at AS "expiresAt", created_at AS "createdAt"
      FROM purchase_access_tokens
      WHERE email = $1
        AND status IN ('pending', 'replaced')
      ORDER BY created_at DESC
      LIMIT 1;
    `, email)

    const last = rows[0]
    if (!last) {
      return NextResponse.json({ error: 'Ainda não encontramos uma compra aprovada para este e-mail. Aguarde alguns segundos e tente novamente.' }, { status: 404 })
    }

    const access = await createPurchaseAccessToken({
      email,
      name: last.name || undefined,
      plan: normalizePlan(last.plan),
      checkout: last.checkout || 'mivvo',
      productId: last.productId || undefined,
      productName: last.productName || undefined,
      purchaseId: last.purchaseId || undefined,
    })

    return NextResponse.json({
      ok: true,
      redirectUrl: activationUrl(access.token),
      expiresInHours: access.expiresInHours,
      message: 'Compra encontrada. Redirecionando para criar sua senha.',
    })
  } catch (e) {
    console.error('[claim purchase access]', e)
    return NextResponse.json({ error: 'Não foi possível resgatar seu acesso agora.' }, { status: 500 })
  }
}
