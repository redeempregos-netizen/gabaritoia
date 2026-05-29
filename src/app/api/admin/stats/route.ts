import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAI } from '@/lib/ai'
import { encryptSecret } from '@/lib/secrets'
import type { AIProvider } from '@/types'

async function ensureCreditRenewalColumn() {
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_renewed_at TIMESTAMP(3);`)
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP(3);`)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

async function getAIUsageSummary() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT,
        action TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        cached BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    const totals = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM(prompt_tokens), 0)::int AS "promptTokens",
        COALESCE(SUM(completion_tokens), 0)::int AS "completionTokens",
        COALESCE(SUM(total_tokens), 0)::int AS "totalTokens",
        COALESCE(SUM(cost_usd), 0)::float AS "totalCostUsd",
        COUNT(*)::int AS "totalCalls"
      FROM ai_usage;
    `)

    const last7Days = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        TO_CHAR(DATE(created_at), 'DD/MM') AS day,
        COALESCE(SUM(total_tokens), 0)::int AS tokens,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::int AS calls
      FROM ai_usage
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC;
    `)

    const byProvider = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        provider,
        COALESCE(SUM(total_tokens), 0)::int AS tokens,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::int AS calls
      FROM ai_usage
      GROUP BY provider
      ORDER BY cost DESC;
    `)

    const byAction = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(action, 'unknown') AS action,
        COALESCE(SUM(total_tokens), 0)::int AS tokens,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::int AS calls
      FROM ai_usage
      GROUP BY action
      ORDER BY cost DESC
      LIMIT 10;
    `)

    return {
      totals: totals[0] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0, totalCalls: 0 },
      last7Days,
      byProvider,
      byAction,
    }
  } catch (e) {
    console.error('[AI usage summary error]', e)
    return {
      totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0, totalCalls: 0 },
      last7Days: [],
      byProvider: [],
      byAction: [],
    }
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  await ensureCreditRenewalColumn()

  const [apiKeys, configs] = await Promise.all([
    prisma.apiKey.findMany(),
    prisma.adminConfig.findMany(),
  ])

  const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]))

  const apiKeysResponse = apiKeys.map(k => ({
    provider: k.provider,
    isEnabled: k.isEnabled,
    hasKey: !!k.keyHash,
    model: k.model,
    lastTested: k.lastTested,
    testStatus: k.testStatus,
  }))

  const [totalUsers, totalAnswers, totalPlans, aiUsage] = await Promise.all([
    prisma.user.count(),
    prisma.answer.count(),
    prisma.studyPlan.count(),
    getAIUsageSummary(),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [todayAnswers, weekAnswers, recentUsers] = await Promise.all([
    prisma.answer.count({ where: { createdAt: { gte: today } } }),
    prisma.answer.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id,
        name,
        email,
        role,
        plan,
        credits,
        "creditsUsed" AS "creditsUsed",
        "createdAt" AS "createdAt",
        streak,
        credits_renewed_at AS "creditsRenewedAt",
        plan_expires_at AS "planExpiresAt",
        CASE
          WHEN plan_expires_at IS NULL THEN false
          WHEN plan_expires_at < NOW() THEN true
          ELSE false
        END AS "planExpired"
      FROM users
      ORDER BY "createdAt" DESC
      LIMIT 50;
    `),
  ])

  return NextResponse.json({
    stats: {
      totalUsers,
      totalAnswers,
      totalPlans,
      configuredApis: apiKeys.filter(k => k.isEnabled && k.keyHash).length,
      todayAnswers,
      weekAnswers,
    },
    aiUsage,
    recentUsers,
    apiKeys: apiKeysResponse,
    config: {
      maxQtd: Number(configMap.maxQtd || 10),
      defaultProvider: configMap.defaultProvider || 'claude',
      monthlyFreeCredits: Number(configMap.monthlyFreeCredits || 1000),
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  await ensureCreditRenewalColumn()

  const body = await req.json()
  const { action, provider, key, model, enabled, maxQtd, defaultProvider, monthlyFreeCredits, userId, role, plan, credits, planDurationDays, clearPlanExpiration } = body

  if (action === 'save_api_key') {
    const encryptedKey = key && !key.startsWith('••') ? encryptSecret(String(key).trim()) : undefined

    await prisma.apiKey.upsert({
      where: { provider },
      create: { provider, keyHash: encryptedKey || '', model: model || 'default', isEnabled: enabled ?? true },
      update: { ...(encryptedKey && { keyHash: encryptedKey }), ...(model && { model }), isEnabled: enabled ?? true },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle_provider') {
    await prisma.apiKey.updateMany({ where: { provider }, data: { isEnabled: enabled } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'test_api') {
    try {
      await callAI({ prompt: 'Responda apenas: OK', provider: provider as AIProvider, maxTokens: 20, action: 'test_api' })
      await prisma.apiKey.update({ where: { provider }, data: { lastTested: new Date(), testStatus: 'ok' } })
      return NextResponse.json({ ok: true, status: 'ok' })
    } catch (e) {
      await prisma.apiKey.updateMany({ where: { provider }, data: { lastTested: new Date(), testStatus: 'error' } })
      return NextResponse.json({ ok: false, status: 'error', message: (e as Error).message })
    }
  }

  if (action === 'save_config') {
    const updates = []
    if (maxQtd !== undefined) updates.push(
      prisma.adminConfig.upsert({ where: { key: 'maxQtd' }, create: { key: 'maxQtd', value: String(maxQtd) }, update: { value: String(maxQtd) } })
    )
    if (defaultProvider) updates.push(
      prisma.adminConfig.upsert({ where: { key: 'defaultProvider' }, create: { key: 'defaultProvider', value: defaultProvider }, update: { value: defaultProvider } })
    )
    if (monthlyFreeCredits !== undefined) updates.push(
      prisma.adminConfig.upsert({ where: { key: 'monthlyFreeCredits' }, create: { key: 'monthlyFreeCredits', value: String(Math.max(0, Number(monthlyFreeCredits) || 0)) }, update: { value: String(Math.max(0, Number(monthlyFreeCredits) || 0)) } })
    )
    await Promise.all(updates)
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_user') {
    const data: any = {}
    if (role) data.role = role
    if (plan) data.plan = plan
    if (credits !== undefined) data.credits = Math.max(0, Number(credits) || 0)

    await prisma.user.update({
      where: { id: userId },
      data,
    })

    if (clearPlanExpiration) {
      await prisma.$executeRawUnsafe(`UPDATE users SET plan_expires_at = NULL WHERE id = $1`, userId)
    } else if (planDurationDays !== undefined) {
      const days = Math.max(1, Number(planDurationDays) || 30)
      await prisma.$executeRawUnsafe(`UPDATE users SET plan_expires_at = $1 WHERE id = $2`, addDays(days), userId)
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
}
