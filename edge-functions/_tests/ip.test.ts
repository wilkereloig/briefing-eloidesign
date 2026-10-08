import { assertEquals } from "jsr:@std/assert";
import { ipDaRequisicao } from "../_shared/ip.ts";

const h = (o: Record<string, string> = {}) => new Headers(o);

Deno.test("cf-connecting-ip manda — é o que a Cloudflare escreveu", () => {
  assertEquals(ipDaRequisicao(h({
    "cf-connecting-ip": "177.12.1.1",
    "x-real-ip": "177.12.1.1",
    "x-forwarded-for": "forjado-123, 177.12.1.1, 99.82.164.22",
  })), "177.12.1.1");
});
Deno.test("XFF forjado não escolhe o IP quando a borda informou o real", () => {
  assertEquals(ipDaRequisicao(h({ "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "1.2.3.4" })), "8.8.8.8");
});
Deno.test("sem cf-connecting-ip usa x-real-ip", () => {
  assertEquals(ipDaRequisicao(h({ "x-real-ip": " 5.5.5.5 ", "x-forwarded-for": "1.1.1.1, 9.9.9.9" })), "5.5.5.5");
});
Deno.test("sem os dois cai no último do XFF, nunca no primeiro", () => {
  assertEquals(ipDaRequisicao(h({ "x-forwarded-for": "forjado-123, 9.9.9.9" })), "9.9.9.9");
  assertEquals(ipDaRequisicao(h({ "x-forwarded-for": " , 5.5.5.5 , " })), "5.5.5.5");
});
Deno.test("header vazio não conta como IP", () => {
  assertEquals(ipDaRequisicao(h({ "cf-connecting-ip": " ", "x-forwarded-for": "7.7.7.7" })), "7.7.7.7");
});
Deno.test("sem header → unknown (conta como um só IP, nunca como zero)", () => {
  assertEquals(ipDaRequisicao(h()), "unknown");
  assertEquals(ipDaRequisicao(h({ "x-forwarded-for": "" })), "unknown");
});
