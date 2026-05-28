import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAI } from '@/lib/ai'
import type { AIProvider } from '@/types'

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
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, name: true, email: true, role: true, plan: true, createdAt: true, streak: true },
    }),
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
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { action, provider, key, model, enabled, maxQtd, defaultProvider, userId, role, plan } = body

  if (action === 'save_api_key') {
    await prisma.apiKey.upsert({
      where: { provider },
      create: { provider, keyHash: key, model: model || 'default', isEnabled: enabled ?? true },
      update: { ...(key && !key.startsWith('••') && { keyHash: key }), ...(model && { model }), isEnabled: enabled ?? true },
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
    await Promise.all(updates)
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_user') {
    await prisma.user.update({
      where: { id: userId },
      data: { ...(role && { role }), ...(plan && { plan }) },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
}
