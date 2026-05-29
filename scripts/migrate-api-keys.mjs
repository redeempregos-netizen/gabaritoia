import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'

function getMasterKey() {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) throw new Error('APP_ENCRYPTION_KEY não configurada.')

  const base64 = Buffer.from(raw, 'base64')
  if (base64.length === 32) return base64

  const hex = Buffer.from(raw, 'hex')
  if (hex.length === 32) return hex

  throw new Error('APP_ENCRYPTION_KEY inválida. Use uma chave de 32 bytes em base64 ou hex.')
}

function isEncryptedSecret(value) {
  return !!value && String(value).startsWith('enc:v1:')
}

function encryptSecret(plainText) {
  if (!plainText) return ''

  const key = getMasterKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return [
    'enc',
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

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
