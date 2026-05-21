export type AIQueueStatus = {
  id: string
  action: string
  provider: string
  status: 'queued' | 'running' | 'done' | 'error' | 'stale'
  position: number
  running: number
  maxConcurrent: number
}

export async function createAIQueueJob(action: string, provider: string): Promise<AIQueueStatus> {
  const res = await fetch('/api/ai/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, provider }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro ao entrar na fila de IA')
  return data.job
}

export async function getAIQueueStatus(jobId: string): Promise<AIQueueStatus> {
  const res = await fetch(`/api/ai/queue?jobId=${encodeURIComponent(jobId)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro ao consultar fila de IA')
  return data.job
}
