import { prisma } from './prisma'

// Custo em créditos por ação
export const CREDIT_COSTS = {
  generate_question_1:  1,  // 1 questão
  generate_question_5:  4,  // 5 questões (desconto)
  generate_question_10: 7,  // 10 questões (desconto maior)
  generate_plan:        15, // Plano de estudos completo
  generate_flashcards:  3,  // Mais flashcards
} as const

// Créditos gratuitos por plano
export const PLAN_CREDITS = {
  FREE: 30,  // 30 créditos ao cadastrar
  PRO:  500, // 500 créditos/mês
  ENTERPRISE: 9999, // Ilimitado (própria chave)
} as const

export function getQuestionCost(quantity: number): number {
  if (quantity >= 10) return CREDIT_COSTS.generate_question_10
  if (quantity >= 5)  return CREDIT_COSTS.generate_question_5
  return quantity * CREDIT_COSTS.generate_question_1
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

// Bonus diário — recompensa usuários ativos
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, streak: true } })
  const bonus = user?.plan === 'PRO' ? 5 : 2
  const streakBonus = Math.min(user?.streak || 0, 5) // Até 5 créditos extras por streak

  const total = bonus + streakBonus
  await addCredits(userId, total, 'daily_bonus', `Bônus diário (+${streakBonus} streak)`)

  return { claimed: true, amount: total }
}
