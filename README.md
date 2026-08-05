# ELOI Studio

Site e painel interno do **ELOI Studio** (Wilke Eloi). Um repositório só, servindo
duas coisas ao mesmo tempo:

- **vitrine e formulários** que o cliente acessa — briefings, orçamento, portal, entrega de marca;
- **painel interno** (`/admin`) onde o estúdio controla clientes, projetos e dinheiro.

Produção: <https://briefing-eloidesign.vercel.app> · painel: <https://briefing-eloidesign.vercel.app/admin>

## Stack

| Camada | O que é |
|---|---|
| Páginas públicas | HTML estático, sem build. Um `index.html` por rota. |
| Painel `/admin` | SPA React 19 + Vite + TypeScript, em `app/`. |
| Backend | Supabase — Postgres com RLS, Storage privado, Edge Functions em Deno. |
| Hospedagem | Vercel, deploy automático no push para `master`. |

**A Vercel não builda nada.** O `app/dist/` é commitado; `vercel.json` reescreve
`/admin/*` para ele. Quem esquece de rodar `npm run build` antes do commit publica
a versão anterior do painel.

## Requisitos

- Node 20+ (só para `app/` e para os scripts; as páginas estáticas não precisam)
- Deno 2.x (só para checar/testar as edge functions)
- Conta Supabase com acesso ao projeto `nlamznxoocmygfvnqcns` (para deploy de edges)

## Instalação

```bash
cd app && npm ci
```

## Comandos

Todos rodam dentro de `app/`:

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 5207 (`/admin`) |
| `npm run build` | `tsc -b` + `vite build` → grava em `app/dist/` (**commitar**) |
| `npm run preview` | Serve o `dist/` já construído |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unidade + contrato do client de API) |

Na raiz do repositório:

| Comando | O que faz |
|---|---|
| `npm run edges:check` | `deno check` em todas as edge functions |
| `npm run edges:test` | `deno test` nos testes das edges |
| `npm run edges:deploy -- <fn>` | Deploy de uma edge function **a partir do repo** |

## Configuração

Copie `.env.example` e preencha o que for usar. Nenhuma variável é lida pelo
front — as chaves públicas do Supabase estão no código das páginas, por design
(RLS nega tudo para `anon`; quem lê e escreve é a edge function com
`service_role`). O `.env` só serve para os scripts locais e para o deploy.

## Deploy

- **Site e painel**: `git push origin master`. A Vercel publica o repositório como está.
- **Edge functions**: `npm run edges:deploy -- eloi-financas`. Nunca pelo dashboard
  do Supabase — em 2026-07-27 produção ficou à frente do repo e um diagnóstico
  inteiro saiu errado por causa disso.
- **Migrações de banco**: os arquivos em `database/migrations/` são o registro do
  que foi aplicado. Aplicar é manual, pelo SQL editor do Supabase.

## Estrutura

```
app/          painel /admin (React 19 + Vite) — o produto
edge-functions/  backend em Deno, 1 arquivo por função
database/     migrações SQL aplicadas, em ordem cronológica
eloi-handoff/ sistema visual do KV: tokens, ícones, logos, guias
docs/         mapas do projeto (comece por PROJECT_MAP.md)
scripts/      deploy de edge functions
assets/       CSS/JS compartilhados pelas páginas estáticas
```

Páginas estáticas ficam em pastas próprias na raiz (`briefing/`, `portal/`,
`gestao/`, `painel-*/`, `orcamento*/`, `marca/`, `entregas-marca/`).

## Documentação

| Arquivo | Para quê |
|---|---|
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Visão geral — comece aqui |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Como as camadas se ligam e por quê |
| [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md) | Toda funcionalidade e seu estado real |
| [docs/ROUTE_MAP.md](docs/ROUTE_MAP.md) | Rotas, arquivos e quem pode acessar |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tabelas, vínculos e regras do banco |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Vocabulário do domínio — leia antes de nomear qualquer coisa |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Onde vive cada parte do sistema visual |
| [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) | Como adicionar tela, rota, briefing, edge |
| [docs/FILE_INVENTORY.md](docs/FILE_INVENTORY.md) | Que arquivo responde por o quê |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões estruturais e o motivo de cada uma |
| [docs/CLEANUP_REPORT.md](docs/CLEANUP_REPORT.md) | O que foi removido, movido e consolidado |
| [CHANGELOG.md](CHANGELOG.md) | O que mudou de comportamento, por data |
| [CLAUDE.md](CLAUDE.md) | Contexto permanente para trabalho assistido por IA |
