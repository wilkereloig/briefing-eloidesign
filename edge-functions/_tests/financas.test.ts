import { assertEquals } from "jsr:@std/assert";
import {
  chavesComSequencia, comSituacaoDoDia, hojeEmSaoPaulo, type LinhaAberta, planejarPagamentoFatura, planoDeParcelasEmprestimo,
  proximaOcorrencia, vencimentoDaFatura,
} from "../_shared/financas.ts";

// ── hoje no fuso do estúdio ──
Deno.test("22h de Brasília ainda é hoje, mesmo já sendo amanhã em UTC", () => {
  assertEquals(hojeEmSaoPaulo(new Date("2026-10-09T01:00:00Z")), "2026-10-08");
  assertEquals(hojeEmSaoPaulo(new Date("2026-10-09T03:00:00Z")), "2026-10-09");
});

// ── vencimento da fatura (espelho de cicloFatura) ──
Deno.test("compra antes do fechamento vence na fatura do mês", () => {
  assertEquals(vencimentoDaFatura("2026-10-03", 5, 12), "2026-10-12");
});
Deno.test("compra no dia do fechamento ainda entra no ciclo atual", () => {
  assertEquals(vencimentoDaFatura("2026-10-05", 5, 12), "2026-10-12");
});
Deno.test("compra depois do fechamento vai para a fatura seguinte", () => {
  assertEquals(vencimentoDaFatura("2026-10-06", 5, 12), "2026-11-12");
});
Deno.test("vencimento antes do fechamento no calendário é no mês seguinte", () => {
  assertEquals(vencimentoDaFatura("2026-10-20", 25, 5), "2026-11-05");
  assertEquals(vencimentoDaFatura("2026-10-26", 25, 5), "2026-12-05");
});
Deno.test("virada de ano e dia 31 em mês curto", () => {
  assertEquals(vencimentoDaFatura("2026-12-28", 25, 5), "2027-02-05");
  assertEquals(vencimentoDaFatura("2026-02-10", 31, 31), "2026-02-28");
});

// ── chaves de importação ──
Deno.test("linhas idênticas no lote ganham sufixo; a primeira fica pura", () => {
  assertEquals(chavesComSequencia(["a", "b", "a", "a", "b"]), ["a", "b", "a#2", "a#3", "b#2"]);
});
Deno.test("reimportar o mesmo lote gera as mesmas chaves", () => {
  const lote = ["x", "x", "y"];
  assertEquals(chavesComSequencia(lote), chavesComSequencia([...lote]));
});

// ── plano de pagamento de fatura ──
const L = (id: string, tipo: string, valor: number, recebido = 0, venc: string | null = "2026-10-12", criado = "2026-10-01T00:00:00Z"): LinhaAberta =>
  ({ id, tipo, valor_cents: valor, recebido_cents: recebido, data_vencimento: venc, created_at: criado });
const HOJE = "2026-10-08";

Deno.test("quita da mais antiga para a mais nova e a última fica parcial", () => {
  const { baixas, sobra_cents } = planejarPagamentoFatura([
    L("nova", "saida", 5000, 0, "2026-11-12"),
    L("velha", "saida", 3000, 0, "2026-10-12"),
  ], 4000, "2026-10-08", HOJE);
  assertEquals(baixas.map((b) => [b.id, b.recebido_cents, b.status]), [["velha", 3000, "realizado"], ["nova", 1000, "parcial"]]);
  assertEquals(sobra_cents, 0);
});
Deno.test("empate de vencimento desempata por criação; sem vencimento vai por último", () => {
  const { baixas } = planejarPagamentoFatura([
    L("sem", "saida", 100, 0, null),
    L("b", "saida", 100, 0, "2026-10-12", "2026-10-02T00:00:00Z"),
    L("a", "saida", 100, 0, "2026-10-12", "2026-10-01T00:00:00Z"),
  ], 300, "2026-10-08", HOJE);
  assertEquals(baixas.map((b) => b.id), ["a", "b", "sem"]);
});
Deno.test("parcial já existente: soma ao recebido e guarda o anterior para a trava", () => {
  const { baixas } = planejarPagamentoFatura([L("p", "saida", 1000, 400)], 600, "2026-10-08", HOJE);
  assertEquals(baixas, [{ id: "p", recebido_anterior: 400, recebido_cents: 1000, status: "realizado", data_liquidacao: "2026-10-08" }]);
});
Deno.test("estorno aberto é liquidado primeiro e soma ao disponível", () => {
  const { baixas, sobra_cents } = planejarPagamentoFatura([
    L("compra", "saida", 1000),
    L("estorno", "entrada", 300),
  ], 700, "2026-10-08", HOJE);
  assertEquals(baixas.map((b) => [b.id, b.recebido_cents, b.status]), [["estorno", 300, "realizado"], ["compra", 1000, "realizado"]]);
  assertEquals(sobra_cents, 0);
});
Deno.test("pagou mais do que havia em aberto → sobra", () => {
  const { baixas, sobra_cents } = planejarPagamentoFatura([L("c", "saida", 500)], 800, "2026-10-08", HOJE);
  assertEquals(baixas.length, 1);
  assertEquals(sobra_cents, 300);
});
Deno.test("nada em aberto: nenhuma baixa, sobra o valor inteiro", () => {
  assertEquals(planejarPagamentoFatura([], 800, "2026-10-08", HOJE), { baixas: [], sobra_cents: 800 });
});
Deno.test("dinheiro acaba: as compras seguintes não são tocadas", () => {
  const { baixas } = planejarPagamentoFatura([
    L("a", "saida", 500, 0, "2026-10-01"),
    L("b", "saida", 500, 0, "2026-10-02"),
  ], 500, "2026-10-08", HOJE);
  assertEquals(baixas.map((b) => b.id), ["a"]);
});

// ── empréstimos ──
Deno.test("empréstimo 12x com 8 pagas antes gera as 4 restantes (9..12)", () => {
  const p = planoDeParcelasEmprestimo({
    parcelas_total: 12, parcelas_pagas_antes: 8, valor_parcela_cents: 171146, primeiro_vencimento: "2026-02-13",
  });
  assertEquals(p.map((x) => x.parcela_num), [9, 10, 11, 12]);
  assertEquals(p.map((x) => x.vencimento), ["2026-10-13", "2026-11-13", "2026-12-13", "2027-01-13"]);
  assertEquals(p.every((x) => x.valor_cents === 171146), true);
});
Deno.test("empréstimo todo pago antes não gera parcela", () => {
  assertEquals(planoDeParcelasEmprestimo({
    parcelas_total: 3, parcelas_pagas_antes: 3, valor_parcela_cents: 100, primeiro_vencimento: "2026-01-10",
  }), []);
});
Deno.test("empréstimo com vencimento no dia 31 cai no último dia do mês curto", () => {
  const p = planoDeParcelasEmprestimo({
    parcelas_total: 3, parcelas_pagas_antes: 0, valor_parcela_cents: 100, primeiro_vencimento: "2026-01-31",
  });
  assertEquals(p.map((x) => x.vencimento), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

// ── 2026-10-09: situação do dia e próxima ocorrência ────────────────────────

Deno.test("situação do dia: pendente com vencimento passado aparece vencido, sem gravar", () => {
  const t = { status: "pendente", recebido_cents: 0, data_vencimento: "2026-10-01" };
  assertEquals(comSituacaoDoDia(t, "2026-10-09").status, "vencido");
  assertEquals(t.status, "pendente"); // não muta a linha
});
Deno.test("situação do dia: previsto passado vira vencido; futuro continua previsto", () => {
  assertEquals(comSituacaoDoDia({ status: "previsto", recebido_cents: 0, data_vencimento: "2026-10-08" }, "2026-10-09").status, "vencido");
  assertEquals(comSituacaoDoDia({ status: "previsto", recebido_cents: 0, data_vencimento: "2026-10-10" }, "2026-10-09").status, "previsto");
});
Deno.test("situação do dia: vence hoje não está vencido; parcial continua parcial", () => {
  assertEquals(comSituacaoDoDia({ status: "pendente", recebido_cents: 0, data_vencimento: "2026-10-09" }, "2026-10-09").status, "pendente");
  assertEquals(comSituacaoDoDia({ status: "parcial", recebido_cents: 10, data_vencimento: "2026-01-01" }, "2026-10-09").status, "parcial");
});
Deno.test("situação do dia: vencido reagendado para o futuro volta a pendente", () => {
  assertEquals(comSituacaoDoDia({ status: "vencido", recebido_cents: 0, data_vencimento: "2026-11-01" }, "2026-10-09").status, "pendente");
});
Deno.test("próxima ocorrência mensal respeita o dia de cobrança depois de fevereiro", () => {
  assertEquals(proximaOcorrencia("2026-01-31", "mensal", 31), "2026-02-28");
  assertEquals(proximaOcorrencia("2026-02-28", "mensal", 31), "2026-03-31");
  assertEquals(proximaOcorrencia("2026-03-31", "mensal", 31), "2026-04-30");
});
Deno.test("próxima ocorrência: semanal, quinzenal, anual e sem dia de cobrança", () => {
  assertEquals(proximaOcorrencia("2026-10-09", "semanal", null), "2026-10-16");
  assertEquals(proximaOcorrencia("2026-10-09", "quinzenal", null), "2026-10-24");
  assertEquals(proximaOcorrencia("2024-02-29", "anual", 29), "2025-02-28");
  assertEquals(proximaOcorrencia("2026-01-15", "trimestral", null), "2026-04-15");
});
