export type Role = 'USER' | 'ADMIN'
export type Plan = 'FREE' | 'PRO'
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE'
export type AIProvider = 'claude' | 'openai' | 'gemini' | 'grok' | 'openrouter'
export type Difficulty = 'Fácil' | 'Média' | 'Difícil'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  plan: Plan
  streak: number
  lastStudyAt?: string
  createdAt: string
}

export interface Question {
  id?: string
  banca: string
  area: string
  subtopic?: string
  cargo?: string
  education?: string
  difficulty: Difficulty
  type: QuestionType
  format: string
  enunciado: string
  options: string[]
  correctIndex: number
  comentario: string
  isOriginal?: boolean
  fromEdital?: boolean
  aiProvider?: AIProvider
}

export interface Answer {
  id: string
  questionId: string
  isCorrect: boolean
  selectedIdx: number
  createdAt: string
  question: Question
}

export interface StudyDay {
  dia: string
  date: string
  materia: string
  subtema: string
  tipo: string
  horas: number
  meta_questoes: number
  descanso: boolean
}

export interface StudyWeek {
  semana: number
  titulo: string
  dias: StudyDay[]
}

export interface Flashcard {
  topico: string
  pergunta: string
  resposta: string
  fonte: string
  armadilha: string
}

export interface BancaInfo {
  nome: string
  estilo: string
  pegadinhas: string
  foco: string
}

export interface StudyPlanData {
  banca: BancaInfo
  materias: Array<{ nome: string; peso: number; horas_sugeridas: number }>
  semanas: StudyWeek[]
  flashcards: Flashcard[]
}

export interface GenerateQuestionParams {
  banca: string
  area: string
  cargo?: string
  education?: string
  difficulty: Difficulty
  type: QuestionType
  format: string
  quantity: number
  provider?: AIProvider
}

export interface GeneratePlanParams {
  editalText: string
  cargo?: string
  examDate?: string
  hoursPerDay: string
  level: string
  provider?: AIProvider
}

export interface AdminStats {
  totalUsers: number
  totalAnswers: number
  totalPlans: number
  configuredApis: number
  todayAnswers: number
  weekAnswers: number
}

export interface ApiKeyConfig {
  provider: AIProvider
  isEnabled: boolean
  hasKey: boolean
  model: string
  lastTested?: string
  testStatus?: string
}
