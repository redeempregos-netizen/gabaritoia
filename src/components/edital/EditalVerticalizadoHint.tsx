export function EditalVerticalizadoHint() {
  return (
    <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-zinc-300">
      <div className="font-heading font-bold text-brand-300 mb-2">Fluxo recomendado</div>
      <div className="space-y-1 text-xs text-zinc-400 leading-relaxed">
        <p>• O cargo deve ser escolhido somente quando o edital tiver vários cargos detectados.</p>
        <p>• A data da prova será extraída automaticamente do edital quando estiver informada.</p>
        <p>• Preencha manualmente apenas se o sistema não reconhecer o cargo ou se o edital estiver incompleto.</p>
      </div>
    </div>
  )
}
