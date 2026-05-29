import { PrismaClient } from '@prisma/client'
import { decryptSecret, isEncryptedSecret } from './secrets'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function decryptApiKeyResult(result: any) {
  if (!result) return result

  const decryptRow = (row: any) => {
    if (row?.keyHash && isEncryptedSecret(row.keyHash)) {
      return { ...row, keyHash: decryptSecret(row.keyHash) }
    }
    return row
  }

  return Array.isArray(result) ? result.map(decryptRow) : decryptRow(result)
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  client.$use(async (params, next) => {
    const result = await next(params)
    if (params.model === 'ApiKey' && ['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
      return decryptApiKeyResult(result)
    }
    return result
  })

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
