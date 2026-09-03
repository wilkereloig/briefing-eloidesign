# Plano de operação — ELOI Studio · serviços, sub-clientes, nota fiscal e portal da F2

Escrito em 2026-08-28 a partir do código, do **banco de produção** e do
`git log` — não dos docs. Destino: uma sessão do Claude Code executar fase a fase.

> **Estado de partida:** `HEAD = d8f9499` ("feat(portal): cliente sugere valor de
> serviço pendente, dono aprova"), commitado às 11:16 de hoje. A migração
> `2026-08-28-servicos-valor-sugerido.sql` **já está aplicada em produção**
> (colunas conferidas no banco). Antes de qualquer coisa, confirmar que
> `portal-cliente` e `eloi-gestao` foram mesmo deployados por
> `npm run edges:deploy -- <fn>` — a migração aplicada com function velha faz o
> portal gravar em coluna que a function não conhece.
>
> Escopo fora daqui: núcleo financeiro (contas, transações, cartão, recorrência,
> metas) — ver `docs/PLANO-PAINEL-COMPLETO.md`. Não tocar, não apagar.

---

## 1. A verdade dos dados (medida no banco, não estimada)

```
eloi_servicos ......... 59 linhas   (2026-07-17 a 2026-08-28)
  com nf_numero ....... 43          soma dos valores: R$ 70.880,00 (7088000 cents)
  sem nf_numero ....... 16
  com PDF de NF ....... 0
  valor_cents = 0 ..... 11          ← "faltam preencher os valores"
  sem data_competencia  16
  com orcamento_id .... 0           ← nenhum serviço nasceu de orçamento aprovado
eloi_notas_fiscais .... 0 linhas    ← a tela /admin/notas está VAZIA
eloi_clientes ......... 2           (F2 EXPERIENCE, Georgia Andrade)
sub_cliente (texto) ... 9 valores distintos, todos dentro da F2
eloi_contas / eloi_transacoes / eloi_arquivos / eloi_materiais ..... 0
orcamentos ............ 1
```

| Sub-cliente (F2) | Serviços | Sem valor | Sem NF | Pagos |
|---|---:|---:|---:|---:|
| PLANO&PLANO | 13 | 0 | 0 | 13 |
| ASUS | 11 | 2 | 2 | 9 |
| VIBRA | 10 | 0 | 2 | 8 |
| F2 EXPERIENCE (trabalho direto) | 8 | 2 | 3 | 5 |
| SWEET & COFFEE WEEK | 7 | 3 | 4 | 3 |
| CONSTEL | 6 | 3 | 3 | 3 |
| LIGENCE | 1 | 1 | 1 | 0 |
| MRV | 1 | 0 | 0 | 1 |
| TRISUL | 1 | 0 | 0 | 1 |

**Quatro conclusões que decidem o plano:**

1. **O painel real é `eloi_servicos`.** Todo o núcleo financeiro está zerado.
2. **A nota fiscal vive no serviço, não na tabela de notas.** 43 notas em
   `eloi_servicos.nf_numero`, zero em `eloi_notas_fiscais`. A unificação tem que
   ser **serviço → nota**, nunca o contrário.
3. **42 números de NF para 43 serviços:** uma nota já cobre mais de um serviço.
   O vínculo correto é **1 nota : N serviços**, não 1:1.
4. **`Projetos.tsx` esconde o trabalho.** A tela filtra por
   `p.servico?.data_competencia` contra o mês do store
   (`Projetos.tsx`, no `useMemo` de `filtrados`). Como 43 dos 59 serviços têm
   competência de fevereiro a julho, a tela mostra só o mês corrente mais os 16
   sem data. **É a causa principal da sensação de desorganização.**

Fatos já conferidos que tornam o backfill da Fase 0 seguro: nenhum número de NF
aparece em dois clientes diferentes; todo serviço com nota tem
`data_competencia`; nenhum serviço com nota está com valor zero.

---

## 2. Como o negócio funciona

O Wilke presta serviço para a **F2 Experience**. A F2 atende outras marcas
(PLANO&PLANO, VIBRA, ASUS, CONSTEL, SWEET & COFFEE WEEK, MRV, TRISUL, LIGENCE) e
**é a F2 quem define o valor de cada serviço**. A F2 paga e recebe a nota.
Georgia Andrade é cliente direto, sem sub-cliente.

Ciclo real: serviço executado → **F2 informa o valor** → Wilke confere → emite a
NFS-e fora do sistema (Parnamirim) → anexa a nota → recebe → marca pago.

## 3. Decisões tomadas com o dono (2026-08-28)

| # | Decisão | Escolhida |
|---|---|---|
| D-18 | Sub-cliente | **Entidade real**, filha do cliente (`eloi_sub_clientes`) |
| D-19 | Valor informado pela F2 | **Sugestão que o dono aprova** — já implementado em `d8f9499` como `valor_sugerido_cents` |
| D-20 | Acesso ao portal | **Só a F2**, com divisão por sub-cliente dentro |
| D-21 | Núcleo financeiro | **Fora de escopo**; não tocar, não apagar |
| D-22 | Nota fiscal | Fonte única é a **nota** (`eloi_notas_fiscais`), vínculo **1 nota : N serviços**; `eloi_servicos.nf_numero` vira **espelho mantido por trigger**, para não quebrar `domain/decisoes.ts`, `dashboard.stats`, `/gestao` e `/portal` |

Registrar as cinco em `docs/DECISIONS.md` — a numeração continua de D-17.

---

## 4. Modelo de dados alvo

O fluxo de valor sugerido **já existe** e não é remodelado: `valor_sugerido_cents`
e `valor_sugerido_em` em `eloi_servicos`. **Não criar `valor_proposto_*` nem
nenhuma coluna paralela** — seria a mesma coisa com dois nomes.

### 4.1 `eloi_sub_clientes` (nova)

```sql
create table if not exists public.eloi_sub_clientes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.eloi_clientes(id) on delete restrict,
  nome        text not null,
  cor         text not null default '#7B2CBF',
  contato     text,
  observacoes text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists eloi_sub_clientes_cliente_nome
  on public.eloi_sub_clientes (cliente_id, lower(nome));
alter table public.eloi_sub_clientes enable row level security;
-- sem policy para anon: quem lê é a edge com service_role
```

`eloi_servicos` ganha
`sub_cliente_id uuid references public.eloi_sub_clientes(id) on delete restrict`.

**A coluna texto `sub_cliente` continua existindo** — `gestao/index.html` a lê em
8 lugares. Ela passa a ser **espelho**, mantido por um trigger próprio
(`trg_eloi_servico_espelha_sub_cliente`), não pela edge. Um campo com dois donos
diverge; o dono passa a ser `sub_cliente_id`.
Condição de saída da coluna texto: cair junto com `/gestao`.

### 4.2 Nota fiscal 1:N

`eloi_servicos` ganha
`nota_fiscal_id uuid references public.eloi_notas_fiscais(id) on delete set null`.

Dois triggers, porque `nf_numero` também vira espelho:

- `trg_eloi_servico_espelha_nf` — em insert/update de `eloi_servicos`, copia
  `numero` da nota vinculada para `nf_numero`; sem nota, `nf_numero` fica nulo.
- `trg_eloi_nota_propaga_numero` — mudou `numero` em `eloi_notas_fiscais`,
  atualiza os serviços daquela nota.

`eloi_notas_fiscais.servico_id` (1:1, sempre nulo hoje) fica marcada como legada,
com comentário e condição de saída.

**Consequência que a Fase 2 tem que tratar:** hoje `eloi-gestao.ts` grava
`nf_numero` à mão em `servicos.upsert`, alimentado pelo campo livre "Número da NF"
de `FolhaServico` (`app/src/routes/admin/folhas.tsx`). Com o espelho, esses dois
pontos passam a brigar com o trigger e **precisam sair no mesmo commit**.

### 4.3 Backfill — **idempotente**, dentro de uma transação

O resto de `database/migrations/` usa `if not exists` / `on conflict do nothing`.
Este backfill segue o mesmo padrão: rodar duas vezes não pode duplicar nada.

1. Um `eloi_sub_clientes` por `distinct sub_cliente` de cada cliente
   (`on conflict do nothing` no índice único). O valor `"F2 EXPERIENCE"` dentro da
   F2 vira **`F2 Experience (direto)`** — é trabalho para a própria F2.
2. Preencher `sub_cliente_id` casando por `lower(trim(sub_cliente))`.
3. Para cada `distinct nf_numero` não nulo, criar a nota (`where not exists`
   pelo par `cliente_id + numero`) com `status = 'emitida'`,
   `valor_cents = sum(...)`, `competencia = min(data_competencia)`,
   `emitida_em = min(data_competencia)`. Depois preencher `nota_fiscal_id`.
4. **Conferência obrigatória** — rodar e comparar:
   ```sql
   select count(*) from eloi_servicos where sub_cliente is not null and sub_cliente_id is null; -- 0
   select count(*) from eloi_servicos where nf_numero  is not null and nota_fiscal_id is null;  -- 0
   select count(*) from eloi_notas_fiscais;                                                     -- 42
   select sum(valor_cents) from eloi_servicos;  -- não pode mudar: 7088000
   ```

Arquivo: `database/migrations/2026-08-28-sub-clientes-e-nota-1n.sql`.
Aplicar **antes** de qualquer deploy de edge.

---

## 5. Fases

Cada fase é um commit que fecha sozinho: builda, passa em `npm run verify` e pode
ir para produção sem a fase seguinte. **Rota nova entra em
`app/src/main.tsx`** (é lá que o `createBrowserRouter` vive) — `nav.ts` só desenha
o menu; mexer só nele deixa a rota caindo no `NaoEncontrado`.

### Fase 0 — Migração e backfill · *nada de UI*

- Escrever e aplicar a migração da §4. Atualizar `docs/DATA_MODEL.md` e
  `docs/DECISIONS.md` (D-18 a D-22) no mesmo commit.
- **Pronto quando:** as quatro conferências batem e o painel atual continua
  funcionando sem nenhuma mudança de código.

### Fase 1 — Serviços utilizáveis · *resolve a urgência*

Backend — `edge-functions/eloi-gestao.ts`:
- `subclientes.list` / `subclientes.upsert` / `subclientes.delete`
  (o delete barra com 409 se houver serviço, como `clientes.delete` já faz).
- `servicos.upsert` aceita `sub_cliente_id` e valida que ele pertence ao
  `cliente_id` enviado. **Para de gravar `sub_cliente` e `nf_numero` à mão** —
  quem escreve agora é o trigger.
- `servicos.valores_lote`: recebe `[{id, valor_cents}]`, valida cada uma
  (inteiro ≥ 0, serviço existe, não pago, sem nota) e grava numa passada.
  Deve **limpar `valor_sugerido_cents`/`valor_sugerido_em`** quando o valor é
  gravado à mão — senão o serviço fica marcado como "sugestão pendente" para
  sempre. Mesma regra vale para `servicos.upsert`.
- `servicos.delete` **já existe** — só falta expor no front.

Front:
- `app/src/lib/tipos.ts`: `SubClienteRow`; `ServicoRow` ganha `sub_cliente_id` e
  `nota_fiscal_id`.
- `app/src/lib/api.ts`: expor `servicos.remover`, `servicos.salvarValores` e o
  objeto `subClientes`.
- `app/src/lib/financas-store.tsx`: carregar `subClientes` junto e publicá-los em
  `useNomes()` como `subCliente: Map<id, SubClienteRow>`.
- `app/src/routes/admin/telas/Projetos.tsx`:
  - **o mês deixa de cortar a lista.** Não mexer no `mes` do store — ele é lido
    por Dinheiro, Notas, Calendário, Relatórios e `useTransacoesDoMes()`, e mudar
    o tipo ricocheteia em cinco telas. A solução é local: estado próprio
    `filtrarPorMes: boolean`, padrão `false`; o corte de `data_competencia` só
    acontece quando está ligado; o `<SeletorMes />` fica ao lado, desabilitado
    quando desligado.
  - **filtros por menu, não por pílula.** A linha de etapa já tem 6 pílulas
    (Todos + 5 etapas) e o `COMPONENT_INVENTORY` manda "máximo 4; acima disso
    vira menu". Aproveitar esta fase para transformar etapa em `<select>` e
    colocar **cliente** e **sub-cliente** (9 valores) também em `<select>`.
    Sobram como pílula só os três atalhos de pendência: `Sem valor`,
    `Sem nota`, `Entregue e não pago` — três, dentro do limite.
  - **agrupamento em dois níveis:** cliente → sub-cliente, com total e contagem
    por sub-cliente. O sub-cliente vira cabeçalho de grupo, não etiqueta na linha.
  - **edição de valor em linha:** serviço sem valor mostra um campo editável na
    própria lista; sair do campo salva por `servicos.valores_lote`. É o que tira
    os 11 serviços sem valor do caminho em minutos. Alvo de toque ≥ 44 px.
  - excluir serviço com `FolhaExcluir` (padrão já usado em `Dinheiro.tsx` e
    `Arquivos.tsx`).
- `app/src/routes/admin/folhas.tsx` · `FolhaServico`: o campo texto
  "Marca ou sub-cliente" vira `<select>` dos sub-clientes do cliente escolhido,
  com "+ Novo sub-cliente" abrindo `FolhaSubCliente`.
- Tela nova `app/src/routes/admin/telas/SubClientes.tsx`, rota
  `/admin/clientes/:id/marcas` **registrada em `main.tsx`**, com total,
  quantidade e pendências por marca. Não entra em `nav.ts`: chega-se pela ficha.
- `ClienteFicha.tsx`: bloco "Marcas" com o resumo por sub-cliente e link.

**Pronto quando:** dá para abrir Projetos, ver os 59 serviços sem trocar de mês,
filtrar por VIBRA, preencher os 11 valores em linha e apagar um serviço sem SQL.

### Fase 2 — Nota fiscal com fonte única

- `eloi-financas.ts` · `nf.upsert` passa a aceitar `servico_ids: string[]`.
  **Cuidado:** hoje a action faz `.upsert(nf)` com o objeto inteiro do corpo —
  qualquer chave que não seja coluna vira erro do Postgres. Separar
  `servico_ids` do objeto da nota antes do upsert e gravar o vínculo depois.
- `nf.list` devolve os serviços vinculados de cada nota.
- **`nf.list` filtra por mês no servidor** (`gte/lt` em `competencia`) e a tela
  passa o mês do store (`Notas.tsx`). Com as 42 notas do backfill em
  fevereiro–julho, agosto mostra quase nada. Dar à tela Notas o mesmo
  `filtrarPorMes` da Fase 1, e o filtro desligado **não manda `mes`** para a edge.
- `Notas.tsx`: a folha de nota ganha seletor múltiplo de serviços do cliente
  (filtrável por sub-cliente e por "sem nota"); o valor da nota sugere a soma dos
  serviços escolhidos. Mantém o anexo de PDF que já existe.
- **Tirar o campo livre "Número da NF" de `FolhaServico`** e a escrita de
  `nf_numero` em `servicos.upsert`: com o espelho, quem define o número é a nota.
- `Projetos.tsx` e `domain/decisoes.ts` continuam lendo `nf_numero` — o espelho
  faz a fila "Precisa de você" parar de cobrar nota que já existe.

**Pronto quando:** `/admin/notas` com o filtro de mês desligado mostra as 42 notas
do backfill; anexar um PDF numa nota faz o "Sem nota fiscal" sumir do serviço
correspondente em Projetos; e uma nota nova consegue cobrir dois serviços.

### Fase 3 — Terminar o fluxo de valor sugerido

O commit `d8f9499` entregou o miolo. Faltam seis coisas, todas pequenas:

1. **`servicos.list` do portal não devolve o sub-cliente.** A F2 vê uma lista
   única de serviços sem saber qual é da VIBRA e qual é da CONSTEL — exatamente a
   divisão que o dono pediu. Incluir o nome do sub-cliente no payload e agrupar a
   aba **Pendências** por ele, com `<select>` de filtro (9 marcas: pílula não
   serve). **Não criar aba nova** — `portal/index.html` já tem 6 abas em pílula,
   e "Pendências" é a aba certa.
2. **`servicos.sugerir_valor` só barra serviço pago.** Barrar também serviço com
   `nf_numero`: depois de faturado, o valor é fato contábil.
3. **`servicos.aprovar_valor_sugerido` não revalida.** Conferir na hora de
   aprovar que o serviço não foi pago nem faturado no meio-tempo.
4. **A sugestão não aparece na tela Hoje.** `domain/decisoes.ts` não conhece
   `valor_sugerido_cents`. Adicionar a decisão `aprovar_valor` no topo da fila,
   com aceitar em um clique, e o caso em `domain/decisoes.test.ts`.
5. **Rejeitar é mudo:** limpa a sugestão e o cliente não fica sabendo. Guardar o
   motivo (em `observacoes`) e mostrar no portal "valor não aceito — o estúdio vai
   falar com você".
6. **Corrigir, no mesmo commit, os dois furos herdados de `portal-cliente.ts`:**
   `x-forwarded-for` passa a usar o **último** elemento (como `admin-auth.ts` já
   faz — o primeiro é texto que o cliente manda e rotaciona), e o contador de
   throttle passa a **falhar fechado** (hoje `(count ?? 0) >= 20` transforma erro
   de contagem em zero e o rate limit some).

**Pronto quando:** a F2 entra, filtra por CONSTEL, envia os valores dos 3 serviços
sem valor, e o Wilke aprova os três pela tela Hoje sem abrir Projetos.

### Fase 4 — Fechamento do mês por sub-cliente

É o fluxo que o Wilke faz de verdade e que hoje não existe em lugar nenhum.

- Tela `app/src/routes/admin/telas/Fechamento.tsx`, rota `/admin/fechamento`
  **em `main.tsx`** e em `NAV_PRIMARIA`. A primária já tem 7 destinos, que é o
  limite do `COMPONENT_INVENTORY` — mover `Calendário` para `NAV_FERRAMENTAS`
  abre a vaga sem quebrar a barra do celular (só os 4 primeiros têm `barra: true`).
- Por mês e por sub-cliente: serviços do período, o que tem valor, o que falta,
  subtotal, e o botão **"Gerar nota destes N serviços"**, que abre a folha de NF
  da Fase 2 já preenchida.
- Um bloco por sub-cliente, ordenado pelo subtotal.

**Pronto quando:** dá para fechar agosto da VIBRA — ver os serviços, o total,
emitir uma nota cobrindo todos e marcar pago — sem sair da tela.

### Fase 5 — Atalhos e navegação

- `Ctrl/Cmd + K`: paleta de comandos com busca de cliente, sub-cliente e serviço,
  e as ações "Novo serviço", "Nova nota", "Ir para fechamento". Componente novo em
  `app/src/ui/componentes.tsx`, registrado em `eloi-handoff/COMPONENT_INVENTORY.md`.
- `N` abre novo serviço; `/` foca a busca; `Esc` já fecha folha.
- Botão central da barra inferior (`CRIAR` em `nav.ts`): incluir **Serviço** como
  primeira opção. Hoje oferece receita, despesa e transferência — as três coisas
  que ele não usa, porque o núcleo financeiro está zerado.
- Migalhas de navegação em `ClienteFicha` e `SubClientes`.

---

## 6. Regras que o executor não pode quebrar

Todas estão no `CLAUDE.md`; repetidas porque este plano mexe em dinheiro e em
acesso de terceiro.

1. **Dinheiro em cents inteiros.**
2. **Validação no servidor.** Nenhuma regra de "pode editar" vive só no formulário
   do portal. O corpo da requisição nunca decide de quem é o serviço — quem decide
   é `session.cliente_id` (o padrão que `servicos.sugerir_valor` já segue).
3. **Nenhum hex solto em `.tsx`** — cor vem de `ui/tokens.css` / `ui/tokens.ts`.
   Cor nunca informa sozinha: todo chip novo leva rótulo ou ícone.
4. **Alvo de toque ≥ 44 px**, inclusive no campo de valor em linha e no portal,
   que é usado no celular.
5. **A logo nunca é centralizada.**
6. **Pílula: máximo 4; acima disso vira menu.** Nav primária: máximo 7 destinos.
7. **Componente novo** só se não houver equivalente e for usado em mais de um
   lugar; variação é `prop`. Registrar no `COMPONENT_INVENTORY`.
8. **Deploy de edge só por `npm run edges:deploy -- <fn>`.** Dashboard nunca.
9. **`npm run build` antes de commitar** — `app/dist/` é commitado e a Vercel não
   builda. Esquecer publica a versão anterior, sem erro nenhum.
10. **Teste onde toca dinheiro.** `domain/` tem 58 testes (`decisoes` 11,
    `financeiro` 35, `projeto` 12); a suíte inteira do app tem 76.
11. **Não tocar** nas tabelas do outro produto (`transactions`, `cards`,
    `categories`, `clients`, `services`, `workspaces*`, `shared_*`…), nem no
    núcleo financeiro do ELOI, que está fora de escopo mas continua vivo.
12. **Ação destrutiva** (apagar arquivo, force-push, mexer em segredo, deploy) só
    com confirmação do Wilke.
13. **Doc no mesmo commit:** `ROUTE_MAP`, `FEATURE_MAP`, `DATA_MODEL`,
    `DECISIONS` e `CHANGELOG`.

## 7. Ordem de execução e verificação

```
Fase 0  migração + backfill              → conferir os 4 selects do §4.3
Fase 1  serviços utilizáveis             → deploy eloi-gestao, build, commit
Fase 2  nota fiscal 1:N                  → deploy eloi-financas
Fase 3  fechar o fluxo de valor sugerido → deploy portal-cliente + eloi-gestao
Fase 4  fechamento por sub-cliente       → só front
Fase 5  atalhos                          → só front
```

Antes de cada commit: `npm run verify`.

**Atenção com o `typecheck`:** `npm run typecheck` roda `tsc --noEmit` sobre um
`tsconfig.json` solution-style (`"files": []` + `references`) — **não checa nada**
e sai 0 mesmo com erro de tipo. Quem pega erro é o `npm run build` (`tsc -b`).
Vale trocar o script para `tsc -b --noEmit` num commit à parte; foi exatamente
esse buraco que deixou os fixtures de teste quebrados até o commit de hoje.

Antes de cada deploy de edge, conferir que a migração correspondente já está
aplicada em produção — `admin-auth` já ensinou que function nova contra schema
velho falha fechada e derruba o acesso.

## 8. O que este plano deliberadamente NÃO faz

- Não ativa contas, transações, cartão, recorrência nem metas (D-21).
- Não cria emissão de nota fiscal — o painel guarda a nota emitida fora dele.
- Não dá portal próprio para sub-cliente (D-20).
- Não aposenta `/painel-orcamentos` nem `/painel-briefings`. Para a rodada
  seguinte, registre-se que **o backend dos dois já existe e está autenticado**:
  `orcamentos.ts` tem `create`/`update`/`delete`/catálogo, e `briefing-links.list`
  já devolve o `raw` das respostas. Falta só tela.
- Não mexe no site institucional nem no gerador `/marca/`.
