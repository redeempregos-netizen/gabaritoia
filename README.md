# GabaritoIA 🎯

Plataforma inteligente de questões comentadas, plano de estudos e flashcards para concursos públicos, com suporte a múltiplos provedores de IA.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Banco:** PostgreSQL via Supabase + Prisma ORM
- **Auth:** JWT com cookies httpOnly
- **IA:** Claude (Anthropic) + suporte a OpenAI, Gemini, Grok, OpenRouter
- **Deploy:** Vercel

## Funcionalidades

- ✅ Gerador de questões (múltipla escolha e certo/errado)
- ✅ Qualquer banca (a IA interpreta o estilo)
- ✅ Edital Verticalizado (questões do seu edital)
- ✅ Edital Pro (plano de estudos completo + flashcards)
- ✅ Histórico com métricas de desempenho
- ✅ Painel Admin com gerenciamento de APIs e usuários
- ✅ Suporte a 5 provedores de IA
- ✅ Autenticação segura
- ✅ Mobile responsivo

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais

# 3. Criar tabelas no banco
npm run db:push

# 4. Rodar em desenvolvimento
npm run dev
```

Abra http://localhost:3000

## Deploy

Veja o guia completo em [DEPLOY.md](./DEPLOY.md)

## Estrutura

```
src/
├── app/
│   ├── (auth)/          # Login e cadastro
│   ├── (dashboard)/     # Painel, Gerar, Edital, Histórico, Admin
│   └── api/             # API Routes (auth, IA, admin)
├── components/          # Componentes React reutilizáveis
├── lib/                 # Prisma, Auth, IA, Utils
├── types/               # TypeScript types
└── hooks/               # React hooks customizados
prisma/
└── schema.prisma        # Modelo do banco de dados
```

## Variáveis de ambiente

Veja `.env.example` para a lista completa.

## Atualização

```bash
git add .
git commit -m "descrição da mudança"
git push
# Vercel faz deploy automático em ~30s
```

## Licença

Privado — todos os direitos reservados.
