export const PLAN_FREE = 'FREE'
export const PLAN_PACK = 'PACK'
export const PLAN_CADERNOS_500 = 'CADERNOS_500'
export const PLAN_CADERNOS_QUESTOES = 'PRO'
export const PLAN_FULL = 'ENTERPRISE'

const ALL_ROUTES = ['/dashboard', '/conta', '/cadernos', '/gerar', '/leitor-pdf', '/plano-questoes', '/edital', '/edital-pro', '/mapas', '/gerados', '/historico', '/suporte', '/em-breve']
const ALL_FEATURES = ['Todos os recursos', 'Leitor PDF', 'Cadernos PDF', 'Plano de questoes completo', 'Gerador de questoes', 'Edital Verticalizado', 'Edital Pro', 'Mapas Mentais', 'Historico', 'Meus Gerados', 'Suporte']

export function normalizePlan(plan?: string | null) {
  const value = String(plan || '').trim().toUpperCase()
  if (!value || value === 'TESTE' || value === 'TRIAL') return PLAN_FREE
  if (value === 'PACK' || value === 'PLANO PACK' || value === 'PACK_IA') return PLAN_PACK
  if (value === 'MENSAL' || value === 'BASICO' || value === 'BÁSICO' || value === 'BASIC') return PLAN_CADERNOS_500
  if (value === 'TRIMESTRAL' || value === 'TRIMESTRE' || value === 'SEMESTRAL' || value === 'PRO' || value === 'PROFISSIONAL') return PLAN_CADERNOS_QUESTOES
  if (value === 'ANUAL' || value === 'PREMIUM' || value === 'FULL' || value === 'ENTERPRISE') return PLAN_FULL
  return value
}

export const PLAN_LABELS: Record<string, string> = {
  FREE: 'Teste',
  PACK: 'Plano Pack',
  CADERNOS_500: 'Mensal',
  PRO: 'Trimestral',
  ENTERPRISE: 'Anual',
}

export const PLAN_CREDIT_AMOUNT: Record<string, number> = {
  [PLAN_FREE]: 300,
  [PLAN_PACK]: 1000,
  [PLAN_CADERNOS_500]: 1000,
  [PLAN_CADERNOS_QUESTOES]: 3000,
  [PLAN_FULL]: 8000,
}

export const PLAN_DAILY_BONUS_AMOUNT: Record<string, number> = {
  [PLAN_FREE]: 20,
  [PLAN_PACK]: 20,
  [PLAN_CADERNOS_500]: 20,
  [PLAN_CADERNOS_QUESTOES]: 20,
  [PLAN_FULL]: 20,
}

export const PLAN_FEATURES: Record<string, string[]> = {
  FREE: [...ALL_FEATURES, '300 creditos', '+20 creditos de bonus por dia', 'Tempo limitado'],
  PACK: [...ALL_FEATURES, '1.000 creditos iniciais', '+20 creditos de bonus por dia', 'Acesso por 6 meses'],
  [PLAN_CADERNOS_500]: [...ALL_FEATURES, '1.000 creditos', 'Acesso mensal'],
  [PLAN_CADERNOS_QUESTOES]: [...ALL_FEATURES, '3.000 creditos', 'Acesso trimestral'],
  [PLAN_FULL]: [...ALL_FEATURES, '8.000 creditos', 'Acesso anual'],
}

export const PLAN_ALLOWED_ROUTES: Record<string, string[]> = {
  FREE: ALL_ROUTES,
  PACK: ALL_ROUTES,
  [PLAN_CADERNOS_500]: ALL_ROUTES,
  [PLAN_CADERNOS_QUESTOES]: ALL_ROUTES,
  [PLAN_FULL]: ALL_ROUTES,
}

export function isFreePlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_FREE
}

export function isPackPlan(plan?: string | null) {
  return normalizePlan(plan) === PLAN_PACK
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
  return normalized === PLAN_FREE || normalized === PLAN_PACK || normalized === PLAN_CADERNOS_500 || normalized === PLAN_CADERNOS_QUESTOES
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
