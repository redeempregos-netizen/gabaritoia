import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

const PUBLIC_ROUTES = ['/login', '/register', '/']
const ADMIN_ROUTES = ['/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const token = req.cookies.get('gaia-session')?.value

  // Rota pública — se já logado, redireciona pro dashboard
  if (isPublic) {
    if (token) {
      const session = await verifySession(token)
      if (session) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }
    return NextResponse.next()
  }

  // Rota protegida — verifica sessão
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const session = await verifySession(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('gaia-session')
    return res
  }

  // Rotas de admin — verifica role
  if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    if (session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  // Adiciona headers com dados do usuário para Server Components
  const res = NextResponse.next()
  res.headers.set('x-user-id', session.userId)
  res.headers.set('x-user-role', session.role)
  res.headers.set('x-user-plan', session.plan)
  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
}
