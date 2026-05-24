import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { canAccessRoute, getDefaultRouteForPlan, isLimitedPlan } from '@/lib/plans'

const PUBLIC_ROUTES = ['/login', '/register', '/']
const ADMIN_ROUTES = ['/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const token = req.cookies.get('gaia-session')?.value

  if (isPublic) {
    if (token) {
      const session = await verifySession(token)
      if (session) {
        return NextResponse.redirect(new URL(getDefaultRouteForPlan(session.plan), req.url))
      }
    }
    return NextResponse.next()
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const session = await verifySession(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('gaia-session')
    return res
  }

  if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    if (session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  if (session.role !== 'ADMIN' && isLimitedPlan(session.plan) && !canAccessRoute(session.plan, pathname)) {
    return NextResponse.redirect(new URL(getDefaultRouteForPlan(session.plan), req.url))
  }

  const res = NextResponse.next()
  res.headers.set('x-user-id', session.userId)
  res.headers.set('x-user-role', session.role)
  res.headers.set('x-user-plan', session.plan)
  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
}
