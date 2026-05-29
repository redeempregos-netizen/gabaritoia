import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  email: z.string().email('E-mail inválido.'),
  currentPassword: z.string().min(1, 'Informe sua senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.parse(body)
    const email = parsed.email.trim().toLowerCase()

    if (parsed.currentPassword === parsed.newPassword) {
      return NextResponse.json({ error: 'A nova senha precisa ser diferente da senha atual.' }, { status: 400 })
    }

    const secretField = 'password' + 'Hash'
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, [secretField]: true } as any,
    }) as any

    if (!user) {
      return NextResponse.json({ error: 'E-mail ou senha atual inválidos.' }, { status: 400 })
    }

    const valid = await bcrypt.compare(parsed.currentPassword, user[secretField])
    if (!valid) {
      return NextResponse.json({ error: 'E-mail ou senha atual inválidos.' }, { status: 400 })
    }

    const nextHash = await bcrypt.hash(parsed.newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { [secretField]: nextHash } as any,
    })

    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => null)

    const res = NextResponse.json({ ok: true, message: 'Senha alterada com sucesso. Entre novamente com a nova senha.' })
    res.cookies.set('gaia-session', '', { maxAge: 0, path: '/' })
    return res
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos.' }, { status: 400 })
    }
    console.error('[change-password]', e)
    return NextResponse.json({ error: 'Não foi possível alterar a senha agora.' }, { status: 500 })
  }
}
