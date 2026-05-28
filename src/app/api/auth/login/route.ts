import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function rateLimitResponse(minutes: number) {
  return NextResponse.json({ error: `Muitas tentativas. Tente novamente em ${minutes} min.` }, { status: 429 })
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req)
    const ipLimit = await checkRateLimit(ip, 'login')
    if (!ipLimit.allowed) {
      return rateLimitResponse(Math.max(1, Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 60000)))
    }

    const body = await req.json()
    const { email, password } = schema.parse(body)

    const emailLimit = await checkRateLimit(email.toLowerCase(), 'login')
    if (!emailLimit.allowed) {
      return rateLimitResponse(Math.max(1, Math.ceil((emailLimit.resetAt.getTime() - Date.now()) / 60000)))
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
    }

    const token = await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    })

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan },
    })

    res.cookies.set('gaia-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return res
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
