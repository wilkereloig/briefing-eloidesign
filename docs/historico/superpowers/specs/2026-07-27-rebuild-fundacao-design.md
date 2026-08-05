# Rebuild ELOI — Sub-projeto 1: Fundação (design aprovado)

**Data:** 2026-07-27 · **Status:** aprovado pelo Wilke (4/4 seções)
**Contexto:** decisões D1–D9 em `2026-07-27-rebuild-ESTADO-BRAINSTORM.md`; base factual em `../2026-07-27-diagnostico-reorganizacao.md`.

## Objetivo

Criar a base técnica da SPA única (D1/D2) sem tocar em nenhuma tela de negócio. A Fundação termina quando: a SPA builda e serve um shell logado em `/admin` (vazio), **nenhuma página atual quebra**, edges deployam pelo repo, e o CI roda lint+typecheck+testes. É o primeiro push de produção do rebuild — risco quase zero por não ter conteúdo.

## Não-objetivos

- Nenhuma tela de clientes/serviços/orçamentos/briefings (sub-projetos 2–4).
- Não deletar `admin-app/` (morre no fim do sub-projeto 2, depois do porte).
- Não migrar marca pro bucket (sub-projeto 5, D8).
- Não mexer nos painéis HTML em produção.

## A. Estrutura e rotas

```
briefing-eloidesign-repo/
├─ app/                    # SPA nova — Vite + React + TypeScript
│  ├─ src/
│  │  ├─ routes/           # 1 pasta por rota; TODAS lazy (code-splitting é requisito, D2:
│  │  │                    #   cliente de briefing no celular não baixa o painel financeiro)
│  │  ├─ lib/api.ts        # client das edges — portar de admin-app/src/lib/api.ts
│  │  └─ ui/               # tokens + componentes; porta o sistema visual do admin.css
│  └─ vite.config.ts
├─ edge-functions/         # como está (D6: sem consolidar) + _shared/
├─ db/                     # migrations SQL versionadas, numeradas
└─ vercel.json             # na Fundação: só /admin/* → SPA; raiz completa vem por sub-projeto (D5)
```

**Rotas congeladas** (D4 — URLs já na mão de clientes, a SPA as adota como canônicas, sem redirect):
`/orcamento/?t=`, `/briefing/`, `/briefing-ecommerce/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/`, `/portal/` (+`?next=`), `/entregas-marca/<slug>/`.

**Rotas internas:** consolidam sob `/admin/*` (`/admin/clientes`, `/admin/orcamentos`, `/admin/briefings`, `/admin/financeiro`); `/admin` é o hub. `/painel/*` NÃO pode ser usado como prefixo (colide com `/painel/` e `/painel-ecommerce/`, ainda necessários enquanto houver submit sem `?t=`).

**vercel.json na Fundação:** adiciona só a rota `/admin/*` → SPA. As rotas congeladas continuam nos HTMLs atuais até cada sub-projeto portá-las — convivência POR ROTA nunca acontece em produção dentro de uma mesma tela (D5).

## B. Auth

- `edge-functions/_shared/auth.ts`: `requireAdmin(supabase, token)` e `requireCliente(supabase, token)`. Substitui as 7 cópias de `verifyAdminToken()`. Mesma semântica atual: sliding 12h, `last_seen_at`.
- Tabelas `admin_sessions` e `portal_sessions` **separadas** (D3): o pior bug possível — token de cliente virar sessão admin — fica impossível por schema, não por disciplina. Custo: ~10 linhas de SQL duplicadas, aceito.
- SPA: `AuthProvider` por perímetro. Guard de `/admin/*` no router — uma regra, telas novas nascem protegidas (D4). Rotas de cliente: sessão de portal OU token `?t=` conforme a página.
- `eloi-gestao` (e pares) mantêm `verify_jwt:false` — CORS só permite `content-type`; auth é token de sessão no body.

## C. Infra

- **Deploy de edges pelo repo (D6):** script `deploy-edges` (supabase CLI ou MCP). Regra escrita: nunca deployar pelo dashboard. Motivo: drift real detectado em 2026-07-27 (repo atrás da produção v12 → diagnóstico errado).
- **Migration `revogado_em` (D7):** `alter table orcamentos add column revogado_em timestamptz; alter table briefing_links add column revogado_em timestamptz;` Edges que servem `?t=` passam a checar `revogado_em is null`. Aditiva — links vivos nascem não-revogados. UI de revogar entra nos sub-projetos 2/4.
- **Allowlist de tabelas:** `app/src/lib/api.ts` só conhece `eloi_*`, `orcamentos`, `briefing_links`, `admin_sessions`/`portal_sessions` (via edges). As tabelas `clients`/`services` do app ELOI Financeiro (mesmo projeto Supabase) ficam invisíveis por construção (`plano.md:110`).

## D. Testes e CI (D9)

- **Vitest** no `app/` + **Deno test** nas edges.
- Alvos obrigatórios: cálculo monetário (cents, competência), `_shared/auth.ts`, normalização de senha do portal (`replace(/[\s-]/g,"").toUpperCase()` + prefixo 4).
- GitHub Action no push: lint + typecheck + testes. Deploy Vercel continua automático no master.
- Smoke E2E (login, briefing com token de teste, `orcamento/?t=`) entra no sub-projeto 2, quando existem telas.
- Preview de branch aponta pro Supabase de produção: testes manuais usam cliente/token descartável, nunca cliente real (ressalva do D5).

## Tratamento de erro

- Edge indisponível / Supabase pausado (plano free): a SPA mostra estado de erro explícito com retry — nunca tela branca. Nos briefings, o backup Formspree continua existindo nos sub-projetos que os portarem.
- Sessão expirada (12h): guard redireciona pro login preservando `?next=` (mesmo contrato do gate atual).

## Critérios de aceite

1. `npm run build` no `app/` gera bundle com `/admin` lazy.
2. `/admin` em produção: login → shell vazio logado; logout funciona.
3. Nenhuma rota atual muda de comportamento (smoke manual nas 10 páginas).
4. `deploy-edges` deploya `eloi-gestao` idêntica à v13 (hash-drop preservado).
5. Migration aplicada; `orcamento/?t=` vivo continua abrindo.
6. CI verde no push.
