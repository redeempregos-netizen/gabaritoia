'use client'

import { useState } from 'react'
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'

type Props = {
  svg: string
}

export function MindMapViewer({ svg }: Props) {
  const [zoom, setZoom] = useState(0.72)
  const [fullscreen, setFullscreen] = useState(false)

  function zoomIn() {
    setZoom(z => Math.min(1.4, Number((z + 0.1).toFixed(2))))
  }

  function zoomOut() {
    setZoom(z => Math.max(0.35, Number((z - 0.1).toFixed(2))))
  }

  function resetZoom() {
    setZoom(0.72)
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
