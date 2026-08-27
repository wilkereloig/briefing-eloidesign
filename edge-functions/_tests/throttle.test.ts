import { assertEquals } from "jsr:@std/assert";
import { avaliarTentativa, LIMITE_GLOBAL, LIMITE_IP } from "../_shared/throttle.ts";

Deno.test("primeira tentativa passa", () => {
  assertEquals(avaliarTentativa(0, 0), null);
});

Deno.test("abaixo do limite do IP passa", () => {
  assertEquals(avaliarTentativa(LIMITE_IP - 1, 0), null);
});

Deno.test("no limite do IP bloqueia", () => {
  assertEquals(avaliarTentativa(LIMITE_IP, 0), "ip");
});

Deno.test("IP limpo não é punido pelo barulho dos outros", () => {
  // O ponto da mudança de 2026-08-07: com contador global, isto era bloqueio.
  assertEquals(avaliarTentativa(0, LIMITE_GLOBAL - 1), null);
});

Deno.test("limite global estourado bloqueia até quem não tentou", () => {
  assertEquals(avaliarTentativa(0, LIMITE_GLOBAL), "global");
});

Deno.test("o motivo do IP tem precedência sobre o global", () => {
  assertEquals(avaliarTentativa(LIMITE_IP, LIMITE_GLOBAL), "ip");
});

Deno.test("limite global é folgado o bastante para não pegar uso normal", () => {
  // Guarda contra alguém 'apertar a segurança' baixando este número e
  // reintroduzindo o DoS que a mudança removeu.
  assertEquals(LIMITE_GLOBAL >= 100, true);
});
