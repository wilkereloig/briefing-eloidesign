# Proposta X — Portal mínimo, marca continua pública por fora


# Proposta X — Portal mínimo, marca continua pública por fora

**Ângulo:** menor mudança possível no que já está em produção e aceito. `/entregas-marca/<slug>/` continua exatamente como hoje — pública, sem senha, sem token, sem proxy. O `/portal/` novo é só **mais um lugar pro cliente logar e achar tudo junto**, incluindo um link pra essa mesma página pública. O que muda de verdade é NF, orçamentos e briefing: hoje são privados/semi-privados de formas inconsistentes (um por trás de senha do Wilke, outro por token solto, outro sem nada); depois desta proposta, os três só aparecem depois de login real do cliente.

---

## 0. Decisão de reconciliação (resumo executivo)

| Dado | Hoje | Depois desta proposta |
|---|---|---|
| Marca (`entregas-marca` bucket público) | Pública, sem senha | **Continua pública, sem senha** — portal só linka pra ela |
| NF (`eloi-notas` bucket privado) | Só o Wilke vê (senha admin) | Cliente vê a dele, via login do portal + signed URL 120s (reaproveita o padrão existente) |
| Orçamentos | Link com `share_token`, sem senha | Continua existindo (não removo), **mais** lista dentro do portal filtrada por `cliente_id` |
| Briefing | Só o Wilke vê | Lista dentro do portal filtrada por `cliente_id` |

**Por que marca fica de fora do login, explicitamente:** são arte-finais já aprovadas e entregues — o cliente vai publicar essas peças em redes/site/gráfica em seguida, não faz sentido de negócio tratar como segredo. Colocar atrás de login também quebraria qualquer link que já esteja em posse de terceiros (gráfica, agência de mídia) — regressão de comportamento sem necessidade. O kill-switch que já existe (`eloi_clientes.marca_publicada`, com UI em `/gestao/`) continua sendo o único controle de visibilidade da marca — o portal não adiciona nem substitui isso.

**Isso não torna a marca "mais segura"**, torna só mais descobrível (o cliente não precisa lembrar a URL, acha ela dentro do portal). Registro isso explicitamente porque é uma escolha, não um descuido — se o Wilke decidir que isso é inaceitável, migrar a marca pra dentro do login é tarefa separada e maior (bucket vira privado, manifest.json e renderização client-side precisam de signed URL — reescrita, não ajuste).

---

## 1. Schema

Aditivo, nullable, não quebra nada que já lê `orcamentos`/`briefing_links` como estão hoje (página pública `/orcamento/?t=`, `painel-briefings`, `briefing-submit`).

```sql
-- senha do portal em eloi_clientes: hash+salt, nunca texto puro
alter table public.eloi_clientes
  add column if not exists portal_senha_hash      text,
  add column if not exists portal_senha_salt      text,
  add column if not exists portal_senha_gerada_em timestamptz,
  add column if not exists portal_ativo           boolean not null default true; -- kill-switch, mesmo espírito de marca_publicada

-- cliente_id nas 2 tabelas que hoje só têm texto livre ("cliente"/"empresa")
alter table public.orcamentos      add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.briefing_links  add column if not exists cliente_id uuid references public.eloi_clientes(id);
create index if not exists orcamentos_cliente_id_idx     on public.orcamentos(cliente_id);
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);

-- sessão do portal — mesmo padrão de token hex que briefing_links.token já usa
create table if not exists public.portal_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  cliente_id   uuid not null references public.eloi_clientes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours')
);
alter table public.portal_sessions enable row level security; -- sem policy: só a service-role (edge function) acessa

-- rate-limit por IP (o login não sabe qual cliente até rodar a verificação)
create table if not exists public.portal_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
alter table public.portal_login_attempts enable row level security;
-- ponytail: sem índice/cleanup — volume de hoje (1 cliente) não pesa a tabela.
-- Se crescer: index (ip, attempted_at) + cron apagando linhas com >24h.
```

**Backfill:** nenhum automático, de propósito. `orcamentos` tem 1 linha real hoje (`cliente = "Campanha 2026 (candidata)"`) que **não bate** com nenhum nome em `eloi_clientes` — associar isso é decisão do Wilke (é da Georgia? é um rascunho sem cliente definido?), não script. `briefing_links` tem 0 linhas, não há o que migrar.

**Consequência assumida:** enquanto o Wilke não associar manualmente, o único orçamento real de hoje **não aparece** no portal de ninguém — falha fechada, não gambiarra de match por texto.

**Nota fora do escopo central mas necessária pra `cliente_id` ser usável daqui pra frente:** os formulários de `painel-orcamentos` e `painel-briefings` (hoje `<input type="text">` livre) precisam ganhar um `<select>` opcional populado por `eloi-gestao` `clientes.list` (que já existe), mandando `cliente_id` junto do texto de sempre. Sem isso a coluna nova fica sempre vazia pra registros futuros. Não desenvolvo esse formulário aqui em detalhe — é troca de um `<input>` por `<select>` + 1 campo a mais no payload de `create`/`update`, não é o núcleo desta proposta.

---

## 2. Geração de senha no admin (`eloi-gestao`)

Ação nova, mesmo padrão de dispatch por `action` que a function já usa.

```ts
// supabase/functions/eloi-gestao/index.ts — nova action
import { pbkdf2, timingSafeEqual } from "../_shared/portal-auth.ts";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0/O/1/I/L — sem ambiguidade ao digitar/ler no whatsapp
function randomSecret(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

if (action === "clientes.gerar_senha_portal") {
  const clienteId = body?.cliente_id;
  if (!clienteId) return json({ error: "cliente_id obrigatório" }, 400);

  // prevenção de colisão (restrição "e se 2 clientes tiverem a mesma senha"):
  // testa a candidata contra todos os hashes existentes antes de salvar, tenta de novo se colidir.
  const { data: outros } = await supabase.from("eloi_clientes")
    .select("portal_senha_hash, portal_senha_salt").not("portal_senha_hash", "is", null).neq("id", clienteId);

  let secret = "";
  for (let tries = 0; tries < 5; tries++) {
    secret = randomSecret(10);
    let colide = false;
    for (const o of outros ?? []) {
      if (timingSafeEqual(await pbkdf2(secret, o.portal_senha_salt), o.portal_senha_hash)) { colide = true; break; }
    }
    if (!colide) break; // probabilidade real ~0 (32^10 combinações), mas o código nunca assume isso
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  const hash = await pbkdf2(secret, saltHex);

  const { error } = await supabase.from("eloi_clientes").update({
    portal_senha_hash: hash,
    portal_senha_salt: saltHex,
    portal_senha_gerada_em: new Date().toISOString(),
    portal_ativo: true,
  }).eq("id", clienteId);
  if (error) return json({ error: error.message }, 500);

  return json({ senha: secret }); // única vez que existe em texto puro — não é salva em lugar nenhum
}
```

**UI em `/gestao/` (painel de clientes):** botão "Gerar senha do portal" por linha de cliente → modal mostra a senha uma vez com botão de copiar e aviso: *"Envie por WhatsApp agora. Fechando esta janela, a senha não aparece de novo em lugar nenhum — só o hash fica salvo. Esqueceu? Gere outra (invalida a antiga)."* Não existe recuperação por e-mail neste desenho — reset é reemissão pelo Wilke, que é o modelo de confiança pedido.

---

## 3. Edge function `portal-cliente` (todas as actions)

Uma função só, como pedido — login/logout e leitura de dados no mesmo dispatch, separada de `eloi-gestao` (que é só admin).

### `supabase/functions/_shared/portal-auth.ts`
```ts
export async function pbkdf2(password: string, saltHex: string, iterations = 100_000): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```
`crypto.subtle` nativo do Deno — zero dependência nova.

### `supabase/functions/portal-cliente/index.ts`
```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { pbkdf2, timingSafeEqual } from "../_shared/portal-auth.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // ---- login: público, sem sessão, rate-limit por IP ----
  if (action === "login") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabase.from("portal_login_attempts")
      .select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", since);
    if ((count ?? 0) >= 10) return json({ error: "muitas tentativas, aguarde 15 minutos" }, 429);

    await supabase.from("portal_login_attempts").insert({ ip }); // conta a tentativa antes de validar, sem branch pra burlar

    const senha = String(body.senha || "");
    if (!senha) return json({ error: "senha incorreta" }, 401);

    const { data: candidatos } = await supabase.from("eloi_clientes")
      .select("id, nome, portal_senha_hash, portal_senha_salt")
      .not("portal_senha_hash", "is", null).eq("portal_ativo", true);

    const matches: { id: string; nome: string }[] = [];
    for (const c of candidatos ?? []) {
      if (timingSafeEqual(await pbkdf2(senha, c.portal_senha_salt), c.portal_senha_hash)) {
        matches.push({ id: c.id, nome: c.nome });
      }
    }

    if (matches.length !== 1) {
      if (matches.length > 1) console.error("PORTAL: colisão de senha entre clientes", matches.map(m => m.id));
      return json({ error: "senha incorreta" }, 401); // mesmo erro genérico pros dois casos (0 ou >1 match)
    }

    const { data: sess, error } = await supabase.from("portal_sessions")
      .insert({ cliente_id: matches[0].id }).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: sess.token, expires_at: sess.expires_at, cliente_nome: matches[0].nome });
  }

  if (action === "logout") {
    if (body.token) await supabase.from("portal_sessions").delete().eq("token", body.token);
    return json({ ok: true });
  }

  // ---- demais actions: exigem sessão válida, cliente_id vem do token, nunca do body ----
  const { data: sess } = await supabase.from("portal_sessions")
    .select("cliente_id, expires_at").eq("token", body.token ?? "").maybeSingle();
  if (!sess || new Date(sess.expires_at) < new Date()) return json({ error: "sessão expirada" }, 401);

  const clienteId = sess.cliente_id;
  await supabase.from("portal_sessions") // sliding 12h, mesmo espírito do admin_sessions do plano do admin
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12 * 3600_000).toISOString() })
    .eq("token", body.token);

  if (action === "me") {
    const { data } = await supabase.from("eloi_clientes")
      .select("nome, marca_slug, marca_publicada").eq("id", clienteId).single();
    return json({ cliente: data });
  }

  if (action === "servicos.list") { // NF sem expor o path bruto do bucket privado
    const { data } = await supabase.from("eloi_servicos")
      .select("id, descricao, valor_cents, status_execucao, pago, data_pagamento, nf_numero, created_at, nf_arquivo_url")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ servicos: (data ?? []).map(({ nf_arquivo_url, ...s }) => ({ ...s, tem_nf: !!nf_arquivo_url })) });
  }

  if (action === "nf.view_url") { // reaproveita 1:1 o padrão de eloi-gestao nf.view_url
    const { data: s } = await supabase.from("eloi_servicos")
      .select("cliente_id, nf_arquivo_url").eq("id", body.servico_id).single();
    if (!s || s.cliente_id !== clienteId || !s.nf_arquivo_url) return json({ error: "não encontrado" }, 404);
    const { data, error } = await supabase.storage.from("eloi-notas").createSignedUrl(s.nf_arquivo_url, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  if (action === "orcamentos.list") {
    const { data } = await supabase.from("orcamentos").select("*")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ orcamentos: data });
  }

  if (action === "briefings.list") {
    const { data } = await supabase.from("briefing_links").select("*")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ briefings: data });
  }

  return json({ error: "ação desconhecida" }, 400);
});
```

Nenhuma action de marca aqui: o front monta o link `/entregas-marca/<slug>/` direto a partir de `me`, sem passar pela function — o bucket já é público, não há por que fazer proxy.

**Ceiling assumido no login:** `login` roda até 1 PBKDF2 (100k iterações) por cliente com senha configurada, sempre — não é lookup indexado. Com 1 cliente hoje isso é instantâneo; com "dezenas" ainda é rápido (dezenas de PBKDF2 a 100k iterações ficam na casa de 1-3s no pior caso). `ponytail:` se a base crescer pra centenas de clientes ativos no portal, trocar pra lookup indexado por prefixo público (senha = `PREFIXO-SEGREDO`, busca por `prefixo` antes de rodar PBKDF2) — mais código, só compensa em escala que este projeto não tem hoje.

---

## 4. Rate-limit / lockout na prática

- **Chave: IP**, não cliente — o login não sabe qual cliente está sendo tentado antes de rodar a verificação (não há usuário digitado), então não dá pra travar "a conta X" sem primeiro ter achado ela.
- **Threshold:** 10 tentativas / 15 minutos por IP → `429`.
- Toda tentativa é gravada em `portal_login_attempts` **antes** de validar a senha — não existe caminho de código que pule a contagem.
- Sem lockout progressivo, sem CAPTCHA — `ponytail:` 15 min fixos, trocar por backoff exponencial se aparecer abuso repetido de verdade nos logs.
- **Por que não travar por-cliente:** com o desenho atual (scan comparando contra todos os candidatos) o "cliente" só é conhecido depois que a senha já bateu — não há ponto no fluxo pra incrementar um contador por conta antes disso. Trade-off aceito: um atacante trocando de IP escapa do rate-limit. Aceitável porque o ganho de descobrir uma senha de portal (arquivos já entregues, orçamento de 1 cliente pequeno) é baixo pro esforço, e o espaço de senha (10 chars, alfabeto de 32 sem ambíguos, ~10¹⁵ combinações) já torna força bruta online inviável mesmo sem lockout nenhum.
- **Fora do escopo v1:** cleanup de `portal_login_attempts` (tabela cresce ~1 linha/tentativa, sem índice — ok pro volume de hoje).

---

## 5. Página `/portal/`

HTML puro, sem build, mesmo padrão do resto do repo (`painel-orcamentos`, `painel-briefings`). Login por senha única + tabs Marca / Notas Fiscais / Orçamentos / Briefing.

```html
<!-- /portal/index.html -->
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Portal do Cliente — ELOI Design</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; }
  #login { max-width: 320px; margin: 80px auto; display: flex; flex-direction: column; gap: 12px; }
  input[type=password] { padding: 10px; font-size: 16px; letter-spacing: 1px; }
  button { padding: 10px 16px; cursor: pointer; }
  #app { display: none; }
  .tabs { display: flex; gap: 8px; border-bottom: 1px solid #ddd; margin-bottom: 16px; }
  .tabs button { background: none; border: none; padding: 10px 4px; border-bottom: 2px solid transparent; }
  .tabs button.active { border-color: currentColor; font-weight: 600; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
  .muted { opacity: .6; font-size: .9em; }
  .error { color: #c0392b; }
  #topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
</style>
</head>
<body>

<div id="login">
  <h2>Portal do Cliente</h2>
  <p class="muted">Cole a senha que a ELOI Design te enviou.</p>
  <input type="password" id="senha" placeholder="Senha" autocomplete="off">
  <button onclick="doLogin()">Entrar</button>
  <p class="error" id="loginErro"></p>
</div>

<div id="app">
  <div id="topbar">
    <strong id="nomeCliente"></strong>
    <button onclick="doLogout()">Sair</button>
  </div>
  <div class="tabs">
    <button data-tab="marca" onclick="showTab('marca')">Marca</button>
    <button data-tab="nf" onclick="showTab('nf')">Notas Fiscais</button>
    <button data-tab="orcamentos" onclick="showTab('orcamentos')">Orçamentos</button>
    <button data-tab="briefing" onclick="showTab('briefing')">Briefing</button>
  </div>
  <div id="tabContent"></div>
</div>

<script>
const FN_URL = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/portal-cliente";
const ANON_KEY = "___SUPABASE_ANON_KEY___"; // mesma chave pública já usada em painel-orcamentos / briefing-submit

async function call(action, extra = {}) {
  const token = localStorage.getItem("portal_token");
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, token, ...extra }),
  });
  const data = await res.json();
  if (res.status === 401 && action !== "login") { logoutLocal(); throw new Error("sessão expirada"); }
  if (!res.ok) throw new Error(data.error || "erro");
  return data;
}

async function doLogin() {
  const senha = document.getElementById("senha").value.trim();
  document.getElementById("loginErro").textContent = "";
  try {
    const data = await call("login", { senha });
    localStorage.setItem("portal_token", data.token);
    localStorage.setItem("portal_nome", data.cliente_nome);
    enterApp();
  } catch (e) {
    document.getElementById("loginErro").textContent = e.message === "muitas tentativas, aguarde 15 minutos"
      ? "Muitas tentativas. Aguarde 15 minutos." : "Senha incorreta.";
  }
}

function logoutLocal() {
  localStorage.removeItem("portal_token");
  localStorage.removeItem("portal_nome");
  document.getElementById("app").style.display = "none";
  document.getElementById("login").style.display = "flex";
}
async function doLogout() { try { await call("logout"); } catch {} logoutLocal(); }

function enterApp() {
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("nomeCliente").textContent = localStorage.getItem("portal_nome") || "";
  showTab("marca");
}

async function showTab(tab) {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const el = document.getElementById("tabContent");
  el.innerHTML = "carregando…";
  try {
    if (tab === "marca") el.innerHTML = await renderMarca();
    if (tab === "nf") el.innerHTML = await renderNF();
    if (tab === "orcamentos") el.innerHTML = await renderOrcamentos();
    if (tab === "briefing") el.innerHTML = await renderBriefing();
  } catch (e) { el.innerHTML = `<p class="error">${e.message}</p>`; }
}

async function renderMarca() {
  const { cliente } = await call("me");
  if (!cliente.marca_publicada) return `<p class="muted">Seus arquivos de marca ainda não foram publicados.</p>`;
  const url = `/entregas-marca/${cliente.marca_slug}/`;
  return `<div class="card"><p>Todos os arquivos da sua identidade visual (logo, cores, variações).</p>
    <a href="${url}" target="_blank"><button>Abrir meus arquivos de marca</button></a>
    <p class="muted">Abre em página pública — sem senha, pra facilitar compartilhar com gráfica/agência.</p></div>`;
}

async function renderNF() {
  const { servicos } = await call("servicos.list");
  if (!servicos.length) return `<p class="muted">Nenhum serviço lançado ainda.</p>`;
  return servicos.map(s => `
    <div class="card">
      <strong>${s.descricao}</strong> — R$ ${(s.valor_cents / 100).toFixed(2)}
      <p class="muted">${s.status_execucao} · ${s.pago ? "pago" : "em aberto"}${s.nf_numero ? " · NF " + s.nf_numero : ""}</p>
      ${s.tem_nf ? `<button onclick="verNF('${s.id}')">Ver nota fiscal</button>` : ""}
    </div>`).join("");
}
async function verNF(id) {
  const { url } = await call("nf.view_url", { servico_id: id });
  window.open(url, "_blank"); // signed URL expira em 120s
}

async function renderOrcamentos() {
  const { orcamentos } = await call("orcamentos.list");
  if (!orcamentos.length) return `<p class="muted">Nenhum orçamento vinculado à sua conta ainda.</p>`;
  return orcamentos.map(o => `
    <div class="card">
      <strong>${o.titulo}</strong> — R$ ${Number(o.valor_total).toFixed(2)}
      <p class="muted">${o.status}</p>
      <a href="/orcamento/?t=${o.share_token}" target="_blank">Ver proposta completa</a>
    </div>`).join("");
}

async function renderBriefing() {
  const { briefings } = await call("briefings.list");
  if (!briefings.length) return `<p class="muted">Nenhum briefing vinculado à sua conta ainda.</p>`;
  return briefings.map(b => `
    <div class="card"><strong>${b.tipo}</strong> — ${b.status}
      <p class="muted">respondido em ${b.responded_at ? new Date(b.responded_at).toLocaleDateString("pt-BR") : "ainda não respondido"}</p>
    </div>`).join("");
}

if (localStorage.getItem("portal_token")) enterApp();
</script>
</body>
</html>
```

Notas de implementação:
- `ANON_KEY` é placeholder — usar a mesma chave pública já embutida em `painel-orcamentos/index.html`/`briefing-submit`, não inventar credencial nova.
- CSS é esqueleto funcional, não copiei o design system real do site (não li os CSS existentes nesta sessão) — ajustar classes/cores pra bater com o resto do repo na implementação.
- Sessão fica em `localStorage` (token opaco de sessão, não a senha) — se expirar, qualquer chamada 401 desloga local e volta pra tela de login.

---

## 6. Rollout (ordem prática)

1. Aplicar a migração SQL da seção 1.
2. Deploy de `_shared/portal-auth.ts` + `portal-cliente`.
3. Adicionar action `clientes.gerar_senha_portal` em `eloi-gestao` + botão em `/gestao/`.
4. Publicar `/portal/`.
5. Wilke gera a senha da Georgia Andrade no admin, envia por WhatsApp.
6. Wilke decide manualmente se o orçamento `"Campanha 2026 (candidata)"` é dela e associa `cliente_id` (via UPDATE manual ou via UI de seleção, se já trocada — seção 1).

---

## 7. Fora de escopo (ponytail)

- Troca de senha pelo próprio cliente — não pedido, só o Wilke gera/regenera.
- Recuperação de senha por e-mail — reset = reemissão pelo Wilke via WhatsApp, é o modelo pedido.
- Lockout por conta (só por IP) — trocar por lookup indexado + lockout por conta se a base crescer além de dezenas de clientes com senha ativa.
- Cleanup automático de `portal_sessions`/`portal_login_attempts` — volume de hoje não pesa a tabela.
- Migrar o bucket de marca pra privado — decisão separada e maior, não incluída aqui; ver seção 0 para o porquê.


---

# Proposta Y — Área de cliente com marca migrando de pública para privada


# Proposta Y — Tudo atrás do login (marca migra de pública para privada)

Ângulo: consistência total. Se existe uma área de cliente, **todo** arquivo do cliente — inclusive a marca — só é acessível depois do login por senha. Sem exceção, sem "porta de trás" pública.

## 0. Correção de premissa (achado novo, verificado agora via MCP read-only)

Antes de desenhar a transição do link público antigo, confirmei o que existe *de fato* em produção hoje — e não é o que o enunciado presume:

| O que se presumia | O que existe de verdade (verificado agora) |
|---|---|
| `/entregas-marca/<slug>/` é uma página pública já no ar | **Não existe.** `Glob` no repo não encontrou nenhum `index.html` em `entregas-marca/` — só existe `entregas-marca/_tools/`, um script Node local (com `node_modules`) para gerar os arquivos, não uma página do site |
| Bucket de marca é público (`public=true`) | **Não existe bucket nenhum chamado `entregas-marca`.** `select * from storage.buckets` retorna só `anexos` (privado) e `eloi-notas` (privado, das NFs) |
| Georgia Andrade já recebeu esse link | Não há como confirmar nem negar por aqui — mas o link **nunca poderia ter funcionado**, porque a página e o bucket que ele apontaria nunca foram construídos |

O que existe de fato: em `gestao/index.html:406-409`, o botão "🔗 link marca" no card de cada cliente roda:
```js
function copiarLinkMarca(slug){
  const url = `${location.origin}/entregas-marca/${slug}/`;
  navigator.clipboard.writeText(url).then(()=>toast('Link copiado: '+url)).catch(()=>toast(url));
}
```
Isso **está no ar e é clicável hoje** — e `eloi_clientes.marca_publicada` já está `true` para a Georgia. Ou seja: a intenção de publicar já foi sinalizada no banco, o botão de copiar o link já existe, mas a infraestrutura por trás (bucket + página) nunca foi implantada. Se o Wilke já copiou e mandou esse link por WhatsApp em algum momento, ele levaria a Georgia a um 404 — não a uma página real.

**Isso muda o enquadramento do problema**, mas não o esforço: não estou "migrando" um link público real para privado (não há nada rodando para desligar), estou **implementando a entrega de marca direto no modelo privado**, e tratando defensivamente o único artefato que de fato já circula: a URL `/entregas-marca/<slug>/` que o botão gera e que pode já ter sido copiada/enviada. Seção 8 trata isso.

## 1. Decisão central desta proposta

Um único ponto de entrada, um único modelo de ameaça: **tudo que é arquivo do cliente exige sessão de portal válida.** Bucket `entregas-marca` nasce com `public=false`. Não existe URL de marca que funcione sem passar pela edge function autenticada — nem hoje (porque não existe nada ainda), nem depois.

Trade-off assumido explicitamente: cada visualização/download de logo custa 1 chamada à function para pegar signed URLs (expiram em minutos), em vez de um `<img src>` direto num CDN público. Para o volume desta agência (1 cliente hoje, "dezenas" no horizonte, entrega pontual de marca por projeto) isso é imperceptível — não é o mesmo tipo de tráfego de um CDN de imagens de e-commerce.

## 2. Schema

### 2.1 `eloi_clientes` — colunas novas (senha do portal)
```sql
alter table public.eloi_clientes
  add column if not exists portal_senha_prefix     text unique,  -- 4 chars, índice de busca, não é secreto
  add column if not exists portal_senha_hash        text,         -- "pbkdf2$<iter>$<salt_b64>$<hash_b64>"
  add column if not exists portal_senha_gerada_em   timestamptz,
  add column if not exists portal_tentativas_falhas integer not null default 0,
  add column if not exists portal_bloqueado_ate     timestamptz,
  add column if not exists portal_ativo             boolean not null default true; -- kill-switch sem apagar a senha
```

### 2.2 `portal_sessions` — tabela nova
```sql
create table if not exists public.portal_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  cliente_id   uuid not null references public.eloi_clientes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours') -- sliding, mesmo espírito do admin_sessions do plano aprovado
);
alter table public.portal_sessions enable row level security; -- sem policy: só a service-role (edge function) acessa
```

### 2.3 `orcamentos` / `briefing_links` — `cliente_id` (idêntico ao que a Proposta X já precisa, não redesenho aqui)
Confirmado agora, de novo: `orcamentos` tem 1 linha (`cliente="Campanha 2026 (candidata)"`, não bate com nenhum cliente cadastrado), `briefing_links` tem 0 linhas, nenhuma das duas tabelas tem `cliente_id` hoje. A migração é a mesma nas duas propostas — Y não muda nada aqui:
```sql
alter table public.orcamentos      add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.briefing_links  add column if not exists cliente_id uuid references public.eloi_clientes(id);
create index if not exists orcamentos_cliente_id_idx     on public.orcamentos(cliente_id);
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);
```
Backfill: manual pelo Wilke (1 decisão sobre a linha existente de `orcamentos`); `briefing_links` nasce vazia, zero trabalho.

### 2.4 Storage — bucket `entregas-marca` nasce privado
```sql
insert into storage.buckets (id, name, public) values ('entregas-marca', 'entregas-marca', false);
```
Estrutura de path (igual ao que já estava decidido no plano aprovado, só a flag `public` muda):
```
entregas-marca/
  georgia-andrade/
    manifest.json
    logo/
      principal/cor-1.svg
      principal/preto-e-branco.svg
      reduzida/cor-1.svg
      ...
```
`manifest.json` lista as variações disponíveis (só `.svg` — o PNG continua sendo rasterizado 100% client-side via Canvas, decisão já tomada no plano aprovado; isso não muda com privacidade, o cliente só passa a buscar o SVG por signed URL em vez de fetch público):
```json
{
  "cliente": "georgia-andrade",
  "gerado_em": "2026-07-15T12:00:00Z",
  "variacoes": [
    { "nome": "principal", "cores": ["cor-1", "preto-e-branco", "mono"] },
    { "nome": "reduzida",  "cores": ["cor-1", "preto-e-branco"] }
  ]
}
```

## 3. Geração de senha (ação nova em `eloi-gestao`, mesmo padrão de dispatch por `action` que já existe lá)

```ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, sem I L O U — sem ambiguidade visual, 256%32===0 sem viés
function randomToken(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

if (action === "clientes.gerar_senha_portal") {
  const clienteId = body?.cliente_id;
  if (!clienteId) return json({ error: "cliente_id obrigatório" }, 400);

  let prefix = "";
  for (let tries = 0; tries < 5; tries++) {
    prefix = randomToken(4);
    const { count } = await supabase.from("eloi_clientes")
      .select("id", { count: "exact", head: true }).eq("portal_senha_prefix", prefix);
    if (!count) break; // 32^4 ≈ 1.05M combinações — colisão é teórica, mas o código nunca assume isso
  }
  const secret = randomToken(8); // 32^8 ≈ 1.1×10^12 combinações (~40 bits)
  const hash = await hashPassword(secret);

  const { error } = await supabase.from("eloi_clientes").update({
    portal_senha_prefix: prefix,
    portal_senha_hash: hash,
    portal_senha_gerada_em: new Date().toISOString(),
    portal_tentativas_falhas: 0,
    portal_bloqueado_ate: null,
    portal_ativo: true,
  }).eq("id", clienteId);
  if (error) return json({ error: error.message }, 500);

  return json({ senha: `${prefix}-${secret}` }); // única vez que o texto puro existe — nunca é salvo em lugar nenhum
}
```
Formato mostrado: `K7M2-QXTN8PLW` (13 caracteres com o traço) — curto o bastante para mandar por WhatsApp. **Esqueceu = regenerar** (sobrescreve prefixo e hash, invalida a senha antiga); não há recuperação por e-mail, por decisão explícita do enunciado.

## 4. Hashing — PBKDF2 nativo do Deno + lookup O(1) por prefixo

```ts
const ITERATIONS = 600_000; // OWASP 2023 para PBKDF2-SHA256 — pagável porque roda 1x por login, não N vezes

function b64(b: Uint8Array) { let s=""; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }
function unb64(s: string) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function hashPassword(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(secret: string, stored: string): Promise<boolean> {
  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(saltB64), iterations: Number(iterStr), hash: "SHA-256" }, key, 256));
  return timingSafeEqual(derived, unb64(hashB64));
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array) { // sem early-exit, tempo constante
  if (a.length !== b.length) return false;
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff === 0;
}
const DUMMY_HASH = "pbkdf2$600000$..."; // gerado 1x offline, literal no código — usado quando prefixo não bate ninguém
```
O prefixo (4 chars, não secreto — é só um índice) permite `where portal_senha_prefix = $1` com índice único: **O(1) sempre, 1 única verificação PBKDF2 por login**, não um scan pelos N clientes. Isso resolve de uma vez a restrição 2 (2 clientes com a mesma senha): a geração garante prefixo único, então o lookup nunca é ambíguo por construção — não existe o caso "a senha bate em mais de 1 cliente" a menos que alguém edite o banco manualmente.

## 5. Rate-limit / lockout (restrição 3)

Lockout **por conta**, usando as colunas já no schema — sem tabela nova, sem infra extra:
- 5 tentativas erradas → bloqueia 15 min (`portal_bloqueado_ate`).
- Reset no login bem-sucedido, ou implicitamente quando o timestamp de bloqueio expira (comparação simples, sem cron).
- Por que por-conta e não por-IP: a chave de ataque aqui é "adivinhar a senha de UM cliente específico" (restrição 3 do enunciado) — trocar de IP não ajuda o atacante, porque o que trava é a conta achada pelo prefixo, não o IP de origem.

```ts
// ponytail: sem tabela de throttle por IP — YAGNI para o volume de hoje (1 cliente, "dezenas" no horizonte).
// Adicionar portal_login_attempts(ip, attempted_at) + limite por IP só se os logs (get_logs) mostrarem
// alguém varrendo muitos prefixos diferentes atrás de "algum" válido — hoje isso não dá acesso a nada sozinho.
```

## 6. Edge function `portal-cliente` — completa, 1 arquivo, mesmo padrão de dispatch do `eloi-gestao`

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "entregas-marca";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
function json(b: unknown, s=200){ return new Response(JSON.stringify(b), { status:s, headers:{...cors,"Content-Type":"application/json"} }); }

// ... hashPassword / verifyPassword / timingSafeEqual / DUMMY_HASH da seção 4 ...

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {}; try { body = await req.json(); } catch {}
  const action = body?.action || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- LOGIN (sem token) ----
  if (action === "login") {
    const raw = String(body?.senha || "").replace(/[\s-]/g, "").toUpperCase();
    const prefix = raw.slice(0, 4), secret = raw.slice(4);

    const { data: c } = await supabase.from("eloi_clientes")
      .select("id,nome,marca_slug,portal_senha_hash,portal_tentativas_falhas,portal_bloqueado_ate,portal_ativo")
      .eq("portal_senha_prefix", prefix).maybeSingle();

    if (!c || !c.portal_ativo || !c.portal_senha_hash) {
      await verifyPassword(secret, DUMMY_HASH); // custo de tempo parecido ao caminho "achou", fecha timing leak
      return json({ error: "senha inválida" }, 401);
    }
    if (c.portal_bloqueado_ate && new Date(c.portal_bloqueado_ate) > new Date())
      return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429);

    const ok = await verifyPassword(secret, c.portal_senha_hash);
    if (!ok) {
      const tentativas = (c.portal_tentativas_falhas ?? 0) + 1;
      const patch: Record<string, unknown> = { portal_tentativas_falhas: tentativas };
      if (tentativas >= 5) { patch.portal_bloqueado_ate = new Date(Date.now()+15*60_000).toISOString(); patch.portal_tentativas_falhas = 0; }
      await supabase.from("eloi_clientes").update(patch).eq("id", c.id);
      return json({ error: "senha inválida" }, 401);
    }

    await supabase.from("eloi_clientes").update({ portal_tentativas_falhas: 0, portal_bloqueado_ate: null }).eq("id", c.id);
    const { data: sess } = await supabase.from("portal_sessions").insert({ cliente_id: c.id }).select("token,expires_at").single();
    return json({ token: sess.token, cliente_nome: c.nome });
  }

  if (action === "logout") {
    if (body?.token) await supabase.from("portal_sessions").delete().eq("token", body.token);
    return json({ ok: true });
  }

  // ---- tudo daqui pra baixo exige sessão válida ----
  const { data: sess } = await supabase.from("portal_sessions")
    .select("cliente_id,expires_at").eq("token", body?.token || "").maybeSingle();
  if (!sess || new Date(sess.expires_at) < new Date()) return json({ error: "unauthorized" }, 401);
  const clienteId = sess.cliente_id;
  await supabase.from("portal_sessions") // sliding 12h
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now()+12*3600_000).toISOString() })
    .eq("token", body.token);

  if (action === "me") {
    const { data } = await supabase.from("eloi_clientes").select("nome,marca_slug").eq("id", clienteId).single();
    return json({ cliente: data });
  }

  // ---- MARCA (bucket privado — o coração da Proposta Y) ----
  if (action === "marca.asset_urls") {
    const { data: cli } = await supabase.from("eloi_clientes").select("marca_slug").eq("id", clienteId).single();
    if (!cli?.marca_slug) return json({ error: "cliente sem marca configurada" }, 404);

    const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
    // trust boundary: cliente só pode pedir signed url de caminhos dentro da própria pasta — nunca aceito
    // "me dá a url desse path" sem checar prefixo, senão um cliente logado poderia pedir a marca de outro.
    const seguros = paths.filter((p) => typeof p === "string" && p.startsWith(`${cli.marca_slug}/`));
    if (!seguros.length) return json({ error: "nenhum path válido" }, 400);

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(seguros, 300); // 5min, dá tempo de baixar/rasterizar
    if (error) return json({ error: error.message }, 500);
    return json({ urls: data }); // [{ path, signedUrl, error }]
  }

  // ---- NF (idêntico ao padrão já existente em eloi-gestao nf.view_url, só troca o gate) ----
  if (action === "servicos.list") {
    const { data } = await supabase.from("eloi_servicos")
      .select("id,descricao,valor_cents,status_execucao,pago,data_pagamento,nf_numero,created_at,nf_arquivo_url")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ servicos: (data ?? []).map(({ nf_arquivo_url, ...s }) => ({ ...s, tem_nf: !!nf_arquivo_url })) });
  }
  if (action === "nf.view_url") {
    const { data: s } = await supabase.from("eloi_servicos").select("cliente_id,nf_arquivo_url").eq("id", body.servico_id).single();
    if (!s || s.cliente_id !== clienteId || !s.nf_arquivo_url) return json({ error: "não encontrado" }, 404);
    const { data, error } = await supabase.storage.from("eloi-notas").createSignedUrl(s.nf_arquivo_url, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  if (action === "orcamentos.list") {
    const { data } = await supabase.from("orcamentos").select("*").eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ orcamentos: data });
  }
  if (action === "briefings.list") {
    const { data } = await supabase.from("briefing_links").select("*").eq("cliente_id", clienteId).order("created_at", { ascending: false });
    return json({ briefings: data });
  }

  return json({ error: "ação inválida" }, 400);
});
```
Ponto de segurança que não dá pra simplificar: o filtro `seguros = paths.filter(p => p.startsWith(marca_slug/))` em `marca.asset_urls` — sem ele, um cliente logado poderia pedir signed URL de qualquer path do bucket (inclusive a pasta de outro cliente) só trocando o array `paths` no body. É a fronteira de confiança da proposta inteira; fica explícito e comentado no código, não é um "detalhe".

Registros antigos sem `cliente_id` (o único orçamento real hoje) simplesmente não aparecem — falha fechada, não bug.

## 7. Página `/portal/` — client-facing, vanilla, sem build (mesmo padrão de `gestao/index.html`)

Um arquivo único (`portal/index.html`), sessão guardada em `sessionStorage` (mesma convenção já usada em `gestao/index.html` para a senha do admin — aqui guardo o *token*, não a senha, o que já é uma melhoria sobre o padrão atual):

```html
<input id="senha" placeholder="Cole sua senha (ex: K7M2-QXTN8PLW)" autocomplete="off">
<button onclick="entrar()">Entrar</button>
<script>
async function chamar(action, extra={}) {
  const token = sessionStorage.getItem('portal_token');
  const r = await fetch('https://nlamznxoocmygfvnqcns.functions.supabase.co/portal-cliente', {
    method: 'POST', body: JSON.stringify({ action, token, ...extra })
  });
  if (r.status === 401) { sessionStorage.removeItem('portal_token'); location.reload(); throw new Error('401'); }
  return r.json();
}
async function entrar() {
  const senha = document.getElementById('senha').value;
  const { token, error, cliente_nome } = await (await fetch(FN_URL, {
    method:'POST', body: JSON.stringify({ action:'login', senha })
  })).json();
  if (error) { document.getElementById('erro').textContent = error; return; }
  sessionStorage.setItem('portal_token', token);
  montarPainel(cliente_nome);
}

async function carregarMarca() {
  const { cliente } = await chamar('me');
  if (!cliente.marca_slug) return;
  // 1) pega a URL assinada do manifest, busca o manifest
  const { urls } = await chamar('marca.asset_urls', { paths: [`${cliente.marca_slug}/manifest.json`] });
  const manifest = await (await fetch(urls[0].signedUrl)).json();
  // 2) monta a lista completa de paths de svg e pede tudo de uma vez (1 chamada, createSignedUrls é batch)
  const paths = manifest.variacoes.flatMap(v => v.cores.map(c => `${cliente.marca_slug}/logo/${v.nome}/${c}.svg`));
  const { urls: assets } = await chamar('marca.asset_urls', { paths });
  // 3) renderiza galeria com cada signedUrl; PNG segue sendo gerado no browser via Canvas (decisão já tomada, inalterada)
}
</script>
```
Abas do painel: **Marca** (galeria de SVGs + botão "baixar PNG" que rasteriza client-side), **Notas Fiscais** (lista + botão "ver PDF" que chama `nf.view_url` só quando clicado, igual ao padrão do admin), **Orçamentos**, **Briefing**.

## 8. O link público antigo — o que acontece de verdade

Dado o achado da seção 0, a resposta é mais simples do que o enunciado presumia, mas ainda merece tratamento defensivo:

**8.1 O que é real hoje:** nenhum bucket público, nenhuma página pública, nenhum link que já tenha funcionado. O único artefato "no ar" é o botão `copiarLinkMarca()` em `gestao/index.html`, que gera uma URL para uma página inexistente.

**8.2 O que fazer mesmo assim (defensivo, porque não dá pra confirmar por aqui se o Wilke já mandou esse link por fora):**
- Criar um `entregas-marca/index.html` estático simples explicando a mudança: *"As entregas de marca agora ficam na sua área de cliente — peça sua senha de acesso"* + link para `/portal/`. Isso cobre quem digitar a URL antiga sem o slug.
- Para o padrão com slug (`/entregas-marca/georgia-andrade/`), como o site é hospedado estaticamente sem arquivo de rewrite hoje (não há `vercel.json`/`_redirects`/`netlify.toml` no repo), a forma correta de capturar **qualquer slug** é adicionar 1 arquivo `vercel.json` na raiz com um rewrite coringa:
  ```json
  { "rewrites": [{ "source": "/entregas-marca/:slug*", "destination": "/entregas-marca/" }] }
  ```
  (assumindo hospedagem Vercel — há uma tool de deploy Vercel disponível no ambiente, o que sugere que é essa a plataforma; se não for, o equivalente do host atual resolve o mesmo problema com 1 regra).

**8.3 Corrigir a fonte do link morto:** `gestao/index.html:406-409` precisa trocar de emitir `/entregas-marca/<slug>/` para apontar para o fluxo novo — o botão devia virar "gerar/copiar senha do portal" (chamando `clientes.gerar_senha_portal` da seção 3) em vez de copiar uma URL pública que nunca deveria ter existido no primeiro lugar. Isso não é feito agora (é código, não vai nesta sessão de planejamento) mas fica registrado como parte necessária da proposta — sem esse ajuste, o botão continua gerando um link morto por cima da página de aviso da seção 8.2.

## 9. Trade-off assumido (Y vs. X, para decisão do Wilke)

| | Proposta X (marca continua pública) | Proposta Y (marca migra pra privada) |
|---|---|---|
| Fricção para o cliente ver a própria marca | Zero (link direto, sem senha) | Precisa logar |
| Modelo mental | 2 regras diferentes (marca é "aprovada, não sensível"; resto é privado) | 1 regra única: tudo do cliente exige login |
| Custo de implementação | Bucket público de graça, zero proxy | +1 ação na function (`marca.asset_urls`), rasterização troca fetch público por signed URL (mesmo código, fonte diferente) |
| Risco de regressão | Nenhum — confirmado que nada público existe hoje pra quebrar | Nenhum — pelo mesmo motivo |
| Concorrente/terceiro adivinhando o slug | Consegue ver a marca (aceito na X, art-final já aprovada) | Não consegue nada sem a senha |

Como nada público foi de fato lançado ainda (seção 0), **a Proposta Y não paga custo de regressão nenhum sobre a X** — a única diferença real de esforço é 1 ação a mais na edge function e o front-end da galeria buscar signed URLs em vez de `<img src>` direto. Se o critério do Wilke é "nunca ter 2 modelos de privacidade coexistindo" (o que o enunciado desta tarefa deixa explícito como o ângulo desejado), Y é a escolha consistente.

## 10. Fora de escopo (ponytail)

- Throttle por IP → seção 5, YAGNI documentado, upgrade path descrito.
- Backoff progressivo no lockout (15 min fixo) → trocar só se abuso repetido de verdade aparecer nos logs.
- Troca de senha pelo próprio cliente → não pedido; só o Wilke gera/regenera via `clientes.gerar_senha_portal`.
- Cleanup automático de `portal_sessions` expiradas → sem cron; volume de hoje (1 cliente) não justifica, e sessões expiradas simplesmente falham no `maybeSingle`/checagem de `expires_at`, não vazam acesso.
