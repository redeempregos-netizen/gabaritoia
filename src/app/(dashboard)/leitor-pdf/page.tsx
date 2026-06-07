'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, FileText, Maximize2, Download, AlertTriangle, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'

type DriveInfo = {
  fileId: string
  previewUrl: string
  downloadUrl: string
  openUrl: string
}

function extractDriveFileId(value: string) {
  const input = value.trim()
  if (!input) return ''

  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/i,
    /drive\.google\.com\/open\?id=([^&]+)/i,
    /drive\.google\.com\/uc\?id=([^&]+)/i,
    /docs\.google\.com\/[^/]+\/d\/([^/]+)/i,
    /[?&]id=([^&]+)/i,
  ]

  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match?.[1]) return decodeURIComponent(match[1])
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input
  return ''
}

function buildDriveInfo(fileId: string): DriveInfo {
  return {
    fileId,
    previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    openUrl: `https://drive.google.com/file/d/${fileId}/view`,
  }
}

export default function LeitorPdfPage() {
  const [link, setLink] = useState('')
  const [fileId, setFileId] = useState('')
  const [isFull, setIsFull] = useState(false)

  const drive = useMemo(() => fileId ? buildDriveInfo(fileId) : null, [fileId])

  function carregarPdf(e?: React.FormEvent) {
    e?.preventDefault()
    const id = extractDriveFileId(link)
    if (!id) {
      toast.error('Não consegui identificar o ID do arquivo do Google Drive.')
      return
    }
    setFileId(id)
    toast.success('PDF carregado no leitor.')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <FileText size={13} /> Leitor PDF
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Ler PDF do Google Drive</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">
          Cole o link compartilhado do arquivo PDF do Google Drive para abrir dentro do GabaritoIA. O arquivo precisa estar compartilhado para visualização.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <form onSubmit={carregarPdf} className="grid lg:grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label">Link do PDF no Google Drive</label>
            <div className="relative">
              <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className="input pl-10"
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/ID_DO_ARQUIVO/view"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary h-11 self-end px-6">
            Carregar PDF
          </button>
        </form>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            Para funcionar, o arquivo precisa estar com permissão de visualização no Google Drive. Arquivos privados só abrem se a pessoa estiver logada no Google com acesso autorizado.
          </div>
        </div>
      </div>

      {drive && (
        <div className={isFull ? 'fixed inset-0 z-50 bg-zinc-950 p-2 md:p-4' : 'card p-3 md:p-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="font-heading font-bold text-white">PDF carregado</div>
              <div className="text-xs text-zinc-500 truncate">ID: {drive.fileId}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setIsFull(v => !v)} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                <Maximize2 size={14} /> {isFull ? 'Sair da tela cheia' : 'Tela cheia'}
              </button>
              <a href={drive.openUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                <ExternalLink size={14} /> Abrir no Drive
              </a>
              <a href={drive.downloadUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs">
                <Download size={14} /> Baixar
              </a>
            </div>
          </div>

          <div className={isFull ? 'h-[calc(100vh-86px)] rounded-2xl overflow-hidden border border-white/10 bg-black' : 'h-[72vh] min-h-[520px] rounded-2xl overflow-hidden border border-white/10 bg-black'}>
            <iframe
              title="Leitor PDF Google Drive"
              src={drive.previewUrl}
              className="w-full h-full border-0 bg-black"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  )
}
