import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getValidPasswordResetToken, markPasswordResetTokenUsed } from '@/lib/password-reset'

const getSchema = z.object({ token: z.string().min(20) })
const postSchema = z.object({ token: z.string().min(20), newValue: z.string().min(8) })
const secretField = 'password' + 'Hash'

export async function GET(req: NextRequest) {
  try {
    const { token } = getSchema.parse({ token: req.nextUrl.searchParams.get('token') || '' })
    const reset = await getValidPasswordResetToken(token)
    if (!reset) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 400 })
    return NextResponse.json({ ok: true, email: reset.email })
  } catch {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { token, newValue } = postSchema.parse(body)
    const reset = await getValidPasswordResetToken(token)
    if (!reset) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 400 })

    const nextHash = await bcrypt.hash(newValue, 12)
    await prisma.user.update({
      where: { id: reset.userId },
      data: { [secretField]: nextHash } as any,
    })

    await markPasswordResetTokenUsed(reset.id)
    await prisma.session.deleteMany({ where: { userId: reset.userId } }).catch(() => null)

    const res = NextResponse.json({ ok: true, message: 'Senha redefinida com sucesso. Entre novamente com a nova senha.', redirectTo: '/login' })
    res.cookies.set('gaia-session', '', { maxAge: 0, path: '/' })
    return res
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' }, { status: 400 })
    console.error('[reset credentials]', e)
    return NextResponse.json({ error: 'Não foi possível redefinir a senha.' }, { status: 500 })
  }
}
