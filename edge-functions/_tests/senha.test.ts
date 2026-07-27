import { assertEquals } from "jsr:@std/assert";
import { normalizarSenha } from "../_shared/senha.ts";

Deno.test("normaliza igual ao login do portal (espaços/hífens fora, uppercase)", () => {
  const r = normalizarSenha("k883-eloi-georgia-andrade-2026");
  assertEquals(r.prefix, "K883");
  assertEquals(r.secret, "ELOIGEORGIAANDRADE2026");
});
Deno.test("senha curta não explode", () => {
  assertEquals(normalizarSenha("ab"), { prefix: "AB", secret: "" });
  assertEquals(normalizarSenha(""), { prefix: "", secret: "" });
});
