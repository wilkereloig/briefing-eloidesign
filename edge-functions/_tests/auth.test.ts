import { assertEquals } from "jsr:@std/assert";
import { MAX_MS, SLIDE_MS, proximaExpiracao, requireAdmin, requireCliente, sessaoValida } from "../_shared/auth.ts";

const H = 3600_000;
const D = 24 * H;
const iso = (t: number) => new Date(t).toISOString();

// Stub mínimo do supabase-js: só o encadeamento que auth.ts usa.
function stub(row: Record<string, string> | null) {
  const updates: unknown[] = [];
  const deletes: string[] = [];
  return {
    updates, deletes,
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (u: unknown) => { updates.push(u); return { eq: async () => ({}) }; },
      delete: () => ({ eq: async () => { deletes.push(table); return {}; } }),
    }),
  };
}
const viva = (over: Partial<Record<string, string>> = {}) => ({
  expires_at: iso(Date.now() + H), created_at: iso(Date.now() - H), ...over,
});

Deno.test("sem token → false", async () => {
  assertEquals(await requireAdmin(stub(null), undefined), false);
});
Deno.test("token desconhecido → false", async () => {
  assertEquals(await requireAdmin(stub(null), "x"), false);
});
Deno.test("token expirado por inatividade → false e a linha é apagada", async () => {
  const s = stub(viva({ expires_at: iso(Date.now() - 1000) }));
  assertEquals(await requireAdmin(s, "x"), false);
  assertEquals(s.deletes, ["admin_sessions"]);
});
Deno.test("token vivo → true e desliza a sessão", async () => {
  const s = stub(viva());
  assertEquals(await requireAdmin(s, "x"), true);
  assertEquals(s.updates.length, 1);
});
Deno.test("teto absoluto: criada há 31 dias → false mesmo com expires_at no futuro", async () => {
  const s = stub(viva({ created_at: iso(Date.now() - 31 * D) }));
  assertEquals(await requireAdmin(s, "x"), false);
  assertEquals(s.deletes, ["admin_sessions"]);
});

Deno.test("requireCliente: sem token → null", async () => {
  assertEquals(await requireCliente(stub(null), undefined), null);
});
Deno.test("requireCliente: sessão viva → {cliente_id} e desliza", async () => {
  const s = stub(viva({ cliente_id: "abc-123" }));
  assertEquals(await requireCliente(s, "x"), { cliente_id: "abc-123" });
  assertEquals(s.updates.length, 1);
});
Deno.test("requireCliente: expirada → null", async () => {
  const s = stub(viva({ expires_at: iso(Date.now() - 1000), cliente_id: "abc-123" }));
  assertEquals(await requireCliente(s, "x"), null);
});

Deno.test("sessaoValida: exige os dois — inatividade E teto", () => {
  const agora = 1_000_000 * D;
  assertEquals(sessaoValida({ expires_at: iso(agora + H), created_at: iso(agora - D) }, agora), true);
  assertEquals(sessaoValida({ expires_at: iso(agora - 1), created_at: iso(agora - D) }, agora), false);
  assertEquals(sessaoValida({ expires_at: iso(agora + H), created_at: iso(agora - MAX_MS) }, agora), false);
});
Deno.test("proximaExpiracao: desliza 12h, mas para no teto", () => {
  const agora = 1_000_000 * D;
  const nova = { expires_at: iso(agora + H), created_at: iso(agora - D) };
  assertEquals(proximaExpiracao(nova, agora), iso(agora + SLIDE_MS));
  const quaseNoTeto = { expires_at: iso(agora + H), created_at: iso(agora - MAX_MS + H) };
  assertEquals(proximaExpiracao(quaseNoTeto, agora), iso(agora + H));
});
