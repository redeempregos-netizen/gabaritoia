export const PLAN_CADERNOS_500 = 'CADERNOS_500'
export const PLAN_FREE = 'FREE'

export const PLAN_LABELS: Record<string, string> = {
  FREE: 'Grátis',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
  [PLAN_CADERNOS_500]: 'Cadernos 500',
}

export const PLAN_CREDIT_AMOUNT: Record<string, number> = {
  [PLAN_CADERNOS_500]: 500,
}

export const PLAN_ALLOWED_ROUTES: Record<string, string[]> = {
  FREE: [
    '/dashboard',
    '/planos',
  ],
  [PLAN_CADERNOS_500]: [
    '/dashboard',
    '/cadernos',
    '/gerados',
    '/planos',
  ],
}

export function isFreePlan(plan?: string | null) {
  return !plan || plan === PLAN_FREE
}

export function isCadernosOnlyPlan(plan?: string | null) {
  return plan === PLAN_CADERNOS_500
}

export function isLimitedPlan(plan?: string | null) {
  return isFreePlan(plan) || isCadernosOnlyPlan(plan)
}

export function getPlanLabel(plan?: string | null) {
  return PLAN_LABELS[plan || ''] || plan || 'Grátis'
}

export function getDefaultRouteForPlan(plan?: string | null) {
  if (isCadernosOnlyPlan(plan)) return '/cadernos'
  return '/dashboard'
}

export function canAccessRoute(plan: string | undefined | null, pathname: string) {
  if (!plan || !PLAN_ALLOWED_ROUTES[plan]) return true
  return PLAN_ALLOWED_ROUTES[plan].some(route => pathname === route || pathname.startsWith(route + '/'))
}
