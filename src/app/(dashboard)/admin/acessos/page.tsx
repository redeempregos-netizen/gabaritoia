import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { KeyRound, Clock, Mail, ShieldAlert } from 'lucide-react'

type AccessRow = {
  id: string
  email: string
  name: string | null
  plan: string
  checkout: string
  product_name: string | null
  purchase_id: string | null
  status: string
  expires_at: Date
  used_at: Date | null
  created_at: Date
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS purchase_access_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      plan TEXT NOT NULL,
      checkout TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      purchase_id TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP(3) NOT NULL,
      used_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => null)
}

function formatDate(value?: Date | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default async function AdminAcessosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  await ensureTable()

  const rows = await prisma.$queryRawUnsafe<AccessRow[]>(`
    SELECT id, email, name, plan, checkout, product_name, purchase_id, status, expires_at, used_at, created_at
    FROM purchase_access_tokens
    ORDER BY created_at DESC
    LIMIT 100;
  `)

  const pending = rows.filter(r => r.status === 'pending').length
  const used = rows.filter(r => r.status === 'used').length
  const canceled = rows.filter(r => r.status === 'canceled').length

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <KeyRound size={24} className="text-brand-400" /> Admin → Acessos
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Compras que geraram link de ativação pelo webhook da Cakto.</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 max-w-md">
          <ShieldAlert size={14} className="inline mr-1" /> Se o e-mail falhar, confira o log do webhook no Vercel/Cakto para copiar o link gerado.
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="text-xs text-zinc-500">Total</div><div className="font-heading text-2xl font-bold">{rows.length}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Pendentes</div><div className="font-heading text-2xl font-bold text-amber-300">{pending}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Usados</div><div className="font-heading text-2xl font-bold text-green-300">{used}</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500">Cancelados</div><div className="font-heading text-2xl font-bold text-red-300">{canceled}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-zinc-400">Nenhum acesso criado ainda.</div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now()
            return (
              <div key={row.id} className="card p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-bold text-white break-all flex items-center gap-2"><Mail size={14} className="text-brand-400" /> {row.email}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${row.status === 'used' ? 'bg-green-500/10 text-green-300 border-green-500/20' : row.status === 'canceled' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>{row.status}</span>
                      {expired && row.status === 'pending' && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-300 border border-red-500/20">expirado</span>}
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-zinc-400">
                      <div>Nome: <span className="text-zinc-200">{row.name || '-'}</span></div>
                      <div>Plano: <span className="text-zinc-200">{row.plan}</span></div>
                      <div>Checkout: <span className="text-zinc-200">{row.checkout}</span></div>
                      <div>Produto: <span className="text-zinc-200">{row.product_name || '-'}</span></div>
                      <div className="flex items-center gap-1"><Clock size={12} /> Criado: <span className="text-zinc-200">{formatDate(row.created_at)}</span></div>
                      <div>Expira: <span className="text-zinc-200">{formatDate(row.expires_at)}</span></div>
                      <div>Usado: <span className="text-zinc-200">{formatDate(row.used_at)}</span></div>
                      <div>Pedido: <span className="text-zinc-200 break-all">{row.purchase_id || '-'}</span></div>
                    </div>
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
