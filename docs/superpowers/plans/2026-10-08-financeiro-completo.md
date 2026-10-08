# Dinheiro como gerenciador financeiro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformar `/admin/dinheiro` numa área com sub-páginas (visão geral, contas, cartões, lançamentos, agenda, empréstimos, planejamento), com página de conta (extrato) e de cartão (faturas por mês) e cadastro de empréstimo.

**Architecture:** rotas aninhadas em `/admin/dinheiro/*` com um layout que desenha a barra de sub-páginas e um `<Outlet/>`. Telas novas em `app/src/routes/admin/telas/dinheiro/`. Cálculo puro em `app/src/domain/financeiro.ts` (testado com vitest). Empréstimo: tabela `eloi_emprestimos` + `eloi_transacoes.emprestimo_id`, ações na edge `eloi-financas`.

**Tech Stack:** React 19 + Vite + TS (react-router), vitest, oxlint; Deno edge functions; Postgres (Supabase).

Spec: `docs/superpowers/specs/2026-10-08-financeiro-completo-design.md`.

## Global Constraints

- Código, nomes e textos em português; `PascalCase` componente/tipo, `camelCase` função, `MAIÚSCULA_` constante.
- Cents inteiros sempre. Transferência não é receita nem despesa. Status derivado no servidor.
- Todo cálculo de saldo/fatura/resultado sai de `app/src/domain/financeiro.ts`; tela nunca recalcula.
- Nenhum hex solto em `.tsx`; cor de `ui/tokens.css`. Reusar `ui/componentes.tsx` e `ui/painel.tsx` (Cabecalho, SeletorMes, SeletorLente, Dinheiro, ChipMovimento, Carga, Painel, Card, Indicador, Pilula, Botao, Vazio, Folha, Progresso, Etiqueta, Icone). Ler `docs/DESIGN_RULES.md` antes de tela nova. Sem sombra, sem degradê, ícones só do sprite.
- Alvo de toque ≥ 44 px. Status = cor + ícone + texto. `tabular-nums` em número.
- Tabelas sem prefixo `eloi_` são de outro produto: não tocar.
- Arquivos editados com Edit/Write no Windows viram CRLF: rodar `sed -i 's/\r$//' <arquivo>` antes de commitar.
- Verificação por fase (na pasta `app/`): `npx vitest run`, `npx oxlint`, `npx tsc -b`, `npm run build`. Edge (na raiz): `npm run edges:check`, `npm run edges:test`.
- `app/dist` é commitado; deploy de edge pelo MCP do Supabase (token do CLI expirado), `verify_jwt=false`, arquivos `index.ts` + `_shared/*.ts` usados, conferência byte a byte, registrar em `edge-functions/DEPLOYS.json`.
- Docs no mesmo commit da mudança: `docs/ROUTE_MAP.md`, `docs/FEATURE_MAP.md`, `CHANGELOG.md`; `docs/DATA_MODEL.md` na fase 3.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `app/src/domain/financeiro.ts` | + `faturasDoCartao`, `indiceFaturaAtual`, `extratoDaConta`, `cobertura`, `patrimonioLiquido`, `resumoEmprestimo` |
| `app/src/routes/admin/nav.ts` | + `NAV_DINHEIRO` (sub-páginas) |
| `app/src/router.tsx` | rotas aninhadas de `dinheiro` |
| `app/src/routes/admin/telas/dinheiro/Layout.tsx` | barra de sub-páginas + Outlet; redireciona `?aba=` antigo |
| `.../dinheiro/VisaoGeral.tsx` | index |
| `.../dinheiro/Contas.tsx`, `ContaDetalhe.tsx` | contas |
| `.../dinheiro/Cartoes.tsx`, `CartaoDetalhe.tsx` | cartões |
| `.../dinheiro/Lancamentos.tsx`, `Agenda.tsx` | fase 2 (saem de `Dinheiro.tsx`) |
| `.../dinheiro/Emprestimos.tsx` | fase 3 |
| `.../dinheiro/Planejamento.tsx` | fase 4 |
| `.../dinheiro/compartilhado.tsx` | peças extraídas de `Dinheiro.tsx` usadas por várias páginas (linha de transação com ações, `FolhaPagarFatura`, orquestração das folhas) |
| `app/src/routes/admin/telas/Dinheiro.tsx` | some no fim da fase 2 |
| `database/migrations/2026-10-08-emprestimos.sql` | fase 3 |
| `edge-functions/_shared/financas.ts` | + `planoDeParcelasEmprestimo` |
| `edge-functions/eloi-financas.ts` | + `emprestimos.upsert`, `emprestimos.encerrar`, bootstrap |

---

## FASE 1 — Estrutura, Visão geral, Contas, Cartões

### Task 1: Domínio — faturas, extrato, cobertura, patrimônio

**Files:**
- Modify: `app/src/domain/financeiro.ts` (anexar no fim)
- Test: `app/src/domain/financeiro.test.ts` (anexar no fim; reusar helpers `tx` e `conta` do arquivo)

**Interfaces — Produces:**
```ts
export type SituacaoFatura = 'aberta' | 'fechada' | 'paga' | 'atrasada'
export interface Fatura {
  vencimento: string            // AAAA-MM-DD
  fechamento: string | null     // null se o cartão não tem ciclo
  linhas: Transacao[]
  total_cents: number           // saídas − entradas (estorno), bruto
  falta_cents: number           // em aberto, ≥ 0
  pago_cents: number            // total − falta, ≥ 0
  situacao: SituacaoFatura
}
export function faturasDoCartao(cartao: Conta, transacoes: Transacao[], hoje: string): Fatura[] // ordem crescente de vencimento
export function indiceFaturaAtual(faturas: Fatura[], hoje: string): number // -1 se vazio
export interface LinhaExtrato { t: Transacao; data: string; valor_cents: number; saldo_cents: number }
export function extratoDaConta(conta: Conta, transacoes: Transacao[]): LinhaExtrato[] // mais recente primeiro
export interface Cobertura { a_pagar_cents: number; disponivel_cents: number; falta_cents: number; itens: number }
export function cobertura(contas: Conta[], transacoes: Transacao[], hoje: string, dias?: number, contexto?: Contexto): Cobertura
export interface Patrimonio { contas_cents: number; cartoes_cents: number; emprestimos_cents: number; liquido_cents: number }
export function patrimonioLiquido(contas: Conta[], transacoes: Transacao[], contexto?: Contexto, emprestimos_cents?: number): Patrimonio
```

- [ ] **Step 1: testes que falham** — anexar a `financeiro.test.ts`:

```ts
describe('faturas do cartão', () => {
  const visa = conta({ id: 'v', tipo: 'cartao_credito', limite_cents: 1000_00, dia_fechamento: 2, dia_vencimento: 9 })
  const c = (p: Partial<Transacao> & { id: string }) =>
    tx({ tipo: 'saida', conta_id: 'v', status: 'pendente', valor_cents: 100_00, ...p })

  it('agrupa por vencimento e deriva a situação', () => {
    const ts = [
      c({ id: 'set', data_vencimento: '2026-09-09', status: 'realizado', recebido_cents: 100_00 }),
      c({ id: 'out1', data_vencimento: '2026-10-09', valor_cents: 300_00, recebido_cents: 100_00, status: 'parcial' }),
      c({ id: 'out2', data_vencimento: '2026-10-09', valor_cents: 50_00 }),
      c({ id: 'est', tipo: 'entrada', data_vencimento: '2026-10-09', valor_cents: 20_00 }),
      c({ id: 'nov', data_vencimento: '2026-11-09', valor_cents: 70_00 }),
      c({ id: 'semvenc', data_competencia: '2026-10-05', valor_cents: 10_00 }), // depois do fechamento (2) → vence 09/11
      tx({ id: 'outra', tipo: 'saida', conta_id: 'x', data_vencimento: '2026-10-09', valor_cents: 999_00 }),
    ]
    const f = faturasDoCartao(visa, ts, '2026-10-08')
    expect(f.map((x) => x.vencimento)).toEqual(['2026-09-09', '2026-10-09', '2026-11-09'])
    expect(f[0]).toMatchObject({ situacao: 'paga', total_cents: 100_00, falta_cents: 0, pago_cents: 100_00 })
    expect(f[1]).toMatchObject({ situacao: 'fechada', fechamento: '2026-10-02', total_cents: 330_00, falta_cents: 230_00, pago_cents: 100_00 })
    expect(f[2]).toMatchObject({ situacao: 'aberta', total_cents: 80_00 })
    expect(f[2].linhas.map((t) => t.id).sort()).toEqual(['nov', 'semvenc'])
    expect(faturasDoCartao(visa, ts, '2026-10-10')[1].situacao).toBe('atrasada')
  })

  it('fatura atual = primeira com saldo; sem saldo, a próxima a vencer', () => {
    const ts = [
      c({ id: 'a', data_vencimento: '2026-09-09', status: 'realizado', recebido_cents: 100_00 }),
      c({ id: 'b', data_vencimento: '2026-10-09' }),
      c({ id: 'n', data_vencimento: '2026-11-09' }),
    ]
    expect(indiceFaturaAtual(faturasDoCartao(visa, ts, '2026-10-08'), '2026-10-08')).toBe(1)
    const pagas = ts.map((t) => ({ ...t, status: 'realizado' as const, recebido_cents: t.valor_cents }))
    expect(indiceFaturaAtual(faturasDoCartao(visa, pagas, '2026-10-08'), '2026-10-08')).toBe(1)
    expect(indiceFaturaAtual([], '2026-10-08')).toBe(-1)
  })
})

describe('extrato da conta', () => {
  it('saldo acumulado linha a linha, mais recente primeiro, terminando no saldo da conta', () => {
    const cc = conta({ id: 'cc', saldo_inicial_cents: 100_00 })
    const ts = [
      tx({ id: 'e', tipo: 'entrada', conta_id: 'cc', valor_cents: 50_00, status: 'realizado', data_liquidacao: '2026-10-01' }),
      tx({ id: 's', tipo: 'saida', conta_id: 'cc', valor_cents: 30_00, status: 'realizado', data_liquidacao: '2026-10-02' }),
      tx({ id: 't', tipo: 'transferencia', conta_id: 'cc', conta_destino_id: 'cartao', valor_cents: 40_00, status: 'realizado', data_liquidacao: '2026-10-03' }),
      tx({ id: 'in', tipo: 'transferencia', conta_id: 'outra', conta_destino_id: 'cc', valor_cents: 5_00, status: 'realizado', data_liquidacao: '2026-10-03' }),
      tx({ id: 'aberta', tipo: 'saida', conta_id: 'cc', valor_cents: 99_00, status: 'pendente', data_vencimento: '2026-10-04' }),
    ]
    const ext = extratoDaConta(cc, ts)
    expect(ext.map((l) => [l.t.id, l.valor_cents, l.saldo_cents])).toEqual([
      ['in', 5_00, 85_00], ['t', -40_00, 80_00], ['s', -30_00, 120_00], ['e', 50_00, 150_00],
    ])
    expect(ext[0].saldo_cents).toBe(saldoConta(cc, ts))
  })
})

describe('cobertura e patrimônio', () => {
  const cc = conta({ id: 'cc', tipo: 'corrente', saldo_inicial_cents: -100_00, limite_cents: 300_00 })
  const visa = conta({ id: 'v', tipo: 'cartao_credito', dia_fechamento: 2, dia_vencimento: 9, limite_cents: 1000_00 })
  const ts = [
    tx({ id: 'atrasada', tipo: 'saida', conta_id: 'cc', valor_cents: 50_00, status: 'vencido', data_vencimento: '2026-10-01' }),
    tx({ id: 'semana', tipo: 'saida', conta_id: 'cc', valor_cents: 60_00, status: 'pendente', data_vencimento: '2026-10-14' }),
    tx({ id: 'longe', tipo: 'saida', conta_id: 'cc', valor_cents: 70_00, status: 'pendente', data_vencimento: '2026-10-20' }),
    tx({ id: 'receber', tipo: 'entrada', conta_id: 'cc', valor_cents: 500_00, status: 'pendente', data_vencimento: '2026-10-10' }),
    tx({ id: 'fat', tipo: 'saida', conta_id: 'v', valor_cents: 400_00, status: 'pendente', data_vencimento: '2026-10-09' }),
    tx({ id: 'fatnov', tipo: 'saida', conta_id: 'v', valor_cents: 80_00, status: 'pendente', data_vencimento: '2026-11-09' }),
  ]
  it('cobertura soma o que vence em 7 dias (com atrasadas e fatura) contra saldo + limite', () => {
    expect(cobertura([cc, visa], ts, '2026-10-08')).toEqual({
      a_pagar_cents: 510_00, disponivel_cents: 200_00, falta_cents: 310_00, itens: 3,
    })
  })
  it('patrimônio = contas − dívida dos cartões − empréstimos', () => {
    expect(patrimonioLiquido([cc, visa], ts, undefined, 1000_00)).toEqual({
      contas_cents: -100_00, cartoes_cents: 480_00, emprestimos_cents: 1000_00, liquido_cents: -1580_00,
    })
  })
})
```
Adicionar ao import do topo: `faturasDoCartao, indiceFaturaAtual, extratoDaConta, cobertura, patrimonioLiquido, saldoConta` (o que faltar).

- [ ] **Step 2:** `cd app && npx vitest run src/domain/financeiro.test.ts` → FAIL (funções não existem).

- [ ] **Step 3: implementação** — anexar a `financeiro.ts` (importar `Contexto` se ainda não importado):

```ts
// ── Faturas do cartão ────────────────────────────────────────────────────────
export type SituacaoFatura = 'aberta' | 'fechada' | 'paga' | 'atrasada'
export interface Fatura {
  vencimento: string
  fechamento: string | null
  linhas: Transacao[]
  total_cents: number
  falta_cents: number
  pago_cents: number
  situacao: SituacaoFatura
}

/** Fechamento do ciclo que vence em `vencimento` (vence antes do dia de
 *  fechamento no calendário = fechou no mês anterior). */
function fechamentoDoVencimento(cartao: Conta, vencimento: string): string | null {
  if (!cartao.dia_fechamento || !cartao.dia_vencimento) return null
  return dataDaParcela(`${vencimento.slice(0, 8)}${String(cartao.dia_fechamento).padStart(2, '0')}`,
    cartao.dia_vencimento < cartao.dia_fechamento ? -1 : 0)
}

/**
 * Faturas = compras do cartão agrupadas por vencimento. Compra sem vencimento
 * cai no ciclo da data da compra (mesma regra de `cicloFatura` / edge
 * `vencimentoDaFatura`). Estorno (entrada) abate.
 */
export function faturasDoCartao(cartao: Conta, transacoes: Transacao[], hoje: string): Fatura[] {
  const grupos = new Map<string, Transacao[]>()
  for (const t of transacoes) {
    if (t.conta_id !== cartao.id || t.tipo === 'transferencia' || estaCancelada(t)) continue
    const venc = t.data_vencimento
      ?? (t.data_competencia ? cicloFatura(cartao, t.data_competencia)?.vencimento : undefined)
    if (!venc) continue
    grupos.set(venc, [...(grupos.get(venc) ?? []), t])
  }
  return [...grupos.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([vencimento, linhas]) => {
    const sinal = (t: Transacao) => (t.tipo === 'saida' ? 1 : -1)
    const total = linhas.reduce((s, t) => s + sinal(t) * t.valor_cents, 0)
    const falta = Math.max(0, linhas.reduce((s, t) => s + sinal(t) * saldoAberto(t), 0))
    const fechamento = fechamentoDoVencimento(cartao, vencimento)
    const situacao: SituacaoFatura = falta === 0 ? 'paga'
      : vencimento < hoje ? 'atrasada'
      : fechamento && hoje > fechamento ? 'fechada' : 'aberta'
    return { vencimento, fechamento, linhas, total_cents: total, falta_cents: falta,
      pago_cents: Math.max(0, total - falta), situacao }
  })
}

/** Qual fatura a página do cartão abre: a mais antiga com saldo; sem saldo, a
 *  próxima a vencer; senão a última. */
export function indiceFaturaAtual(faturas: Fatura[], hoje: string): number {
  if (!faturas.length) return -1
  const comSaldo = faturas.findIndex((f) => f.falta_cents > 0)
  if (comSaldo >= 0) return comSaldo
  const futura = faturas.findIndex((f) => f.vencimento >= hoje)
  return futura >= 0 ? futura : faturas.length - 1
}

// ── Extrato ──────────────────────────────────────────────────────────────────
export interface LinhaExtrato { t: Transacao; data: string; valor_cents: number; saldo_cents: number }

/** O que já mexeu no saldo da conta, com saldo acumulado após cada linha.
 *  Mesma regra de `saldoConta`: o último saldo é o saldo da conta. */
export function extratoDaConta(conta: Conta, transacoes: Transacao[]): LinhaExtrato[] {
  const linhas: Omit<LinhaExtrato, 'saldo_cents'>[] = []
  for (const t of transacoes) {
    const v = valorLiquidado(t)
    if (v === 0) continue
    let valor = 0
    if (t.tipo === 'transferencia') {
      if (t.conta_id === conta.id) valor -= v
      if (t.conta_destino_id === conta.id) valor += v
    } else if (t.conta_id === conta.id) {
      valor = t.tipo === 'entrada' ? v : -v
    }
    if (valor === 0) continue
    linhas.push({ t, data: t.data_liquidacao ?? t.data_competencia ?? t.created_at.slice(0, 10), valor_cents: valor })
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data) || a.t.created_at.localeCompare(b.t.created_at))
  let saldo = conta.saldo_inicial_cents
  return linhas.map((l) => ({ ...l, saldo_cents: (saldo += l.valor_cents) })).reverse()
}

// ── Visão geral ──────────────────────────────────────────────────────────────
export interface Cobertura { a_pagar_cents: number; disponivel_cents: number; falta_cents: number; itens: number }

const somaDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso) + dias * 86_400_000).toISOString().slice(0, 10)

/**
 * Dá para pagar o que vence nos próximos `dias`? A pagar = saídas em aberto
 * das contas (atrasadas incluídas) + faturas de cartão com saldo que vencem
 * até lá. Disponível = saldo + limite (cheque especial) das contas. A receber
 * não entra: cobertura é conservadora.
 */
export function cobertura(contas: Conta[], transacoes: Transacao[], hoje: string, dias = 7, contexto?: Contexto): Cobertura {
  const ate = somaDias(hoje, dias)
  const ativas = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
  const ids = new Set(ativas.filter((c) => c.tipo !== 'cartao_credito').map((c) => c.id))
  let aPagar = 0
  let itens = 0
  for (const t of transacoes) {
    if (t.tipo !== 'saida' || !t.conta_id || !ids.has(t.conta_id) || !estaEmAberto(t)) continue
    if (!t.data_vencimento || t.data_vencimento > ate) continue
    aPagar += saldoAberto(t); itens++
  }
  for (const cartao of ativas.filter((c) => c.tipo === 'cartao_credito')) {
    for (const f of faturasDoCartao(cartao, transacoes, hoje)) {
      if (f.falta_cents > 0 && f.vencimento <= ate) { aPagar += f.falta_cents; itens++ }
    }
  }
  const disponivel = ativas.filter((c) => c.tipo !== 'cartao_credito')
    .reduce((s, c) => s + saldoConta(c, transacoes) + (c.limite_cents ?? 0), 0)
  return { a_pagar_cents: aPagar, disponivel_cents: disponivel, falta_cents: Math.max(0, aPagar - disponivel), itens }
}

export interface Patrimonio { contas_cents: number; cartoes_cents: number; emprestimos_cents: number; liquido_cents: number }

/** Quanto se tem menos quanto se deve. `emprestimos_cents` = saldo devedor
 *  dos empréstimos (vem de `resumoEmprestimo`). */
export function patrimonioLiquido(contas: Conta[], transacoes: Transacao[], contexto?: Contexto, emprestimos_cents = 0): Patrimonio {
  const ativas = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
  const contasCents = ativas.filter((c) => c.tipo !== 'cartao_credito').reduce((s, c) => s + saldoConta(c, transacoes), 0)
  const cartoes = ativas.filter((c) => c.tipo === 'cartao_credito').reduce((s, c) => s + dividaDoCartao(c, transacoes), 0)
  return { contas_cents: contasCents, cartoes_cents: cartoes, emprestimos_cents,
    liquido_cents: contasCents - cartoes - emprestimos_cents }
}
```

- [ ] **Step 4:** `npx vitest run` → todos PASS.
- [ ] **Step 5:** normalizar CRLF; commit `feat(financeiro): faturas por cartão, extrato, cobertura e patrimônio`.

### Task 2: Estrutura de rotas + Layout + Visão geral

**Files:**
- Modify: `app/src/routes/admin/nav.ts` — anexar:
```ts
/** Sub-páginas de Dinheiro. Barra própria dentro da área; a primária segue com 7. */
export const NAV_DINHEIRO: { path: string; label: string; fim?: boolean }[] = [
  { path: '/admin/dinheiro', label: 'Visão geral', fim: true },
  { path: '/admin/dinheiro/contas', label: 'Contas' },
  { path: '/admin/dinheiro/cartoes', label: 'Cartões' },
  { path: '/admin/dinheiro/lancamentos', label: 'Lançamentos' },
  { path: '/admin/dinheiro/agenda', label: 'A pagar e receber' },
  { path: '/admin/dinheiro/emprestimos', label: 'Empréstimos' },
  { path: '/admin/dinheiro/planejamento', label: 'Planejamento' },
]
```
- Modify: `app/src/router.tsx` — trocar `{ path: 'dinheiro', element: <Dinheiro /> }` por rota com filhos (todos lazy):
```tsx
{ path: 'dinheiro', element: <DinheiroLayout />, children: [
  { index: true, element: <VisaoGeral /> },
  { path: 'contas', element: <Contas /> },
  { path: 'contas/:id', element: <ContaDetalhe /> },
  { path: 'cartoes', element: <Cartoes /> },
  { path: 'cartoes/:id', element: <CartaoDetalhe /> },
  { path: 'lancamentos', element: <Dinheiro /> },   // fase 1: tela antiga inteira; fase 2 substitui
  { path: 'agenda', element: <Dinheiro /> },        // idem
  { path: 'emprestimos', element: <EmBreve titulo="Empréstimos" /> },   // fase 3
  { path: 'planejamento', element: <Dinheiro /> },  // fase 4 substitui
] },
```
`EmBreve` pode ser um `Vazio` simples definido no próprio Layout; some na fase 3.
- Create: `app/src/routes/admin/telas/dinheiro/Layout.tsx` — `Cabecalho` "Dinheiro" com `SeletorLente` (a lente vive no store `useFinancas`, conferir), barra de abas com `NavLink` estilizado como `Pilula` (role="tablist", rolagem horizontal no mobile, mesmo padrão das abas atuais de `Dinheiro.tsx` linhas ~170-178), e `<Outlet />`. Se `useSearchParams().get('aba')` existir (link antigo), `Navigate` para: movimentos→lancamentos, receber/pagar→agenda, contas→contas, recorrencias→planejamento.
- Modify: `app/src/routes/admin/telas/Dinheiro.tsx` — remover o próprio `Cabecalho`/seletor de lente se duplicar com o Layout (manter seletor de mês e botões); ler a aba inicial do path: `/agenda` → aba `pagar`, `/planejamento` → `recorrencias`, senão `movimentos`; esconder a aba `contas` (agora página própria).
- Create: `app/src/routes/admin/telas/dinheiro/VisaoGeral.tsx`:
  - `Indicador dominante` "Patrimônio líquido" = `patrimonioLiquido(contas, transacoes, contexto).liquido_cents`, nota "contas − cartões − empréstimos".
  - Grade de indicadores: "Disponível nas contas" (`patrimonio.contas_cents`), "Faturas a pagar" (Σ `faturaAberta` dos cartões ativos), "Resultado do mês" (`resultado(transacoes, contexto, mes).lucro_cents`).
  - `Painel` "Próximos 7 dias": frase com `cobertura(...)` — `A pagar R$ X · disponível R$ Y` e, se `falta_cents > 0`, `Aviso` tom de alerta "Faltam R$ Z para cobrir". Abaixo, lista dos itens (reusar `proximosVencimentos(transacoes, hoje, 7)` filtrado por lente + vencidas de `vencidas()`; cartões aparecem como uma linha "Fatura <nome>").
  - `Painel` "Contas": linha por conta não-cartão ativa → `Link` `/admin/dinheiro/contas/:id`, saldo com `Dinheiro`.
  - `Painel` "Cartões": linha por cartão → `/admin/dinheiro/cartoes/:id`, fatura atual + "vence dd/mm".
  - Estados carregando/vazio/erro via `Carga` (padrão do `Hoje.tsx`). Sem conta → `Vazio` com botão "Cadastrar conta" (`/admin/dinheiro/contas?novo=1`).
- Verificar: `npx tsc -b`, `npx oxlint`, `npx vitest run`, `npm run build`; abrir no preview (`.claude/launch.json` porta 5207) e checar `/admin/dinheiro`, `/admin/dinheiro/lancamentos`, `/admin/dinheiro?aba=contas`.
- Commit `feat(dinheiro): área com sub-páginas e visão geral`.

### Task 3: Contas — lista e página da conta

**Files:**
- Create: `app/src/routes/admin/telas/dinheiro/Contas.tsx` — grade de `Card` por conta não-cartão (ativas, por contexto da lente; arquivadas num `details`/painel recolhido). Card inteiro é `Link` para `/admin/dinheiro/contas/:id`: nome, instituição, saldo (`saldoConta`), e se `limite_cents`: "Cheque especial: R$ usado de R$ limite" (usado = max(0, −saldo)). Botão "Nova conta" abre `FolhaConta` (de `routes/admin/folhas.tsx`) com tipo inicial `corrente`; `?novo=1` abre direto.
- Create: `app/src/routes/admin/telas/dinheiro/ContaDetalhe.tsx` — `useParams().id`; conta inexistente → `Vazio` "Conta não encontrada" + link para lista. Cabeçalho: nome, instituição, saldo grande, limite/cheque especial, última conferência (mesma fonte que `Dinheiro.tsx` usa para `conferencia`). Ações: "Lançar" (abre `FolhaTransacao` com `conta_id` pré-preenchido — ver props da folha), "Transferir" (FolhaTransacao tipo transferencia com origem = conta), "Conferir saldo" (`FolhaConferencia` de `FolhasExtrato.tsx`), "Editar" (`FolhaConta`), "Arquivar"/"Reativar" (mesma chamada que `Config.tsx` usa para Desativar/Reativar). Abas `Pilula`: **Extrato** — `extratoDaConta(conta, transacoes)` filtrado pelo mês do `SeletorMes` (por `data`), linha: data curta, descrição, categoria, valor com sinal (`Dinheiro sinal`), saldo após (legenda); `Paginacao` se > 50. **Agendado** — transações em aberto com `conta_id === id` ordenadas por `data_vencimento`, com `ChipMovimento` e ação liquidar (reusar a linha de transação de `Dinheiro.tsx`; se precisar, extrair para `dinheiro/compartilhado.tsx`).
- Modify: `app/src/routes/admin/folhas.tsx` (`FolhaConta`) — mostrar campo de limite também para `corrente`/`digital` com rótulo "Limite da conta (cheque especial)"; cartão mantém "Limite do cartão". Conferir que a edge `contas.upsert` aceita `limite_cents` para qualquer tipo (se restringir a cartão, ajustar a validação e registrar no deploy).
- Modify: `app/src/routes/admin/telas/Config.tsx` — seção de contas vira `Painel` curto com texto + link "Gerenciar contas e cartões" → `/admin/dinheiro/contas`.
- Modify: `app/src/routes/admin/telas/Hoje.tsx` — itens da lista "Contas e cartões" viram `Link` para a página da conta/cartão; "Gerenciar" → `/admin/dinheiro/contas`; "Ver todas" de últimas movimentações → `/admin/dinheiro/lancamentos`.
- Verificar e commit `feat(dinheiro): páginas de contas com extrato`.

### Task 4: Cartões — lista e página do cartão

**Files:**
- Create: `app/src/routes/admin/telas/dinheiro/Cartoes.tsx` — `Card` por cartão ativo (lente), `Link` para `/admin/dinheiro/cartoes/:id`: nome, fatura atual (`faturasDoCartao` + `indiceFaturaAtual` → `falta_cents` e "vence dd/mm" + situação), `Progresso` do limite usado (`dividaDoCartao / limite_cents`) com texto "R$ disponível de R$ limite", parcelado (`parceladoAberto`). Botão "Novo cartão" abre `FolhaConta` com tipo `cartao_credito`; `?novo=1` abre direto.
- Create: `app/src/routes/admin/telas/dinheiro/CartaoDetalhe.tsx` — `faturas = faturasDoCartao(cartao, transacoes, hoje)`; estado `indice` iniciado em `indiceFaturaAtual`. Navegação ← / → (botões ícone, `aria-label` "Fatura anterior"/"Próxima fatura", desabilitados nas pontas) com o mês do vencimento ("Fatura de outubro · vence 09/10"). Chip de situação (aberta/fechada/paga/atrasada: cor + ícone + texto). Indicadores: Total, Pago, Falta. Botão primário "Pagar fatura" (quando `falta_cents > 0`) abre a `FolhaPagarFatura` existente (mover de `Dinheiro.tsx` para `dinheiro/compartilhado.tsx` e exportar). Painel "Por categoria": `agrupar` das linhas por categoria (usar o helper `agrupar` existente; nome da categoria pelo mapa de categorias do store). Painel "Compras": linhas ordenadas por `data_competencia` desc, com parcela "n/m" quando houver, valor, chip. Painel lateral "Limite": limite, usado (`dividaDoCartao`), disponível (`limiteDisponivel`), fecha/vence (`cicloFatura`). Painel "Próximas faturas": faturas seguintes à selecionada com `falta_cents`. Ação "Editar cartão" (`FolhaConta`).
- Verificar e commit `feat(dinheiro): página do cartão com faturas por mês`.

### Task 5: Fechamento da fase 1

- Atualizar links internos: `domain/decisoes.ts` `ACAO.pagar_conta/cobrar_pagamento/conferir_recebimento.destino` → `/admin/dinheiro/agenda`; `domain/busca.ts:151` e `routes/admin/Busca.tsx:63` → `/admin/dinheiro/agenda`; `Calendario.tsx` links "Ver" → `/admin/dinheiro/agenda`, "Ver recorrência" → `/admin/dinheiro/planejamento`; `Onboarding.tsx` lançamentos → `/admin/dinheiro/lancamentos`. Rodar testes (decisoes.test pode checar destino).
- Docs: `docs/ROUTE_MAP.md` (novas rotas), `docs/FEATURE_MAP.md`, `CHANGELOG.md`.
- Build, commit do `dist`, push, aguardar bundle novo em produção (`curl .../admin/ | grep index-`), checar `/admin/dinheiro/contas` responde 200 (SPA rewrite no `vercel.json` — conferir que sub-rotas de `/admin/*` já caem no index.html).

---

## FASE 2 — Lançamentos e Agenda

### Task 6: Separar `Dinheiro.tsx`

**Files:**
- Create: `dinheiro/Lancamentos.tsx` — conteúdo da aba `movimentos` (lista do mês com paginação, busca, botões Lançar/Importar extrato) + filtros novos em linha: conta (`select` com contas ativas), categoria (por contexto), status (`em aberto`/`realizado`/`cancelado`/todos), tipo (entrada/saída/transferência/todos). Estado dos filtros na URL (`useSearchParams`: `conta`, `categoria`, `status`, `tipo`) para o link da página da conta (`?conta=<id>`) funcionar. Filtro aplicado no cliente sobre `transacoes` do store (já carregadas inteiras).
- Create: `dinheiro/Agenda.tsx` — abas `receber`/`pagar` + recortes + `agruparPorPrazo`, exatamente como hoje.
- Create/estender: `dinheiro/compartilhado.tsx` — linha de transação com ações (liquidar, reagendar, editar, cancelar/reabrir, excluir) e o hook/componente que orquestra as folhas (`FolhaTransacao`, `FolhaLiquidar`, `FolhaReagendar`, `FolhaExcluir`, `FolhaRecorrencia`, `FolhaImportar`), para Lancamentos, Agenda, ContaDetalhe e CartaoDetalhe usarem a mesma coisa.
- Create: `dinheiro/Planejamento.tsx` — por enquanto só a aba Recorrências (movida de `Dinheiro.tsx`).
- Delete: `app/src/routes/admin/telas/Dinheiro.tsx` (provar antes com grep que nada mais importa). Router aponta `lancamentos`, `agenda`, `planejamento` para as telas novas. Indicadores do topo do Dinheiro antigo (resultado/a receber/a pagar/custo recorrente) vão para o topo de Lançamentos (resultado do mês) e Agenda (a receber/a pagar).
- Teste de domínio, se criar função de filtro pura (`filtrarLancamentos(transacoes, filtros)` em `financeiro.ts`), com caso por filtro.
- Verificar, docs (ROUTE_MAP, FEATURE_MAP, CLEANUP_REPORT para o arquivo apagado, CHANGELOG), build, commit, push, smoke.

---

## FASE 3 — Empréstimos

### Task 7: Banco

- Create `database/migrations/2026-10-08-emprestimos.sql`:
```sql
create table public.eloi_emprestimos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  instituicao text,
  contexto eloi_contexto not null,
  conta_id uuid references public.eloi_contas(id),
  categoria_id uuid references public.eloi_categorias(id),
  valor_recebido_cents bigint not null default 0 check (valor_recebido_cents >= 0),
  parcelas_total smallint not null check (parcelas_total >= 1),
  valor_parcela_cents bigint not null check (valor_parcela_cents > 0),
  primeiro_vencimento date not null,
  parcelas_pagas_antes smallint not null default 0 check (parcelas_pagas_antes >= 0 and parcelas_pagas_antes <= parcelas_total),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);
alter table public.eloi_emprestimos enable row level security;
-- sem policy: anon/authenticated negados; edge usa service_role
alter table public.eloi_transacoes add column emprestimo_id uuid references public.eloi_emprestimos(id);
create index eloi_transacoes_emprestimo_idx on public.eloi_transacoes(emprestimo_id) where emprestimo_id is not null;
comment on table public.eloi_emprestimos is 'Empréstimos (ELOI). Parcelas são eloi_transacoes com emprestimo_id.';
```
- Aplicar via MCP `apply_migration`. Migrar os empréstimos já lançados: inserir cadastro e ligar as parcelas existentes por `emprestimo_id`.
- Ajustar `limite_cents` da "Itaú — conta 1" para 10000 (print: limite disponível R$ 100 com saldo 0).

### Task 8: Edge

- `edge-functions/_shared/financas.ts` + teste em `_tests/financas.test.ts`:
```ts
/** Parcelas que o sistema gera para um empréstimo: as que faltam depois das
 *  pagas fora do sistema. Vencimento mensal a partir do primeiro. */
export function planoDeParcelasEmprestimo(e: {
  parcelas_total: number; parcelas_pagas_antes: number; valor_parcela_cents: number; primeiro_vencimento: string;
}): { parcela_num: number; vencimento: string; valor_cents: number }[] {
  const out = [];
  for (let n = e.parcelas_pagas_antes + 1; n <= e.parcelas_total; n++) {
    out.push({ parcela_num: n, vencimento: dataDaParcela(e.primeiro_vencimento, n - 1), valor_cents: e.valor_parcela_cents });
  }
  return out;
}
```
Teste: `{12, 8, 171146, '2026-02-13'}` → 4 itens, nums 9..12, vencimentos `2026-10-13`, `2026-11-13`, `2026-12-13`, `2027-01-13`; `{3,3,...}` → `[]`; dia 31 em mês de 30 cai no último dia.
- `eloi-financas.ts`: `EMPRESTIMO_CAMPOS` (lista permitida = colunas da tabela menos id/created_at), `emprestimos.upsert` (valida nome, contexto, cents, `parcelas_total ≥ 1`, `0 ≤ pagas_antes ≤ total`, data; sem `id` → insere e gera parcelas: `tipo 'saida'`, `contexto`, `status` = `statusPorValor(valor,0,venc,hoje)`, `descricao` = `${nome} (${n}/${total})`, `conta_id`, `categoria_id`, `fornecedor` = instituicao, `data_competencia = data_vencimento = venc`, `parcela_num/parcela_de`, `origem 'parcelamento'`, `emprestimo_id`; com `id` → só update do cadastro), `emprestimos.encerrar` (`ativo=false`), e `bootstrap` incluindo `emprestimos` (todas, ordem `created_at`). Se a geração das parcelas falhar, apagar o empréstimo recém-criado e devolver erro (sem órfão).
- `npm run edges:check && npm run edges:test`; deploy MCP + conferência byte a byte + smoke 401; `DEPLOYS.json`.

### Task 9: Tela

- `app/src/lib/tipos.ts`: `Emprestimo` (colunas da tabela) e `emprestimo_id: string | null` em `Transacao`; `lib/api.ts`: `financas.salvarEmprestimo(e)`, `financas.encerrarEmprestimo(id)`; `financas-store.tsx`: `emprestimos` do bootstrap.
- `financeiro.ts` + teste:
```ts
export interface ResumoEmprestimo {
  total_cents: number; juros_cents: number | null; pago_cents: number; falta_cents: number
  parcelas_pagas: number; proxima: Transacao | null; quitacao: string; progresso: number
}
export function resumoEmprestimo(e: Emprestimo, transacoes: Transacao[]): ResumoEmprestimo {
  const parcelas = transacoes.filter((t) => t.emprestimo_id === e.id && !estaCancelada(t))
  const total = e.valor_parcela_cents * e.parcelas_total
  const quitadas = parcelas.filter((t) => saldoAberto(t) === 0).length
  const abertas = parcelas.filter((t) => saldoAberto(t) > 0)
    .sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''))
  const pagas = e.parcelas_pagas_antes + quitadas
  return {
    total_cents: total,
    juros_cents: e.valor_recebido_cents > 0 ? total - e.valor_recebido_cents : null,
    pago_cents: e.parcelas_pagas_antes * e.valor_parcela_cents + parcelas.reduce((s, t) => s + valorLiquidado(t), 0),
    falta_cents: abertas.reduce((s, t) => s + saldoAberto(t), 0),
    parcelas_pagas: pagas,
    proxima: abertas[0] ?? null,
    quitacao: dataDaParcela(e.primeiro_vencimento, e.parcelas_total - 1),
    progresso: pagas / e.parcelas_total,
  }
}
```
Teste com um empréstimo de exemplo: 8 antes + 4 abertas de 1.711,46 → `total 2053752`, `juros 453752`, `pago 1369168`, `falta 684584`, `parcelas_pagas 8`, `quitacao '2027-01-13'`, `progresso 8/12`; com 1 parcela liquidada → pagas 9, falta 513438. `valor_recebido 0` → `juros null`.
- `dinheiro/Emprestimos.tsx`: card por empréstimo ativo (lente): nome, instituição, `Progresso` (n/total), Pago, Falta, Juros (ou "valor recebido não informado"), próxima parcela (data + valor + conta), quitação. Total em aberto no topo. Botão "Novo empréstimo" → `Folha` com campos nome, instituição, contexto, conta que debita, valor recebido, nº parcelas, valor da parcela, 1º vencimento, parcelas já pagas (prévia: "Vai gerar N parcelas de R$ X, de dd/mm/aaaa a dd/mm/aaaa"). Editar (mesma folha, sem regerar) e Encerrar (confirmação). Encerrados recolhidos.
- `VisaoGeral.tsx`: `patrimonioLiquido(..., Σ resumoEmprestimo(e).falta_cents dos ativos)` + indicador "Empréstimos em aberto".
- Router `emprestimos` → tela nova; remover `EmBreve`.
- Docs (DATA_MODEL, ROUTE_MAP, FEATURE_MAP, CHANGELOG), build, commit, push, smoke.

---

## FASE 4 — Planejamento

### Task 10: Planejamento completo

- `dinheiro/Planejamento.tsx` com abas `Pilula`: **Metas e orçamentos** (mover o painel + `FolhaMeta` de `Relatorios.tsx` para `dinheiro/Metas.tsx` exportado; Relatórios perde a aba e ganha, se fizer sentido, link "Metas estão em Dinheiro › Planejamento"), **Recorrências** (já movida na fase 2), **Categorias** (mover de `Config.tsx`: lista por contexto/tipo, criar, editar nome/cor, desativar/reativar via `categorias.upsert` com `ativa`; categorias inativas recolhidas). `Config.tsx` perde a seção e ganha link.
- Verificar, docs, build, commit, push, smoke.

### Task 11: Revisão final

- Revisor independente (agente) sobre o diff da área nova: dinheiro (cents, sinais, transferência), links quebrados, estados vazio/erro, mobile.
- Corrigir achados, publicar, relatório curto ao usuário.
