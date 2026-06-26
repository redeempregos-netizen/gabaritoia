import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createPasswordResetToken } from '@/lib/password-reset'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const schema = z.object({
  email: z.string().email(),
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function shouldExposeDebugLink() {
  return process.env.PASSWORD_RESET_DEBUG_LINK === 'true'
}

async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, email
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1;
  `, normalized).catch(() => [])
  return rows?.[0] || null
}

async function sendResetEmail(to: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'missing_resend_key' }

  const from = process.env.ACCESS_EMAIL_FROM || 'GabaritoIA <onboarding@resend.dev>'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto">
      <h2>Redefinir senha do GabaritoIA</h2>
      <p>Recebemos uma solicitação para redefinir sua senha.</p>
      <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
      <p>Se o botão não abrir, copie e cole este link no navegador:</p>
      <p style="word-break:break-all;font-size:12px;color:#4b5563">${escapeHtml(url)}</p>
      <p>Este link expira em 2 horas.</p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Redefinir senha do GabaritoIA',
      html,
    }),
  })

  const body = await response.text().catch(() => '')
  if (!response.ok) {
    console.warn('[forgot password email not sent]', body)
    return { sent: false, reason: 'email_error', details: body.slice(0, 300) }
  }

  let emailId = ''
  try { emailId = JSON.parse(body)?.id || '' } catch {}
  return { sent: true, reason: 'accepted_by_resend', emailId }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req)
    const ipLimit = await checkRateLimit(ip, 'forgot_password')
    if (!ipLimit.allowed) {
      const minutes = Math.max(1, Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 60000))
      return NextResponse.json({ error: `Muitas tentativas. Tente novamente em ${minutes} min.` }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const { email } = schema.parse(body)
    const normalizedEmail = email.trim().toLowerCase()

    const emailLimit = await checkRateLimit(normalizedEmail, 'forgot_password')
    if (!emailLimit.allowed) {
      const minutes = Math.max(1, Math.ceil((emailLimit.resetAt.getTime() - Date.now()) / 60000))
      return NextResponse.json({ error: `Muitas tentativas. Tente novamente em ${minutes} min.` }, { status: 429 })
    }

    const user = await findUserByEmail(normalizedEmail)

    if (user) {
      const reset = await createPasswordResetToken(user.id, user.email)
      const emailResult = await sendResetEmail(user.email, reset.url)
      return NextResponse.json({
        ok: true,
        emailSent: emailResult.sent,
        reason: emailResult.reason,
        emailId: emailResult.emailId || undefined,
        debugResetUrl: shouldExposeDebugLink() ? reset.url : undefined,
        message: emailResult.sent
          ? 'O envio foi aceito pelo provedor de e-mail. Verifique caixa de entrada, spam e promoções. Se não chegar, confira os logs do Resend e o domínio remetente.'
          : 'A solicitação foi registrada, mas o envio automático de e-mail não está funcionando. Avise o suporte para configurar o envio de e-mails.',
      })
    }

    return NextResponse.json({
      ok: true,
      emailSent: true,
      message: 'Se este e-mail existir, enviaremos um link para redefinir a senha.',
    })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
    console.error('[forgot password]', e)
    return NextResponse.json({ error: 'Não foi possível solicitar recuperação de senha.' }, { status: 500 })
  }
}
