import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCredits, getCreditHistory, claimDailyBonus } from '@/lib/credits'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const [credits, history] = await Promise.all([
    getCredits(session.userId),
    getCreditHistory(session.userId, 10),
  ])

  return NextResponse.json({ credits, history })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { action } = await req.json()

  if (action === 'daily_bonus') {
    const result = await claimDailyBonus(session.userId)
    if (!result.claimed) {
      return NextResponse.json({ error: 'Bônus já resgatado hoje. Volte amanhã!' }, { status: 400 })
    }
    const credits = await getCredits(session.userId)
    return NextResponse.json({ ok: true, amount: result.amount, credits })
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
}
