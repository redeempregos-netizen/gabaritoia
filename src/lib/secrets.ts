import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getMasterKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY

  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY não configurada.')
  }

  // Aceita base64 ou hex
  try {
    const base64 = Buffer.from(raw, 'base64')
    if (base64.length === 32) return base64
  } catch {}

  try {
    const hex = Buffer.from(raw, 'hex')
    if (hex.length === 32) return hex
  } catch {}

  throw new Error(
    'APP_ENCRYPTION_KEY inválida. Use uma chave de 32 bytes em base64 ou hex.'
  )
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return ''

  const key = getMasterKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  // formato: enc:v1:iv:tag:data
  return [
    'enc',
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function isEncryptedSecret(value?: string | null): boolean {
  return !!value && value.startsWith('enc:v1:')
}

export function decryptSecret(value?: string | null): string {
  if (!value) return ''

  if (!isEncryptedSecret(value)) {
    // compatibilidade temporária com valores legados em texto puro
    return value
  }

  const parts = value.split(':')
  if (parts.length !== 5) {
    throw new Error('Secret criptografado em formato inválido.')
  }

  const [, , ivB64, tagB64, dataB64] = parts

  const key = getMasterKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(dataB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
