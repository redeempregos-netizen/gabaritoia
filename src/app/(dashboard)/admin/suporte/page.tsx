import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { HelpCircle, User, Clock, Bug } from 'lucide-react'

type SupportReport = {
  id: string
  user_id: string | null
  user_email: string | null
  message: string
  page: string | null
  action: string | null
  user_agent: string | null
  url: string | null
  admin_email: string
  created_at: Date
}

async function ensureSupportTable() {
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

function formatDate(value: Date) {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function getMessageType(report: SupportReport) {
  const message = String(report.message || '')
  if (message.startsWith('[Bug]')) return 'Bug'
  if (message.startsWith('[Dúvida]')) return 'Dúvida'
  if (message.startsWith('[Problema de acesso]')) return 'Acesso'
  if (message.startsWith('[Sugestão]')) return 'Sugestão'
  if (report.action?.includes('bug')) return 'Bug'
  return 'Mensagem'
}

function cleanMessage(message: string) {
  return message.replace(/^\[(Bug|Dúvida|Problema de acesso|Sugestão)\]\s*/i, '')
}

export default async function AdminSuportePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  await ensureSupportTable()

  const reports = await prisma.$queryRawUnsafe<SupportReport[]>(`
    SELECT id, user_id, user_email, message, page, action, user_agent, url, admin_email, created_at
    FROM error_reports
    ORDER BY created_at DESC
    LIMIT 100
  `)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <HelpCircle size={24} className="text-brand-400" /> Admin → Suporte
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Mensagens enviadas pelos usuários pelo menu Suporte e relatórios de erro do sistema.</p>
        </div>
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          Mesmo se o e-mail falhar, as mensagens aparecem aqui.
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-zinc-500 mb-1">Total exibido</div>
          <div className="font-heading text-2xl font-bold">{reports.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-zinc-500 mb-1">Bugs</div>
          <div className="font-heading text-2xl font-bold text-red-300">{reports.filter(r => getMessageType(r) === 'Bug').length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-zinc-500 mb-1">Dúvidas e outros</div>
          <div className="font-heading text-2xl font-bold text-brand-300">{reports.filter(r => getMessageType(r) !== 'Bug').length}</div>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-semibold text-zinc-100">Nenhuma mensagem recebida ainda.</div>
          <p className="text-sm text-zinc-500 mt-1">Quando um usuário enviar pelo Suporte, vai aparecer aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const type = getMessageType(report)
            const isBug = type === 'Bug'
            return (
              <div key={report.id} className="card p-5 border-white/[0.08]">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isBug ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-brand-500/10 text-brand-300 border border-brand-500/20'}`}>
                        {isBug ? <Bug size={12} /> : <HelpCircle size={12} />}
                        {type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Clock size={12} /> {formatDate(report.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <User size={14} className="text-zinc-500" />
                      <span className="truncate">{report.user_email || 'Usuário não identificado'}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 md:text-right">
                    <div>Página: {report.page || '-'}</div>
                    <div>Ação: {report.action || '-'}</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
                  {cleanMessage(report.message)}
                </div>

                <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-black/20 border border-white/10 p-3 min-w-0">
                    <div className="text-zinc-500 mb-1">URL</div>
                    <div className="text-zinc-300 break-all">{report.url || 'Não informada'}</div>
                  </div>
                  <div className="rounded-xl bg-black/20 border border-white/10 p-3 min-w-0">
                    <div className="text-zinc-500 mb-1">Navegador</div>
                    <div className="text-zinc-300 break-all">{report.user_agent || 'Não informado'}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
