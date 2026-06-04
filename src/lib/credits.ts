import { prisma } from './prisma'
import { normalizePlan, PLAN_DAILY_BONUS_AMOUNT } from './plans'

// Custo em créditos por ação
export const CREDIT_COSTS = {
  generate_question_1:  1,
  generate_question_5:  5,
  generate_question_10: 10,
  generate_plan:        15,
  generate_flashcards:  3,
} as const

// Créditos gratuitos por plano
export const PLAN_CREDITS = {
  FREE: 300,
  PACK: 300,
  PRO:  3000,
  ENTERPRISE: 8000,
  CADERNOS_500: 1000,
} as const

export function getQuestionCost(quantity: number): number {
  return Math.max(1, quantity)
}

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  })
  return user?.credits ?? 0
}

export async function hasCredits(userId: string, cost: number): Promise<boolean> {
  const credits = await getCredits(userId)
  return credits >= cost
}

export async function deductCredits(
  userId: string,
  cost: number,
  action: string,
  details?: string
): Promise<{ ok: boolean; remaining: number }> {
  try {
    const user = await prisma.user.update({
      where: { id: userId, credits: { gte: cost } },
      data: {
        credits: { decrement: cost },
        creditsUsed: { increment: cost },
        creditLogs: {
          create: {
            amount: -cost,
            action,
            details,
          },
        },
      },
      select: { credits: true },
    })
    return { ok: true, remaining: user.credits }
  } catch {
    const current = await getCredits(userId)
    return { ok: false, remaining: current }
  }
}

export async function addCredits(
  userId: string,
  amount: number,
  action: string,
  details?: string
): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      credits: { increment: amount },
      creditLogs: {
        create: { amount, action, details },
      },
    },
    select: { credits: true },
  })
  return user.credits
}

export async function getCreditHistory(userId: string, limit = 20) {
  return prisma.creditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

// Bônus diário por plano
export async function claimDailyBonus(userId: string): Promise<{ claimed: boolean; amount: number }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alreadyClaimed = await prisma.creditLog.findFirst({
    where: {
      userId,
      action: 'daily_bonus',
      createdAt: { gte: today },
    },
  })

  if (alreadyClaimed) return { claimed: false, amount: 0 }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
  const plan = normalizePlan(user?.plan)
  const total = PLAN_DAILY_BONUS_AMOUNT[plan] ?? 20

  await addCredits(userId, total, 'daily_bonus', `Bônus diário de ${total} créditos - ${plan}`)

  return { claimed: true, amount: total }
}
