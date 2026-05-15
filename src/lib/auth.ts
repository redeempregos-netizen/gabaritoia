import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

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
    .sign(JWT_SECRET)

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await prisma.session.create({
    data: { userId: payload.userId, token, expiresAt },
  })

  return token
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('gaia-session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function deleteSession(token: string) {
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
