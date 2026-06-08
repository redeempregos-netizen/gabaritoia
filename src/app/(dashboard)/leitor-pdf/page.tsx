'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileText, Maximize2, Download, AlertTriangle, Link as LinkIcon, Upload } from 'lucide-react'
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
  const [localPdfUrl, setLocalPdfUrl] = useState('')
  const [localFileName, setLocalFileName] = useState('')
  const [isFull, setIsFull] = useState(false)

  const drive = useMemo(() => fileId ? buildDriveInfo(fileId) : null, [fileId])
  const readerSrc = localPdfUrl || drive?.previewUrl || ''
  const readerTitle = localFileName || (drive ? 'PDF do Google Drive' : '')

  useEffect(() => {
    return () => {
      if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
    }
  }, [localPdfUrl])

  function carregarPdf(e?: React.FormEvent) {
    e?.preventDefault()
    const id = extractDriveFileId(link)
    if (!id) {
      toast.error('Não consegui identificar o ID do arquivo do Google Drive.')
      return
    }
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
    setLocalPdfUrl('')
    setLocalFileName('')
    setFileId(id)
    toast.success('PDF do Drive carregado no leitor.')
  }

  function carregarArquivo(file?: File) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Envie apenas arquivo PDF.')
      return
    }
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
    const url = URL.createObjectURL(file)
    setLocalPdfUrl(url)
    setLocalFileName(file.name)
    setFileId('')
    setLink('')
    toast.success('PDF enviado e carregado no leitor.')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <FileText size={13} /> Leitor PDF
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Ler PDF</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">
          Envie um arquivo PDF do seu dispositivo ou cole um link compartilhado do Google Drive para abrir dentro do GabaritoIA.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-6 text-center hover:border-brand-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('pdf-local-file')?.click()}>
            <Upload size={30} className="mx-auto mb-3 text-brand-300" />
            <div className="font-heading font-bold text-white">Enviar PDF do dispositivo</div>
            <p className="text-xs text-zinc-500 mt-1">Clique aqui para selecionar um PDF no celular ou computador.</p>
            <button type="button" className="btn-primary mt-4 px-5 py-2 text-xs">Selecionar PDF</button>
          </div>
          <input
            id="pdf-local-file"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={e => {
              carregarArquivo(e.target.files?.[0])
              e.currentTarget.value = ''
            }}
          />
        </div>

        <div className="card p-5 space-y-4">
          <form onSubmit={carregarPdf} className="space-y-3">
            <div>
              <label className="label">Ou cole o link do PDF no Google Drive</label>
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
            <button type="submit" className="btn-secondary h-11 px-6">
              Carregar do Drive
            </button>
          </form>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              No Drive, o arquivo precisa estar com permissão de visualização. Para evitar problema de permissão, use a opção de enviar o PDF direto do dispositivo.
            </div>
          </div>
        </div>
      </div>

      {readerSrc && (
        <div className={isFull ? 'fixed inset-0 z-50 bg-zinc-950 p-2 md:p-4' : 'card p-3 md:p-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="font-heading font-bold text-white">PDF carregado</div>
              <div className="text-xs text-zinc-500 truncate">{readerTitle}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setIsFull(v => !v)} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                <Maximize2 size={14} /> {isFull ? 'Sair da tela cheia' : 'Tela cheia'}
              </button>
              {drive && (
                <>
                  <a href={drive.openUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                    <ExternalLink size={14} /> Abrir no Drive
                  </a>
                  <a href={drive.downloadUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs">
                    <Download size={14} /> Baixar
                  </a>
                </>
              )}
            </div>
          </div>

          <div className={isFull ? 'h-[calc(100vh-86px)] rounded-2xl overflow-hidden border border-white/10 bg-black' : 'h-[72vh] min-h-[520px] rounded-2xl overflow-hidden border border-white/10 bg-black'}>
            <iframe
              title="Leitor PDF"
              src={readerSrc}
              className="w-full h-full border-0 bg-black"
            />
          </div>
        </div>
      )}
    </div>
  )
}
