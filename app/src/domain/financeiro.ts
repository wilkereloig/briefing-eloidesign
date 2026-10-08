// Regras financeiras do ELOI Studio — FONTE ÚNICA de todo cálculo de dinheiro.
// Nenhuma tela recalcula saldo, resultado ou pendência por conta própria: se um
// número aparece na interface, ele saiu daqui. Duas telas com contas próprias é
// como um sistema financeiro passa a mostrar dois valores para a mesma coisa.
//
// Invariantes (espelham as constraints de database/migrations/2026-08-04-gestao-eloi-financeiro.sql):
//  · valor em cents inteiros, sempre;
//  · TRANSFERÊNCIA não é receita nem despesa — só troca de bolso. Ela move saldo
//    entre contas e é neutra no resultado. Contar transferência como receita é o
//    erro que infla faturamento e é o motivo de o tipo existir separado;
//  · o que entrou de fato é `recebido_cents`; `valor_cents` é o combinado.
//    Pagamento parcial é normal, não exceção;
//  · competência (a que mês pertence) ≠ liquidação (quando o dinheiro andou).
//    Resultado usa competência; saldo usa liquidação.
import type { Transacao, Conta, Contexto, Meta, StatusMov } from '../lib/tipos'

/** Status em que a transação ainda não liquidou e continua devida. */
const EM_ABERTO: StatusMov[] = ['previsto', 'pendente', 'parcial', 'vencido']

export const estaEmAberto = (t: Transacao) => EM_ABERTO.includes(t.status)
export const estaCancelada = (t: Transacao) => t.status === 'cancelado'

/** Quanto ainda falta entrar/sair desta transação. */
export function saldoAberto(t: Transacao): number {
  if (estaCancelada(t)) return 0
  // O que já liquidou é o mesmo número que valorLiquidado() enxerga. Usar
  // `recebido_cents` cru aqui contava o lançamento 'realizado' com recebido
  // zerado DUAS vezes: inteiro em receita e inteiro em "a receber".
  return Math.max(0, t.valor_cents - valorLiquidado(t))
}

/** Soma do que falta entrar/sair numa lista — os indicadores "a receber" e
 *  "a pagar" das telas. */
export const totalEmAberto = (ts: Transacao[]) => ts.reduce((s, t) => s + saldoAberto(t), 0)

/** Quanto já andou de dinheiro nesta transação. */
export function valorLiquidado(t: Transacao): number {
  if (estaCancelada(t)) return 0
  // 'realizado' com recebido zerado é o caso comum de quem marcou pago sem
  // informar valor: liquidou tudo.
  if (t.status === 'realizado' && t.recebido_cents === 0) return t.valor_cents
  return t.recebido_cents
}

// ── saldo de conta ───────────────────────────────────────────────────────────

/**
 * Saldo real da conta: só dinheiro que efetivamente andou.
 * Transferência entra aqui (move saldo) e fica fora do resultado.
 */
export function saldoConta(conta: Conta, transacoes: Transacao[]): number {
  let saldo = conta.saldo_inicial_cents
  for (const t of transacoes) {
    const v = valorLiquidado(t)
    if (v === 0) continue
    if (t.tipo === 'transferencia') {
      if (t.conta_id === conta.id) saldo -= v
      if (t.conta_destino_id === conta.id) saldo += v
      continue
    }
    if (t.conta_id !== conta.id) continue
    saldo += t.tipo === 'entrada' ? v : -v
  }
  return saldo
}

/** Saldo da conta ao fim de `data`: só o que liquidou até ali. É o número
 *  que se compara com o extrato daquele dia numa conferência. */
export function saldoContaEm(conta: Conta, transacoes: Transacao[], data: string): number {
  return saldoConta(conta, transacoes.filter((t) =>
    (t.data_liquidacao ?? t.created_at.slice(0, 10)) <= data))
}

/** Soma de saldos das contas de um contexto. Cartão de crédito fica de fora:
 *  fatura é dívida, não saldo disponível — some em `faturaAberta`. */
export function saldoDisponivel(contas: Conta[], transacoes: Transacao[], contexto?: Contexto): number {
  return contas
    .filter((c) => c.ativa && c.tipo !== 'cartao_credito' && (!contexto || c.contexto === contexto))
    .reduce((s, c) => s + saldoConta(c, transacoes), 0)
}

// ── resultado do período (regime de competência) ─────────────────────────────

export interface Resultado {
  receita_cents: number
  despesa_cents: number
  lucro_cents: number
  margem: number
  /** Receita combinada que ainda não entrou. */
  a_receber_cents: number
  /** Despesa combinada que ainda não saiu. */
  a_pagar_cents: number
}

/** `mes` no formato 'AAAA-MM'; omitido, considera todas as competências. */
export function resultado(transacoes: Transacao[], contexto?: Contexto, mes?: string): Resultado {
  let receita = 0, despesa = 0, aReceber = 0, aPagar = 0
  for (const t of transacoes) {
    // transferência é neutra: nunca entra em resultado
    if (t.tipo === 'transferencia' || estaCancelada(t)) continue
    if (contexto && t.contexto !== contexto) continue
    if (mes && !competenciaNoMes(t, mes)) continue

    const liquidado = valorLiquidado(t)
    const aberto = saldoAberto(t)
    if (t.tipo === 'entrada') { receita += liquidado; aReceber += aberto }
    else { despesa += liquidado; aPagar += aberto }
  }
  const lucro = receita - despesa
  return {
    receita_cents: receita,
    despesa_cents: despesa,
    lucro_cents: lucro,
    margem: receita > 0 ? lucro / receita : 0,
    a_receber_cents: aReceber,
    a_pagar_cents: aPagar,
  }
}

/** Resultado mês a mês e o acumulado da série — o gráfico de 12 meses.
 *  O total é a soma dos meses, não um segundo cálculo com regra própria. */
export function serieResultado(transacoes: Transacao[], meses: string[], contexto?: Contexto) {
  const serie = meses.map((mes) => ({ mes, ...resultado(transacoes, contexto, mes) }))
  const receita = serie.reduce((s, m) => s + m.receita_cents, 0)
  const despesa = serie.reduce((s, m) => s + m.despesa_cents, 0)
  const lucro = receita - despesa
  return {
    serie,
    total: { receita_cents: receita, despesa_cents: despesa, lucro_cents: lucro, margem: receita > 0 ? lucro / receita : 0 },
  }
}

/** Ticket médio por recebimento liquidado (entradas com dinheiro que andou). */
export function ticketMedio(transacoes: Transacao[]): number {
  const entradas = transacoes.filter((t) => t.tipo === 'entrada' && valorLiquidado(t) > 0)
  if (!entradas.length) return 0
  return Math.round(entradas.reduce((s, t) => s + valorLiquidado(t), 0) / entradas.length)
}

/** Competência da transação, com fallback pro vencimento e depois liquidação —
 *  lançamento sem competência explícita não pode sumir do relatório. */
export function competenciaDe(t: Transacao): string | null {
  const d = t.data_competencia || t.data_vencimento || t.data_liquidacao
  return d ? d.slice(0, 7) : null
}

const competenciaNoMes = (t: Transacao, mes: string) => competenciaDe(t) === mes

// ── pendências e vencimentos ─────────────────────────────────────────────────

/** Vencidas de verdade: em aberto e com vencimento anterior a `hoje`.
 *  `hoje` entra por parâmetro para o cálculo ser determinístico e testável. */
export function vencidas(transacoes: Transacao[], hoje: string, contexto?: Contexto): Transacao[] {
  return transacoes.filter((t) =>
    estaEmAberto(t) && !!t.data_vencimento && t.data_vencimento < hoje &&
    (!contexto || t.contexto === contexto))
}

export function diasDeAtraso(t: Transacao, hoje: string): number {
  if (!t.data_vencimento || !estaEmAberto(t)) return 0
  const ms = Date.parse(hoje) - Date.parse(t.data_vencimento)
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Em aberto vencendo nos próximos `dias`. Ordenado do mais próximo. */
export function proximosVencimentos(transacoes: Transacao[], hoje: string, dias = 30): Transacao[] {
  const limite = new Date(Date.parse(hoje) + dias * 86_400_000).toISOString().slice(0, 10)
  return transacoes
    .filter((t) => t.tipo !== 'transferencia' && estaEmAberto(t) && !!t.data_vencimento &&
      t.data_vencimento >= hoje && t.data_vencimento <= limite)
    .sort((a, b) => (a.data_vencimento! < b.data_vencimento! ? -1 : 1))
}

/** Faixas de prazo da fila de cobrança. A ordem é a ordem de urgência. */
export type FaixaPrazo = 'vencido' | 'hoje' | 'semana' | 'mes' | 'proximo' | 'sem_data'

export const ROTULO_FAIXA: Record<FaixaPrazo, string> = {
  vencido: 'Vencidos',
  hoje: 'Hoje',
  semana: 'Próximos 7 dias',
  mes: 'Ainda este mês',
  proximo: 'Depois',
  sem_data: 'Sem vencimento',
}

const ORDEM_FAIXA: FaixaPrazo[] = ['vencido', 'hoje', 'semana', 'mes', 'proximo', 'sem_data']

export function faixaDePrazo(t: Transacao, hoje: string): FaixaPrazo {
  const v = t.data_vencimento
  if (!v) return 'sem_data'
  if (v < hoje) return 'vencido'
  if (v === hoje) return 'hoje'
  const semana = new Date(Date.parse(hoje) + 7 * 86_400_000).toISOString().slice(0, 10)
  if (v <= semana) return 'semana'
  if (v.slice(0, 7) === hoje.slice(0, 7)) return 'mes'
  return 'proximo'
}

/**
 * Fila de cobrança agrupada por prazo, do mais urgente ao mais distante.
 * Faixa vazia não aparece: título sem item é ruído. Dentro da faixa, ordena
 * por vencimento — e o vencido mais antigo vem primeiro.
 */
export function agruparPorPrazo(
  transacoes: Transacao[], hoje: string,
): { faixa: FaixaPrazo; itens: Transacao[]; total_cents: number }[] {
  const mapa = new Map<FaixaPrazo, Transacao[]>()
  for (const t of transacoes) {
    const f = faixaDePrazo(t, hoje)
    mapa.set(f, [...(mapa.get(f) ?? []), t])
  }
  return ORDEM_FAIXA
    .filter((f) => mapa.has(f))
    .map((f) => {
      const itens = mapa.get(f)!.sort((a, b) =>
        (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999'))
      return { faixa: f, itens, total_cents: itens.reduce((s, t) => s + saldoAberto(t), 0) }
    })
}

// ── cartão de crédito ────────────────────────────────────────────────────────

/**
 * Fatura de um cartão: soma das compras em aberto do ciclo.
 * O pagamento da fatura é uma TRANSFERÊNCIA (conta corrente → cartão) e por isso
 * não aparece de novo como despesa — a despesa já foi lançada na compra.
 */
export function faturaAberta(cartao: Conta, transacoes: Transacao[]): number {
  // Só a PRÓXIMA fatura: parcela que vence no mês que vem não se paga agora.
  // Somar tudo sugeria pagar o parcelamento inteiro de uma vez. A edge quita
  // na mesma ordem (por vencimento), então o valor sugerido fecha certinho.
  // Mesmo vencimento efetivo de `faturasDoCartao` (compra sem vencimento cai no
  // ciclo da data da compra); sem nenhum dos dois, entra sempre.
  const abertas = linhasAbertasDoCartao(cartao, transacoes).map((t) => ({
    t, venc: t.data_vencimento
      ?? (t.data_competencia ? cicloFatura(cartao, t.data_competencia)?.vencimento : undefined) ?? null,
  }))
  // Primeira fatura (por vencimento) que de fato deve: estorno que zera uma
  // fatura não faz a tela sugerir R$ 0 enquanto a seguinte tem saldo.
  const semVenc = abertas.filter((x) => !x.venc).map((x) => x.t)
  const vencs = [...new Set(abertas.map((x) => x.venc).filter((v): v is string => !!v))].sort()
  for (const v of vencs) {
    const soma = somaComEstorno([...semVenc, ...abertas.filter((x) => x.venc === v).map((x) => x.t)])
    if (soma > 0) return soma
  }
  return somaComEstorno(semVenc)
}

/** Tudo o que o cartão ainda deve, em qualquer fatura. É o que ocupa limite. */
export function dividaDoCartao(cartao: Conta, transacoes: Transacao[]): number {
  return somaComEstorno(linhasAbertasDoCartao(cartao, transacoes))
}

const linhasAbertasDoCartao = (cartao: Conta, transacoes: Transacao[]) => transacoes.filter((t) =>
  t.conta_id === cartao.id && t.tipo !== 'transferencia' && !estaCancelada(t) && saldoAberto(t) > 0)

// Estorno (entrada no cartão) em aberto abate a fatura — mesmo critério de
// planejarPagamentoFatura na edge, senão a tela sugere pagar o bruto e o
// servidor devolve o estorno como sobra.
const somaComEstorno = (linhas: Transacao[]) => Math.max(0,
  linhas.reduce((s, t) => s + (t.tipo === 'saida' ? saldoAberto(t) : -saldoAberto(t)), 0))

/**
 * Datas do ciclo atual do cartão a partir de `hoje`: quando a fatura fecha e
 * quando vence. Fechamento já passou neste mês → o ciclo é o do mês que vem.
 * Vencimento menor que fechamento significa que vence no mês seguinte ao
 * fechamento (fecha dia 25, vence dia 5).
 */
export function cicloFatura(cartao: Conta, hoje: string): { fechamento: string; vencimento: string } | null {
  if (!cartao.dia_fechamento || !cartao.dia_vencimento) return null
  const [a, m, d] = hoje.split('-').map(Number)
  const desloc = d > cartao.dia_fechamento ? 1 : 0
  const fecha = dataDaParcela(`${a}-${String(m).padStart(2, '0')}-${String(cartao.dia_fechamento).padStart(2, '0')}`, desloc)
  const vence = dataDaParcela(
    `${fecha.slice(0, 8)}${String(cartao.dia_vencimento).padStart(2, '0')}`,
    cartao.dia_vencimento < cartao.dia_fechamento ? 1 : 0)
  return { fechamento: fecha, vencimento: vence }
}

/** Parcelas ainda em aberto no cartão: quantas linhas e quanto falta. */
export function parceladoAberto(cartao: Conta, transacoes: Transacao[]): { qtd: number; cents: number } {
  const linhas = transacoes.filter((t) =>
    t.conta_id === cartao.id && t.tipo === 'saida' && !!t.parcela_de && estaEmAberto(t))
  return { qtd: linhas.length, cents: linhas.reduce((s, t) => s + saldoAberto(t), 0) }
}

export function limiteDisponivel(cartao: Conta, transacoes: Transacao[]): number | null {
  if (cartao.limite_cents == null) return null
  return cartao.limite_cents - dividaDoCartao(cartao, transacoes)
}

/**
 * Divide um valor em N parcelas sem perder centavo: o resto da divisão vai
 * inteiro para a primeira parcela. 100,00 em 3 = 33,34 + 33,33 + 33,33.
 */
export function dividirParcelas(valor_cents: number, n: number): number[] {
  if (n < 1) throw new Error('parcelas deve ser >= 1')
  const base = Math.floor(valor_cents / n)
  const resto = valor_cents - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base))
}

/** Data da parcela `i` (0-based) a partir de uma data inicial 'AAAA-MM-DD'.
 *  Dia 31 em mês de 30 cai no último dia do mês, não vaza pro mês seguinte. */
export function dataDaParcela(inicio: string, i: number): string {
  const [a, m, d] = inicio.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + i, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

// ── previsão de caixa ────────────────────────────────────────────────────────

export interface Cenario { conservador: number; provavel: number; otimista: number }

/**
 * Previsão de saldo ao fim do horizonte. Três cenários variam só o quanto do
 * "a receber" se acredita: vencido tem menos chance de entrar que a vencer.
 * Realizado nunca é projetado — já é fato e está no saldo.
 */
export function previsaoCaixa(
  contas: Conta[], transacoes: Transacao[], hoje: string, dias = 90, contexto?: Contexto,
): Cenario {
  const saldo = saldoDisponivel(contas, transacoes, contexto)
  const limite = new Date(Date.parse(hoje) + dias * 86_400_000).toISOString().slice(0, 10)

  let receberEmDia = 0, receberAtrasado = 0, pagar = 0
  for (const t of transacoes) {
    if (t.tipo === 'transferencia' || !estaEmAberto(t)) continue
    if (contexto && t.contexto !== contexto) continue
    const venc = t.data_vencimento
    if (!venc || venc > limite) continue
    const aberto = saldoAberto(t)
    if (t.tipo === 'saida') { pagar += aberto; continue }
    if (venc < hoje) receberAtrasado += aberto
    else receberEmDia += aberto
  }
  // despesa prevista entra inteira nos três: conta a pagar não escolhe cenário
  return {
    conservador: saldo + Math.round(receberEmDia * 0.7) - pagar,
    provavel: saldo + receberEmDia + Math.round(receberAtrasado * 0.5) - pagar,
    otimista: saldo + receberEmDia + receberAtrasado - pagar,
  }
}

// ── agregações de análise ────────────────────────────────────────────────────

export interface Fatia { chave: string; total_cents: number; qtd: number }

/** Agrupa por uma chave da transação, do maior total pro menor. Soma o que
 *  já liquidou (relatório de caixa); a fatura do cartão passa `valor` para
 *  somar o combinado — compra em aberto também é gasto da fatura. */
export function agrupar(
  transacoes: Transacao[], chave: (t: Transacao) => string | null, tipo: 'entrada' | 'saida',
  valor: (t: Transacao) => number = valorLiquidado,
): Fatia[] {
  const mapa = new Map<string, Fatia>()
  for (const t of transacoes) {
    if (t.tipo !== tipo || estaCancelada(t)) continue
    const k = chave(t)
    if (!k) continue
    const atual = mapa.get(k) || { chave: k, total_cents: 0, qtd: 0 }
    atual.total_cents += valor(t)
    atual.qtd += 1
    mapa.set(k, atual)
  }
  return [...mapa.values()].filter((f) => f.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents)
}

/**
 * Período de uma meta, datas inclusivas. Com `fim`, vale o `fim`. Sem ele, o
 * limite de gasto é MENSAL — o mês do `inicio` — e a meta de acúmulo não
 * termina. Antes, orçamento sem fim somava do início para sempre e todo
 * limite "estourava" depois de alguns meses.
 */
export function periodoDaMeta(m: Pick<Meta, 'especie' | 'inicio' | 'fim'>): { de: string; ate: string | null } {
  if (m.fim) return { de: m.inicio, ate: m.fim }
  if (m.especie === 'meta') return { de: m.inicio, ate: null }
  const [a, mm] = m.inicio.split('-').map(Number)
  return { de: m.inicio, ate: new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10) }
}

/** Quanto já foi usado da meta: orçamento mede saída da categoria; meta de
 *  acúmulo mede entrada. Data de referência é a competência (com a mesma
 *  cascata de `competenciaDe`) — é resultado, não saldo. */
export function consumoDaMeta(m: Meta, transacoes: Transacao[]): number {
  const { de, ate } = periodoDaMeta(m)
  const tipo = m.especie === 'orcamento' ? 'saida' : 'entrada'
  return transacoes
    .filter((t) => {
      if (t.tipo !== tipo || t.contexto !== m.contexto) return false
      if (m.categoria_id && t.categoria_id !== m.categoria_id) return false
      const d = t.data_competencia || t.data_vencimento || t.data_liquidacao
      return !!d && d >= de && (!ate || d <= ate)
    })
    .reduce((s, t) => s + valorLiquidado(t), 0)
}

/** Consumo de um orçamento de gasto: quanto do limite já foi usado. */
export function consumoOrcamento(alvo_cents: number, gasto_cents: number) {
  return {
    usado_cents: gasto_cents,
    restante_cents: alvo_cents - gasto_cents,
    percentual: alvo_cents > 0 ? gasto_cents / alvo_cents : 0,
    estourou: gasto_cents > alvo_cents,
  }
}

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

/** Cheque especial em uso: quanto o saldo da conta está abaixo de zero. */
export const chequeEspecialUsado = (saldo_cents: number) => Math.max(0, -saldo_cents)

// ── Visão geral ──────────────────────────────────────────────────────────────
export interface Cobertura { a_pagar_cents: number; disponivel_cents: number; falta_cents: number; itens: number }

const somaDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso) + dias * 86_400_000).toISOString().slice(0, 10)

/** Saídas soltas que `cobertura` conta: em aberto, vencendo até `dias` (atrasadas
 *  incluídas), em conta ativa que não é cartão. A lista da Visão geral usa a
 *  mesma função, senão a tela lista uma coisa e soma outra. */
export function saidasDaCobertura(contas: Conta[], transacoes: Transacao[], hoje: string, dias = 7, contexto?: Contexto): Transacao[] {
  const ate = somaDias(hoje, dias)
  const ids = new Set(contas.filter((c) => c.ativa && c.tipo !== 'cartao_credito' && (!contexto || c.contexto === contexto))
    .map((c) => c.id))
  return transacoes.filter((t) => t.tipo === 'saida' && !!t.conta_id && ids.has(t.conta_id) && estaEmAberto(t) &&
    !!t.data_vencimento && t.data_vencimento <= ate)
}

/**
 * Dá para pagar o que vence nos próximos `dias`? A pagar = saídas em aberto
 * das contas (atrasadas incluídas) + faturas de cartão com saldo que vencem
 * até lá. Disponível = saldo + limite (cheque especial) das contas. A receber
 * não entra: cobertura é conservadora.
 */
export function cobertura(contas: Conta[], transacoes: Transacao[], hoje: string, dias = 7, contexto?: Contexto): Cobertura {
  const ate = somaDias(hoje, dias)
  const ativas = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
  let aPagar = 0
  let itens = 0
  for (const t of saidasDaCobertura(contas, transacoes, hoje, dias, contexto)) {
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
