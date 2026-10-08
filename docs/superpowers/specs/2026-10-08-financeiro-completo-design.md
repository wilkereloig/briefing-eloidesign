# Dinheiro como gerenciador financeiro completo — design

Data: 2026-10-08 · Aprovado por Wilke na conversa ("pode seguir, faz tudo até o final").

## Problema

A área financeira do `/admin` é uma tela só (`Dinheiro.tsx`, 616 linhas) com
indicadores, lançamentos, fila a pagar/receber, cards de conta e recorrências.
Não existe página de conta (extrato) nem de cartão (faturas por mês), o card de
conta não navega, empréstimo não tem lugar, contas são geridas em três telas
(Dinheiro, Config, Hoje), metas/orçamento estão escondidos em Relatórios e
lançamentos só filtram por mês e lente.

## Decisões

1. **Dinheiro vira área com sub-páginas** (não separar Pessoal/Empresa: a lente
   empresa/pessoal continua como filtro em todas). `NAV_PRIMARIA` continua com 7
   itens; a navegação interna é uma barra de abas (rolagem horizontal no mobile)
   renderizada pelo layout de `/admin/dinheiro/*`.
2. **Empréstimo tem cadastro próprio** (tabela `eloi_emprestimos`); o sistema
   gera as parcelas como transações ligadas por `emprestimo_id`.
3. Gestão de contas fica **só** no Dinheiro. Config e Hoje passam a linkar.
4. Todo cálculo novo em `app/src/domain/financeiro.ts`, com teste.

## Rotas

| Rota | Conteúdo |
|---|---|
| `/admin/dinheiro` | Visão geral |
| `/admin/dinheiro/contas` | Lista de contas (não-cartão) |
| `/admin/dinheiro/contas/:id` | Página da conta: saldo, extrato, agendado |
| `/admin/dinheiro/cartoes` | Lista de cartões |
| `/admin/dinheiro/cartoes/:id` | Página do cartão: faturas por mês |
| `/admin/dinheiro/lancamentos` | Todos os lançamentos, com filtros |
| `/admin/dinheiro/agenda` | A pagar / a receber (fila atual) |
| `/admin/dinheiro/emprestimos` | Empréstimos |
| `/admin/dinheiro/planejamento` | Metas e orçamentos · recorrências · categorias |

Links antigos (`/admin/dinheiro?aba=...`) caem na sub-página equivalente.

## Páginas

### Visão geral
- Indicador dominante: **patrimônio líquido** = saldo das contas não-cartão −
  dívida dos cartões (`dividaDoCartao`) − saldo devedor dos empréstimos.
- Indicadores: disponível nas contas, faturas abertas (próxima fatura de cada
  cartão), empréstimos em aberto, resultado do mês (lente).
- **Cobertura 7 dias**: soma do que vence (saídas em aberto, incluindo vencidas
  e próxima fatura de cartão) nos próximos 7 dias vs disponível
  (saldo + limite de cheque especial restante). Mostra "faltam R$ X" quando
  negativo. Texto, não gráfico.
- Listas: contas (saldo), cartões (fatura + vence), vencimentos da semana. Cada
  item linka para sua página.

### Contas
- Card por conta: nome, instituição, saldo, cheque especial usado/limite
  (`limite_cents` passa a valer para conta corrente = limite da conta).
  Ativas primeiro; arquivadas recolhidas. Botão "Nova conta".
- Página da conta: cabeçalho (saldo, limite, última conferência), abas
  **Extrato** (liquidadas nesta conta, mais recente primeiro, com saldo
  acumulado após cada linha; transferências entram com sinal pelo lado da
  conta) e **Agendado** (em aberto nesta conta, por vencimento). Seletor de
  período (mês). Ações: Lançar, Transferir, Conferir saldo, Editar, Arquivar /
  Reativar.

### Cartões
- Card por cartão: fatura atual (próximo vencimento em aberto), vence em,
  barra de limite usado (`dividaDoCartao` / `limite_cents`), parcelado.
  Botão "Novo cartão".
- Página do cartão: seletor de fatura por vencimento (← anterior · atual ·
  próxima →). Cada fatura = transações do cartão com o mesmo
  `data_vencimento` (compra sem vencimento cai em `vencimentoDaFatura` pelo
  ciclo). Situação: **aberta** (fechamento ainda não passou), **fechada**
  (fechou, não venceu, falta pagar), **paga** (nada em aberto), **atrasada**
  (venceu com saldo). Mostra total, pago, falta, lista de compras e resumo por
  categoria. Lateral/abaixo: limite, parcelas futuras (faturas seguintes),
  ações Pagar fatura e Editar.

### Lançamentos
Aba "Movimentações" atual promovida a página + filtros: conta, categoria,
status, tipo (entrada/saída/transferência), além de mês, lente e busca.
Filtro por conta aceita `?conta=<id>` (link vindo da página da conta).

### Agenda
Aba "A receber / A pagar" atual, sem mudança de comportamento.

### Empréstimos
Tabela `eloi_emprestimos`:

| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| nome | text not null | "Empréstimo Itaú R$ 16 mil" |
| instituicao | text | |
| contexto | eloi_contexto not null | |
| conta_id | uuid → eloi_contas | conta que debita |
| categoria_id | uuid → eloi_categorias | default "Empréstimos e dívidas" |
| valor_recebido_cents | bigint not null ≥ 0 | |
| parcelas_total | smallint not null ≥ 1 | |
| valor_parcela_cents | bigint not null > 0 | |
| primeiro_vencimento | date not null | vencimento da parcela 1 |
| parcelas_pagas_antes | smallint not null default 0 | pagas fora do sistema |
| ativo | boolean not null default true | |
| observacoes | text | |
| created_at | timestamptz | |

`eloi_transacoes.emprestimo_id uuid null → eloi_emprestimos`. RLS nega anon
(mesmo padrão das outras `eloi_*`).

Edge `eloi-financas`:
- `emprestimos.upsert`: valida; ao criar, gera as parcelas
  `parcelas_pagas_antes+1 .. parcelas_total` (vencimento por `dataDaParcela`,
  status derivado). Ao editar, só altera cadastro (não regera parcelas).
- `emprestimos.encerrar`: `ativo=false` (não apaga parcelas).
- `bootstrap` devolve `emprestimos`.

Resumo (domínio, puro): total = parcela × parcelas_total; juros = total −
recebido; pago = parcelas_pagas_antes × parcela + liquidado das parcelas no
sistema; falta = soma em aberto; próxima parcela; quitação = último
vencimento; progresso = parcelas pagas / total.

Migração dos 3 empréstimos já lançados (Itaú 16 mil 12× 1.711,46, 8 pagas
antes, 1º venc. 13/02/2026; Itaú 5 mil 6× 1.174,02, 1 paga antes, 1º venc.
14/09/2026; Mercado Pago 5× 587,98, 1 paga antes, 1º venc. 28/08/2026, valor
recebido desconhecido = 0): cria o cadastro e liga as parcelas existentes por
`emprestimo_id` (sem gerar de novo).

### Planejamento
Abas: **Metas e orçamentos** (sai de Relatórios, mesmo componente),
**Recorrências** (sai do Dinheiro), **Categorias** (sai de Config, ganha
editar nome/cor e desativar; edge já aceita).

## Fora de escopo (YAGNI)
Investimentos, gráficos decorativos, metas de economia, open finance /
importação automática, formulário de lançamento como página.

## Testes
Domínio: `faturasDoCartao`, `extratoDaConta` (saldo acumulado),
`patrimonioLiquido`, `resumoEmprestimo`, `cobertura` (7 dias). Edge:
geração de parcelas do empréstimo (função pura em `_shared/financas.ts`).

## Entrega
Fase 1 Estrutura + Visão geral + Contas + Cartões · Fase 2 Lançamentos +
Agenda · Fase 3 Empréstimos · Fase 4 Planejamento. Cada fase: testes, lint,
tsc, build, commit do `dist`, push, deploy de edge quando houver, smoke em
produção.
