import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const RESET_TTL_HOURS = 2

export async function ensurePasswordResetTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP(3) NOT NULL,
      used_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS password_reset_tokens_email_idx ON password_reset_tokens(email);`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token);`)
}

function makeId() {
  return crypto.randomBytes(16).toString('hex')
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function passwordResetUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://gabaritoia.vercel.app'
  return `${base.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(token)}`
}

export async function createPasswordResetToken(userId: string, email: string) {
  await ensurePasswordResetTables()
  await prisma.$executeRawUnsafe(`
    UPDATE password_reset_tokens
    SET status = 'replaced'
    WHERE user_id = $1 AND status = 'pending';
  `, userId)

  const id = makeId()
  const token = makeToken()
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000)

  await prisma.$executeRawUnsafe(`
    INSERT INTO password_reset_tokens (id, user_id, email, token, status, expires_at)
    VALUES ($1, $2, $3, $4, 'pending', $5);
  `, id, userId, email.toLowerCase(), token, expiresAt)

  return { token, url: passwordResetUrl(token), expiresAt, expiresInHours: RESET_TTL_HOURS }
}

export async function getValidPasswordResetToken(token: string) {
  await ensurePasswordResetTables()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, user_id AS "userId", email, status, expires_at AS "expiresAt", used_at AS "usedAt"
    FROM password_reset_tokens
    WHERE token = $1
    LIMIT 1;
  `, token)
  const item = rows?.[0]
  if (!item) return null
  if (item.status !== 'pending') return null
  if (item.usedAt) return null
  if (new Date(item.expiresAt).getTime() < Date.now()) return null
  return item
}

export async function markPasswordResetTokenUsed(id: string) {
  await prisma.$executeRawUnsafe(`
    UPDATE password_reset_tokens
    SET status = 'used', used_at = NOW()
    WHERE id = $1;
  `, id)
}
