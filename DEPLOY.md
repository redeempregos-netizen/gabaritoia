# 🚀 GabaritoIA — Guia Completo de Deploy e Manutenção

## Visão geral do que você vai fazer

```
Seu computador          GitHub              Vercel              Supabase
──────────────    →    ──────────    →    ──────────    →    ──────────
Código do projeto       Repositório         Deploy              Banco de dados
(Next.js)               privado gratuito    automático          PostgreSQL gratuito
                                            gabaritoia.vercel   + autenticação
```

Tempo estimado: **45 a 60 minutos na primeira vez**.
Após isso, atualizar é só rodar `git push` e o Vercel faz o resto em 30 segundos.

---

## PARTE 1 — Preparar o computador

### 1.1 Instalar as ferramentas necessárias

**Node.js** (motor do projeto):
- Acesse: https://nodejs.org
- Baixe a versão **LTS** (a recomendada)
- Instale normalmente (next, next, finish)
- Verifique abrindo o Terminal (Windows: Prompt de Comando ou PowerShell):
  ```
  node --version
  ```
  Deve aparecer algo como: `v20.15.0`

**Git** (controle de versão):
- Acesse: https://git-scm.com/downloads
- Baixe para seu sistema operacional
- Instale com as opções padrão
- Verifique:
  ```
  git --version
  ```
  Deve aparecer: `git version 2.x.x`

---

## PARTE 2 — Criar contas gratuitas

### 2.1 GitHub (onde o código fica guardado)
1. Acesse https://github.com
2. Clique em **Sign up**
3. Crie sua conta (é gratuita)
4. Confirme o e-mail

### 2.2 Supabase (banco de dados + autenticação)
1. Acesse https://supabase.com
2. Clique em **Start your project**
3. Entre com sua conta do GitHub (mais fácil)
4. Clique em **New project**
5. Preencha:
   - **Name:** gabaritoia
   - **Database Password:** crie uma senha forte (guarde em local seguro!)
   - **Region:** South America (São Paulo)
6. Clique em **Create new project**
7. Aguarde ~2 minutos enquanto o banco é criado
8. Quando aparecer o dashboard, vá em **Settings → API** e anote:
   - `Project URL` (ex: https://abcxyz.supabase.co)
   - `anon public key` (chave longa)
   - `service_role key` (chave secreta — não compartilhe!)
9. Vá em **Settings → Database** e anote:
   - `Connection string` (URI) — clique em **URI** e copie

### 2.3 Vercel (hospedagem gratuita)
1. Acesse https://vercel.com
2. Clique em **Sign Up**
3. Entre com sua conta do GitHub
4. Autorize o Vercel a acessar seus repositórios

### 2.4 Anthropic (IA principal — Claude)
1. Acesse https://console.anthropic.com
2. Crie uma conta
3. Vá em **API Keys → Create Key**
4. Guarde a chave (começa com `sk-ant-...`)
5. O plano gratuito tem créditos iniciais suficientes para testar

---

## PARTE 3 — Configurar o projeto localmente

### 3.1 Abrir o terminal na pasta do projeto

**Windows:**
- Abra o Explorador de Arquivos
- Navegue até a pasta `gabaritoia`
- Clique na barra de endereço, digite `cmd` e pressione Enter

**Mac:**
- Abra o Terminal
- Digite: `cd ~/Downloads/gabaritoia` (ajuste o caminho)

### 3.2 Instalar as dependências
```bash
npm install
```
Aguarde — vai baixar tudo automaticamente (~2 minutos).

### 3.3 Criar o arquivo de variáveis de ambiente
Copie o arquivo de exemplo:

**Windows:**
```
copy .env.example .env.local
```

**Mac/Linux:**
```
cp .env.example .env.local
```

Agora abra o arquivo `.env.local` em qualquer editor de texto (Notepad, VSCode, etc.) e preencha:

```env
# Banco de dados — pegue no Supabase > Settings > Database
DATABASE_URL="postgresql://postgres.SEU-REF:SUA-SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.SEU-REF:SUA-SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

# Supabase — pegue em Settings > API
NEXT_PUBLIC_SUPABASE_URL="https://SEU-REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-anon-key-aqui"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key-aqui"

# Segurança — gere uma chave aleatória
JWT_SECRET="cole-aqui-uma-string-longa-e-aleatoria-de-64-caracteres"

# IA
ANTHROPIC_API_KEY="sk-ant-sua-chave-aqui"

# Admin
ADMIN_EMAIL="seu@email.com"
ADMIN_PASSWORD="sua-senha-admin-forte"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**Como gerar o JWT_SECRET:**
Acesse https://generate-secret.vercel.app/64 e copie o resultado.

### 3.4 Criar as tabelas no banco
```bash
npm run db:push
```
Isso cria todas as tabelas automaticamente no Supabase.

### 3.5 Testar localmente
```bash
npm run dev
```
Abra http://localhost:3000 no navegador.
Deve aparecer a tela de login do GabaritoIA!

Crie uma conta usando o e-mail que você definiu como `ADMIN_EMAIL` — ela vai ter acesso de administrador automaticamente.

---

## PARTE 4 — Publicar no GitHub

### 4.1 Criar repositório no GitHub
1. Acesse https://github.com/new
2. Preencha:
   - **Repository name:** gabaritoia
   - Selecione **Private** (seu código fica privado)
3. Clique em **Create repository**
4. Copie a URL do repositório (ex: `https://github.com/seunome/gabaritoia.git`)

### 4.2 Enviar o código
No terminal, dentro da pasta do projeto:
```bash
git init
git add .
git commit -m "primeiro commit — GabaritoIA"
git branch -M main
git remote add origin https://github.com/SEUNOME/gabaritoia.git
git push -u origin main
```
Digite seu usuário e senha do GitHub quando solicitado.

---

## PARTE 5 — Deploy no Vercel

### 5.1 Importar o projeto
1. Acesse https://vercel.com/new
2. Clique em **Import Git Repository**
3. Selecione o repositório `gabaritoia`
4. Clique em **Import**

### 5.2 Configurar variáveis de ambiente
Na tela de configuração, **antes de fazer deploy**, clique em **Environment Variables** e adicione todas as variáveis do seu `.env.local`:

| Nome | Valor |
|------|-------|
| DATABASE_URL | sua-connection-string |
| DIRECT_URL | sua-direct-url |
| NEXT_PUBLIC_SUPABASE_URL | https://xxx.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | sua-anon-key |
| SUPABASE_SERVICE_ROLE_KEY | sua-service-key |
| JWT_SECRET | sua-chave-jwt |
| ANTHROPIC_API_KEY | sk-ant-... |
| ADMIN_EMAIL | seu@email.com |
| ADMIN_PASSWORD | sua-senha |
| NEXT_PUBLIC_APP_URL | https://gabaritoia.vercel.app |

### 5.3 Fazer o deploy
1. Clique em **Deploy**
2. Aguarde ~3 minutos
3. Quando aparecer **Congratulations!** seu site está no ar!
4. Acesse a URL fornecida (ex: `https://gabaritoia.vercel.app`)

### 5.4 Rodar as migrations no banco de produção
Após o deploy, você precisa criar as tabelas no banco de produção.

No terminal local (com as variáveis de ambiente configuradas):
```bash
npm run db:push
```
As tabelas são criadas no Supabase automaticamente.

---

## PARTE 6 — Domínio personalizado (opcional)

Se quiser usar `gabaritoia.com.br` em vez de `gabaritoia.vercel.app`:

1. Compre um domínio em: Registro.br (nacional, ~R$40/ano) ou Namecheap (~$10/ano)
2. No Vercel: **Settings → Domains → Add**
3. Digite seu domínio e siga as instruções para configurar o DNS
4. Atualize `NEXT_PUBLIC_APP_URL` nas variáveis do Vercel para seu domínio
5. Redeploy automático

---

## PARTE 7 — Como atualizar o projeto

### Fluxo de atualização (após qualquer mudança no código):

```bash
# 1. Faça suas alterações nos arquivos

# 2. No terminal, dentro da pasta:
git add .
git commit -m "descrição do que você mudou"
git push

# 3. O Vercel detecta automaticamente e faz deploy em ~30 segundos
```

Pronto. Não precisa fazer mais nada.

### Exemplos de mensagens de commit:
```bash
git commit -m "adiciona filtro por dificuldade na tela de gerar"
git commit -m "corrige bug no cronograma do Edital Pro"
git commit -m "melhora layout mobile da sidebar"
git commit -m "adiciona suporte a nova banca CETAP"
```

---

## PARTE 8 — Painel Admin em produção

Acesse `https://seusite.vercel.app/admin` com o e-mail e senha de admin.

No painel você pode:

**Gerenciar APIs de IA:**
- Adicionar chaves do ChatGPT, Gemini, Grok, OpenRouter
- Testar cada API com um clique
- Ativar/desativar provedores individualmente
- Definir qual IA é o padrão da plataforma

**Configurar limites:**
- Quantidade máxima de questões por geração (1 a 10)
- Controle por plano (FREE vs PRO)

**Ver usuários:**
- Lista de todos os cadastros
- Promover usuário a admin
- Mudar plano (FREE → PRO)

**Métricas:**
- Total de questões respondidas
- Questões hoje e na semana
- Áreas mais estudadas
- Planos gerados

---

## PARTE 9 — Monitoramento e logs

### Ver logs de erros (Vercel):
1. Acesse https://vercel.com/seu-projeto
2. Clique em **Functions** ou **Logs**
3. Filtre por erro para ver o que deu errado

### Ver banco de dados (Supabase):
1. Acesse https://supabase.com/dashboard
2. Vá em **Table Editor** para ver os dados
3. Vá em **SQL Editor** para rodar consultas
4. Vá em **Logs** para ver logs do banco

### Alertas de erro (recomendado para produção):
- Cadastre-se em https://sentry.io (gratuito até 5k erros/mês)
- Adicione ao projeto com: `npm install @sentry/nextjs`
- Receberá e-mail quando algo der errado

---

## PARTE 10 — Custos

### Para começar (R$0/mês):
| Serviço | Plano | Limite gratuito |
|---------|-------|-----------------|
| Vercel | Hobby | Projetos ilimitados, 100GB bandwidth |
| Supabase | Free | 500MB banco, 50MB storage, 50k req/mês |
| Anthropic | Pay-per-use | Pague só o que usar (~R$0,05 por questão) |
| GitHub | Free | Repositórios privados ilimitados |

### Quando escalar (usuários pagando):
| Serviço | Plano pago | Custo |
|---------|-----------|-------|
| Vercel | Pro | US$20/mês |
| Supabase | Pro | US$25/mês |
| Anthropic | API | ~US$3 por milhão de tokens |

---

## Problemas comuns e soluções

**"Cannot find module" ao rodar `npm run dev`:**
```bash
npm install
```

**"PrismaClientKnownRequestError" / erro de banco:**
- Verifique se `DATABASE_URL` está correto no `.env.local`
- Rode novamente: `npm run db:push`

**Deploy falhou no Vercel:**
- Clique em **View Function Logs** para ver o erro
- Geralmente é variável de ambiente faltando

**API da IA retornando erro 401:**
- Verifique se `ANTHROPIC_API_KEY` está correto
- Confirme que tem créditos na conta Anthropic

**Site lento:**
- Verifique o plano do Supabase (free tem limites)
- Adicione cache nas API routes mais acessadas

---

## Resumo rápido (checklist)

- [ ] Instalar Node.js e Git
- [ ] Criar conta GitHub, Supabase, Vercel, Anthropic
- [ ] Criar projeto no Supabase e copiar as credenciais
- [ ] `npm install` na pasta do projeto
- [ ] Preencher `.env.local` com todas as variáveis
- [ ] `npm run db:push` para criar o banco
- [ ] `npm run dev` para testar localmente
- [ ] Criar repositório no GitHub e fazer `git push`
- [ ] Importar no Vercel com as variáveis de ambiente
- [ ] Acessar o site e criar a conta admin
- [ ] Configurar chaves de IA no painel /admin

**Após isso, toda atualização é apenas:**
```bash
git add . && git commit -m "descrição" && git push
```
