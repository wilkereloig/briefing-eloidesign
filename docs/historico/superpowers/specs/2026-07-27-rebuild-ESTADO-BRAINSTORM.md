# Rebuild ELOI — estado do brainstorming (EM ANDAMENTO)

**Data:** 2026-07-27
**Status:** brainstorming interrompido por limite de contexto. NÃO é spec final.
**Base factual:** `docs/2026-07-27-diagnostico-reorganizacao.md`

---

## Premissa dada pelo Wilke

> "crie um plano do zero, para refazer tudo por completo, mantenho o que já existe (serviços, notas, clientes)."

**Leitura:** os DADOS ficam. O schema Supabase (`eloi_clientes`, `eloi_servicos`, `orcamentos`, `briefing_links`, `eloi_materiais`, `eloi_caixas`, `eloi_movimentos_financeiros`, buckets `eloi-notas`/`eloi-entregas`) é preservado. A reescrita é de **apresentação e acesso**, não de persistência. Sem migração de dados de risco.

---

## Decomposição acordada (6 sub-projetos)

| # | Sub-projeto | Depende de |
|---|---|---|
| 1 | **Fundação** — auth única, `_shared/` nas edges, shell | — |
| 2 | **Painel interno** — clientes, serviços, NF, financeiro, orçamentos | 1 |
| 3 | **Portal do cliente** — marca, arquivos, NF, orçamentos, briefing | 1 |
| 4 | **Motor de briefing** — 1 engine + config por tipo | 1 |
| 5 | **Entrega de marca** — bucket privado + signed URL | 1, 3 |
| 6 | **Vitrine pública** — landing | — |

Ordem sugerida: 1 → 2 → 4 → 3 → 5 → 6. Cada um com spec → plano → implementação próprios.

**Em brainstorming agora:** #1 Fundação.

---

## Decisões tomadas (2026-07-27, pelo Wilke)

### D1 — Stack: SPA única React/Vite
Termina o que `/admin-app/` começou; os painéis HTML são aposentados.

**Isto reverte conscientemente** `plano.md:354` ("decisão consciente de não fazer agora") e a rejeição da Proposta B/C pelo painel de juízes. Escolha explícita do dono em 2026-07-27, com o diagnóstico à vista. **Não é acidente — não reverter sem falar com ele.**

### D2 — Fronteira: tudo vira SPA
Inclui as páginas que o cliente abre por link: os 4 briefings, `/orcamento/?t=`, entrega de marca.

**Consequências que a spec PRECISA endereçar:**
- Links já enviados a clientes (`/orcamento/?t=`, briefings com `?t=`) **não podem quebrar** — exige rewrites no `vercel.json` mapeando as URLs antigas para as rotas da SPA
- Carga inicial em rede ruim / celular passa a importar (cliente preenchendo briefing) → code-splitting por rota é requisito, não otimização
- Os 4 briefings (~3.800 linhas) precisam ser portados **antes** de desligar os antigos
- SEO da landing pública: SPA sem SSR perde indexação — decidir se a landing sai da SPA ou ganha pré-render

### D3 — Auth: unificar o código, manter as tabelas separadas

`admin_sessions` e `portal_sessions` **continuam sendo duas tabelas**. O que se unifica é o código: um `edge-functions/_shared/auth.ts` com duas funções distintas (`requireAdmin` / `requireCliente`), substituindo as 7 cópias de `verifyAdminToken()`.

**Razão:** as duas duplicações têm custos muito diferentes. A de código (D3) obriga a corrigir um bug de auth em 7 lugares e basta esquecer um. A de tabela (D4) custa ~10 linhas de SQL. Em troca dessas 10 linhas, o pior bug possível do sistema — token de cliente virando sessão admin — fica **impossível por construção**, porque a tabela é outra. Unificar trocaria esse invariante de schema por disciplina de todo consumidor lembrar de checar uma coluna `role`.

Reforçado por haver **1 admin para sempre**: `admin_sessions` tem no máximo uma linha viva. Unificar eliminaria uma tabela quase vazia.

**Consequência:** D4 do diagnóstico sai do escopo do rebuild. Não é dívida — é decisão.

### D4 — Rotas: cliente congeladas, internas sob `/admin/*`

**Rotas de cliente:** a SPA serve de `/` e adota os paths atuais como canônicos. Sem redirect, sem prefixo, sem mapeamento — a URL que o cliente já tem é a que a SPA atende. Lista congelada abaixo.

**Rotas internas:** consolidam sob `/admin/*` — `/admin/clientes`, `/admin/orcamentos`, `/admin/briefings`, `/admin/financeiro`. `/admin` sozinho segue como hub.

**Razão:** um prefixo é um único ponto de guarda. Hoje cada página do painel repete seu próprio check de sessão; com `/admin/*` o router exige sessão admin uma vez, e uma tela nova nasce protegida por omissão em vez de por lembrança. Mesmo raciocínio de D3 — invariante em vez de disciplina.

**Por que não `/painel/*`:** colidiria. `/painel/` e `/painel-ecommerce/` continuam necessários enquanto os forms aceitarem submit sem `?t=` (gravam direto em `briefings`/`ecommerce_briefings`, sem edge function). Ver "falso positivo" no diagnóstico §2.

`/admin-app/*` desaparece.

### D5 — Corte: big-bang POR SUB-PROJETO, validado em branch

Cada sub-projeto entra inteiro num push, depois de validado no deployment de preview que o Vercel gera pra branch. Produção nunca fica meio-nova-meio-velha numa mesma tela; o raio de um erro é um subsistema. Dos 6 pushes, só 3 tocam página que cliente abre (briefings, portal, marca).

**Ressalva operacional:** o preview de branch aponta pro MESMO Supabase de produção. Testar submit de briefing/login no preview grava linha real e dispara Formspree real → usar cliente/token de teste descartável, nunca os da Georgia.

**Rejeitado:** paralelo em produção — prolongaria o estado de duas arquiteturas vivas que gerou a bagunça atual.

---

### D6 — Edge functions: separadas como estão + `_shared/auth.ts` + deploy pelo repo

`plano.md:261` segue valendo (não consolidar; raio de explosão limitado). D3 já unificou o código de auth. Requisito novo da Fundação, nascido do drift descoberto em 2026-07-27: **deploy das edges sai do repo** (script/CI via MCP ou supabase CLI) — produção nunca mais diverge do código versionado.

### D7 — Tokens `?t=`: revogação manual, sem expiração automática

Coluna `revogado_em` em `orcamentos` (share_token) e `briefing_links` + botão de revogar no painel. Link continua eterno por padrão — cliente abre orçamento semanas depois sem fricção — mas link vazado pode ser morto individualmente. Links já enviados seguem funcionando (nascem com `revogado_em = null`). Fecha o S3 sem quebrar nada.

---

### D8 — Marca: privada de verdade + link de repasse revogável

Arquivos migram pro bucket privado `eloi-entregas` (já existe, já usado pelo portal) com signed URLs — curl direto morre, fecha o S2. Pro repasse gráfica/agência: botão "link de repasse" gera token revogável (mesmo mecanismo do D7); fornecedor acessa sem senha do cliente, e o link pode ser morto depois. Resolve a incoerência atual (página pede login, arquivos estáticos públicos) escolhendo um lado de verdade. Define o sub-projeto 5.

### D9 — Testes: caminhos críticos, sem meta de cobertura

Unitário onde erro custa dinheiro ou cliente: cálculo monetário (cents/competência), auth/token nas edges, normalização de senha do portal. Mais 3-4 smoke E2E (login, briefing com token de teste, `orcamento/?t=`). Rodam em CI antes do push. Pirâmide completa rejeitada: pra 1 pessoa, a manutenção da suíte competiria com o trabalho que paga as contas.

---

## Avisos da revisão final da Fundação para os PRÓXIMOS sub-projetos

- **Sub-projeto 4 (briefings):** a revogação de token de briefing é MEIA-eficaz hoje — nenhuma edge serve o token na abertura da página (o form só POSTa no submit), então `?t=` revogado ABRE o form normalmente e só falha no envio; e no `briefing-guia-viver-bem` o sucesso é `supabase.ok || formspree.ok`, então com token revogado o cliente vê SUCESSO e a resposta chega só por e-mail. A UI de revogação do sub-projeto 4 precisa validar o token no load E consertar essa semântica de sucesso.
- **Sub-projeto 2:** `admin-auth.login` não tem throttle/lockout/comparação constante (o portal tem os três) — brute-force da senha admin é livre. Ticket próprio.
- **`admin_preview`** (`portal-cliente.ts`) mantém cópia local de verificação admin SEM sliding, de propósito (trocar por `requireAdmin` estenderia a sessão a cada preview). Decisão do dono se um dia unificar.
- **`scripts/deploy-edges.mjs`** nunca rodou de ponta a ponta (falta `SUPABASE_ACCESS_TOKEN`, só o dono gera; deploys da Fundação foram via MCP com os mesmos arquivos). Validar o script no primeiro deploy do sub-projeto 2. Atenção: mudou `_shared/`, TODAS as consumidoras precisam de redeploy — o script não avisa (débito).

## TODAS as perguntas do brainstorm estão respondidas (D1–D9)

Próximo passo do skill: apresentar o design da **Fundação (sub-projeto 1)** por seções → aprovação → spec em `docs/superpowers/specs/` → writing-plans.

---

## Rotas CONGELADAS (decorre de D2 + restrição de links já enviados)

Estas URLs já estão na mão de clientes. A SPA passa a servir de `/` e **adota estes paths como canônicos** — não são redirecionados, não ganham prefixo, não mudam:

- `/orcamento/?t=<token>`
- `/briefing/`, `/briefing-ecommerce/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/` (com e sem `?t=`)
- `/portal/` (e `/portal/?next=`)
- `/entregas-marca/<slug>/`

`/admin-app/*` desaparece — nunca foi enviado a ninguém de fora.

---

## Pendências operacionais — RESOLVIDAS em 2026-07-27 (mesma data, mais tarde)

- ~~Senha da Georgia~~ → Wilke regenerou às 14:35 (prefixo K883). Causa raiz do erro original: produção gera senha legível `<RAND4>-eloi-<slug>-<ano>` e a mensagem de WhatsApp estava truncada (faltava o `6` de `2026`). O repo tinha o gerador ANTIGO — drift, ver abaixo.
- ~~Fix do hash não deployado~~ → deployado (eloi-gestao v13) e verificado: `clientes.list` não devolve mais `portal_senha_hash`.
- ~~CLAUDE.md desatualizado~~ → corrigido (`eloi_admin_token` + `admin_sessions`).
- ~~S1 (apresentação aberta)~~ → `gate.js` adicionado em `entregas-marca/*/apresentacao/`.
- **S2 segue aberto** (gate fail-open + estáticos públicos) — é o sub-projeto 5 do rebuild.
- **Drift descoberto:** o repo estava atrás da produção na `eloi-gestao` (S4 do diagnóstico em ação). Repo sincronizado com a v12 + fix. Regra: `get_edge_function` antes de diagnosticar/deployar.
