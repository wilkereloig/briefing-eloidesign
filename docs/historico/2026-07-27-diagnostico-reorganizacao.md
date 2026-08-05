# Diagnóstico de reorganização — páginas, sessões e duplicação

**Data:** 2026-07-27
**Origem:** pedido do Wilke — "algumas páginas estão duplicadas e sem sentido, quero mudanças reais"
**Método:** 3 levantamentos paralelos (inventário de rotas, mapa de auth, edge functions + histórico de decisões)

Este documento é **diagnóstico e proposta**, não execução. Nada foi alterado com base nele.

---

## 1. A causa raiz

O repo tem **duas arquiteturas de painel admin vivas ao mesmo tempo**:

| Geração | O que é | Estado |
|---|---|---|
| HTML multipágina | `/admin`, `/gestao`, `/painel-orcamentos`, `/painel-briefings` + shell compartilhado (`assets/eloi-admin/nav.js`, `auth.js`, `periodo.js`) | Em produção, fases 0–3 + P1 do plano executadas |
| SPA React/Vite | `/admin-app/` — Dashboard, Clientes, ClienteDetail, Orçamentos, Serviços, Financeiro, Briefings, Entregas | "Em validação" (`SITEMAP.md:27`); `Briefings` e `Entregas` são `Placeholder.tsx` |

Ambas consomem **as mesmas edge functions**. São ~3.100 linhas espelhadas.

### Por que isso é um conflito de decisão, não só débito

`docs/painel-admin-unificado/plano.md` escolheu a **Proposta A — "Shell mínimo"** entre 3 candidatas, por painel de juízes:

- Proposta A: 22,0 — **vencedora**
- Proposta C: 15,7 — reestruturar URLs para `/admin/<modulo>/` + SPA
- Proposta B: 15,3 — SPA única + gateway monolítico

Decisão explícita em `plano.md:20`:
> "Estrutura de pastas não muda — decisão deliberada, não omissão."

E em `plano.md:354`, sobre a Proposta C:
> "decisão consciente de **não fazer agora**... `vercel.json` como peça nova de infra"

`/admin-app/` (commit `a747b90`) **é** a Proposta C: `vercel.json` ganhou rewrites, URLs viraram `/admin-app/<rota>`, SPA React. Foi construída depois da decisão que a recusou.

**Não estou dizendo que a decisão antiga está certa e a SPA errada.** Estou dizendo que hoje as duas coexistem, e é isso que produz a sensação de "sem sentido": qualquer melhoria precisa ser feita duas vezes ou fica só numa metade. Aconteceu hoje mesmo — adicionei um badge de estado do portal em `/gestao/` que a SPA não tem.

---

## 2. Inventário de duplicações

Ordenado por custo real, não por tamanho.

| # | Duplicação | Volume | Observação |
|---|---|---|---|
| D1 | SPA `/admin-app/` vs 4 painéis HTML | ~3.100 linhas | Arquiteturas concorrentes. Decide tudo abaixo. |
| D2 | 4 briefings (`/briefing/`, `-ecommerce`, `-solarium`, `-guia-viver-bem`) | ~3.800 linhas | Wizard + autosave + submit copiados literalmente 4× |
| D3 | `verifyAdminToken()` em 6–7 edge functions | ~8 linhas × 7 | `_shared/auth.ts` previsto em `plano.md:47`, nunca criado |
| D4 | `admin_sessions` vs `portal_sessions` | 2 tabelas | Estruturalmente idênticas: mesmo gerador, mesmo 12h sliding, mesmo RLS |
| D5 | `entregas.list` (Storage) vs `materiais.list` (tabela `eloi_materiais`) | 2 caminhos | **Duas fontes da verdade para "arquivo entregue"** |
| D6 | `/orcamento-precampanha/` vs `/cliente/` | 293 vs 300 linhas | Diff real ~30 linhas |
| D7 | `/entregas-marca/<slug>/` vs aba Marca do portal | — | **Resolvido em 2026-07-27**: aba virou card com link |
| D8 | `/orcamento-inteligente/` | 30 linhas | Só um `<meta refresh>`. Já "Aposentado" no SITEMAP |
| D9 | `/briefing-solarium/` | 604 linhas | Fork pré-preenchido de `-ecommerce` (921 linhas) |
| D10 | Cópia inline de `periodo.js` em `gestao/` | — | Follow-up já marcado com `ponytail:` |

**Falso positivo:** `/painel/` e `/painel-ecommerce/` parecem legado removível, mas **ainda são necessários**. Briefings submetidos **sem** `?t=` gravam direto nas tabelas `briefings`/`ecommerce_briefings` via anon key + RLS, sem passar por edge function. Enquanto os forms aceitarem submit sem token, esses painéis são a única forma de ver esses dados. `plano.md:352` já condiciona a aposentadoria a "confirmar 0 linhas".

---

## 3. Segurança — achados que independem da reorganização

Ordenados por urgência. **S1 e S2 valem correção imediata, fora de qualquer plano maior.**

### S1 — Apresentação da marca está aberta
`/entregas-marca/<slug>/apresentacao/` **não carrega `gate.js`**. Qualquer pessoa com a URL vê a apresentação da identidade do cliente.

### S2 — O gate da marca é fail-open e contornável
`entregas-marca/_shared/gate.js:39-41`: qualquer erro que não seja 401 **libera** a página. Além disso, os arquivos são estáticos públicos na Vercel — `curl` na URL direta ignora o gate por completo. O próprio código admite (`gate.js:10-13`): "Perímetro de UX, não cofre... Pra fechar de verdade: migrar pro bucket privado `eloi-entregas`."
O bucket privado **já existe** (`db/eloi-entregas-bucket.sql`) e já é usado pelo portal com signed URLs. A página legada simplesmente não o usa.

### S3 — `?t=` nunca expira e não é revogável
`orcamentos.share_token` e `briefing_links.token` são permanentes. As sessões expiram em 12h; os tokens que dão acesso aos mesmos dados, não. Link vazado = acesso permanente.

### S4 — `briefing-submit` não está versionado
Recebe **todo** briefing com token. Existe só em produção; não dá para auditar se valida status ou duplicidade. Ponto cego de auditoria.

### S5 — Escrita sem edge function
Briefing sem `?t=` escreve direto em `/rest/v1/briefings` com a publishable key. Depende de RLS que **não está em `db/*.sql`**.

### S6 — `ADMIN_PASSWORD` nunca rotacionada
`plano.md:344` (Fase 6) previa rotação; sem evidência de execução. A senha `eloidesign2026` está no histórico do git (`plano.md:358` item 8) — janela aberta.

### S7 — `?mode=admin` é bypass sem verificação
Presente nos 4 briefings. Não protege dado, mas permite pular toda validação de campo obrigatório a partir de link público.

---

## 4. Documentação desatualizada (corrigir já)

- **`CLAUDE.md`**: diz "Área admin protegida por senha (sessionStorage `eloi_pw`)". **Morto** — zero ocorrências no código. A auth real é `localStorage['eloi_admin_token']` + `admin_sessions` via edge `admin-auth`. Igualmente desatualizados: `docs/superpowers/specs/2026-07-17-gestao-redesign-design.md:5` e `plans/2026-07-17-gestao-redesign.md:14`.
- **`SITEMAP.md:23`** chama `/entregas-marca/<slug>/` de "legado, obsoleto", mas ela é hoje **a página principal que o cliente recebe por link**.

---

## 5. Actions órfãs

Definidas nas edge functions, nenhuma página chama:

- `admin-auth`: `logout_all`
- `orcamentos`: `catalog_save`, `catalog_delete` (não há UI de CRUD de catálogo; `catalogo_servicos` tem 0 linhas)
- `portal-cliente`: `marca.manifest` (portal lê o `manifest.json` estático direto), `materiais.list`
- Quase-órfãs: `eloi-gestao materiais.upsert/delete`, `entregas.list`, `orcamentos create/update/delete` — existem em `admin-app/src/lib/api.ts` mas nenhuma página da SPA as usa

---

## 6. A decisão que destrava tudo

**Terminar a SPA ou aposentá-la?** Todo o resto decorre disso.

### Opção 1 — Aposentar `/admin-app/`, consolidar no HTML
- **A favor:** volta ao plano vencedor; fases 0–3 e P1 já executadas; `/gestao` e `/painel-orcamentos` são as versões completas; SPA tem 2 páginas em placeholder; sem build, coerente com o resto do repo
- **Contra:** joga fora trabalho feito; HTML multipágina envelhece pior
- **Custo:** baixo — deletar `admin-app/`, limpar 3 rewrites do `vercel.json`

### Opção 2 — Terminar a SPA, aposentar os HTMLs
- **A favor:** arquitetura melhor a longo prazo; estado compartilhado de verdade; um só lugar para corrigir
- **Contra:** reverte decisão de 3 juízes; exige portar `Briefings` e `Entregas`; introduz build num repo que não tem; `/painel` e `/painel-ecommerce` continuam necessários de qualquer jeito
- **Custo:** alto — portar ~3.100 linhas com paridade

### Opção 3 — Congelar a SPA, decidir depois
- **Contra:** é o estado atual. Foi ele que produziu o problema.

**Recomendação: Opção 1.** Não por preferência técnica — HTML multipágina não é superior a React. É que o plano A já está 80% executado, a SPA está ~60% e parada, e a diferença de valor entre as duas não paga o custo de portar. O critério é "qual caminho tem menos trabalho até uma arquitetura única", e é o HTML.

**Se você prefere React, a Opção 2 é legítima** — mas então precisa ser decisão explícita e a migração precisa terminar, não ficar em validação indefinida.

---

## 7. Ordem sugerida

**Fase 0 — independe da decisão (fazer já)**
1. S1: `gate.js` em `/apresentacao/`
2. S2: migrar marca para bucket privado + signed URL, ou aceitar que é pública por escrito
3. Corrigir `CLAUDE.md` (`eloi_pw` → `eloi_admin_token`) e `SITEMAP.md:23`
4. S6: rotacionar `ADMIN_PASSWORD`
5. Versionar `briefing-submit` no repo (S4)

**Fase 1 — a decisão**
6. Escolher Opção 1 ou 2. Executar. Uma arquitetura só.

**Fase 2 — duplicação barata**
7. D8: deletar `/orcamento-inteligente/` (checar antes se o link circulou)
8. D3: criar `edge-functions/_shared/auth.ts`, remover as 7 cópias
9. D6: unificar `orcamento-precampanha` (uma página, modo por querystring)
10. D10: `gestao/` passa a usar `periodo.js` compartilhado

**Fase 3 — estrutural**
11. D5: decidir fonte única de "arquivo entregue" — Storage listing ou `eloi_materiais`. Hoje são duas.
12. D2/D9: extrair o motor de briefing (wizard + autosave + submit) para `assets/briefing/`; os 4 forms viram config + campos
13. Confirmar 0 linhas em `briefings`/`ecommerce_briefings`; se confirmado, aposentar `/painel/`, `/painel-ecommerce/` e as 2 functions (`plano.md:352`)
14. D4: avaliar unificar `admin_sessions` + `portal_sessions` numa tabela com coluna de papel

**Fase 4 — higiene**
15. Remover actions órfãs ou construir a UI que as justifica
16. Decidir sobre `novo-visual/` (hoje: 135 linhas, placeholders, não commitada, ninguém aponta pra ela)

---

## 8. Restrições a respeitar

- `plano.md:110` — **allowlist de tabelas obrigatória**: `clients`/`services` do app ELOI Financeiro dividem o mesmo projeto Supabase e colidem de nome com `eloi_clientes`/`eloi_servicos`
- `plano.md:261` — **não consolidar edge functions**: manter `eloi-gestao`/`orcamentos`/`briefing-links` separadas limita o blast radius. Foi decisão explícita, não omissão
- **1 usuário admin para sempre** — multi-usuário descartado (`plano.md:38,358`)
- `/orcamento/?t=` e links de briefing já enviados a clientes **não podem quebrar**
- A marca já foi privada → pública → privada. Antes de mexer de novo, confirmar qual é a intenção atual: `addendum:5` registra que o motivo do link permanente era **repasse pra gráfica/agência sem depender de sessão**
