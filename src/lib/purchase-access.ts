import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { normalizePlan, PLAN_CADERNOS_500, PLAN_CADERNOS_QUESTOES, PLAN_FULL, PLAN_CREDIT_AMOUNT } from '@/lib/plans'

export const PURCHASE_TOKEN_TTL_HOURS = 24

export async function ensurePurchaseAccessTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS purchase_access_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      plan TEXT NOT NULL,
      checkout TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      purchase_id TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP(3) NOT NULL,
      used_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_access_tokens_email_idx ON purchase_access_tokens(email);`).catch(() => null)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_access_tokens_purchase_idx ON purchase_access_tokens(purchase_id);`).catch(() => null)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_access_tokens_status_idx ON purchase_access_tokens(status);`).catch(() => null)
}

export function makeActivationToken() {
  return randomBytes(32).toString('hex')
}

export function hashActivationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function planValidityDays(plan: string) {
  const normalized = normalizePlan(plan)
  if (normalized === PLAN_CADERNOS_500) return 30
  if (normalized === PLAN_CADERNOS_QUESTOES) return 180
  if (normalized === PLAN_FULL) return 365
  return 30
}

export function planCredits(plan: string) {
  const normalized = normalizePlan(plan)
  return PLAN_CREDIT_AMOUNT[normalized] ?? PLAN_CREDIT_AMOUNT[PLAN_CADERNOS_500]
}

export function inferCaktoPlan(payload: any) {
  const explicit = String(payload?.plan || payload?.metadata?.plan || payload?.custom_fields?.plan || '').trim()
  if (explicit) return normalizePlan(explicit)

  const productId = String(payload?.product_id || payload?.product?.id || payload?.product?.code || payload?.offer?.id || '').toLowerCase()
  const productName = String(payload?.product_name || payload?.product?.name || payload?.offer?.name || payload?.item?.name || '').toLowerCase()
  const source = `${productId} ${productName}`

  if (/anual|annual|12\s*mes|365/.test(source)) return PLAN_FULL
  if (/semestral|semester|6\s*mes|180/.test(source)) return PLAN_CADERNOS_QUESTOES
  if (/mensal|monthly|1\s*mes|30/.test(source)) return PLAN_CADERNOS_500

  return PLAN_CADERNOS_500
}

export function extractBuyerFromPayload(payload: any) {
  const email = String(
    payload?.email ||
    payload?.customer_email ||
    payload?.buyer_email ||
    payload?.customer?.email ||
    payload?.buyer?.email ||
    payload?.client?.email ||
    payload?.data?.customer?.email ||
    ''
  ).trim().toLowerCase()

  const name = String(
    payload?.name ||
    payload?.customer_name ||
    payload?.buyer_name ||
    payload?.customer?.name ||
    payload?.buyer?.name ||
    payload?.client?.name ||
    payload?.data?.customer?.name ||
    ''
  ).trim()

  return { email, name }
}

export function extractPurchaseStatus(payload: any) {
  return String(
    payload?.status ||
    payload?.payment_status ||
    payload?.order_status ||
    payload?.event ||
    payload?.data?.status ||
    ''
  ).trim().toLowerCase()
}

export function isApprovedPurchaseStatus(status: string) {
  return ['paid', 'approved', 'aprovado', 'compra_aprovada', 'payment_approved', 'order_paid', 'completed', 'complete', 'success', 'succeeded'].some(key => status.includes(key))
}

export function extractProductInfo(payload: any) {
  return {
    productId: String(payload?.product_id || payload?.product?.id || payload?.product?.code || payload?.offer?.id || payload?.data?.product?.id || '').trim(),
    productName: String(payload?.product_name || payload?.product?.name || payload?.offer?.name || payload?.item?.name || payload?.data?.product?.name || '').trim(),
    purchaseId: String(payload?.purchase_id || payload?.order_id || payload?.transaction_id || payload?.sale_id || payload?.id || payload?.data?.id || payload?.data?.order_id || '').trim(),
  }
}

export async function createPurchaseAccessToken(input: {
  email: string
  name?: string
  plan: string
  checkout: string
  productId?: string
  productName?: string
  purchaseId?: string
}) {
  await ensurePurchaseAccessTables()
  const token = makeActivationToken()
  const tokenHash = hashActivationToken(token)
  const id = randomBytes(16).toString('hex')
  const plan = normalizePlan(input.plan)

  if (input.purchaseId) {
    await prisma.$executeRawUnsafe(`
      UPDATE purchase_access_tokens
      SET status = 'replaced', updated_at = CURRENT_TIMESTAMP
      WHERE checkout = $1 AND purchase_id = $2 AND status = 'pending';
    `, input.checkout, input.purchaseId).catch(() => null)
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO purchase_access_tokens
      (id, email, name, plan, checkout, product_id, product_name, purchase_id, token_hash, status, expires_at, created_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending', NOW() + INTERVAL '${PURCHASE_TOKEN_TTL_HOURS} hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `, id, input.email.toLowerCase(), input.name || null, plan, input.checkout, input.productId || null, input.productName || null, input.purchaseId || null, tokenHash)

  return { id, token, plan, expiresInHours: PURCHASE_TOKEN_TTL_HOURS }
}

export function activationUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://gabaritoia.vercel.app'
  return `${base.replace(/\/$/, '')}/ativar-acesso?token=${encodeURIComponent(token)}`
}
