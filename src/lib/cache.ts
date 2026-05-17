import { createHash } from 'crypto'
import { prisma } from './prisma'

// TTL padrão: 7 dias para questões, 1 dia para planos
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashPrompt(prompt: string, provider: string): string {
  return createHash('sha256')
    .update(`${provider}:${prompt}`)
    .digest('hex')
}

export async function getCached(promptHash: string): Promise<string | null> {
  try {
    const cached = await prisma.aICache.findUnique({
      where: { promptHash },
    })

    if (!cached) return null
    if (cached.expiresAt < new Date()) {
      // Expirado — apagar em background
      prisma.aICache.delete({ where: { promptHash } }).catch(() => {})
      return null
    }

    // Incrementar hits
    prisma.aICache.update({
      where: { promptHash },
      data: { hits: { increment: 1 } },
    }).catch(() => {})

    return cached.response
  } catch {
    return null
  }
}

export async function setCache(
  promptHash: string,
  prompt: string,
  response: string,
  provider: string,
  model?: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs)
    await prisma.aICache.upsert({
      where: { promptHash },
      create: { promptHash, prompt: prompt.substring(0, 1000), response, provider, model, expiresAt },
      update: { response, expiresAt, hits: 0 },
    })
  } catch {
    // Falha no cache não deve quebrar a aplicação
  }
}

export async function getCacheStats() {
  const [total, hits] = await Promise.all([
    prisma.aICache.count(),
    prisma.aICache.aggregate({ _sum: { hits: true } }),
  ])
  return { totalEntries: total, totalHits: hits._sum.hits || 0 }
}

export async function clearExpiredCache() {
  const deleted = await prisma.aICache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return deleted.count
}
