# Rebuild ELOI — Sub-projeto 2: Painel interno (design)

**Data:** 2026-07-30 · **Status:** visual entregue pelo Wilke em alta fidelidade (KV v3); mapeamento técnico e gaps de backend levantados nesta sessão — falta sua confirmação nas seções "Assunções" e "Decisões abertas" antes do plano.
**Contexto:** decomposição em `2026-07-27-rebuild-ESTADO-BRAINSTORM.md` (sub-projeto 2, depende do 1/Fundação — concluída, ver `2026-07-27-rebuild-fundacao-design.md`). Vocabulário do domínio em `../../../CONTEXT.md` (termos **Projeto**, **Etapa**, **Decisão** nascem aqui). Handoff visual completo (cores, tipografia, grid, 7 telas, estados, responsividade, a11y, motion) copiado verbatim em `design-assets/painel-kv3/README.md` + os `.dc.html` interativos na mesma pasta — **este documento não repete esse conteúdo**, ele cobre o que o handoff não define: mapeamento pros dados reais, gaps de backend, e decisões de produto em aberto.

## Objetivo

Substituir `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/` e `admin-app/` por 5 áreas + Ferramentas›Entregas dentro da SPA `app/` (`/admin/*`), com o sistema visual KV v3. Termina quando as 7 telas rodam com dado real, os painéis antigos saem do ar, e CI continua verde.

## Não-objetivos

- **Site público** (`Site Eloi.dc.html`, `Eloi KV v3.dc.html` como peça de marca) — sub-projeto 6, mais tarde. Usamos o KV v3 aqui só como fonte de tokens (cores/tipografia/silhuetas/motion), não implementamos a landing.
- **Motor de briefing novo** (os 4 forms client-facing) — sub-projeto 4. A tela "Briefings" do painel só lista convites/respostas; não toca nos forms.
- **Portal do cliente, entrega de marca (ferramenta `/marca/`)** — sub-projetos 3/5. A tela "Entregas" do painel lista `eloi_materiais`; gerar variação de logo continua sendo a ferramenta `/marca/` existente, só passa a ser **linkada** a partir da Ficha do Cliente/Entregas em vez de ficar no menu principal (conforme a decisão de produto do handoff) — sem reescrever `/marca/`.
- **Retrofit visual dos HTMLs legados com `kv.css`** — eles são retirados, não redecorados. `design-assets/painel-kv3/design/kv-sistema/kv.css` fica só como referência de tokens caso algum dia sobre alguma página estática viva.

## Achados que corrigem o handoff (verificados no código, não assumidos)

O handoff foi escrito olhando pra um estado do repo que já mudou. Confirmado por leitura direta do código atual:

| Handoff dizia | Realidade no repo hoje |
|---|---|
| `wordmark.svg`/`wordmark-light.svg` são byte-idênticos, nenhum declara `fill`, sai preto | **Falso.** Os dois têm `fill` (via `<style>` interno) e são diferentes: `wordmark.svg` usa `fill: var(--logo-1, #240043)` (aceita override, cai pro roxo escuro se a var não resolver); `wordmark-light.svg` tem lilás claro fixo. O bug real é mais sutil: **`<img src="wordmark.svg">` não herda `--logo-1` da página** (imagem externa é isolada), então em qualquer fundo escuro a wordmark sempre cai no fallback escuro — quase invisível, não "preta" literalmente, mas o sintoma prático (wordmark some no escuro) é real. `wordmark-light.svg` está **órfão** (nenhum arquivo do repo o referencia). |
| `nav.js` tem 236px, `admin.css` declara `--sidebar-w:248px`, "os dois nunca bateram" | Confirmado que os números diferem, mas não colidem em runtime: `--sidebar-w` é uma variável **órfã** (só a própria declaração, nada lê). `nav.js` hardcoda 236px em JS puro. **Bônus:** existe uma terceira largura, 220px, hardcoded em `admin-app/src/styles.css` (CSS totalmente independente). Três sistemas, três larguras, nenhuma é "o padrão" — e a `app/` nova ainda não tem sidebar nenhum. |
| — | **Não estava no handoff:** `admin-app` tem bugs de nome de campo que fazem colunas renderizarem sempre vazias — ver seção seguinte. Não portar essas telas como estão. |

### Bugs de campo no `admin-app` — portar a lógica, não os nomes

`admin-app/src/types/domain.ts` e as páginas leem campos que **não existem** no retorno real das edges (schema real em `db/*.sql` usa inglês `created_at`, não `criado_em`):

- `Clientes.tsx`, `Orcamentos.tsx`, `ClienteDetail.tsx`, `Servicos.tsx` leem `.criado_em` → sempre "—" (campo real: `created_at`).
- `Servicos.tsx`, `ClienteDetail.tsx` leem `.status` do serviço → sempre vazio (campo real: `status_execucao`, valores `aguardando_inicio|em_execucao|concluida`).
- `Servicos.tsx` chama de "Título" o campo que na tabela é `descricao` (`eloi_servicos` não tem coluna `titulo`).
- `Financeiro.tsx`: o form de novo movimento manda `data` mas a edge espera `data_movimento` — todo movimento criado por essa tela grava sem data.
- `ClienteDetail.tsx` espera um array `entregas` que `clientes.detail` nunca retornou (a edge devolve `materiais` e `resumo`, ambos ignorados pelo front atual).

Os componentes genéricos (`Rows`, `Cards`, `useFetch`, `ToastProvider`, `States`) em `admin-app/src/ui.tsx` são bons padrões — **portar esses**, com os nomes de campo corrigidos.

## Gaps de backend que o handoff pressupõe e não existem ainda

Três coisas que o design descreve como se já fossem possíveis, mas a edge function não suporta hoje. Sem isso, três pedaços do design não têm dado pra mostrar:

1. **Tela "Entregas" (grade cross-cliente)** — não existe ação de listar `eloi_materiais` de todos os clientes; `eloi-gestao.ts` só tem `materiais.upsert`/`materiais.delete`, e a única leitura é embutida em `clientes.detail` (por cliente). **Precisa:** nova action `materiais.list` (global, admin) em `eloi-gestao.ts` — respeita a regra de não consolidar functions (é uma action nova numa function que já existe, não uma function nova).
2. **"Vincular cliente" em briefing legado** — as tabelas `briefings` e `ecommerce_briefings` (forms sem token) **não têm coluna `cliente_id`** nenhuma, e `get-briefings.ts`/`get-ecommerce-briefings.ts` só listam (sem update). **Precisa:** migration aditiva (`alter table ... add column cliente_id uuid references eloi_clientes(id)`) nas duas tabelas + action de update em cada edge (ou a mesma function ganha um segundo `action`).
3. **"Vincular cliente" em convite `briefing_links` sem cliente** — `briefing-links.ts` só tem `list`/`create`/`delete`, sem `update`. **Precisa:** action `update` (ou `vincular_cliente`) na mesma function.

Nenhum desses 3 é migração de dado arriscada (só coluna nova nullable + action nova). Viram tasks próprias no plano, antes das telas que dependem delas.

## Mapeamento por tela (edge/action real — visual já definido no handoff)

| Tela | Fonte de dado | Observação |
|---|---|---|
| **Hoje** | `financeiro.stats`, `dashboard.stats`, + `decisoesDoDia()`/`prazos()` calculados no front (ver "Regra: Precisa de você") | Nenhuma edge retorna "decisões" prontas — é leitura derivada, ver `CONTEXT.md` termo **Decisão**. |
| **Projetos** | `orcamentos` (`list`) + `servicos.list`, unidos por `orcamento_id` → **Projeto** (ver `CONTEXT.md`) | `orcamentos.valor_total` é **reais** (numeric), `eloi_servicos.valor_cents` é **cents** — não comparar/somar direto, converter primeiro (ver "Assunções"). |
| **Clientes** | `clientes.list` | Já retorna `total_servicos`/`total_cents` agregados — não recalcular no front. |
| **Ficha do cliente** | `clientes.detail` | Consumir `resumo` (faturado/recebido/a_receber) e `materiais` que a edge já manda e o `admin-app` ignora — sem re-somar no front. |
| **Dinheiro** | `caixas.list`, `movimentos.list`, `financeiro.stats` | Gráfico mensal = agregação de **entradas** de `movimentos.list` por `data_movimento` (mês), separando `status='realizado'` (barra cheia) de `status='previsto'` (contorno) — ver assunção abaixo. |
| **Briefings** | `briefing-links` (list) + `get-briefings` + `get-ecommerce-briefings`, mesclados no front por `created_at` | Depende do gap #2/#3 pra "Vincular cliente" funcionar. |
| **Entregas** | `materiais.list` (novo, gap #1) | — |

## Assunções (V1 — ajustável, sinalize o que quiser mudar)

1. **Etapa do Projeto** e **Orçamento recusado fica fora do board** — já resolvidos e documentados em `CONTEXT.md` (termo "Etapa"), com base no schema real e no trigger `trg_eloi_orcamento_aprovado`. Ver `docs/adr/0001-projeto-e-view-nao-tabela.md` pra por que isso não virou tabela nova.
2. **Regra "Precisa de você" (Hoje):**
   - Serviço `concluida` sem `nf_numero` → decisão "Lançar NF" (ação lima).
   - Serviço `concluida` + `pago=false` → decisão "Cobrar pagamento" (laranja se `data_competencia` já passou).
   - Movimento `previsto` com `data_movimento` no passado e ainda `previsto` → decisão "Conferir recebimento" (laranja).
   - Orçamento `enviado` há mais de 5 dias sem virar `aprovado`/`recusado` → decisão "Cobrar decisão do cliente".
   - **"Prazos"** (bloco separado, só informativo) = os mesmos itens com data futura próxima, ordenados por distância — não duplica os botões de ação.
3. **Gráfico de Dinheiro** agrega só **entradas** (receita), não saldo líquido — combina com a leitura "faturado × previsto" do resto do painel. Saídas aparecem só na lista de movimentos, não no gráfico.
4. **`orcamentos.valor_total` (reais) → cents**: multiplicar por 100 e arredondar (mesma conta que o trigger SQL já faz) antes de qualquer soma/formatação junto de campos `_cents`. Centralizar num helper (`app/src/lib/dinheiro.ts` ganha `centsDeReais(valor_total: number)`), não espalhar `* 100` pelas telas.
5. **`/marca/` (ferramenta de geração de logo) e nav.js**: depois que `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/` saírem, `/marca/` fica como a ÚNICA página ainda usando `assets/eloi-admin/nav.js` — cujo `PRIMARY` aponta pra 4 rotas que vão deixar de existir. V1: trocar o sidebar injetado de `/marca/` por um link único "← Painel" pra `/admin`, e não tocar mais em `nav.js`/`admin.css` (ficam mortos, candidatos a remoção numa limpeza futura, fora de escopo aqui).

## Arquitetura técnica

- **`app/src/lib/api.ts`** ganha wrappers por domínio (padrão de organização do `admin-app/src/lib/api.ts`, nomes de campo corrigidos): `api.clientes.*`, `api.projetos.*` (orquestra `orcamentos`+`servicos`), `api.financeiro.*`, `api.briefings.*`, `api.materiais.*`. A allowlist de `Fn` em `api.ts` precisa incluir `get-briefings`/`get-ecommerce-briefings` (hoje só tem as 5 da Fundação).
- **`app/src/domain/projeto.ts`** (novo): `etapaDoProjeto()`, `juntarProjetos()`, `decisoesDoDia()` — funções puras, testáveis, onde mora a lógica de `CONTEXT.md`. Testes aqui importam mais que em qualquer tela (é dinheiro + regra de negócio, D9 da Fundação).
- **Rotas** sob `/admin/*`: `/admin` (Hoje), `/admin/projetos`, `/admin/clientes`, `/admin/clientes/:id`, `/admin/dinheiro`, `/admin/briefings`, `/admin/entregas`. Todas lazy (mesmo padrão da Fundação).
- **Layout**: `Shell.tsx` deixa de ser vazio — ganha `<aside>` 202px + topbar sticky, tokens KV v3 novos substituem os valores placeholder de `app/src/app.css` (que hoje tem `--brand:#5A189A`, cor da geração antiga, incompatível com o roxo novo `#7D2AE8`).
- **Assets**: copiar `wordmark-kv.svg` (fundo escuro) e `wordmark-tinta.svg` (placas claras) do handoff pra `app/public/` (ou equivalente) — resolve o achado do `<img>`/CSS-var sem precisar consertar o SVG antigo. `wordmark-light.svg` órfão não é tocado (fora de escopo; é do sistema antigo).

## Decisões abertas — resolvidas com default; corrija se eu chutei errado

Sem resposta sua ainda, então segui com a opção mais barata/reversível em cada uma. O plano abaixo já reflete isso — é só falar que eu ajusto antes ou durante a execução:

1. **Throttle/lockout no `admin-auth.login`** — **default: incluir**, como task opcional isolada no fim do plano (porta o mecanismo que já existe em `portal-cliente.ts`; barato, fecha gap de segurança real). Se preferir deixar de fora como ticket separado, eu tiro do plano.
2. **Fonte `Juturu-VariableVF.woff2`** (sem uso) — **default: remover** do repo (nenhuma tela do handoff a usa; `carbona-variable` é a fonte única do sistema). Se for pra usar em algo, avisa antes da task de assets.
3. **As 5 assunções da seção anterior** — **default: seguir como documentado**. Ajusto qualquer uma a qualquer momento, inclusive no meio da implementação.

## Critérios de aceite

1. As 5 áreas + Entregas funcionam com dado real, sem campo mostrando "—" por bug de nome (criado_em/status/data corrigidos).
2. `Projeto` calcula a Etapa certa nos 6 casos de `CONTEXT.md` (incl. serviço sem `orcamento_id` e orçamento aprovado sem serviço vinculado).
3. Dinheiro exibido correto em todo lugar, incluindo `orcamentos.valor_total` convertido — nenhuma soma mistura reais com cents.
4. Sidebar 202px, tokens KV v3 aplicados, `prefers-reduced-motion` respeitado, wordmark visível em fundo escuro.
5. `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/`, `admin-app/` saem do ar (`vercel.json` + arquivos); rotas congeladas (briefings, portal, orçamento público, entregas-marca) continuam intactas; `/marca/` continua acessível.
6. Os 3 gaps de backend fechados e verificados manualmente com registro descartável (o repo não tem precedente de Deno test unitário pra actions CRUD dentro das edge functions grandes — só pra `_shared/`, que é lógica pura; manter esse padrão em vez de inventar um novo só pra esta task).
7. CI verde.
