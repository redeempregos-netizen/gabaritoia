import Link from 'next/link'

export default function EmBrevePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="card max-w-lg w-full p-8 text-center">
        <div className="text-5xl mb-4">🚧</div>
        <h1 className="font-heading text-2xl font-bold mb-2">Função em breve</h1>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">
          Essa ferramenta ainda está em preparação para usuários comuns. Por enquanto, use Cadernos PDF e Gerar Questões.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Link href="/cadernos" className="btn-secondary">Cadernos PDF</Link>
          <Link href="/gerar" className="btn-primary">Gerar Questões</Link>
        </div>
      </div>
    </div>
  )
}
