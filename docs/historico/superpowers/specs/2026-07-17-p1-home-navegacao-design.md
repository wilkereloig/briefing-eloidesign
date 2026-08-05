# Spec P1 — Painel ELOI: Home + Navegação

**Origem:** roadmap `docs/superpowers/2026-07-17-painel-redesign-roadmap.md` (seção P1), brainstorming 2026-07-17.
**Escopo:** transformar `admin/index.html` de hub-de-atalhos em visão administrativa, e introduzir navegação persistente (sidebar) compartilhada por todas as páginas admin. Primeiro dos 4 sub-projetos do redesign.

## Decisões (fechadas no brainstorming)

1. **Navegação = sidebar lateral** (não top bar).
2. **Sidebar compartilhado em todas as páginas admin** via componente único.
3. **Integração = partial injetado por JS** (Abordagem A). Um `nav.js` que cada página inclui com 1 `<script>`. Não reestrutura o layout interno de cada página: sidebar é `position:fixed`; o deslocamento do conteúdo é feito por `padding-left`/`padding-top` aplicado via **inline style** no `<body>` (sobrepõe shorthand de padding de cada página).
4. **"Próximos prazos/entregas" fica pro P2** (depende de `data_entrega_prevista`, que não existe ainda). Não construir seção sem dado.
5. **Estimativa de receita** = orçamentos aprovados sem serviço vinculado = `aprovados_pendentes_cents` de `eloi-gestao dashboard.stats`. NÃO soma com Recebido.
6. **`periodo.js`** = helper compartilhado com a lógica canônica de período/formatação. Home consome. Gestão permanece com sua cópia inline por ora (recém-shippada e funcionando) — migração da Gestão pro helper é follow-up marcado com `ponytail:`, fora do P1 pra não arriscar página estável.
7. **Nav primária:** Painel · Gestão · Briefings · Orçamentos · Orçamento inteligente · Portal do Cliente.
   - `/aplicativos/` removido da nav **e a rota apagada** (dir `aplicativos/`).
   - `/marca/` (Entregas de Marca) sai da nav primária → item secundário "Ferramentas" no rodapé do sidebar.
   - "Portal do Cliente" aponta pra `/gestao/` (aba Clientes, onde se gera senha do portal) até o P4 ter tela dedicada.

## Arquitetura

Três artefatos novos em `assets/eloi-admin/`, mais a reescrita da home e edições pequenas nas outras páginas.

### `assets/eloi-admin/periodo.js` (helper puro, sem DOM)
Expõe em `window.EloiPeriodo`:
- `MESES` (['Jan'…'Dez']), estado `criar()` → `{ano, mes}`.
- `ymPeriodo(p)`, `mesDe(s)`, `noPeriodo(p,s)`, `pagoNoPeriodo(p,s)`, `anosDisponiveis(servicos)`.
- Formatação: `brl(cents)`, `esc(s)`, `dataBR(d)`.
- `corDaMarca(nome)` + `PALETA_MARCA`.

Semântica idêntica à Gestão (competência define o mês do serviço; pagamento define o mês do recebido). Fonte de verdade única daqui pra frente.

### `assets/eloi-admin/nav.js` (sidebar compartilhado)
- Expõe `window.EloiNav = { mount, unmount }`.
- `mount()`: se já montado, no-op. Injeta `<aside>` sidebar + `<div>` topbar mobile (com hambúrguer) + `<style>` próprio (escopo com prefixo `eloi-nav-`). Busca o wordmark de `/assets/eloi-admin/wordmark.svg`.
- Item ativo derivado de `location.pathname` (match por prefixo de rota).
- Desloca conteúdo: desktop (`min-width:900px`) → `body.style.paddingLeft='240px'`; mobile → `body.style.paddingTop='52px'`, sidebar off-canvas (`transform`), abre/fecha pelo hambúrguer, fecha ao navegar/redimensionar. Reavalia em `resize` via `matchMedia`.
- Ações rápidas no rodapé: **+Serviço**, **+Orçamento**, **+Cliente** (link pra `/gestao/`, `/painel-orcamentos/`, `/gestao/` respectivamente — abrir modal específico fica pra depois; por ora navega pra página certa) e **Sair** (`EloiAdminAuth.logout()` + reload).
- Auth-aware: `mount()` só injeta se `EloiAdminAuth.token()`. Cada página chama `EloiNav.mount()` no load (se logada) e no sucesso do login.

### `admin/index.html` (reescrita — Home)
Mantém o bloco de **login** (idêntico ao atual, `EloiAdminAuth`). Logado: chama `EloiNav.mount()` e renderiza o dashboard. Inclui `periodo.js` e `nav.js`.

Conteúdo do dashboard (usa `EloiPeriodo`), de cima pra baixo:
1. **Cabeçalho:** saudação + navegação mensal (abas Jan–Dez + Todos, seletor de ano quando houver >1). Abre no **mês atual**.
2. **Linha financeira** (4 cards): Faturado · Recebido · A receber · Estimativa. Faturado/Recebido/A receber calculados dos serviços no período (mesma fórmula da Gestão). Estimativa = `aprovados_pendentes_cents` (rótulo "orçamentos aprovados sem serviço"). Clique em qualquer um → `/gestao/`. Variação vs mês anterior exibida quando houver dado dos dois meses.
3. **Sua atenção** (lista priorizada de pendências): NF pendente (serviço sem `nf_numero`), pagamento pendente (`!pago`), orçamento aguardando (status `enviado`), briefing pendente. Cada linha: tipo · cliente/marca · descrição · data · link direto pra página de origem. Ordena por urgência (NF/pagamento antes de briefing). Limite ~8, com "ver todos" pra Gestão/páginas.
4. **Resumo operacional** (contadores-alerta, linha de mini-stats): em execução, NF pendentes, pagamentos pendentes, orçamentos aguardando, briefings pendentes.
5. **Clientes em destaque** (top do período): por cliente, Faturado/Recebido/A receber + nº em execução. Ordena por faturado desc, top ~5. Reusa fórmula da aba Clientes da Gestão.
6. **Atividade recente:** mantém a lógica atual (briefings respondidos + orçamentos), ~7 itens.

Fontes de dados (todas já existem): `eloi-gestao servicos.list` + `dashboard.stats`, `briefing-links list`, `orcamentos list`. Sem dado fictício; cada seção tem estado vazio desenhado.

### Edições nas outras páginas admin (5)
`gestao/`, `painel-briefings/`, `painel-orcamentos/`, `orcamento-inteligente/`, `marca/`:
- Adicionar `<script src="/assets/eloi-admin/nav.js"></script>` antes do `</body>`.
- Chamar `window.EloiNav && EloiNav.mount()` no load (quando logado) e no sucesso do login de cada página.
- Nenhuma outra mudança de layout (o `padding` do body é ajustado pelo nav.js).

### Remoção
- Deletar diretório `aplicativos/` (rota `/aplicativos/`).
- Remover qualquer referência a `/aplicativos/` no restante do repo.
- Atualizar `SITEMAP.md` (rota removida; sidebar novo; item "Entregas de Marca" agora secundário; nota do `periodo.js`/`nav.js`).

## Direção visual
Noturno roxo maduro (paleta `--c950…--c100`, aurora de fundo mantida na home). Sidebar em vidro escuro, item ativo com barra/realce lilás sutil, ícones discretos (SVG inline ou glifos simples, sem emoji-como-elemento nas seções). Hierarquia forte pros valores financeiros e pendências; badges pequenos consistentes com a Gestão. Mobile: nav mensal com scroll-x, cards legíveis, drawer confortável, ações acessíveis.

## Regras de dados
Totais só de registros reais; "Faturado" ≠ "Recebido" ≠ "Estimativa" (nunca somar Estimativa com o resto); estados vazios bem desenhados; preservar dados/rotas/funções existentes (só `/aplicativos/` é removido, por decisão explícita).

## Testes / verificação
- Preview local (`launch.json` porta 5186) servindo `admin` e `gestao`.
- Home: login → dashboard renderiza mês atual, 4 cards financeiros coerentes com a Gestão do mesmo mês, sidebar aparece, navegação mensal funciona, links levam às páginas certas.
- Sidebar: aparece nas 6 páginas logado; item ativo correto por página; drawer abre/fecha no mobile (resize p/ 375px); conteúdo não fica escondido atrás do sidebar.
- Regressão: Gestão continua funcionando idêntica (cards, ranking, serviços, modais) com o sidebar sobreposto.
- Sem erros no console.

## Fora de escopo (P1)
Migração da Gestão pro `periodo.js`; campo `data_entrega_prevista` e bloco de prazos (P2); abrir modal específico pelas ações rápidas do sidebar (por ora navega pra página); tela admin dedicada do Portal (P4).
