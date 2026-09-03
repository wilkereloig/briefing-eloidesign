import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdmin } from "./_shared/auth.ts";
import { avaliarTentativa, JANELA_MS } from "./_shared/throttle.ts";
import { ipDaRequisicao } from "./_shared/ip.ts";

const TABELA_TENTATIVAS = "admin_login_ip_attempts";
const FAXINA_MS = 24 * 3600 * 1000;

// Origens que podem falar com esta function PELO NAVEGADOR. CORS não impede
// curl — a defesa contra força bruta é o throttle abaixo. O que a allowlist
// impede é uma página qualquer usar o navegador de outra pessoa para martelar
// o login, que era exatamente o que o "*" anterior autorizava.
const ORIGENS = [
  "https://briefing-eloidesign.vercel.app",
  "https://www.eloidesign.com.br",
  "http://localhost:5207",
  "http://127.0.0.1:5207",
];
// Sem curinga para preview da Vercel de propósito: `.vercel.app` é espaço
// compartilhado com todo mundo que publica lá, e um padrão como
// /briefing-eloidesign.*\.vercel\.app/ liberaria qualquer projeto alheio que
// escolhesse um nome parecido. Precisar de um preview? Cole a URL exata acima.

function corsDe(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  const liberada = ORIGENS.includes(origem);
  return {
    ...(liberada ? { "Access-Control-Allow-Origin": origem, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** Comparação sem early-exit: o tempo da resposta não conta caracteres certos. */
function igualdadeConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const cors = corsDe(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const action = body?.action || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (action === "login") {
    const expected = Deno.env.get("ADMIN_PASSWORD");
    if (!expected) return json({ error: "ADMIN_PASSWORD não configurado no projeto" }, 500);

    const ip = ipDaRequisicao(req.headers);
    const desde = new Date(Date.now() - JANELA_MS).toISOString();

    const [doIp, noTotal] = await Promise.all([
      supabase.from(TABELA_TENTATIVAS).select("id", { count: "exact", head: true })
        .eq("ip", ip).gte("attempted_at", desde),
      supabase.from(TABELA_TENTATIVAS).select("id", { count: "exact", head: true })
        .gte("attempted_at", desde),
    ]);

    // Contador que não respondeu não vale como "zero tentativas". Se a tabela
    // não existe (migration não aplicada), se o banco caiu ou se a RLS mudou,
    // `count` volta null — e tratar isso como 0 deixaria o login sem proteção
    // nenhuma, funcionando normalmente, sem sinal para ninguém. Falha fechada.
    if (doIp.error || noTotal.error || doIp.count == null || noTotal.count == null) {
      console.error("throttle indisponível", doIp.error ?? noTotal.error);
      return json({ error: "não foi possível verificar o acesso agora" }, 503);
    }

    if (avaliarTentativa(doIp.count, noTotal.count)) {
      // Mesma mensagem nos dois motivos: qual limite estourou é informação
      // para quem está atacando, não para quem está tentando entrar.
      return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429);
    }

    // Registra ANTES de validar: sem branch de "senha certa" para burlar a conta.
    // Se o registro falhar, a tentativa não acontece — contagem furada é o
    // mesmo que contagem nenhuma.
    const { error: erroRegistro } = await supabase.from(TABELA_TENTATIVAS).insert({ ip });
    if (erroRegistro) {
      console.error("não registrou a tentativa", erroRegistro);
      return json({ error: "não foi possível verificar o acesso agora" }, 503);
    }

    if (!igualdadeConstante(String(body?.password ?? ""), expected)) {
      return json({ error: "senha inválida" }, 401);
    }

    // Acertou: o histórico DESTE ip morre aqui. Sem isso, usar o painel cinco
    // vezes num dia de trabalho (abrir em outro navegador, sessão expirada,
    // celular) empurraria o dono para o próprio limite.
    await supabase.from(TABELA_TENTATIVAS).delete().eq("ip", ip);
    // Faxina oportunista: linha fora da janela não decide mais nada, e a tabela
    // é escrita por quem não está autenticado. Roda só no sucesso — é o único
    // momento em que dá para pagar uma escrita a mais sem ajudar o atacante.
    await supabase.from(TABELA_TENTATIVAS).delete()
      .lt("attempted_at", new Date(Date.now() - FAXINA_MS).toISOString());

    const { data, error } = await supabase.from("admin_sessions").insert({}).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: data.token, expires_at: data.expires_at });
  }

  if (action === "logout") {
    const token = body?.token;
    if (token) await supabase.from("admin_sessions").delete().eq("token", token);
    return json({ ok: true });
  }

  if (action === "logout_all") {
    if (!(await requireAdmin(supabase, body?.token))) return json({ error: "unauthorized" }, 401);
    await supabase.from("admin_sessions").delete().neq("token", "");
    return json({ ok: true });
  }

  return json({ error: "ação inválida" }, 400);
});
