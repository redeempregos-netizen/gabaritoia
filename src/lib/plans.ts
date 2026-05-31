export const PLAN_FREE = 'FREE'
export const PLAN_CADERNOS_500 = 'CADERNOS_500'
export const PLAN_CADERNOS_QUESTOES = 'PRO'
export const PLAN_FULL = 'ENTERPRISE'

export function normalizePlan(plan?: string | null) {
  const value = String(plan || '').trim().toUpperCase()
  if (!value || value === 'TESTE' || value === 'TRIAL') return PLAN_FREE
  if (value === 'BASICO' || value === 'BÁSICO' || value === 'BASIC') return PLAN_CADERNOS_500
  if (value === 'PRO' || value === 'PROFISSIONAL') return PLAN_CADERNOS_QUESTOES
  if (value === 'PREMIUM' || value === 'FULL' || value === 'ENTERPRISE') return PLAN_FULL
  return value
}

export const PLAN_LABELS: Record<string, string> = {
  FREE: 'Teste',
  CADERNOS_500: 'Básico',
  PRO: 'Pro',
  ENTERPRISE: 'Premium',
}

export const PLAN_CREDIT_AMOUNT: Record<string, number> = {
  [PLAN_FREE]: 300,
  [PLAN_CADERNOS_500]: 1000,
  [PLAN_CADERNOS_QUESTOES]: 3000,
  [PLAN_FULL]: 8000,
}

export const PLAN_FEATURES: Record<string, string[]> = {
  FREE: ['Dashboard', 'Minha Conta', 'Gerar questões', 'Meus Gerados', '300 créditos'],
  [PLAN_CADERNOS_500]: ['Dashboard', 'Minha Conta', 'Gerar questões', 'Plano de questões básico', 'Meus Gerados', '1.000 créditos'],
  [PLAN_CADERNOS_QUESTOES]: ['Dashboard', 'Minha Conta', 'Gerar questões', 'Plano de questões completo', 'Cadernos PDF', 'Edital Verticalizado', 'Meus Gerados', '3.000 créditos'],
  [PLAN_FULL]: ['Todos os recursos', 'Cadernos PDF', 'Plano de questões completo', 'Gerador de questões', 'Edital Verticalizado', 'Edital Pro', 'Mapas Mentais', 'Meus Gerados', '8.000 créditos'],
}

export const PLAN_ALLOWED_ROUTES: Record<string, string[]> = {
  FREE: ['/dashboard', '/conta', '/gerar', '/gerados', '/em-breve'],
  [PLAN_CADERNOS_500]: ['/dashboard', '/conta', '/gerar', '/plano-questoes', '/gerados', '/em-breve'],
  [PLAN_CADERNOS_QUESTOES]: ['/dashboard', '/conta', '/cadernos', '/gerar', '/plano-questoes', '/edital', '/gerados', '/em-breve'],
  [PLAN_FULL]: ['/dashboard', '/conta', '/cadernos', '/gerar', '/plano-questoes', '/edital', '/edital-pro', '/mapas', '/gerados', '/historico', '/em-breve'],
}

export function isFreePlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_FREE
}

export function isCadernosOnlyPlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_CADERNOS_500
}

export function isCadernosQuestoesPlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_CADERNOS_QUESTOES
}

export function isFullPlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_FULL
}

export function isLimitedPlan(plan?: string | null) {
  const normalized = normalizePlan(plan)
  return normalized === PLAN_FREE || normalized === PLAN_CADERNOS_500 || normalized === PLAN_CADERNOS_QUESTOES
}

export function getPlanLabel(plan?: string | null) {
  const normalized = normalizePlan(plan)
  return PLAN_LABELS[normalized] || plan || 'Teste'
}

export function getPlanFeatures(plan?: string | null) {
  const normalized = normalizePlan(plan)
  return PLAN_FEATURES[normalized] || PLAN_FEATURES[PLAN_FREE]
}

export function getDefaultRouteForPlan(plan?: string | null) {
  return '/dashboard'
}

export function canAccessRoute(plan: string | undefined | null, pathname: string) {
  const normalized = normalizePlan(plan)
  if (!PLAN_ALLOWED_ROUTES[normalized]) return true
  return PLAN_ALLOWED_ROUTES[normalized].some(route => pathname === route || pathname.startsWith(route + '/'))
}
