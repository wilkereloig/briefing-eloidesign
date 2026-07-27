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

---

## Perguntas ainda EM ABERTO (retomar aqui)

1. **Corte:** big-bang (troca tudo num push) ou paralelo com fallback (SPA e legado convivendo por rota, desligando aos poucos)?
3. **Edge functions:** mantidas como estão (`plano.md:261` proíbe consolidar, por blast radius) e só ganham `_shared/auth.ts`? Ou o rebuild reabre essa decisão também?
4. **Tokens permanentes:** `share_token` e `briefing_links.token` ganham expiração/revogação no rebuild, ou seguem eternos?
5. **Marca pública vs privada:** o motivo original do link permanente era repasse pra gráfica/agência sem depender de sessão. Isso ainda vale? Define o sub-projeto #5.
6. **Testes:** o repo não tem nenhum hoje. O rebuild introduz? Em que nível?

---

## Rotas CONGELADAS (decorre de D2 + restrição de links já enviados)

Estas URLs já estão na mão de clientes. A SPA passa a servir de `/` e **adota estes paths como canônicos** — não são redirecionados, não ganham prefixo, não mudam:

- `/orcamento/?t=<token>`
- `/briefing/`, `/briefing-ecommerce/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/` (com e sem `?t=`)
- `/portal/` (e `/portal/?next=`)
- `/entregas-marca/<slug>/`

`/admin-app/*` desaparece — nunca foi enviado a ninguém de fora.

---

## Pendências operacionais fora do brainstorming

- Senha do portal da Georgia Andrade continua inválida → botão "🔐 Senha portal" em `/gestao/`
- Fix do vazamento de `portal_senha_hash` em `clientes.list` está no código, **não deployado**
- `CLAUDE.md` desatualizado: cita `sessionStorage eloi_pw` (morto); real é `localStorage eloi_admin_token`
- Furos de segurança S1/S2 do diagnóstico (apresentação de marca aberta; gate fail-open) seguem abertos
