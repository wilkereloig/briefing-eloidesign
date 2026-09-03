// Fonte ÚNICA da verificação de sessão. Substitui as cópias de
// verifyAdminToken() espalhadas pelas functions (D3/D6).
// admin_sessions e portal_sessions são tabelas SEPARADAS de propósito:
// token de cliente virar sessão admin é impossível por schema (D3).
// deno-lint-ignore no-explicit-any
type SupaLike = any;

/** Inatividade: cada chamada empurra `expires_at` 12h pra frente. */
export const SLIDE_MS = 12 * 3600 * 1000;
/**
 * Teto absoluto a partir de `created_at` (2026-09-03). Antes só deslizava:
 * um token usado toda semana nunca morria — vazou, valia pra sempre.
 * 30 dias: quem usa o painel todo dia relogra uma vez por mês.
 */
export const MAX_MS = 30 * 24 * 3600 * 1000;

export type Sessao = { expires_at: string; created_at: string };

export function sessaoValida(s: Sessao, agora = Date.now()): boolean {
  const expira = new Date(s.expires_at).getTime();
  const teto = new Date(s.created_at).getTime() + MAX_MS;
  return expira > agora && teto > agora;
}

/** Desliza 12h, mas nunca além do teto absoluto. */
export function proximaExpiracao(s: Sessao, agora = Date.now()): string {
  const teto = new Date(s.created_at).getTime() + MAX_MS;
  return new Date(Math.min(agora + SLIDE_MS, teto)).toISOString();
}

async function requireSession(supabase: SupaLike, table: string, token: string | undefined, cols: string) {
  if (!token) return null;
  const { data } = await supabase.from(table).select(cols + ",created_at").eq("token", token).maybeSingle();
  if (!data) return null;
  if (!sessaoValida(data)) {
    // Linha morta não decide mais nada — sai agora, sem esperar faxina.
    await supabase.from(table).delete().eq("token", token);
    return null;
  }
  await supabase.from(table)
    .update({ last_seen_at: new Date().toISOString(), expires_at: proximaExpiracao(data) })
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

/**
 * Faxina oportunista de sessões: expiradas por inatividade OU além do teto.
 * Chamada no login bem-sucedido — único momento em que uma escrita a mais
 * não ajuda quem está atacando. Sem cron.
 */
export async function faxinarSessoes(supabase: SupaLike, table: string, agora = Date.now()): Promise<void> {
  const agoraIso = new Date(agora).toISOString();
  const limiteCriacao = new Date(agora - MAX_MS).toISOString();
  await supabase.from(table).delete().or(`expires_at.lt.${agoraIso},created_at.lt.${limiteCriacao}`);
}
