import { assertEquals } from "jsr:@std/assert";
import { ipDaRequisicao } from "../_shared/ip.ts";

const h = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

Deno.test("último elemento da cadeia — o que a borda escreveu", () => {
  assertEquals(ipDaRequisicao(h("1.1.1.1, 2.2.2.2, 3.3.3.3")), "3.3.3.3");
});
Deno.test("valor injetado pelo cliente no começo não escolhe o IP", () => {
  assertEquals(ipDaRequisicao(h("forjado-123, 9.9.9.9")), "9.9.9.9");
});
Deno.test("espaços e itens vazios são ignorados", () => {
  assertEquals(ipDaRequisicao(h(" , 5.5.5.5 , ")), "5.5.5.5");
});
Deno.test("sem header → unknown (conta como um só IP, nunca como zero)", () => {
  assertEquals(ipDaRequisicao(h()), "unknown");
  assertEquals(ipDaRequisicao(h("")), "unknown");
});
