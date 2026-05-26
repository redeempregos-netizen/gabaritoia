export const PLAN_FREE = 'FREE'
export const PLAN_CADERNOS_500 = 'CADERNOS_500'
export const PLAN_CADERNOS_QUESTOES = 'PRO'
export const PLAN_FULL = 'ENTERPRISE'

export const PLAN_LABELS: Record<string, string> = {
  FREE: 'Sem acesso',
  PRO: 'Cadernos + Questões',
  ENTERPRISE: 'Full',
  [PLAN_CADERNOS_500]: 'Cadernos PDF',
}

export const PLAN_CREDIT_AMOUNT: Record<string, number> = {
  [PLAN_CADERNOS_500]: 500,
  [PLAN_CADERNOS_QUESTOES]: 1000,
  [PLAN_FULL]: 3000,
}

export const PLAN_ALLOWED_ROUTES: Record<string, string[]> = {
  FREE: [
    '/dashboard',
    '/planos',
    '/cadernos',
  ],
  [PLAN_CADERNOS_500]: [
    '/dashboard',
    '/cadernos',
    '/plano-questoes',
    '/gerados',
    '/planos',
  ],
  [PLAN_CADERNOS_QUESTOES]: [
    '/dashboard',
    '/cadernos',
    '/gerar',
    '/plano-questoes',
    '/historico',
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

export function isCadernosQuestoesPlan(plan?: string | null) {
  return plan === PLAN_CADERNOS_QUESTOES
}

export function isFullPlan(plan?: string | null) {
  return plan === PLAN_FULL
}

export function isLimitedPlan(plan?: string | null) {
  return isFreePlan(plan) || isCadernosOnlyPlan(plan) || isCadernosQuestoesPlan(plan)
}

export function getPlanLabel(plan?: string | null) {
  return PLAN_LABELS[plan || ''] || plan || 'Sem acesso'
}

export function getDefaultRouteForPlan(plan?: string | null) {
  if (isCadernosOnlyPlan(plan)) return '/cadernos'
  if (isCadernosQuestoesPlan(plan)) return '/dashboard'
  if (isFullPlan(plan)) return '/dashboard'
  return '/planos'
}

export function canAccessRoute(plan: string | undefined | null, pathname: string) {
  if (!plan || !PLAN_ALLOWED_ROUTES[plan]) return true
  return PLAN_ALLOWED_ROUTES[plan].some(route => pathname === route || pathname.startsWith(route + '/'))
}
