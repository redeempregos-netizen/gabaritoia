import { prisma } from './prisma'

const AI_MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT || 3)
const AI_QUEUE_WAIT_MS = Number(process.env.AI_QUEUE_WAIT_MS || 45000)
const AI_JOB_STALE_MINUTES = Number(process.env.AI_JOB_STALE_MINUTES || 6)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function ensureAIQueueTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ai_queue_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP(3),
      finished_at TIMESTAMP(3)
    );
  `)
  await prisma.$executeRawUnsafe(`ALTER TABLE ai_queue_jobs ADD COLUMN IF NOT EXISTS user_id TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE ai_queue_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP(3);`)
  await prisma.$executeRawUnsafe(`ALTER TABLE ai_queue_jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP(3);`)
}

async function cleanupStaleJobs() {
  await ensureAIQueueTable()
  await prisma.$executeRawUnsafe(
    `UPDATE ai_queue_jobs
     SET status = 'stale', finished_at = CURRENT_TIMESTAMP
     WHERE status IN ('running', 'queued')
     AND COALESCE(started_at, created_at) < NOW() - ($1 || ' minutes')::interval`,
    String(AI_JOB_STALE_MINUTES)
  )
}

export async function createAIQueueJob(opts: { userId: string; action: string; provider: string }) {
  await cleanupStaleJobs()
  const id = crypto.randomUUID()
  await prisma.$executeRawUnsafe(
    `INSERT INTO ai_queue_jobs (id, user_id, action, provider, status, created_at)
     VALUES ($1, $2, $3, $4, 'queued', CURRENT_TIMESTAMP)`,
    id, opts.userId, opts.action || 'unknown', opts.provider || 'unknown'
  )
  return getAIQueueStatus(id, opts.userId)
}

export async function getAIQueueStatus(jobId: string, userId?: string) {
  await cleanupStaleJobs()
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT id, user_id, action, provider, status, created_at, started_at, finished_at
     FROM ai_queue_jobs
     WHERE id = $1
     LIMIT 1`,
    jobId
  )
  const job = rows[0]
  if (!job) return null
  if (userId && job.user_id && job.user_id !== userId) return null

  const running = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ai_queue_jobs WHERE status = 'running'`
  )

  let position = 0
  if (job.status === 'queued') {
    const pos = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count
       FROM ai_queue_jobs
       WHERE status = 'queued'
       AND created_at <= $1`,
      job.created_at
    )
    position = pos[0]?.count || 1
  }

  const isRunning = job.status === 'running'
  const startedAt = job.started_at || job.created_at
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0

  return {
    id: job.id,
    action: job.action,
    provider: job.provider,
    // Enquanto a IA está processando, mantemos status visual como queued para evitar a tela parada em
    // “Sua vez chegou. Gerando...”. A requisição principal continua rodando normalmente no backend.
    status: isRunning ? 'queued' : job.status,
    processing: isRunning,
    position: isRunning ? 1 : position,
    running: running[0]?.count || 0,
    maxConcurrent: AI_MAX_CONCURRENT,
    elapsedSeconds,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  }
}

export async function acquireAISlot(action: string, provider: string, queueJobId?: string): Promise<string> {
  await cleanupStaleJobs()
  const jobId = queueJobId || crypto.randomUUID()

  if (!queueJobId) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ai_queue_jobs (id, action, provider, status, created_at)
       VALUES ($1, $2, $3, 'queued', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      jobId, action || 'unknown', provider || 'unknown'
    )
  }

  const deadline = Date.now() + AI_QUEUE_WAIT_MS

  while (Date.now() < deadline) {
    await cleanupStaleJobs()

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, status, created_at FROM ai_queue_jobs WHERE id = $1 LIMIT 1`,
      jobId
    )
    const job = rows[0]
    if (!job) throw new Error('Job da fila não encontrado. Tente novamente.')
    if (!['queued', 'running'].includes(job.status)) {
      throw new Error('Este job da fila não está mais disponível. Tente novamente.')
    }
    if (job.status === 'running') return jobId

    const running = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM ai_queue_jobs WHERE status = 'running'`
    )
    const olderQueued = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count
       FROM ai_queue_jobs
       WHERE status = 'queued'
       AND created_at < $1`,
      job.created_at
    )

    if ((running[0]?.count || 0) < AI_MAX_CONCURRENT && (olderQueued[0]?.count || 0) === 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE ai_queue_jobs
         SET status = 'running', started_at = CURRENT_TIMESTAMP, action = COALESCE(action, $2), provider = COALESCE(provider, $3)
         WHERE id = $1 AND status = 'queued'`,
        jobId, action || 'unknown', provider || 'unknown'
      )
      return jobId
    }

    await sleep(900)
  }

  throw new Error('A fila de IA está cheia no momento. Aguarde alguns segundos e tente novamente.')
}

export async function releaseAISlot(jobId?: string, status: 'done' | 'error' = 'done') {
  if (!jobId) return
  try {
    await ensureAIQueueTable()
    await prisma.$executeRawUnsafe(
      `UPDATE ai_queue_jobs SET status = $2, finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
      jobId, status
    )
  } catch (e) {
    console.error('[AI queue release error]', e)
  }
}
