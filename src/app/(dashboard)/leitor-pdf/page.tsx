'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, Maximize2, Download, AlertTriangle, Link as LinkIcon, Upload, ZoomIn, ZoomOut } from 'lucide-react'
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
  const [localFileName, setLocalFileName] = useState('')
  const [localPdfBuffer, setLocalPdfBuffer] = useState<ArrayBuffer | null>(null)
  const [localPdfUrl, setLocalPdfUrl] = useState('')
  const [rendering, setRendering] = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [isFull, setIsFull] = useState(false)
  const pdfContainerRef = useRef<HTMLDivElement | null>(null)

  const drive = useMemo(() => fileId ? buildDriveInfo(fileId) : null, [fileId])
  const hasLocalPdf = !!localPdfBuffer
  const readerTitle = localFileName || (drive ? 'PDF do Google Drive' : '')

  useEffect(() => {
    return () => {
      if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
    }
  }, [localPdfUrl])

  useEffect(() => {
    if (!localPdfBuffer || !pdfContainerRef.current) return
    const pdfData = localPdfBuffer.slice(0)
    let cancelled = false

    async function renderPdf() {
      const container = pdfContainerRef.current
      if (!container) return
      setRendering(true)
      setTotalPages(0)
      container.innerHTML = ''

      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
        const pdf = await pdfjs.getDocument({ data: pdfData }).promise
        if (cancelled) return
        setTotalPages(pdf.numPages)

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return
          const page = await pdf.getPage(pageNumber)
          const viewportBase = page.getViewport({ scale: 1 })
          const availableWidth = Math.max(280, Math.min((container.clientWidth || window.innerWidth) - 24, 980))
          const scale = Math.max(0.75, Math.min(2.8, (availableWidth / viewportBase.width) * zoom))
          const viewport = page.getViewport({ scale })

          const wrapper = document.createElement('div')
          wrapper.className = 'mb-4 rounded-2xl overflow-hidden bg-white shadow-lg mx-auto'
          wrapper.style.width = `${viewport.width}px`
          wrapper.style.maxWidth = '100%'

          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) continue

          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          wrapper.appendChild(canvas)
          container.appendChild(wrapper)

          await page.render({ canvasContext: context, viewport }).promise
        }
      } catch (e) {
        console.error('[pdf mobile render]', e)
        toast.error('Não consegui abrir este PDF. Tente outro PDF pesquisável ou abra pelo Drive.')
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    void renderPdf()
    return () => { cancelled = true }
  }, [localPdfBuffer, zoom, isFull])

  function carregarPdf(e?: React.FormEvent) {
    e?.preventDefault()
    const id = extractDriveFileId(link)
    if (!id) {
      toast.error('Não consegui identificar o ID do arquivo do Google Drive.')
      return
    }
    setLocalPdfBuffer(null)
    setLocalFileName('')
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
    setLocalPdfUrl('')
    setFileId(id)
    toast.success('PDF do Drive carregado no leitor.')
  }

  async function carregarArquivo(file?: File) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Envie apenas arquivo PDF.')
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      if (localPdfUrl) URL.revokeObjectURL(localPdfUrl)
      const url = URL.createObjectURL(file)
      setLocalPdfUrl(url)
      setLocalPdfBuffer(buffer)
      setLocalFileName(file.name)
      setFileId('')
      setLink('')
      setZoom(1)
      toast.success('PDF enviado. Abrindo em modo compatível com celular...')
    } catch {
      toast.error('Não consegui ler este arquivo PDF.')
    }
  }

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-zinc-900 to-zinc-950 p-5 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 mb-3">
          <FileText size={13} /> Leitor PDF
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Ler PDF</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl">
          Envie um arquivo PDF do seu celular/computador. No mobile, o PDF é renderizado página por página para ficar mais compatível e legível.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-6 text-center hover:border-brand-500/40 transition-colors cursor-pointer" onClick={() => document.getElementById('pdf-local-file')?.click()}>
            <Upload size={30} className="mx-auto mb-3 text-brand-300" />
            <div className="font-heading font-bold text-white">Enviar PDF do dispositivo</div>
            <p className="text-xs text-zinc-500 mt-1">Melhor opção para celular. O arquivo abre dentro da plataforma.</p>
            <button type="button" className="btn-primary mt-4 px-5 py-2 text-xs">Selecionar PDF</button>
          </div>
          <input
            id="pdf-local-file"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={e => {
              void carregarArquivo(e.target.files?.[0])
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
              No celular, o Drive pode falhar dependendo da permissão ou do navegador. Para melhor leitura, baixe o PDF e envie pela opção do dispositivo.
            </div>
          </div>
        </div>
      </div>

      {(hasLocalPdf || drive) && (
        <div className={isFull ? 'fixed inset-0 z-50 bg-zinc-950 p-2 md:p-4 overflow-y-auto' : 'card p-3 md:p-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-md rounded-2xl p-2 border border-white/10">
            <div className="min-w-0">
              <div className="font-heading font-bold text-white">PDF carregado</div>
              <div className="text-xs text-zinc-500 truncate">{readerTitle}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasLocalPdf && (
                <>
                  <button onClick={() => setZoom(v => Math.max(0.75, Number((v - 0.15).toFixed(2))))} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                    <ZoomOut size={14} /> Menor
                  </button>
                  <button onClick={() => setZoom(v => Math.min(2.2, Number((v + 0.15).toFixed(2))))} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
                    <ZoomIn size={14} /> Maior
                  </button>
                  {localPdfUrl && <a href={localPdfUrl} download={localFileName || 'arquivo.pdf'} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Download size={14} /> Baixar</a>}
                </>
              )}
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

          {hasLocalPdf ? (
            <div className={isFull ? 'min-h-[calc(100vh-90px)] rounded-2xl overflow-y-auto border border-white/10 bg-zinc-900 p-2' : 'min-h-[520px] rounded-2xl overflow-y-auto border border-white/10 bg-zinc-900 p-2'}>
              {rendering && <div className="p-6 text-sm text-zinc-300 flex items-center gap-2"><FileText size={16} /> Abrindo PDF... {totalPages ? `${totalPages} páginas` : ''}</div>}
              <div ref={pdfContainerRef} className="w-full overflow-x-auto pb-4" />
            </div>
          ) : drive ? (
            <div className={isFull ? 'h-[calc(100vh-86px)] rounded-2xl overflow-hidden border border-white/10 bg-black' : 'h-[72vh] min-h-[520px] rounded-2xl overflow-hidden border border-white/10 bg-black'}>
              <iframe
                title="Leitor PDF Google Drive"
                src={drive.previewUrl}
                className="w-full h-full border-0 bg-black"
                allow="autoplay"
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
