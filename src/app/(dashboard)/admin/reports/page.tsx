import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS error_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_email TEXT,
      message TEXT NOT NULL,
      page TEXT,
      action TEXT,
      details_json JSONB,
      user_agent TEXT,
      url TEXT,
      admin_email TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export default async function AdminReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') redirect('/dashboard')

  await ensureTable()

  const reports = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, message, page, action, created_at AS "createdAt"
    FROM error_reports
    ORDER BY created_at DESC
    LIMIT 100
  `)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-200 mb-3">
          <AlertTriangle size={13} /> Administração
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Reports de Erro</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Últimos erros reportados pelos usuários dentro do GabaritoIA.</p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div>
            <div className="font-heading font-bold">Histórico recente</div>
            <div className="text-xs text-zinc-500 mt-1">{reports.length} report(s) encontrados</div>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="p-10 text-center text-zinc-500">Nenhum erro reportado ainda.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {reports.map(report => (
              <div key={report.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-zinc-100">{report.message}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {report.page || 'Página não informada'} · {report.action || 'Ação não informada'}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(report.createdAt).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
