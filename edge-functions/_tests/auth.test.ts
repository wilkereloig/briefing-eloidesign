import { assertEquals } from "jsr:@std/assert";
import { requireAdmin, requireCliente } from "../_shared/auth.ts";

// Stub mínimo do supabase-js: só o encadeamento que auth.ts usa.
function stub(row: Record<string, string> | null) {
  const updates: unknown[] = [];
  return {
    updates,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (u: unknown) => { updates.push(u); return { eq: async () => ({}) }; },
    }),
  };
}

Deno.test("sem token → false", async () => {
  assertEquals(await requireAdmin(stub(null), undefined), false);
});
Deno.test("token desconhecido → false", async () => {
  assertEquals(await requireAdmin(stub(null), "x"), false);
});
Deno.test("token expirado → false", async () => {
  const s = stub({ expires_at: new Date(Date.now() - 1000).toISOString() });
  assertEquals(await requireAdmin(s, "x"), false);
});
Deno.test("token vivo → true e desliza a sessão", async () => {
  const s = stub({ expires_at: new Date(Date.now() + 3600_000).toISOString() });
  assertEquals(await requireAdmin(s, "x"), true);
  assertEquals(s.updates.length, 1);
});

Deno.test("requireCliente: sem token → null", async () => {
  assertEquals(await requireCliente(stub(null), undefined), null);
});
Deno.test("requireCliente: sessão viva → {cliente_id} e desliza", async () => {
  const s = stub({ expires_at: new Date(Date.now() + 3600_000).toISOString(), cliente_id: "abc-123" });
  assertEquals(await requireCliente(s, "x"), { cliente_id: "abc-123" });
  assertEquals(s.updates.length, 1);
});
Deno.test("requireCliente: expirada → null", async () => {
  const s = stub({ expires_at: new Date(Date.now() - 1000).toISOString(), cliente_id: "abc-123" });
  assertEquals(await requireCliente(s, "x"), null);
});
