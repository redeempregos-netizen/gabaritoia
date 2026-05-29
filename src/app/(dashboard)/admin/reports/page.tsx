import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AlertTriangle, Copy, Search } from 'lucide-react'

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

function safeText(value: unknown) {
  return String(value || '').trim()
}

export default async function AdminReportsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') redirect('/dashboard')

  await ensureTable()

  const q = safeText(Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q).toLowerCase()
  const pageFilter = safeText(Array.isArray(searchParams?.page) ? searchParams?.page[0] : searchParams?.page)
  const actionFilter = safeText(Array.isArray(searchParams?.action) ? searchParams?.action[0] : searchParams?.action)
  const period = safeText(Array.isArray(searchParams?.period) ? searchParams?.period[0] : searchParams?.period) || 'all'

  const reports = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      id,
      message,
      page,
      action,
      details_json AS details,
      url,
      user_email AS "userEmail",
      created_at AS "createdAt"
    FROM error_reports
    ORDER BY created_at DESC
    LIMIT 200
  `)

  const now = Date.now()
  const filtered = reports.filter(report => {
    const created = new Date(report.createdAt).getTime()
    if (period === '24h' && now - created > 24 * 60 * 60 * 1000) return false
    if (period === '7d' && now - created > 7 * 24 * 60 * 60 * 1000) return false
    if (pageFilter && report.page !== pageFilter) return false
    if (actionFilter && report.action !== actionFilter) return false
    if (q) {
      const haystack = `${report.message || ''} ${report.page || ''} ${report.action || ''} ${report.userEmail || ''} ${report.url || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const pages = Array.from(new Set(reports.map(r => safeText(r.page)).filter(Boolean))).sort()
  const actions = Array.from(new Set(reports.map(r => safeText(r.action)).filter(Boolean))).sort()
  const mostRecent = reports[0]?.createdAt ? new Date(reports[0].createdAt).toLocaleString('pt-BR') : 'Sem registros'

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-8 rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-200 mb-3">
          <AlertTriangle size={13} /> Administração
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Reports de Erro</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Últimos erros reportados pelos usuários dentro do GabaritoIA.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-xs text-zinc-500">Total carregado</div>
          <div className="font-heading text-2xl font-bold text-white">{reports.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-zinc-500">Filtrados</div>
          <div className="font-heading text-2xl font-bold text-red-300">{filtered.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-zinc-500">Mais recente</div>
          <div className="font-heading text-sm font-bold text-zinc-200 mt-1">{mostRecent}</div>
        </div>
      </div>

      <form className="card p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-red-300 uppercase tracking-wider"><Search size={14} /> Filtros</div>
        <div className="grid md:grid-cols-4 gap-3">
          <input name="q" defaultValue={q} className="input" placeholder="Buscar mensagem, email, página..." />
          <select name="page" defaultValue={pageFilter} className="input" style={{ colorScheme: 'dark' }}>
            <option value="">Todas as páginas</option>
            {pages.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select name="action" defaultValue={actionFilter} className="input" style={{ colorScheme: 'dark' }}>
            <option value="">Todas as ações</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select name="period" defaultValue={period} className="input" style={{ colorScheme: 'dark' }}>
            <option value="all">Todo período</option>
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 dias</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-sm" type="submit">Aplicar filtros</button>
          <a href="/admin/reports" className="btn-secondary text-sm">Limpar</a>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div>
            <div className="font-heading font-bold">Histórico recente</div>
            <div className="text-xs text-zinc-500 mt-1">Mostrando {filtered.length} de {reports.length} report(s)</div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-zinc-500">Nenhum erro encontrado com esses filtros.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map(report => {
              const details = report.details ? JSON.stringify(report.details, null, 2) : ''
              const copyText = [
                `Mensagem: ${report.message || ''}`,
                `Página: ${report.page || ''}`,
                `Ação: ${report.action || ''}`,
                `URL: ${report.url || ''}`,
                `Usuário: ${report.userEmail || ''}`,
                `Data: ${new Date(report.createdAt).toLocaleString('pt-BR')}`,
                details ? `Detalhes: ${details}` : '',
              ].filter(Boolean).join('\n')

              return (
                <details key={report.id} className="group">
                  <summary className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer list-none">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-zinc-100">{report.message}</div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {report.page || 'Página não informada'} · {report.action || 'Ação não informada'}
                          {report.userEmail ? ` · ${report.userEmail}` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(report.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="grid md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">URL</div><div className="text-zinc-300 break-all">{report.url || 'Não informado'}</div></div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-zinc-500 mb-1">Usuário</div><div className="text-zinc-300 break-all">{report.userEmail || 'Não informado'}</div></div>
                    </div>
                    {details && <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-300 whitespace-pre-wrap break-words">{details}</pre>}
                    <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-xs text-zinc-400">
                      <div className="flex items-center gap-2 text-zinc-300 mb-2"><Copy size={13} /> Conteúdo para copiar</div>
                      <pre className="whitespace-pre-wrap break-words">{copyText}</pre>
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
