import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req)
    const ipLimit = await checkRateLimit(ip, 'register')
    if (!ipLimit.allowed) {
      const minutes = Math.max(1, Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 60000))
      return NextResponse.json({ error: `Muitos cadastros. Tente novamente em ${minutes} min.` }, { status: 429 })
    }

    const body = await req.json()
    const { name, email, password } = schema.parse(body)
    const normalizedEmail = email.toLowerCase().trim()

    const emailLimit = await checkRateLimit(normalizedEmail, 'register')
    if (!emailLimit.allowed) {
      const minutes = Math.max(1, Math.ceil((emailLimit.resetAt.getTime() - Date.now()) / 60000))
      return NextResponse.json({ error: `Muitas tentativas para este e-mail. Tente novamente em ${minutes} min.` }, { status: 429 })
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const isAdmin = normalizedEmail === process.env.ADMIN_EMAIL

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role: isAdmin ? 'ADMIN' : 'USER',
        plan: 'FREE',
      },
    })

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
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
