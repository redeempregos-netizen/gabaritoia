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

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('gaia-session')?.value
  if (!token) return null

  const session = await verifySession(token)
  if (!session?.userId) return null

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
