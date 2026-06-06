import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hashActivationToken, ensurePurchaseAccessTables, planCredits, planValidityDays } from '@/lib/purchase-access'
import { normalizePlan } from '@/lib/plans'

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
})

async function findAccess(token: string) {
  await ensurePurchaseAccessTables()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, email, name, plan, checkout, product_name AS "productName", status, expires_at AS "expiresAt", used_at AS "usedAt"
    FROM purchase_access_tokens
    WHERE token_hash = $1
    LIMIT 1;
  `, hashActivationToken(token))
  return rows[0] || null
}

function expired(value: any) {
  return !value || new Date(value).getTime() < Date.now()
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || ''
    if (token.length < 20) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })
    const access = await findAccess(token)
    if (!access) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 })
    if (access.status !== 'pending' || access.usedAt) return NextResponse.json({ error: 'Este link já foi usado.' }, { status: 400 })
    if (expired(access.expiresAt)) return NextResponse.json({ error: 'Este link expirou. Solicite um novo link.' }, { status: 410 })
    return NextResponse.json({ ok: true, access: { email: access.email, name: access.name, plan: normalizePlan(access.plan), checkout: access.checkout, productName: access.productName, expiresAt: access.expiresAt } })
  } catch (e) {
    console.error('[activate purchase get]', e)
    return NextResponse.json({ error: 'Erro ao validar link.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    if (body.password !== body.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 })

    const access = await findAccess(body.token)
    if (!access) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 })
    if (access.status !== 'pending' || access.usedAt) return NextResponse.json({ error: 'Este link já foi usado.' }, { status: 400 })
    if (expired(access.expiresAt)) return NextResponse.json({ error: 'Este link expirou. Solicite um novo link.' }, { status: 410 })

    const plan = normalizePlan(access.plan)
    const credits = planCredits(plan)
    const validity = planValidityDays(plan)
    const email = String(access.email).trim().toLowerCase()
    const name = String(access.name || email.split('@')[0] || 'Usuário').trim()
    const passwordHash = await bcrypt.hash(body.password, 12)

    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP(3);`).catch(() => null)
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`).catch(() => null)
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_renewed_at TIMESTAMP(3);`).catch(() => null)

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      await prisma.$executeRawUnsafe(`
        UPDATE users
        SET name = $1,
            "passwordHash" = $2,
            plan = $3,
            credits = $4,
            "creditsUsed" = 0,
            plan_started_at = NOW(),
            plan_expires_at = NOW() + ($5 || ' days')::interval,
            credits_renewed_at = NOW(),
            "updatedAt" = NOW()
        WHERE id = $6;
      `, name, passwordHash, plan, credits, String(validity), existing.id)
    } else {
      const user = await prisma.user.create({ data: { name, email, passwordHash, role: 'USER', plan: plan as any, credits, creditsUsed: 0 }, select: { id: true } })
      await prisma.$executeRawUnsafe(`UPDATE users SET plan_started_at = NOW(), plan_expires_at = NOW() + ($1 || ' days')::interval, credits_renewed_at = NOW() WHERE id = $2;`, String(validity), user.id).catch(() => null)
    }

    await prisma.$executeRawUnsafe(`UPDATE purchase_access_tokens SET status = 'used', used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`, access.id)
    return NextResponse.json({ ok: true, message: 'Senha criada com sucesso. Entre com o e-mail da compra.' })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    console.error('[activate purchase post]', e)
    return NextResponse.json({ error: 'Não foi possível ativar o acesso.' }, { status: 500 })
  }
}
