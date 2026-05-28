import { prisma } from './prisma'
import { NextRequest } from 'next/server'

interface RateLimitConfig {
  limit: number       // máximo de requisições
  windowMs: number    // janela de tempo em ms
}

// Configurações por tipo de ação
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  generate:     { limit: 20,  windowMs: 60 * 60 * 1000 },      // 20 gerações/hora
  generate_ip:  { limit: 10,  windowMs: 60 * 60 * 1000 },      // 10/hora por IP
  login:        { limit: 10,  windowMs: 15 * 60 * 1000 },      // 10 tentativas/15min
  register:     { limit: 5,   windowMs: 60 * 60 * 1000 },      // 5 cadastros/hora por IP
  plan:         { limit: 3,   windowMs: 60 * 60 * 1000 },      // 3 planos/hora
  api_global:   { limit: 100, windowMs: 60 * 1000 },           // 100 req/min global
}

const FAIL_CLOSED_ACTIONS = new Set(['generate', 'generate_ip', 'login', 'register'])

export async function checkRateLimit(
  key: string,
  action: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const config = RATE_LIMITS[action] || RATE_LIMITS.api_global
  const now = new Date()
  const fullKey = `${action}:${key}`

  try {
    const record = await prisma.rateLimit.findUnique({ where: { key: fullKey } })

    // Se não existe ou a janela expirou, criar/resetar
    if (!record || record.resetAt < now) {
      const resetAt = new Date(now.getTime() + config.windowMs)
      await prisma.rateLimit.upsert({
        where: { key: fullKey },
        create: { key: fullKey, count: 1, resetAt },
        update: { count: 1, resetAt },
      })
      return { allowed: true, remaining: config.limit - 1, resetAt }
    }

    // Verificar limite
    if (record.count >= config.limit) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt }
    }

    // Incrementar contador
    const updated = await prisma.rateLimit.update({
      where: { key: fullKey },
      data: { count: { increment: 1 } },
    })

    return {
      allowed: true,
      remaining: config.limit - updated.count,
      resetAt: record.resetAt,
    }
  } catch (e) {
    console.error('[rate limit error]', e)
    const resetAt = new Date(now.getTime() + config.windowMs)

    // Em rotas críticas, se o limitador falhar, bloqueia em vez de liberar.
    if (FAIL_CLOSED_ACTIONS.has(action)) {
      return { allowed: false, remaining: 0, resetAt }
    }

    return { allowed: true, remaining: 1, resetAt }
  }
}

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export function rateLimitHeaders(remaining: number, resetAt: Date) {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.floor(resetAt.getTime() / 1000)),
  }
}

export async function cleanExpiredRateLimits() {
  const deleted = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  })
  return deleted.count
}
