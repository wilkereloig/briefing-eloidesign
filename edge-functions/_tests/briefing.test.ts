import { assertEquals } from "jsr:@std/assert";
import { linhaBriefingAberto, MAX_RAW_BYTES } from "../_shared/briefing.ts";

Deno.test("briefing aberto: só colunas conhecidas viram coluna; tudo vai no raw", () => {
  const raw = { nome: "Ana", email: "a@b.c", q1: "Loja", q18: "Logo, Site", campo_novo: "x" };
  const r = linhaBriefingAberto("briefing", raw);
  assertEquals(r, { tabela: "briefings", linha: { raw, nome: "Ana", email: "a@b.c", q1: "Loja", q18: "Logo, Site" } });
});

Deno.test("briefing aberto: e-commerce usa a empresa da página, senão a do formulário", () => {
  const raw = { nome: "Ana", ec_empresa: "Loja X" };
  assertEquals(linhaBriefingAberto("ecommerce", raw, "Solarium"), {
    tabela: "ecommerce_briefings",
    linha: { nome: "Ana", email: null, whatsapp: null, empresa: "Solarium", raw },
  });
  const semEmpresa = linhaBriefingAberto("ecommerce", raw);
  assertEquals("linha" in semEmpresa && semEmpresa.linha.empresa, "Loja X");
});

Deno.test("briefing aberto: recusa formulário desconhecido, raw ausente ou enorme", () => {
  assertEquals(linhaBriefingAberto("orcamentos", {}), { erro: "formulario invalido" });
  assertEquals(linhaBriefingAberto("briefing", null), { erro: "raw obrigatorio" });
  assertEquals(linhaBriefingAberto("briefing", ["a"]), { erro: "raw obrigatorio" });
  assertEquals(linhaBriefingAberto("briefing", { q1: "x".repeat(MAX_RAW_BYTES) }), { erro: "briefing grande demais" });
});

Deno.test("briefing aberto: campo longo é cortado na coluna, inteiro no raw", () => {
  const raw = { q2: "y".repeat(6000) };
  const r = linhaBriefingAberto("briefing", raw);
  assertEquals("linha" in r && String(r.linha.q2).length, 5000);
});
