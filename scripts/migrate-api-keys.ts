import { PrismaClient } from '@prisma/client'
import { encryptSecret, isEncryptedSecret } from '../src/lib/secrets'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.apiKey.findMany()
  let migrated = 0

  for (const row of rows) {
    if (!row.keyHash) continue
    if (isEncryptedSecret(row.keyHash)) continue

    const encrypted = encryptSecret(row.keyHash)

    await prisma.apiKey.update({
      where: { provider: row.provider },
      data: { keyHash: encrypted },
    })

    migrated++
    console.log(`Migrado provider: ${row.provider}`)
  }

  console.log(`Migração concluída. Total migrado: ${migrated}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
