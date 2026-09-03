import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdmin } from "./_shared/auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await requireAdmin(supabase, body?.token))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const action = body?.action || "list";

  if (action === "create") {
    const cliente = (body?.cliente || "").toString().slice(0, 200);
    const tipo = (body?.tipo || "").toString().slice(0, 60);
    const cliente_id = body?.cliente_id || null;
    if (!tipo) {
      return new Response(JSON.stringify({ error: "tipo obrigatorio" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase
      .from("briefing_links")
      .insert({ cliente, tipo, cliente_id })
      .select("token, cliente, cliente_id, tipo, status, created_at")
      .single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ invite: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Reabrir devolve o convite para "pendente" e limpa a resposta anterior do
  // caminho: e a UNICA forma de um briefing ja respondido aceitar novo envio
  // (briefing-submit recusa com 409). Guardar a resposta antiga junto seria
  // outra tabela; hoje o backup por e-mail do Formspree e o historico.
  if (action === "reabrir") {
    const id = (body?.id || "").toString();
    if (!id) {
      return new Response(JSON.stringify({ error: "id obrigatorio" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase.from("briefing_links")
      .update({ status: "pendente", raw: null, responded_at: null })
      .eq("id", id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ invite: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Revogar mata o link sem apagar a resposta: token vazado para de abrir, o
  // que o cliente escreveu fica. `revogado_em` ja era respeitado por
  // briefing-submit e pelo formulario -- so nao havia como produzir o estado.
  if (action === "revogar") {
    const id = (body?.id || "").toString();
    if (!id) {
      return new Response(JSON.stringify({ error: "id obrigatorio" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const revogar = body?.revogar !== false;
    const { data, error } = await supabase.from("briefing_links")
      .update({ revogado_em: revogar ? new Date().toISOString() : null })
      .eq("id", id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ invite: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (action === "delete") {
    // nota: body.token é o token de sessão admin (injetado por EloiAdminAuth.call);
    // o convite é identificado por id, igual às demais edge functions (clientes.delete, orcamentos delete etc.)
    const id = (body?.id || "").toString();
    await supabase.from("briefing_links").delete().eq("id", id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (action === "vincular_cliente") {
    const id = (body?.id || "").toString();
    const cliente_id = body?.cliente_id || null;
    if (!id || !cliente_id) {
      return new Response(JSON.stringify({ error: "id e cliente_id obrigatorios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase.from("briefing_links")
      .update({ cliente_id }).eq("id", id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ invite: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // default: list
  const { data, error } = await supabase
    .from("briefing_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ invites: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
