# Inventário real — 2026-10-09

Etapa 1 do plano de evolução (`docs/EVOLUCAO-FINANCEIRO.md`). Feito com leitura do
código dos dois repositórios e consultas **somente leitura** ao projeto Supabase.
Nenhum dado foi alterado. Este arquivo é público: não contém nome, valor, conta
nem identificador financeiro real. Os números de dinheiro do baseline ficam fora
do repositório (ver §7).

## 1. Ambiente

| Item | Estado real |
|---|---|
| Postgres | 17.6 (Supabase, sa-east-1) |
| Extensões | `pg_cron`, `pg_net` (em `public` — aviso do advisor), `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements` |
| Schemas de terceiros no mesmo projeto | `dia_criancas`, `notas_aromas` (outros projetos — **não tocar**) |
| Buckets | `eloi-notas` (privado, 9 objetos, todos referenciados), `eloi-entregas` (privado, vazio), `anexos` (privado, vazio — app Financeiro) |
| Cron | `recurrences-daily` e `reminders-daily` — **do app Financeiro**, chamam edges dele via HTTP. O Studio não tinha cron até a migração `2026-10-09-rotina-diaria-cron.sql` |
| Auth | 1 usuário no Supabase Auth (app Financeiro). O Studio não usa Supabase Auth: senha admin única → `admin_sessions` |

### Edge functions publicadas (13)

| Função | Dono | Observação |
|---|---|---|
| `eloi-financas`, `eloi-gestao`, `admin-auth`, `portal-cliente`, `orcamentos`, `briefing-submit`, `briefing-links`, `get-briefings`, `get-ecommerce-briefings` | Studio | código em `edge-functions/` |
| `eloi-financeiro` | Studio (legado) | **ainda ATIVA** em produção, embora o repo diga que saiu em 2026-10-08. Conferir o que responde antes de remover (pedir autorização) |
| `recurrences`, `reminders`, `categorize` | app Financeiro | sem checagem de quem chama (ver §5) |

## 2. Matriz de propriedade dos dados

| Tabelas | Dono | Linhas hoje | Quem escreve |
|---|---|---|---|
| `eloi_*` (15), `orcamentos`, `catalogo_servicos`, `briefings`, `ecommerce_briefings`, `briefing_links`, `admin_*`, `portal_*`, `briefing_submit_ip_attempts` | **Studio** | transações ~3 centenas; serviços ~6 dezenas; notas ~5 dezenas | edges do Studio (service_role); `briefings`/`ecommerce_briefings` também por **REST anônimo** (§5) |
| `transactions`, `cards`, `categories`, `recurrences`, `budgets`, `monthly_goals`, `clients`, `services`, `workspaces`, `workspace_members`, `invites`, `category_rules`, `push_subscriptions`, `shared_*`, `app_secrets` | **app Financeiro** | `transactions`, `cards`, `clients`, `services`, `recurrences`, `shared_*` = **0**; `workspaces` 2; `categories` 17 | cliente Supabase JS do app Financeiro (RLS por membro) |

**Qual aplicação recebe lançamentos: só o Studio.** O app Financeiro não tem nenhuma
transação, cartão, cliente ou serviço gravado. Os dois apps **não têm sobreposição
de registros** — a consolidação (Etapa 4) não tem dado a migrar, só recursos a portar.
O motivo provável de o app Financeiro estar vazio é o bug 42P10 (§5): a importação
dele sempre falhou.

## 3. Schema aplicado × migrações do repositório

Comparação por impressão digital (`database/homologacao/fingerprint.sql`: colunas,
tipos, nulidade, default, constraints, índices, políticas, triggers) das 26 tabelas
do Studio, e hash das funções `eloi_*`.

- **Antes:** recriar o banco só com `database/migrations/` falhava (coluna
  `eloi_servicos.sub_cliente`, criada fora do repo, faltava) e, mesmo contornado,
  divergia em 6 tabelas: 4 índices, 2 políticas de INSERT anônimo, a coluna, e os
  triggers que dependiam dela.
- **Correção:** `2026-07-15-servicos-sub-cliente-legado.sql` (registro retroativo) e
  `2026-10-09-reconcilia-schema-producao.sql`. Ambas idempotentes — em produção são
  no-op.
- **Depois:** as 26 tabelas batem **exatamente**. As 5 funções `eloi_*` batem (uma
  difere só em comentários).
- Ordem de aplicação: `database/homologacao/ordem.txt` (arquivos sem data são
  anteriores à convenção).

## 4. Fluxos que escrevem ao abrir uma tela

| Onde | O quê | Situação nesta branch |
|---|---|---|
| `app/src/lib/financas-store.tsx` (carga) | `recorrencias.gerar` em **toda** carga e em cada `recarregar()` (≈35 telas chamam), erro engolido | uma vez por sessão, erros em `falhas.recorrencias`; geração no banco, única por ocorrência; rotina diária no pg_cron (migração pendente de autorização) |
| `_shared/auth.ts` `requireAdmin` | estende a sessão (UPDATE) em toda chamada | mantido — é o renovador de sessão; documentado |
| `admin-auth` login | faxina de tentativas e sessões | mantido |
| `npm run dev` / preview da Vercel | `api.ts` apontava fixo para produção: dev local gravava no banco real | **corrigido**: `VITE_FUNCTIONS_URL`; fora de produção, escrita contra produção é bloqueada no cliente |

## 5. Diagnóstico priorizado

Gravidade: **A** pode produzir número errado, perda ou exposição; **M** inconsistência
recuperável; **B** robustez. ✅ = corrigido nesta branch (código + teste; migração
pendente de autorização quando indicado).

| # | Grav. | Problema | Onde | Estado |
|---|---|---|---|---|
| 1 | A | Aviso de truncamento invertido (avisava à toa entre 2 mil e 20 mil; calava no corte real) | store | ✅ `completo`/`total` vêm do servidor |
| 2 | A | Saldo só no cliente, sobre a lista carregada | store/domínio | ✅ `eloi_saldos_contas` (banco, histórico inteiro) + aviso de divergência |
| 3 | A | `transacoes.liquidar` lê-soma-grava: dois pagamentos simultâneos perdem um | edge | ✅ `eloi_liquidar` com trava de linha + idempotência (teste de concorrência) |
| 4 | A | Recorrência: confere-depois-insere, sem índice único, a cada carga | edge/store | ✅ índice `(recorrencia_id, ocorrencia)`, RPC com trava, teste com 3 chamadas simultâneas |
| 5 | A | Recorrência sem conta trava para sempre, calada | edge | ✅ conta obrigatória; erro gravado e mostrado |
| 6 | A | `resultado()` = liquidado filtrado por competência (mês corrente parece sem despesa; empréstimo recebido vira receita) | domínio | ✅ renomeado `resultadoLiquidadoPorCompetencia`; novos `resultadoPorCompetencia` (domínio) e perspectivas no banco. **Telas ainda usam o antigo** (Etapa 6/7) |
| 7 | A | Arquivar conta/cartão com saldo ou dívida tirava o valor do patrimônio e da cobertura | domínio | ✅ `pesaNosTotais` |
| 8 | A | Pagar conta "com o cartão" na folha de baixa marcava a conta paga dentro do cartão — não entrava em fatura, a dívida sumia | folha + edge | ✅ bloqueado com orientação; modelagem completa na Etapa 5 |
| 9 | A | `vercel.json` publica o repositório inteiro (`outputDirectory: "."`), inclusive ZIP/PDF de entrega de cliente em `entregas-marca/` — o "gate" é só no navegador | hospedagem | ⏸ dono decidiu manter como está (2026-10-09) |
| 10 | A | Briefing sem token grava direto em `/rest/v1/` com a chave pública — existe política de INSERT anônimo em produção (não estava em migração nenhuma) | páginas estáticas | ⏳ Etapa 9; agora registrada em migração |
| 11 | A | Edges do app Financeiro (`categorize`, `reminders`, `recurrences`) sem checagem de chamador; `categorize` usa chave de IA | app Financeiro | ✅ desativadas (410), cron desligado, site pausado — 2026-10-09 |
| 12 | M | `pagar_fatura` não idempotente (duplo envio debitava de novo) | edge | ✅ chave + recusa sem compra em aberto |
| 13 | M | Apagar/cancelar pagamento de fatura deixava compras quitadas sem saída de dinheiro | edge | ✅ bloqueado (409); estorno de pagamento de fatura na Etapa 5 |
| 14 | M | Conferência e ajuste fora de transação; saldo do sistema vinha da tela | edge | ✅ RPC única; saldo recalculado no servidor; ajuste exige justificativa |
| 15 | M | Empréstimo e parcelas fora de transação | edge | ✅ `eloi_criar_emprestimo` |
| 16 | M | Status "vencido" só mudava se alguém editasse | edge | ✅ situação do dia na leitura (sem gravar) + rotina diária |
| 17 | M | Parcelamento: status fixo "previsto" e vencimento fora do ciclo do cartão | edge | ✅ |
| 18 | M | Retomar recorrência pausada cobrava o período pausado | edge | ✅ |
| 19 | M | Recorrência mensal no dia 31 "encolhia" para 28 depois de fevereiro | edge | ✅ usa `dia_cobranca` |
| 20 | M | Tipo/contexto/saldo inicial de conta com histórico mudavam livremente | edge | ✅ trava (trigger) + motivo + auditoria |
| 21 | M | Categoria de outro contexto/tipo aceita no lançamento | edge | ✅ validada |
| 22 | M | Importação ignora erro da consulta de existentes; colisão derruba o lote | edge | ⏳ Etapa 5 (novo fluxo de importação) |
| 23 | M | `nf.upsert` em três escritas; `nf.remover` ignora erro | edge | ⏳ |
| 24 | M | Serviço "pago" e receita são registros independentes (nenhum serviço pago tem transação vinculada; entradas da empresa sem `servico_id`) | modelo | ⏳ Etapa 4 — vínculo por candidatos, sem somar os dois |
| 25 | B | Logout deixava buscas recentes (cliente/valor) e paginação no navegador | cliente | ✅ |
| 26 | B | Listas sem paginação (`clientes.list`, `servicos.list`, `orcamentos.list`), notas/arquivos `limit(500)`, conferências `limit(100)` sem aviso | edges | ⏳ |
| 27 | B | `clientes.upsert`/`servicos.upsert` substituem o registro inteiro | eloi-gestao | ⏳ |
| 28 | B | Telas recalculando dinheiro (ficha do cliente, notas, projetos) | telas | ⏳ Etapa 6 |
| 29 | B | Corrida no throttle de login/portal e em `client_decide` de orçamento | edges | ⏳ Etapa 8 |

## 6. App Financeiro (repositório separado)

Inventário completo feito no clone; resumo do que importa para a consolidação:

- **Bugs confirmados:** `onConflict` contra índice **parcial** (erro 42P10) quebra
  importação, receita de serviço, cota paga e o cron de recorrências; transferência
  como par entrada+saída infla "Entrou/Saiu"; estorno de fatura descartado em silêncio;
  dedup sem sinal e sem FITID; total da fatura congelado; sem paginação acima de 1000;
  hooks fora de ordem em Compartilhadas (crash ao navegar); edges sem autorização;
  trigger `on_auth_user_created` dispara para todo usuário do projeto.
- **Vale portar:** parser CSV/OFX tolerante (com FITID e sinal), categorização em
  camadas (regra → histórico → IA com confiança → pergunta), rateio de assinaturas
  (participantes e cotas), Web Push, busca global.
- **Não há dado a migrar.**
- **Desligado em 2026-10-09, a pedido do dono** (reversível, nada apagado):
  - cron `recurrences-daily` e `reminders-daily` → `active = false` (`cron.alter_job`);
  - edges `categorize`, `reminders` e `recurrences` → resposta 410 "app Financeiro
    desativado" (verify_jwt mantido). O código original está no repo `app-financeiro`,
    em `supabase/functions/`: para religar, basta redeployar de lá;
  - projeto Vercel `eloi-financeiro` → pausado (religar: unpause no painel da Vercel).
  - **Ficaram como estavam:** as tabelas dele (vazias ou quase), o trigger
    `on_auth_user_created` e o bucket `anexos`. Apagar exige outra autorização.

## 7. Baseline e backup

- **Baseline privado** (fora do git): contagens e checksums `md5` por tabela,
  transações por contexto/tipo/status/origem, saldos por conta, obrigações em aberto,
  empréstimos, vínculos cliente→serviço→nota→transação e arquivos referenciados × existentes.
  Serve para provar que uma migração não alterou nada além do previsto: recalcular os
  mesmos checksums antes e depois.
- **Backup restaurável: NÃO foi possível nesta sessão.** Não há credencial de banco
  (senha/connection string) nem token do CLI; o MCP só executa SQL e devolveria os
  dados pelo contexto da conversa. Por isso, **nenhuma transformação foi executada no
  banco real.** O que existe e foi validado:
  - **Estrutura:** recriável e conferida (§3) — `database/homologacao/recriar.sh`.
  - **Dados:** não exportados.
- **Procedimento de backup antes de aplicar as migrações (dono ou sessão com credencial):**
  1. Painel Supabase → Database → Backups (se o plano permitir download), **ou**
     `supabase db dump --data-only -s public -f dados.sql` + `supabase db dump -f schema.sql`
     com o token do CLI (`SUPABASE_ACCESS_TOKEN`).
  2. Storage: baixar o bucket `eloi-notas` (9 objetos) pelo painel.
  3. Restaurar num Postgres local: `recriar.sh` (estrutura) + `psql -f dados.sql`;
     conferir com `fingerprint.sql` e com os checksums do baseline.
  4. Só então aplicar as migrações de 2026-10-09, na ordem do `EVOLUCAO-FINANCEIRO.md`.
  5. Recalcular checksums e o relatório de invariantes; comparar.
- Recuperação de autenticação: o Studio depende de `ADMIN_PASSWORD` (secret da edge
  `admin-auth`) e das tabelas `admin_sessions`/`portal_sessions` (descartáveis). Os
  secrets não foram lidos nem alterados.
