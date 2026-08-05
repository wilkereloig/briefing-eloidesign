# Painel de Gestão ELOI — Fase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a planilha de serviços do Wilke por um painel real (`/gestao/`) no site ELOI, com clientes, serviços (com NF em PDF) e dashboard.

**Architecture:** Página HTML estática nova no repo `briefing-eloidesign-repo`, falando com uma edge function anônima (`eloi-gestao`, service-role, senha) que lê/grava em tabelas novas isoladas (`eloi_clientes`, `eloi_servicos`) e num bucket privado de Storage (`eloi-notas`). Deploy do frontend por `git push origin master` → Vercel. Edge e schema aplicados via Supabase (MCP).

**Tech Stack:** HTML/CSS/JS vanilla (sem build) · Supabase Postgres + Edge Functions (Deno, supabase-js v2) + Storage · Vercel.

## Global Constraints

- **Senha admin:** `eloidesign2026` (hardcoded na edge, igual `get-briefings`/`orcamentos`).
- **Projeto Supabase:** `nlamznxoocmygfvnqcns` (eloi-financeiro, ACTIVE_HEALTHY, região sa-east-1).
- **Valor monetário:** sempre em **centavos** (`valor_cents` bigint). Exibir formatado `R$ x.xxx,xx`.
- **Visual:** variáveis roxas ELOI `--c950:#10002B --c900:#240046 --c800:#3C096C --c700:#5A189A --c600:#7B2CBF --c500:#9D4EDD --c300:#C77DFF --c100:#E0AAFF`; fonte `carbona-variable` via `https://use.typekit.net/ngx4uek.css`; logo wordmark SVG `viewBox 0 0 750.94 177.34`; aurora blobs. **Copiar o chrome de `aplicativos/index.html`.**
- **Não tocar** no app ELOI Financeiro (`app-financeiro/`, `eloi-financeiro.vercel.app`) nem nas tabelas `clients`/`services`/`catalogo_servicos`.
- **Commits escopados:** adicionar só os arquivos da tarefa (`git add <arquivo>`). O repo tem WIP local de terceiros não commitado — nunca `git add .`.
- **CORS edge:** `Access-Control-Allow-Origin: *`, headers `content-type`, métodos `POST, OPTIONS`.

**Nota sobre "testes":** o repo não tem framework de teste. Aqui, "teste" = verificação concreta: `execute_sql` (SQL), `curl` na edge, ou preview no navegador. Cada tarefa termina com uma verificação observável.

---

## File Structure

- `db/eloi-gestao.sql` — **(novo)** SQL de criação das tabelas + bucket (source-of-record; aplicado via Supabase).
- `edge-functions/eloi-gestao.ts` — **(novo)** source-of-record da edge (deploy via Supabase).
- `gestao/index.html` — **(novo)** a página do painel (login + dashboard + serviços + clientes).
- `admin/index.html` — **(modificar)** adicionar card "Gestão" no hub.
- `SITEMAP.md` — **(modificar)** documentar a rota `/gestao/`.

---

## Task 1: Infra — tabelas + bucket privado

**Files:**
- Create: `db/eloi-gestao.sql`

**Interfaces:**
- Produces: tabelas `eloi_clientes(id,nome,cor,contato,created_at)` e `eloi_servicos(id,cliente_id,descricao,valor_cents,status_execucao,pago,data_pagamento,nf_numero,nf_arquivo_url,observacoes,created_at)`; bucket privado `eloi-notas`.

- [ ] **Step 1: Escrever o SQL de record** em `db/eloi-gestao.sql`:

```sql
-- Painel de Gestão ELOI — Fase 1 (tabelas isoladas + bucket de notas)
create table if not exists public.eloi_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#7B2CBF',
  contato text,
  created_at timestamptz not null default now()
);

create table if not exists public.eloi_servicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.eloi_clientes(id) on delete restrict,
  descricao text not null,
  valor_cents bigint not null default 0,
  status_execucao text not null default 'em_execucao'
    check (status_execucao in ('em_execucao','concluida')),
  pago boolean not null default false,
  data_pagamento date,
  nf_numero text,
  nf_arquivo_url text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists eloi_servicos_cliente_idx on public.eloi_servicos(cliente_id);

alter table public.eloi_clientes enable row level security;
alter table public.eloi_servicos enable row level security;
-- Sem políticas para anon/authenticated: acesso só via edge (service-role bypassa RLS).

-- Bucket privado para PDFs de nota fiscal
insert into storage.buckets (id, name, public)
values ('eloi-notas','eloi-notas', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar a migration** via Supabase MCP:

`apply_migration(project_id="nlamznxoocmygfvnqcns", name="eloi_gestao_fase1", query=<conteúdo do SQL acima, exceto o insert em storage.buckets>)`
Depois rodar o `insert into storage.buckets ...` via `execute_sql` (migrations não devem mexer em `storage`).

- [ ] **Step 3: Verificar tabelas**

`execute_sql(project_id, query: "select table_name from information_schema.tables where table_name in ('eloi_clientes','eloi_servicos');")`
Esperado: 2 linhas.

- [ ] **Step 4: Verificar bucket**

`execute_sql(project_id, query: "select id, public from storage.buckets where id='eloi-notas';")`
Esperado: 1 linha, `public = false`.

- [ ] **Step 5: Commit**

```bash
git add db/eloi-gestao.sql
git commit -m "feat(gestao): schema eloi_clientes/eloi_servicos + bucket eloi-notas"
```

---

## Task 2: Edge function `eloi-gestao`

**Files:**
- Create: `edge-functions/eloi-gestao.ts`

**Interfaces:**
- Consumes: tabelas e bucket da Task 1; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: endpoint `POST {SUPA_URL}/functions/v1/eloi-gestao` com actions:
  - `clientes.list` → `{clientes:[{...,total_servicos,total_cents}]}`
  - `clientes.upsert {cliente:{id?,nome,cor,contato}}` → `{cliente}`
  - `clientes.delete {id}` → `{ok}` (erro se tiver serviços)
  - `servicos.list {filtro?:{cliente_id?,status_execucao?,pago?,mes?}}` → `{servicos:[...]}`
  - `servicos.upsert {servico:{id?,cliente_id,descricao,valor_cents,status_execucao,pago,data_pagamento,nf_numero,observacoes,nf_arquivo_url?}}` → `{servico}`
  - `servicos.delete {id}` → `{ok}`
  - `nf.upload_url {servico_id,filename}` → `{path, signed_url, token}` (signed upload URL)
  - `nf.view_url {path}` → `{url}` (signed URL 120s)
  - `dashboard.stats` → `{faturado_mes,a_receber,em_execucao,concluido_sem_nf,por_cliente:[{nome,cor,total_cents}]}`

- [ ] **Step 1: Escrever a edge** em `edge-functions/eloi-gestao.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PASSWORD = "eloidesign2026";
const BUCKET = "eloi-notas";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const action = body?.action || "";

  if (body?.password !== PASSWORD) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── CLIENTES ──
  if (action === "clientes.list") {
    const { data: clientes, error } = await supabase
      .from("eloi_clientes").select("*").order("nome");
    if (error) return json({ error: error.message }, 500);
    const { data: svc } = await supabase
      .from("eloi_servicos").select("cliente_id,valor_cents");
    const agg: Record<string, { total_servicos: number; total_cents: number }> = {};
    for (const s of svc ?? []) {
      const a = agg[s.cliente_id] ?? (agg[s.cliente_id] = { total_servicos: 0, total_cents: 0 });
      a.total_servicos++; a.total_cents += Number(s.valor_cents) || 0;
    }
    return json({ clientes: (clientes ?? []).map((c) => ({ ...c, ...(agg[c.id] ?? { total_servicos: 0, total_cents: 0 }) })) });
  }

  if (action === "clientes.upsert") {
    const c = body?.cliente || {};
    if (!c.nome) return json({ error: "nome obrigatório" }, 400);
    const row = { nome: c.nome, cor: c.cor || "#7B2CBF", contato: c.contato ?? null };
    if (c.id) {
      const { data, error } = await supabase.from("eloi_clientes").update(row).eq("id", c.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ cliente: data });
    }
    const { data, error } = await supabase.from("eloi_clientes").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ cliente: data });
  }

  if (action === "clientes.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { count } = await supabase.from("eloi_servicos")
      .select("id", { count: "exact", head: true }).eq("cliente_id", body.id);
    if ((count ?? 0) > 0) return json({ error: "cliente tem serviços; mova ou exclua antes" }, 409);
    const { error } = await supabase.from("eloi_clientes").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── SERVIÇOS ──
  if (action === "servicos.list") {
    const f = body?.filtro || {};
    let q = supabase.from("eloi_servicos").select("*").order("created_at", { ascending: false });
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    if (f.status_execucao) q = q.eq("status_execucao", f.status_execucao);
    if (typeof f.pago === "boolean") q = q.eq("pago", f.pago);
    if (f.mes) { // 'YYYY-MM' sobre data_pagamento
      const start = `${f.mes}-01`;
      const [y, m] = f.mes.split("-").map(Number);
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      q = q.gte("data_pagamento", start).lt("data_pagamento", end);
    }
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ servicos: data });
  }

  if (action === "servicos.upsert") {
    const s = body?.servico || {};
    if (!s.cliente_id) return json({ error: "cliente_id obrigatório" }, 400);
    if (!s.descricao) return json({ error: "descricao obrigatória" }, 400);
    const row: any = {
      cliente_id: s.cliente_id,
      descricao: s.descricao,
      valor_cents: Number(s.valor_cents) || 0,
      status_execucao: s.status_execucao === "concluida" ? "concluida" : "em_execucao",
      pago: s.pago === true,
      data_pagamento: s.data_pagamento || null,
      nf_numero: s.nf_numero || null,
      observacoes: s.observacoes || null,
    };
    if (typeof s.nf_arquivo_url === "string") row.nf_arquivo_url = s.nf_arquivo_url || null;
    if (s.id) {
      const { data, error } = await supabase.from("eloi_servicos").update(row).eq("id", s.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ servico: data });
    }
    const { data, error } = await supabase.from("eloi_servicos").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data });
  }

  if (action === "servicos.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("eloi_servicos").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── NOTA FISCAL (Storage) ──
  if (action === "nf.upload_url") {
    if (!body?.servico_id || !body?.filename) return json({ error: "servico_id e filename obrigatórios" }, 400);
    const safe = String(body.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${body.servico_id}/${Date.now()}_${safe}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return json({ error: error.message }, 500);
    return json({ path, signed_url: data.signedUrl, token: data.token });
  }

  if (action === "nf.view_url") {
    if (!body?.path) return json({ error: "path obrigatório" }, 400);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(body.path, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  // ── DASHBOARD ──
  if (action === "dashboard.stats") {
    const { data: rows, error } = await supabase
      .from("eloi_servicos")
      .select("valor_cents,status_execucao,pago,data_pagamento,nf_numero,cliente_id");
    if (error) return json({ error: error.message }, 500);
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    let faturado_mes = 0, a_receber = 0, em_execucao = 0, concluido_sem_nf = 0;
    const porCli: Record<string, number> = {};
    for (const r of rows ?? []) {
      const v = Number(r.valor_cents) || 0;
      if (r.pago && r.data_pagamento && String(r.data_pagamento).slice(0, 7) === ym) faturado_mes += v;
      if (!r.pago) a_receber += v;
      if (r.status_execucao === "em_execucao") em_execucao++;
      if (r.status_execucao === "concluida" && !r.nf_numero) concluido_sem_nf++;
      porCli[r.cliente_id] = (porCli[r.cliente_id] ?? 0) + v;
    }
    const { data: clientes } = await supabase.from("eloi_clientes").select("id,nome,cor");
    const por_cliente = (clientes ?? [])
      .map((c) => ({ nome: c.nome, cor: c.cor, total_cents: porCli[c.id] ?? 0 }))
      .sort((a, b) => b.total_cents - a.total_cents);
    return json({ faturado_mes, a_receber, em_execucao, concluido_sem_nf, por_cliente });
  }

  return json({ error: "ação inválida" }, 400);
});
```

- [ ] **Step 2: Deploy** via Supabase MCP:

`deploy_edge_function(project_id="nlamznxoocmygfvnqcns", name="eloi-gestao", files=[{name:"index.ts", content:<o TS acima>}])`

- [ ] **Step 3: Verificar 401 sem senha**

```bash
curl -s -X POST "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/eloi-gestao" \
  -H "content-type: application/json" -d '{"action":"clientes.list"}'
```
Esperado: `{"error":"unauthorized"}` (status 401).

- [ ] **Step 4: Verificar fluxo cliente + serviço + dashboard**

```bash
SUPA=https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/eloi-gestao
# cria cliente
curl -s -X POST $SUPA -H "content-type: application/json" \
  -d '{"password":"eloidesign2026","action":"clientes.upsert","cliente":{"nome":"TESTE","cor":"#1565C0"}}'
# lista clientes (guarde o id retornado)
curl -s -X POST $SUPA -H "content-type: application/json" \
  -d '{"password":"eloidesign2026","action":"clientes.list"}'
# cria serviço (troque CLIENTE_ID)
curl -s -X POST $SUPA -H "content-type: application/json" \
  -d '{"password":"eloidesign2026","action":"servicos.upsert","servico":{"cliente_id":"CLIENTE_ID","descricao":"Layout teste","valor_cents":100000,"status_execucao":"concluida","pago":false}}'
# dashboard
curl -s -X POST $SUPA -H "content-type: application/json" \
  -d '{"password":"eloidesign2026","action":"dashboard.stats"}'
```
Esperado: cada um retorna JSON sem `error`; `dashboard.stats` mostra `a_receber:100000`, `concluido_sem_nf:1`.

- [ ] **Step 5: Verificar signed upload URL**

```bash
curl -s -X POST $SUPA -H "content-type: application/json" \
  -d '{"password":"eloidesign2026","action":"nf.upload_url","servico_id":"SERVICO_ID","filename":"nota.pdf"}'
```
Esperado: JSON com `path`, `signed_url`, `token`.

- [ ] **Step 6: Limpar dados de teste**

`execute_sql(project_id, query: "delete from public.eloi_servicos where descricao='Layout teste'; delete from public.eloi_clientes where nome='TESTE';")`

- [ ] **Step 7: Commit**

```bash
git add edge-functions/eloi-gestao.ts
git commit -m "feat(gestao): edge eloi-gestao (clientes/serviços/NF/dashboard)"
```

---

## Task 3: Página `/gestao/` (frontend)

**Files:**
- Create: `gestao/index.html`

**Interfaces:**
- Consumes: edge `eloi-gestao` (Task 2). Constante `SUPA = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/eloi-gestao"`. Senha em `sessionStorage('eloi_pw')`.

- [ ] **Step 1: Criar o esqueleto da página** copiando o chrome de `aplicativos/index.html` (head, vars roxas, aurora, logo SVG, login). Trocar título para "Gestão". O `entrar()` valida via:

```js
const SUPA = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/eloi-gestao";
async function api(action, extra = {}) {
  const password = sessionStorage.getItem('eloi_pw') || '';
  const r = await fetch(SUPA, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ password, action, ...extra }) });
  if (r.status === 401) { sessionStorage.removeItem('eloi_pw'); location.reload(); throw new Error('401'); }
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
function brl(cents){ return (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
async function entrar(){
  const pw = document.getElementById('pw').value;
  try { sessionStorage.setItem('eloi_pw', pw); await api('dashboard.stats'); mostrarApp(); }
  catch(e){ sessionStorage.removeItem('eloi_pw'); document.getElementById('err').textContent = e.message==='401'?'Senha incorreta.':'Erro.'; }
}
```

- [ ] **Step 2: Verificar login** — `preview_start`, abrir `/gestao/`, digitar `eloidesign2026`, deve entrar; senha errada mostra "Senha incorreta.".

- [ ] **Step 3: Aba Clientes** — render da lista (`clientes.list`) com chip colorido (`background:cliente.cor`), botão "+ Cliente" e edição (nome, cor via `<input type=color>`, contato) chamando `clientes.upsert`; excluir via `clientes.delete` (mostrar erro 409 se tiver serviços).

```js
async function renderClientes(){
  const { clientes } = await api('clientes.list');
  // pinta lista: chip = <span style="background:${c.cor}">${c.nome}</span>, total_servicos, brl(c.total_cents)
}
async function salvarCliente(c){ await api('clientes.upsert', { cliente:c }); await renderClientes(); }
```

- [ ] **Step 4: Verificar Clientes** — adicionar "ASUS" cor azul, editar, ver chip colorido. `preview_snapshot` confirma.

- [ ] **Step 5: Aba Serviços** — render `servicos.list` **agrupado por cliente** (cabeçalho = chip colorido do cliente), cada linha: descrição · `brl(valor_cents)` · badge status (Em execução/Concluída) · ✓ pago · data · NF nº · OBS. Filtros (cliente, status, pago, mês) re-chamam `servicos.list` com `filtro`. Botão "+ Serviço" abre modal.

```js
let CLIENTES = [];
async function renderServicos(filtro={}){
  const [{servicos}] = await Promise.all([ api('servicos.list',{filtro}) ]);
  const byCli = {}; servicos.forEach(s=>(byCli[s.cliente_id]??=[]).push(s));
  // para cada cliente em CLIENTES: cabeçalho chip + linhas
}
```

- [ ] **Step 6: Modal de serviço** — campos: cliente (`<select>` de CLIENTES), descrição, valor (digita em reais → `Math.round(parseFloat*100)` → `valor_cents`), status_execucao, pago (checkbox), data_pagamento, nf_numero, observacoes, **upload PDF**. Salvar via `servicos.upsert`.

- [ ] **Step 7: Upload da NF** — fluxo signed URL:

```js
async function uploadNF(servico_id, file){
  const { path, signed_url } = await api('nf.upload_url', { servico_id, filename:file.name });
  const put = await fetch(signed_url, { method:'PUT', headers:{'content-type':file.type||'application/pdf'}, body:file });
  if(!put.ok) throw new Error('falha no upload');
  await api('servicos.upsert', { servico:{ id:servico_id, cliente_id:CUR.cliente_id, descricao:CUR.descricao, nf_arquivo_url:path } });
  return path;
}
async function verNF(path){ const { url } = await api('nf.view_url', { path }); window.open(url, '_blank'); }
```
(no upsert do upload, reenviar os campos obrigatórios `cliente_id`/`descricao` do serviço atual `CUR`.)

- [ ] **Step 8: Verificar Serviços ponta-a-ponta** — criar serviço para ASUS R$ 1.000, status Concluída, subir um PDF qualquer, clicar no NF e ver abrir; aplicar filtro "não pago" e confirmar. `preview_screenshot` para registro.

- [ ] **Step 9: Dashboard** — topo com cards de `dashboard.stats`: `brl(faturado_mes)`, `brl(a_receber)`, `em_execucao`, `concluido_sem_nf`, e ranking `por_cliente` (chip + `brl(total_cents)`).

- [ ] **Step 10: Verificar Dashboard** — números batem com os serviços criados. `preview_screenshot`.

- [ ] **Step 11: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): página /gestao/ (dashboard + serviços + clientes)"
```

---

## Task 4: Integração no admin + SITEMAP

**Files:**
- Modify: `admin/index.html` (adicionar card no hub `.cards`)
- Modify: `SITEMAP.md` (linha da rota)

**Interfaces:**
- Consumes: página `/gestao/` (Task 3).

- [ ] **Step 1: Adicionar card no hub** de `admin/index.html`, dentro do `<div class="cards">`, seguindo o padrão dos `<a class="card-base nav-card">` existentes:

```html
<a class="card-base nav-card" href="/gestao/">
  <span class="ic">📊</span>
  <div class="t">Gestão</div>
  <div class="d">Clientes, serviços, notas fiscais e dashboard financeiro.</div>
</a>
```

- [ ] **Step 2: Documentar a rota** em `SITEMAP.md`, na tabela de rotas:

```markdown
| `/gestao/` | `gestao/index.html` | **Painel de Gestão** — clientes, serviços prestados (valor, NF, PDF, status), dashboard financeiro. Tabelas isoladas `eloi_clientes`/`eloi_servicos` via edge `eloi-gestao`; PDFs no bucket privado `eloi-notas`. |
```

- [ ] **Step 3: Verificar** — `preview` em `/admin/`, login, clicar no card "Gestão" → abre `/gestao/`.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html SITEMAP.md
git commit -m "feat(gestao): card no admin + rota no SITEMAP"
```

---

## Task 5: Deploy de produção

**Files:** nenhum (push do que já foi commitado).

- [ ] **Step 1: Conferir o que vai subir** — `git status` e `git log --oneline origin/master..HEAD`. Confirmar que só há commits do painel de gestão (db, edge, gestao, admin, sitemap, specs/plans) e **nenhum** dos 4 arquivos WIP (`briefing-ecommerce`, `briefing-solarium`, `briefing/`, `painel-ecommerce`).

- [ ] **Step 2: Push**

```bash
git push origin master
```

- [ ] **Step 3: Verificar produção** — após o deploy Vercel, abrir `https://briefing-eloidesign.vercel.app/gestao/`, logar, confirmar dashboard/clientes/serviços carregando da edge.

---

## Task 6: Carga inicial da planilha (depende do Wilke)

**Files:** nenhum no repo (inserção de dados via Supabase).

**Interfaces:**
- Consumes: tabelas da Task 1.
- **Pré-requisito:** Wilke exporta a planilha atual em **CSV** (colunas CLIENTE, SERVIÇO, Status, R$, DATA PG, NF-S, PG, OBS).

- [ ] **Step 1: Inserir clientes únicos** — a partir dos valores distintos de CLIENTE, `insert into eloi_clientes(nome,cor)` com as cores dos chips (ASUS azul `#1565C0`, PLANO&PLANO vermelho `#C62828`, VIBRA laranja `#EF6C00`, F2 EXPERIENCE rosa `#AD1457`, etc.).

- [ ] **Step 2: Inserir serviços** — mapear cada linha: R$ → `valor_cents` (×100), Status "Concluída"→`concluida`/"Em execuç…"→`em_execucao`, PG ✓→`pago=true`, DATA PG→`data_pagamento` (formato `YYYY-MM-DD`), NF-S→`nf_numero`, OBS→`observacoes`, ligando `cliente_id` pelo nome.

- [ ] **Step 3: Verificar contagem** — `execute_sql`: `select c.nome, count(*) from eloi_servicos s join eloi_clientes c on c.id=s.cliente_id group by c.nome;` bate com a planilha.

- [ ] **Step 4: Conferir no painel** — abrir `/gestao/` e ver os dados reais agrupados.

---

## Self-Review

**Spec coverage:** `/gestao/` no site (T3,T4,T5) ✓ · tabelas isoladas (T1) ✓ · `eloi_servicos` com todos os campos da planilha (T1) ✓ · bucket privado + signed URLs (T1,T2) ✓ · edge `eloi-gestao` (T2) ✓ · dashboard com faturado/a-receber/em-execução/concluído-sem-NF/ranking (T2,T3) ✓ · agrupar por cliente + chip colorido (T3) ✓ · carga inicial (T6) ✓ · card no admin + SITEMAP (T4) ✓ · app financeiro intocado (Global Constraints) ✓.

**Placeholders:** SQL e edge completos; frontend mostra a lógica nova (api/brl/upload/render) como código real e cita `aplicativos/index.html` como fonte exata do chrome visual. Sem TBD/TODO.

**Type consistency:** `valor_cents` (centavos) em todo o fluxo; `status_execucao` valores `em_execucao`/`concluida` iguais no SQL, edge e frontend; actions do frontend (`api('servicos.list',{filtro})`) batem com o router da edge; `nf_arquivo_url` (path do Storage) gravado no upsert e lido por `nf.view_url`.

**Fora de escopo (confirmado no spec):** pagamento parcial formal, NF como entidade própria, ligação cliente↔orçamentos↔briefings, catálogo/projetos — Fases futuras.
