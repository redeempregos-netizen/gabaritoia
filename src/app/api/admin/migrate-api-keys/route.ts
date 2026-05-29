import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { encryptSecret, isEncryptedSecret } from '@/lib/secrets'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const directPrisma = new PrismaClient()

  try {
    const rows = await directPrisma.apiKey.findMany()
    let migrated = 0
    let skipped = 0

    for (const row of rows) {
      if (!row.keyHash) {
        skipped++
        continue
      }

      if (isEncryptedSecret(row.keyHash)) {
        skipped++
        continue
      }

      await directPrisma.apiKey.update({
        where: { provider: row.provider },
        data: { keyHash: encryptSecret(row.keyHash) },
      })

      migrated++
    }

    return NextResponse.json({ ok: true, migrated, skipped })
  } catch (e) {
    console.error('[migrate api keys error]', e)
    return NextResponse.json({ error: 'Erro ao migrar API keys.' }, { status: 500 })
  } finally {
    await directPrisma.$disconnect()
  }
}
