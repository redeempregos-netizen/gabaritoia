import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Rota em configuração.' }, { status: 503 })
}
