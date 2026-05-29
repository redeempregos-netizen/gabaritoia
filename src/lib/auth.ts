import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET ausente ou fraco. Configure uma chave com pelo menos 32 caracteres.')
  }
  return new TextEncoder().encode(secret)
}

async function getPrisma() {
  const mod = await import('./prisma')
  return mod.prisma
}

export interface SessionPayload {
  userId: string
  email: string
  role: string
  plan: string
  [key: string]: unknown
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getJwtSecret())

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const prisma = await getPrisma()
  await prisma.session.create({
    data: { userId: payload.userId, token, expiresAt },
  })

  return token
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

async function renewMonthlyCreditsIfNeeded(userId: string) {
  const prisma = await getPrisma()
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_renewed_at TIMESTAMP(3);`).catch(() => null)

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT credits_renewed_at AS "creditsRenewedAt"
    FROM users
    WHERE id = $1
    LIMIT 1;
  `, userId).catch(() => [])

  const renewedAt = rows?.[0]?.creditsRenewedAt ? new Date(rows[0].creditsRenewedAt) : null
  const now = new Date()
  const days = renewedAt ? Math.floor((now.getTime() - renewedAt.getTime()) / 86400000) : 999
  if (days < 30) return

  const config = await prisma.adminConfig.findUnique({ where: { key: 'monthlyFreeCredits' } }).catch(() => null)
  const monthlyCredits = Math.max(0, Number(config?.value || 1000) || 1000)

  await prisma.$executeRawUnsafe(`
    UPDATE users
    SET credits = $1,
        "creditsUsed" = 0,
        credits_renewed_at = NOW()
    WHERE id = $2;
  `, monthlyCredits, userId).catch((e) => console.error('[monthly credit renewal]', e))
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('gaia-session')?.value
  if (!token) return null

  const session = await verifySession(token)
  if (!session?.userId) return null

  await renewMonthlyCreditsIfNeeded(session.userId)

  // Sempre busca o usuário atual no banco para evitar sessão antiga com plano antigo.
  // Isso permite que alterações feitas no admin/Supabase liberem o acesso imediatamente.
  const prisma = await getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true, plan: true },
  }).catch(() => null)

  if (!user) return null

  return {
    ...session,
    userId: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
  }
}

export async function deleteSession(token: string) {
  const prisma = await getPrisma()
  await prisma.session.deleteMany({ where: { token } })
}

export function setSessionCookie(token: string) {
  cookies().set('gaia-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
}

export function clearSessionCookie() {
  cookies().set('gaia-session', '', { maxAge: 0, path: '/' })
}
