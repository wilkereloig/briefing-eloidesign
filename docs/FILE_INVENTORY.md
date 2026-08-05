# Inventário de Arquivos — ELOI Studio

Que arquivo responde por o quê. Não lista todos os 440 — lista **onde procurar**.
Estrutura real do repositório, verificada em 2026-08-05.

---

## Árvore

```
eloi-studio/                      (pasta local: briefing-eloidesign-repo)
│
├── app/                          PAINEL /admin — o produto
│   ├── public/                   servido como está: sprite, favicon, manifest
│   ├── dist/                     BUILD COMMITADO — a Vercel serve isto
│   └── src/
│       ├── main.tsx              rotas + lazy
│       ├── app.css               layout: shell, trilho, cabeçalho, acesso
│       ├── auth/                 tela de acesso e contexto de sessão
│       ├── domain/               REGRA DE NEGÓCIO — sem React, sem fetch
│       ├── lib/                  tipos, client de API, store, dinheiro
│       ├── routes/admin/         shell, trilho, navegação, folhas
│       │   └── telas/            uma tela por rota
│       └── ui/                   SISTEMA VISUAL: tokens, primitivos, blocos
│
├── edge-functions/               BACKEND (Deno) — 1 arquivo por função
│   ├── _shared/                  auth e senha compartilhados
│   └── _tests/                   testes das edges
│
├── database/migrations/          SQL aplicado, ordem cronológica
│
├── eloi-handoff/                 SISTEMA VISUAL entregável: tokens, ícones, logos, guias
│
├── docs/                         MAPAS do projeto
│   ├── adr/                      decisões com alternativa avaliada
│   └── historico/                planos e diagnósticos já executados
│
├── assets/                       compartilhado pelas PÁGINAS ESTÁTICAS
│   ├── eloi-admin/               admin.css, auth.js, nav.js, pagenav.js, wordmark.svg…
│   └── icons/                    ícones PWA do site público
│
├── scripts/deploy-edges.mjs      deploy de edge function a partir do repo
│
├── briefing/  briefing-ecommerce/  briefing-solarium/  briefing-guia-viver-bem/
├── orcamento/  orcamento-inteligente/  orcamento-precampanha/
├── portal/  marca/  entregas-marca/
├── gestao/  painel/  painel-briefings/  painel-ecommerce/  painel-orcamentos/   (legado)
│
├── index.html   manifest.json   favicon.svg   apple-touch-icon.png
├── vercel.json  package.json    .env.example  .gitignore
└── README.md    CLAUDE.md       CHANGELOG.md
```

## Responsabilidade de cada pasta

| Pasta | Responde por | Não é lugar de |
|---|---|---|
| `app/src/domain/` | Toda regra de negócio e cálculo | Fetch, JSX, formatação de exibição |
| `app/src/lib/` | Tipos do schema, chamada de API, store, cents↔BRL | Regra de negócio |
| `app/src/ui/` | Sistema visual e primitivos reutilizáveis | Regra de tela específica |
| `app/src/routes/admin/telas/` | Uma tela: montagem, estado local, chamadas | Cálculo de dinheiro |
| `app/dist/` | Build commitado — **nunca editar à mão** | — |
| `edge-functions/` | Autorização, validação e acesso ao banco | Regra de apresentação |
| `database/migrations/` | Registro do que foi aplicado | Rascunho de SQL |
| `eloi-handoff/` | Sistema visual entregável e suas guias | Código do app |
| `docs/` | Mapas do estado atual | Plano em andamento |
| `docs/historico/` | Registro do que já foi decidido e feito | Documentação viva |
| `assets/eloi-admin/` | Compartilhado das páginas estáticas | Nada do painel React |

## Arquivos-chave

| Arquivo | Por que importa |
|---|---|
| `app/src/domain/financeiro.ts` | **Fonte única** de todo cálculo de dinheiro |
| `app/src/lib/tipos.ts` | Contrato com o schema real do banco |
| `app/src/lib/api.ts` | Toda chamada de edge; lista branca de funções |
| `app/src/lib/financas-store.tsx` | Store único, janela −11/+12 meses |
| `app/src/routes/admin/nav.ts` | **Fonte única** dos destinos de navegação |
| `app/src/ui/tokens.css` | **Fonte única** dos valores visuais |
| `app/vite.config.ts` | `base: '/app/dist/'` + rewrite de `/admin` no dev |
| `vercel.json` | Rewrites de `/admin` e redirect de `/admin-app` |
| `scripts/deploy-edges.mjs` | O **único** caminho de deploy de edge |
| `edge-functions/_shared/auth.ts` | Validação de sessão de todas as funções admin |
| `.github/workflows/ci.yml` | lint, tipos, testes, build, `deno check` e `deno test` |

## Convenção de nomes

O código é escrito em **português**, e isso é deliberado: o domínio é falado em
português (competência, liquidação, pró-labore, nota fiscal) e traduzir só
adicionaria uma camada de erro. Mantenha.

| O quê | Convenção | Exemplo |
|---|---|---|
| Componente React | `PascalCase`, arquivo com o mesmo nome | `ClienteFicha.tsx` |
| Módulo de função/dado | `minusculas.ts` | `financeiro.ts`, `dinheiro.ts` |
| Função e variável | `camelCase`, verbo primeiro se for ação | `saldoAberto`, `centsDeBRL` |
| Tipo e interface | `PascalCase`, sem prefixo `I` | `Transacao`, `ItemNav` |
| Constante de módulo | `MAIÚSCULA_COM_UNDERSCORE` | `NAV_PRIMARIA`, `TOKEN_KEY` |
| Classe CSS | `kebab-case` em português | `.trilho-item`, `.acesso-painel` |
| Token CSS | `--kebab-case` em português | `--chao-2`, `--raio-card` |
| Rota | `kebab-case` | `/admin/clientes/:id` |
| Migração SQL | `AAAA-MM-DD-assunto.sql` | `2026-08-04-gestao-eloi-financeiro.sql` |
| Teste | `<módulo>.test.ts`, ao lado do módulo | `financeiro.test.ts` |

**Proibido:** `novo`, `final`, `v2`, `copia`, `temp`, `teste`, `backup`, `old` em
nome de arquivo versionado. Se precisa desses sufixos para distinguir, o antigo já
devia ter saído.

Falso positivo conhecido: `assets/eloi-admin/rascunho.js` — "rascunho" aí é o
conceito do domínio (autosave do briefing no aparelho do cliente), não sufixo de
versão. Está vivo, usado por três formulários.

## O que está fora do controle deste repositório

| Item | Onde vive de verdade |
|---|---|
| `ADMIN_PASSWORD` e demais secrets | Painel do Supabase |
| Nome do projeto na Vercel / domínio | Painel da Vercel |
| Nome do repositório no GitHub | `wilkereloig/briefing-eloidesign` |
| Buckets `eloi-notas` / `eloi-entregas` | Supabase Storage |
| Masters de logo dos clientes | Dropbox local do estúdio |
