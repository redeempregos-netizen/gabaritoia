'use client'

import { useRef, useState } from 'react'
import { FileDown, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  svg: string
}

type DragState = {
  active: boolean
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

export function MindMapViewer({ svg }: Props) {
  const [zoom, setZoom] = useState(0.72)
  const [fullscreen, setFullscreen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState>({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })

  function setSafeZoom(next: number) {
    setZoom(Math.min(1.8, Math.max(0.3, Number(next.toFixed(2)))))
  }

  function zoomIn() {
    setSafeZoom(zoom + 0.1)
  }

  function zoomOut() {
    setSafeZoom(zoom - 0.1)
  }

  function resetZoom() {
    setZoom(0.72)
    const el = scrollerRef.current
    if (el) {
      el.scrollLeft = 0
      el.scrollTop = 0
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 35) return
    e.preventDefault()
    const direction = e.deltaY > 0 ? -0.08 : 0.08
    setSafeZoom(zoom + direction)
  }

  function startDrag(clientX: number, clientY: number) {
    const el = scrollerRef.current
    if (!el) return
    dragRef.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    }
  }

  function moveDrag(clientX: number, clientY: number) {
    const el = scrollerRef.current
    const drag = dragRef.current
    if (!el || !drag.active) return
    el.scrollLeft = drag.scrollLeft - (clientX - drag.startX)
    el.scrollTop = drag.scrollTop - (clientY - drag.startY)
  }

  function stopDrag() {
    dragRef.current.active = false
  }

  async function svgToPngDataUrl(svgMarkup: string) {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Erro ao converter mapa'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 3600
    canvas.height = 2400
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas não suportado')
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/png')
  }

  async function exportPNG() {
    if (!svg) return
    try {
      const png = await svgToPngDataUrl(svg)
      const a = document.createElement('a')
      a.href = png
      a.download = 'gabaritoia-mapa-mental-hd.png'
      a.click()
      toast.success('PNG HD exportado')
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao exportar PNG')
    }
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
          Zoom: {Math.round(zoom * 100)}% · arraste o mapa para navegar
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={zoomOut} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><Minus size={13} /> Menos</button>
          <button type="button" onClick={resetZoom} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><RotateCcw size={13} /> Reset</button>
          <button type="button" onClick={zoomIn} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><Plus size={13} /> Mais</button>
          <button type="button" onClick={exportPNG} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2"><FileDown size={13} /> PNG HD</button>
          <button type="button" onClick={exportPDF} disabled={exportingPdf} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2 disabled:opacity-50">
            <FileDown size={13} /> {exportingPdf ? 'PDF...' : 'PDF'}
          </button>
          <button type="button" onClick={() => setFullscreen(v => !v)} className="btn-secondary text-xs flex items-center gap-1 px-3 py-2">
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {fullscreen ? 'Sair' : 'Tela cheia'}
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onWheel={handleWheel}
        onMouseDown={e => startDrag(e.clientX, e.clientY)}
        onMouseMove={e => moveDrag(e.clientX, e.clientY)}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={e => {
          const touch = e.touches[0]
          if (touch) startDrag(touch.clientX, touch.clientY)
        }}
        onTouchMove={e => {
          const touch = e.touches[0]
          if (touch) moveDrag(touch.clientX, touch.clientY)
        }}
        onTouchEnd={stopDrag}
        className={`${fullscreen ? 'h-[calc(100vh-88px)]' : 'max-h-[72vh]'} overflow-auto rounded-2xl border border-white/10 bg-black/30 p-3 cursor-grab active:cursor-grabbing select-none touch-none`}
      >
        <div
          className="origin-top-left transition-transform duration-100"
          style={{ width: 1800, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
