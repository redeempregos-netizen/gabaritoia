export const PLAN_FREE = 'FREE'
export const PLAN_PACK = 'PACK'
export const PLAN_CADERNOS_500 = 'CADERNOS_500'
export const PLAN_CADERNOS_QUESTOES = 'PRO'
export const PLAN_FULL = 'ENTERPRISE'

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
  FREE: ['Todos os recursos por tempo limitado', 'Leitor PDF', 'Cadernos PDF', 'Plano de questões completo', 'Gerador de questões', 'Edital Verticalizado', 'Edital Pro', 'Mapas Mentais', 'Meus Gerados', 'Suporte', '300 créditos', '+20 créditos de bônus por dia'],
  PACK: ['Gerador de questões', 'Leitor PDF', 'Meus Gerados', 'Suporte', '1.000 créditos iniciais', '+20 créditos de bônus por dia', 'Acesso por 6 meses'],
  [PLAN_CADERNOS_500]: ['Dashboard', 'Minha Conta', 'Gerar questões', 'Leitor PDF', 'Plano de questões básico', 'Meus Gerados', 'Suporte', '1.000 créditos', 'Acesso mensal'],
  [PLAN_CADERNOS_QUESTOES]: ['Dashboard', 'Minha Conta', 'Gerar questões', 'Leitor PDF', 'Plano de questões completo', 'Cadernos PDF', 'Edital Verticalizado', 'Meus Gerados', 'Suporte', '3.000 créditos', 'Acesso trimestral'],
  [PLAN_FULL]: ['Todos os recursos', 'Leitor PDF', 'Cadernos PDF', 'Plano de questões completo', 'Gerador de questões', 'Edital Verticalizado', 'Edital Pro', 'Mapas Mentais', 'Meus Gerados', 'Suporte', '8.000 créditos', 'Acesso anual'],
}

export const PLAN_ALLOWED_ROUTES: Record<string, string[]> = {
  FREE: ['/dashboard', '/conta', '/cadernos', '/gerar', '/leitor-pdf', '/plano-questoes', '/edital', '/edital-pro', '/mapas', '/gerados', '/historico', '/suporte', '/em-breve'],
  PACK: ['/dashboard', '/conta', '/gerar', '/leitor-pdf', '/gerados', '/suporte', '/em-breve'],
  [PLAN_CADERNOS_500]: ['/dashboard', '/conta', '/gerar', '/leitor-pdf', '/plano-questoes', '/gerados', '/suporte', '/em-breve'],
  [PLAN_CADERNOS_QUESTOES]: ['/dashboard', '/conta', '/cadernos', '/gerar', '/leitor-pdf', '/plano-questoes', '/edital', '/gerados', '/suporte', '/em-breve'],
  [PLAN_FULL]: ['/dashboard', '/conta', '/cadernos', '/gerar', '/leitor-pdf', '/plano-questoes', '/edital', '/edital-pro', '/mapas', '/gerados', '/historico', '/suporte', '/em-breve'],
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
