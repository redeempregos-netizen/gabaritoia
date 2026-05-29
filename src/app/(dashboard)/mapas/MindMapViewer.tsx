'use client'

import { useState } from 'react'
import { FileDown, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  svg: string
}

export function MindMapViewer({ svg }: Props) {
  const [zoom, setZoom] = useState(0.72)
  const [fullscreen, setFullscreen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  function zoomIn() {
    setZoom(z => Math.min(1.4, Number((z + 0.1).toFixed(2))))
  }

  function zoomOut() {
    setZoom(z => Math.max(0.35, Number((z - 0.1).toFixed(2))))
  }

  function resetZoom() {
    setZoom(0.72)
  }

  async function svgToPngDataUrl(svgMarkup: string) {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Erro ao converter mapa para PDF'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1600
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas não suportado')
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/png')
  }

  async function exportPDF() {
    if (!svg) return
    setExportingPdf(true)
    try {
      const [{ default: jsPDF }, png] = await Promise.all([
        import('jspdf'),
        svgToPngDataUrl(svg),
      ])
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      doc.addImage(png, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST')
      doc.save('gabaritoia-mapa-mental.pdf')
      toast.success('PDF exportado')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao exportar PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-zinc-950 p-3 md:p-5' : 'space-y-2'}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-zinc-900/95 p-2">
        <div className="text-xs text-zinc-400 px-2">
          Zoom: {Math.round(zoom * 100)}%
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={zoomOut} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><Minus size={13} /> Menos</button>
          <button type="button" onClick={resetZoom} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><RotateCcw size={13} /> Reset</button>
          <button type="button" onClick={zoomIn} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><Plus size={13} /> Mais</button>
          <button type="button" onClick={exportPDF} disabled={exportingPdf} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2 disabled:opacity-50">
            <FileDown size={13} /> {exportingPdf ? 'PDF...' : 'PDF'}
          </button>
          <button type="button" onClick={() => setFullscreen(v => !v)} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2">
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {fullscreen ? 'Sair' : 'Tela cheia'}
          </button>
        </div>
      </div>

      <div className={fullscreen ? 'h-[calc(100vh-88px)] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-3' : 'card overflow-auto p-2 bg-black/20 max-h-[72vh]'}>
        <div
          className="origin-top-left transition-transform duration-150"
          style={{ width: 1800, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
