import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createAIQueueJob, getAIQueueStatus } from '@/lib/aiQueue'

const createSchema = z.object({
  action: z.string().optional(),
  provider: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const params = createSchema.parse(body)
    const status = await createAIQueueJob({
      userId: session.userId,
      action: params.action || 'unknown',
      provider: params.provider || 'unknown',
    })
    return NextResponse.json({ ok: true, job: status })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    return NextResponse.json({ error: (e as Error).message || 'Erro ao criar job na fila.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId obrigatório.' }, { status: 400 })

  const status = await getAIQueueStatus(jobId, session.userId)
  if (!status) return NextResponse.json({ error: 'Job não encontrado.' }, { status: 404 })

  return NextResponse.json({ ok: true, job: status })
}
