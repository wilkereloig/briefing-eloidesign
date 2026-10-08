// Regras puras do núcleo financeiro que a edge eloi-financas aplica. Separadas
// da function para serem testáveis sem rede e sem banco (_tests/financas.test.ts).
// Várias ESPELHAM app/src/domain/financeiro.ts: se uma mudar lá, muda aqui.

/** Data de hoje no fuso do estúdio. `new Date().toISOString()` é UTC: entre
 *  21h e meia-noite de Brasília já é "amanhã", e uma conta que vence hoje
 *  virava "vencido" três horas antes da hora. */
export function hojeEmSaoPaulo(agora = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Status derivado do quanto entrou — nunca vem escolhido pela tela. */
export function statusPorValor(valor: number, recebido: number, vencimento: string | null, hoje: string): string {
  if (recebido >= valor) return "realizado";
  if (recebido > 0) return "parcial";
  if (vencimento && vencimento < hoje) return "vencido";
  return "pendente";
}

/** Situação pela data, sem gravar: abrir a tela não escreve no banco. A rotina
 *  diária (eloi_rotina_diaria) persiste a mesma regra. */
export function comSituacaoDoDia<T extends { status: string; recebido_cents: number; data_vencimento: string | null }>(
  t: T, hoje: string,
): T {
  if ((t.status === "pendente" || t.status === "previsto") && Number(t.recebido_cents) === 0
    && t.data_vencimento && t.data_vencimento < hoje) {
    return { ...t, status: "vencido" };
  }
  if (t.status === "vencido" && (!t.data_vencimento || t.data_vencimento >= hoje)) return { ...t, status: "pendente" };
  return t;
}

/** Próxima ocorrência de uma recorrência. Espelha eloi_proxima_ocorrencia (SQL,
 *  migração 2026-10-09): mensal em diante usa o dia de cobrança — 31 vira 28 em
 *  fevereiro e volta a 31 em março, em vez de "encolher" para sempre. */
export function proximaOcorrencia(data: string, periodicidade: string, dia: number | null): string {
  const somaDias = (n: number) => new Date(Date.parse(data) + n * 86_400_000).toISOString().slice(0, 10);
  if (periodicidade === "semanal") return somaDias(7);
  if (periodicidade === "quinzenal") return somaDias(15);
  const meses = ({ mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[periodicidade] ?? 1;
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia ?? d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Espelha dataDaParcela(): dia 31 em mes de 30 cai no ultimo dia do mes. */
export function dataDaParcela(inicio: string, i: number): string {
  const [a, m, d] = inicio.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + i, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Vencimento da fatura em que cai uma compra feita em `dataCompra`. Espelha
 * cicloFatura(cartao, hoje) de app/src/domain/financeiro.ts com hoje = data da
 * compra: compra DEPOIS do dia de fechamento vai para o ciclo seguinte; no
 * próprio dia do fechamento ainda entra no atual. Vencimento antes do
 * fechamento no calendário (fecha 25, vence 5) é no mês seguinte ao fechamento.
 */
export function vencimentoDaFatura(dataCompra: string, diaFechamento: number, diaVencimento: number): string {
  const [a, m, d] = dataCompra.split("-").map(Number);
  const desloc = d > diaFechamento ? 1 : 0;
  const fecha = dataDaParcela(`${a}-${String(m).padStart(2, "0")}-${String(diaFechamento).padStart(2, "0")}`, desloc);
  return dataDaParcela(
    `${fecha.slice(0, 8)}${String(diaVencimento).padStart(2, "0")}`,
    diaVencimento < diaFechamento ? 1 : 0,
  );
}

/**
 * Chave de importação por linha, com sufixo para linhas IDÊNTICAS no mesmo
 * lote: duas compras iguais no mesmo dia (dois cafés de 8,00) geravam a mesma
 * chave e o índice único (conta_id, importacao_chave) jogava a segunda fora.
 * A primeira ocorrência fica com a chave pura — reimportar um extrato antigo
 * continua reconhecendo o que já entrou —, a segunda vira `chave#2`, e assim
 * por diante. Reimportar o mesmo extrato gera as mesmas chaves: continua
 * idempotente.
 */
export function chavesComSequencia(chaves: string[]): string[] {
  const vistas = new Map<string, number>();
  return chaves.map((c) => {
    const n = (vistas.get(c) ?? 0) + 1;
    vistas.set(c, n);
    return n === 1 ? c : `${c}#${n}`;
  });
}

export type LinhaAberta = {
  id: string;
  tipo: string;
  valor_cents: number;
  recebido_cents: number;
  data_vencimento: string | null;
  created_at: string;
};

export type Baixa = {
  id: string;
  /** recebido_cents lido antes do plano: o banco só aplica a baixa se a linha
   *  ainda estiver assim (trava otimista contra pagamento concorrente). */
  recebido_anterior: number;
  recebido_cents: number;
  status: string;
  data_liquidacao: string;
};

/**
 * Plano de baixa de um pagamento de fatura (transacoes.pagar_fatura).
 *
 * 1. Estornos em aberto do cartão (entradas) são liquidados primeiro e SOMAM
 *    ao valor disponível — crédito na fatura abate o que se deve.
 * 2. As despesas em aberto são quitadas por ordem de vencimento (sem
 *    vencimento por último) e, no empate, de criação. Cada uma coberta inteira
 *    vira realizado; a primeira que não couber recebe o resto e fica com o
 *    status derivado (parcial).
 * 3. `sobra_cents` = o que não foi usado. > 0 quer dizer que pagou mais do que
 *    havia em aberto.
 */
export function planejarPagamentoFatura(
  abertas: LinhaAberta[],
  valorCents: number,
  data: string,
  hoje: string,
): { baixas: Baixa[]; sobra_cents: number } {
  const falta = (l: LinhaAberta) => l.valor_cents - l.recebido_cents;
  const baixas: Baixa[] = [];
  let disponivel = valorCents;

  for (const e of abertas.filter((l) => l.tipo === "entrada" && falta(l) > 0)) {
    disponivel += falta(e);
    baixas.push({
      id: e.id, recebido_anterior: e.recebido_cents, recebido_cents: e.valor_cents,
      status: "realizado", data_liquidacao: data,
    });
  }

  const despesas = abertas
    .filter((l) => l.tipo === "saida" && falta(l) > 0)
    .sort((x, y) =>
      (x.data_vencimento ?? "9999-12-31").localeCompare(y.data_vencimento ?? "9999-12-31") ||
      x.created_at.localeCompare(y.created_at)
    );
  for (const s of despesas) {
    if (disponivel <= 0) break;
    const usa = Math.min(falta(s), disponivel);
    disponivel -= usa;
    const recebido = s.recebido_cents + usa;
    baixas.push({
      id: s.id, recebido_anterior: s.recebido_cents, recebido_cents: recebido,
      status: statusPorValor(s.valor_cents, recebido, s.data_vencimento, hoje),
      data_liquidacao: data,
    });
  }
  return { baixas, sobra_cents: disponivel };
}

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
