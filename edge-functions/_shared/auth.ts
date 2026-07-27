// Fonte ÚNICA da verificação de sessão. Substitui as cópias de
// verifyAdminToken() espalhadas pelas functions (D3/D6).
// admin_sessions e portal_sessions são tabelas SEPARADAS de propósito:
// token de cliente virar sessão admin é impossível por schema (D3).
// deno-lint-ignore no-explicit-any
type SupaLike = any;

const SLIDE_MS = 12 * 3600 * 1000;

async function requireSession(supabase: SupaLike, table: string, token: string | undefined, cols: string) {
  if (!token) return null;
  const { data } = await supabase.from(table).select(cols).eq("token", token).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  await supabase.from(table)
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + SLIDE_MS).toISOString() })
    .eq("token", token);
  return data;
}

export async function requireAdmin(supabase: SupaLike, token: string | undefined): Promise<boolean> {
  return (await requireSession(supabase, "admin_sessions", token, "expires_at")) !== null;
}

export async function requireCliente(supabase: SupaLike, token: string | undefined): Promise<{ cliente_id: string } | null> {
  const s = await requireSession(supabase, "portal_sessions", token, "expires_at,cliente_id");
  return s ? { cliente_id: s.cliente_id } : null;
}
