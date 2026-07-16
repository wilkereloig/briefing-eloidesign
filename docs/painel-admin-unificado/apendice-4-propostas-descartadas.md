# Proposta A — Shell mínimo sobre o que já existe (admin unificado ELOI Design Studio)


# Proposta A — Shell mínimo sobre o que já existe

Premissa: **menor diff possível**. Nenhuma página muda de lugar, nenhuma tabela muda de nome, nenhuma edge function é reescrita do zero. Trocamos só duas coisas transversais (autenticação e casca visual) e acrescentamos um módulo novo (marca). Confirmei ao vivo via MCP read-only (`list_tables` verbose + `get_edge_function` em `eloi-gestao`, `orcamentos`, `briefing-links`) o schema exato das 7 tabelas do site e o padrão de código real — o que está abaixo não é inferência, é o que está rodando em produção agora.

## Correção ao "AVISO IMPORTANTE" (li antes de planejar, não re-planejo em cima do aviso velho)

As 4 tabelas apontadas como "vazias/inexistentes" **existem**, com RLS ligado e schema batendo 100% com o código das edge functions (`briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings` — e mais `catalogo_servicos`, que também existe). **Não vou propor `apply_migration` de recriação — isso destruiria/recriaria objetos que já servem produção sem necessidade.** O que a tarefa pediu ("plano de recriar as 4 tabelas") eu resolvo como **plano de versionamento**: hoje só existe `db/eloi-gestao.sql` no repo; as outras 4 tabelas não têm `.sql` correspondente. A "recriação" concreta e segura é **documentar o schema real em SQL idempotente (`CREATE TABLE IF NOT EXISTS`) e commitar em `db/`**, para o repo parar de mentir sobre o que existe em produção. Isso é rodado zero vezes contra o banco — é só fechar a lacuna de source control.

---

## 1. IA / Navegação

Estrutura de pastas **não muda**. O que muda é que toda página abaixo passa a ter uma barra superior comum (via shell compartilhado) e um único mecanismo de login.

```
/admin/                  → hub (dashboard agregando briefings+orçamentos)
/gestao/                 → clientes + serviços + financeiro
/painel-briefings/       → geração de link + respostas (fluxo novo, tokenizado)
/painel-orcamentos/      → orçamentos/propostas
/orcamento-inteligente/  → calculadora por catálogo
/marca/                  → NOVO — gerador de variações de marca (upload+paleta+raster)
/aplicativos/            → launcher (ELOI Financeiro externo)
/painel/                 → legado, briefings sem token (mantém, sem card novo)
/painel-ecommerce/       → legado, ecommerce_briefings (mantém, sem card novo)
```

Nav da topbar compartilhada (mesma ordem em todas as páginas, item ativo destacado por `data-active`):
`Dashboard · Clientes/Financeiro · Briefings · Orçamentos · Orçamento inteligente · Marca · Aplicativos` — com um menu secundário "Legado" (dropdown ou rodapé) linkando `/painel/` e `/painel-ecommerce/`, porque a decisão de aposentá-las depende do Wilke confirmar que as 0 linhas não escondem histórico perdido (fora do escopo desta proposta).

Páginas públicas (`/orcamento/?t=`, `/entregas-marca/<slug>/`, `/briefing*`) **não entram no shell** — continuam exatamente como estão, sem topbar admin, sem token de sessão admin.

---

## 2. Autenticação unificada

### 2.1 O que existe hoje (confirmado lendo o código real de 3 funções)

Toda edge function admin tem literalmente esta linha:
```ts
const PASSWORD = "eloidesign2026";
...
if (body?.password !== PASSWORD) return json({ error: "unauthorized" }, 401);
```
(`eloi-gestao`, `orcamentos`, `briefing-links` — confirmado via `get_edge_function`; `get-briefings`/`get-ecommerce-briefings` fazem o mesmo mas sem checar `action`.)

### 2.2 Desenho novo — 1 tabela + 1 função nova + 1 helper compartilhado

**Tabela nova** `admin_sessions` (sessão real, curta, single-user — não é over-engineering porque é literalmente o que "login único" pede):

```sql
create table if not exists public.admin_sessions (
  token         text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '12 hours')
);
alter table public.admin_sessions enable row level security;
-- sem policies: só a service-role (edge functions) acessa, mesmo padrão de eloi_clientes/orcamentos.
```
`ponytail:` sem cron de limpeza de sessões expiradas — 1 linha nova por login, volume de um usuário único é irrelevante. Adicionar `delete where expires_at < now()` só se um dia isso importar.

**Função nova** `admin-auth` (`verify_jwt: false`, mesmo padrão das outras):

```ts
// supabase/functions/admin-auth/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {}; try { body = await req.json(); } catch {}
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const action = body?.action || "login";

  if (action === "login") {
    const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") ?? "eloidesign2026"; // fallback = valor atual, zero mudança de comportamento no dia 1
    if (body?.password !== ADMIN_PASSWORD) return json({ error: "unauthorized" }, 401);
    const { data, error } = await supabase.from("admin_sessions").insert({}).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: data.token, expires_at: data.expires_at });
  }
  if (action === "logout") {
    if (body?.token) await supabase.from("admin_sessions").delete().eq("token", body.token);
    return json({ ok: true });
  }
  return json({ error: "ação inválida" }, 400);
});
```

**Helper compartilhado** `supabase/functions/_shared/auth.ts` (Deno CLI resolve import relativo entre funções, é o padrão oficial pra código compartilhado — não duplica arquivo):

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function verifyAdminToken(body: any): Promise<boolean> {
  const token = body?.token;
  if (!token) return false;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("admin_sessions").select("expires_at").eq("token", token).single();
  if (!data || new Date(data.expires_at) < new Date()) return false;
  await supabase.from("admin_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() })
    .eq("token", token); // sessão "desliza" enquanto o Wilke usa o painel
  return true;
}
```

**Diff em cada função existente — literalmente 2 linhas**:
```diff
+ import { verifyAdminToken } from "../_shared/auth.ts";
- const PASSWORD = "eloidesign2026";
  ...
- if (body?.password !== PASSWORD) return json({ error: "unauthorized" }, 401);
+ if (!(await verifyAdminToken(body))) return json({ error: "unauthorized" }, 401);
```
Aplicado em `eloi-gestao`, `orcamentos` (o bloco `public_get` continua sem essa checagem — permanece público), `briefing-links`, `get-briefings`, `get-ecommerce-briefings`. `briefing-submit` não toca em nada (já é pública por design, correto).

### 2.3 Cliente — 1 arquivo compartilhado, `localStorage` (não `sessionStorage`)

`/assets/eloi-admin/auth.js`, incluído via `<script src="/assets/eloi-admin/auth.js">` em todo `index.html` admin (caminho absoluto — funciona igual não importa a profundidade da pasta):

```js
const FN_ADMIN_AUTH = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/admin-auth";
const KEY = "eloi_admin_token";
window.EloiAdminAuth = {
  token: () => localStorage.getItem(KEY),
  async login(password) {
    const r = await fetch(FN_ADMIN_AUTH, { method: "POST", body: JSON.stringify({ action: "login", password }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "senha inválida");
    localStorage.setItem(KEY, d.token);
  },
  logout() {
    const t = this.token(); localStorage.removeItem(KEY);
    if (t) fetch(FN_ADMIN_AUTH, { method: "POST", body: JSON.stringify({ action: "logout", token: t }) });
  },
  async call(fnUrl, body) {
    const r = await fetch(fnUrl, { method: "POST", body: JSON.stringify({ ...body, token: this.token() }) });
    if (r.status === 401) { this.logout(); location.reload(); throw new Error("sessão expirada"); }
    return r.json();
  },
};
```
Cada página troca `fetch(FN, {body: JSON.stringify({password: pw, ...})})` por `EloiAdminAuth.call(FN, {...})` — a UI de login de cada página (que já existe, cada uma com seu próprio HTML de "digite a senha") **não muda de layout**, só troca o que faz no submit: chama `EloiAdminAuth.login(pw)` em vez de salvar a senha crua.

`localStorage` em vez de `sessionStorage` é mudança deliberada pedida no requisito — sessão sobrevive a fechar aba/navegador, mas a expiração de 12h no `admin_sessions` já limita o risco (é o mesmo trade-off que "lembrar-me" em qualquer app single-user).

**401 em qualquer chamada, não só no login**: `.call()` já cobre isso central — resolve a inconsistência #2 do inventário (só `gestao` deslogava sozinho hoje) para as 8 páginas de uma vez, de graça, sem tocar lógica interna de nenhuma.

---

## 3. Shell visual compartilhado

2 arquivos novos, ambos incluídos via tag absoluta em cada `index.html`:

- `/assets/eloi-admin/shell.css` — o bloco de ~20-40 linhas de paleta/aurora/botões/toast que hoje está copiado em 8 arquivos, extraído verbatim (zero mudança visual).
- `/assets/eloi-admin/shell.js` — injeta o wordmark SVG (as 176 linhas de `<path>` saem do HTML de cada página, viram 1 função `renderTopbar(activeKey)` que desenha `<svg>` + nav + botão sair dentro de `<div id="eloi-shell-topbar">`).

Diff por página: **remove** ~40 linhas de CSS duplicado + ~176 linhas de SVG inline, **adiciona** 2 tags `<link>/<script>` + 1 `<div id="eloi-shell-topbar" data-active="gestao"></div>`. Resultado líquido: cada página fica **menor**, não maior. Resolve inconsistência #3 (6 páginas tinham logo, 2 não) de graça — todas passam a ter.

---

## 4. Modelo de dados completo

### 4.1 Tabela nova (autenticação)
Já mostrada acima (`admin_sessions`).

### 4.2 Tabela nova (bucket de storage, não é tabela SQL — ver seção 5)

### 4.3 As 4 (5, contando `catalogo_servicos`) tabelas do site — schema real capturado agora via `list_tables`, para virar `db/*.sql` versionado

```sql
-- db/briefing-links.sql
create table if not exists public.briefing_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  cliente      text,
  tipo         text not null,
  status       text not null default 'pendente',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  nome         text,
  email        text,
  whatsapp     text,
  empresa      text,
  raw          jsonb
);
alter table public.briefing_links enable row level security;
```

```sql
-- db/orcamentos.sql
create sequence if not exists public.orcamentos_numero_seq;
create table if not exists public.orcamentos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cliente      text,
  titulo       text,
  status       text default 'rascunho',
  itens        jsonb default '[]'::jsonb,
  valor_total  numeric default 0,
  observacoes  text,
  link         text,
  share_token  uuid not null default gen_random_uuid(),
  numero       integer default nextval('orcamentos_numero_seq')
);
alter table public.orcamentos enable row level security;
```

```sql
-- db/briefings-legado.sql
create sequence if not exists public.briefings_numero_seq;
create table if not exists public.briefings (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  nome text, email text, whatsapp text,
  q1 text, q2 text, q3 text, q4 text, q5 text, q6 text, q7 text, q8 text, q9 text,
  q10_descricao text, q10_link text,
  q11_cores text, q11_texto text,
  q12 text, q13 text, q14 text, q15 text, q16 text, q17 text,
  q18 text, q18_outro text,
  raw           jsonb,
  numero        integer default nextval('briefings_numero_seq')
);
alter table public.briefings enable row level security;
```

```sql
-- db/ecommerce-briefings-legado.sql
create table if not exists public.ecommerce_briefings (
  id         uuid primary key default gen_random_uuid(),
  numero     bigint generated always as identity,
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text, empresa text,
  raw        jsonb
);
alter table public.ecommerce_briefings enable row level security;
```

```sql
-- db/catalogo-servicos.sql
create table if not exists public.catalogo_servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text,
  preco_base  numeric not null default 0,
  unidade     text not null default 'un',
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.catalogo_servicos enable row level security;
```

`db/eloi-gestao.sql` já existe e já bate com o real (`eloi_clientes` com `marca_slug`/`marca_publicada`, `eloi_servicos` com FK pra `eloi_clientes`) — não precisa de arquivo novo, só confirmo que não há drift.

**Nenhum destes 6 blocos é executado contra produção nesta proposta** — viram commits em `db/`, prontos pra rodar (`create table if not exists` é seguro/idempotente se algum dia um projeto novo precisar recriar do zero) mas sem efeito no banco atual porque tudo já existe igual.

### 4.4 Allowlist de tabelas do site (documentar isso em `db/README.md` ou no topo de cada `.sql`)
`eloi_clientes`, `eloi_servicos`, `briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`, `catalogo_servicos`, `admin_sessions`. Qualquer SQL/migration futura do admin roda só contra esses nomes — nunca `clients`/`services`/`workspaces` (são do ELOI Financeiro, mesmo projeto Supabase).

---

## 5. Edge functions — lista final

| Função | Status | Mudança |
|---|---|---|
| `admin-auth` | **NOVA** | login/logout, emite token em `admin_sessions` |
| `eloi-gestao` | existente | swap de auth (2 linhas) + 1 action nova: `marca.upload_urls` |
| `orcamentos` | existente | swap de auth; `public_get`/`catalog_*` inalterados |
| `briefing-links` | existente | swap de auth |
| `briefing-submit` | existente | **inalterada** (já é pública por token, correta) |
| `get-briefings` | existente | swap de auth (ganha `action`/token junto) |
| `get-ecommerce-briefings` | existente | swap de auth |

Nenhuma função é excluída nesta fase — decisão de aposentar `get-briefings`/`get-ecommerce-briefings` fica pendente de confirmação do Wilke (risco #10 do inventário), fora do escopo "menor diff".

`marca.upload_urls` em `eloi-gestao` (reaproveita 1:1 o padrão de `nf.upload_url` já existente, só em lote):
```ts
if (action === "marca.upload_urls") {
  const { slug, paths } = body; // paths: string[] com os ~107 caminhos dentro do bucket
  const out = [];
  for (const p of paths) {
    const { data, error } = await supabase.storage.from("entregas-marca")
      .createSignedUploadUrl(`${slug}/${p}`, { upsert: true });
    if (error) return json({ error: error.message }, 500);
    out.push({ path: p, signed_url: data.signedUrl, token: data.token });
  }
  return json({ uploads: out });
}
```

---

## 6. Pipeline de geração de marca no navegador (módulo `/marca/`)

Segue a recomendação já validada na pesquisa: **Canvas API 100% client-side**, zero `sharp`, zero `resvg-wasm`.

### 6.1 Bucket (novo, público — primeiro bucket público do projeto)
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-marca', 'entregas-marca', true, 26214400,
        array['image/svg+xml','image/png','application/json','application/zip'])
on conflict (id) do nothing;
-- sem policies: leitura pública é padrão de bucket public=true; escrita só via signed upload url do edge function.
```

### 6.2 Path scheme (espelha a árvore de pastas atual do git, `entrega.js` só troca `./` → URL pública)
```
entregas-marca/<slug>/manifest.json
entregas-marca/<slug>/<slug>-marca-completa.zip
entregas-marca/<slug>/logo/<variacao>/<cor-slug>.svg
entregas-marca/<slug>/logo/<variacao>/<cor-slug>.png
entregas-marca/<slug>/logo/<variacao>/<cor-slug>.preview.png
```

### 6.3 Fluxo na tela `/marca/`
1. Selecionar cliente (dropdown de `eloi_clientes`, mostra `marca_slug`/`marca_publicada` já vindos de `clientes.list`).
2. Upload do(s) SVG mestre (`fill:currentColor`) — `<input type="file" multiple accept=".svg">`, lido com `FileReader`, guardado em memória.
3. Editor de paleta na tela: lista `{nome, hex}` editável, add/remove linha — estado local, sem rede.
4. Botão "Gerar": por variação × cor —
   - Recolorir: `masterSvg.replace(/fill:\s*currentColor/g, \`fill: ${hex}\`)` (regex, igual ao script Node atual).
   - Rasterizar: `data:image/svg+xml;...` → `new Image()` → `<canvas>.drawImage` → `canvas.toBlob('image/png')`, 2000px (full) e 480px (preview). `data:` URL nunca "tainta" o canvas (confirmado via blink-dev intent-to-ship) — não precisa `createObjectURL`/CORS.
   - Guardar cada blob em memória com a chave de path da seção 6.2.
5. Montar `manifest.json` em memória.
6. Zip client-side com `fflate.zipSync` sobre os blobs já em memória (excluindo `*.preview.png`). Vendorizar `fflate` local em `/assets/vendor/fflate.min.js` (~8kB, não depender de CDN externo pra ferramenta de produção) — primeira dependência client-side do site, adicionada só nesta página admin, não na página pública do cliente.
7. 1 POST `eloi-gestao` `{action:"marca.upload_urls", token, slug, paths:[...]}` → recebe signed URLs em lote.
8. Browser faz `PUT` direto pros signed URLs (paralelo, limite ~6 simultâneos), com header `apikey: <anon key>` — obrigatório porque o Storage é outro serviço no gateway (spike de 5 min pra confirmar antes de construir, é o único ponto não 100% verificado por fonte primária).
9. Só depois que **todos** os uploads confirmarem, chamar `clientes.upsert` (já existe) com `marca_publicada: true` — evita publicar estado parcial.
10. Página pública `/entregas-marca/<slug>/` vira template genérico (1 arquivo, não mais 1 commit por cliente) que lê `slug` da URL e faz `fetch(BASE + "/manifest.json")` direto do Storage público.

`cache-control: public, max-age=3600` em todo upload (não `immutable` — o botão "gerar" pode rodar de novo pro mesmo slug com `upsert:true`, correção precisa aparecer em até 1h, não ficar presa em cache agressivo).

---

## 7. Plano de migração faseado (cada fase é revertível sozinha)

**Fase 0 — Aditivo puro, zero risco** (nada existente muda de comportamento):
- Criar `admin_sessions` (tabela nova).
- Deploy `admin-auth` + `_shared/auth.ts` (função nova, não referenciada por ninguém ainda).
- Setar secret `ADMIN_PASSWORD=eloidesign2026` no projeto (mesmo valor de hoje — zero mudança de comportamento, só tira o hardcode do próximo passo).
- Validar manualmente: `curl` no `admin-auth` com `{action:"login",password:"eloidesign2026"}`, confirmar token + linha em `admin_sessions`.

**Fase 1 — Canário**: trocar auth em **`/aplicativos/`** primeiro (é a página que já usa `get-briefings` só pra checar senha e descarta a resposta — menor blast radius do conjunto). Validar login/logout/expiração de token na prática antes de tocar em qualquer página com dado real.

**Fase 2 — Shell visual no mesmo canário**: extrair CSS/SVG pra `/assets/eloi-admin/`, aplicar em `/aplicativos/`, confirmar visual idêntico.

**Fase 3 — Rollout do padrão validado**: repetir fases 1+2 em `eloi-gestao` → `briefing-links` → `orcamentos` → `/painel-orcamentos/` → `/painel-briefings/` → `/orcamento-inteligente/` → `/admin/` (hub). Cada página é 1 commit pequeno e independente — se uma quebrar, reverte só ela, as outras continuam no padrão antigo (mesma senha, ainda funcionando, porque a Fase 0 não tocou nas funções antigas).

**Fase 4 — Legado**: mesmo swap em `get-briefings`/`get-ecommerce-briefings` + `/painel/` + `/painel-ecommerce/` (mantém como estão, só ganham auth unificada e shell — sem decisão de aposentadoria aqui).

**Fase 5 — Módulo novo `/marca/`** (paralelo às fases 3-4, é aditivo e não toca páginas existentes): criar bucket `entregas-marca`, action `marca.upload_urls` em `eloi-gestao`, página `/marca/`, template genérico de `/entregas-marca/<slug>/`.

**Fase 6 — Documentação**: commitar os 6 blocos `db/*.sql` da seção 4.3 (zero efeito em produção, fecha a lacuna de source control).

**Fase 7 — opcional, futuro**: rotacionar o valor de `ADMIN_PASSWORD` agora que é secret (não hardcode) — o valor atual ainda está no histórico do git, então "trocar a senha" de verdade é follow-up, não bloqueia nada acima.

---

## 8. Telas por módulo (pós-shell, sem redesenho de layout interno)

- **Login** (compartilhado): mesmo HTML de senha que cada página já tem, só o submit muda (chama `EloiAdminAuth.login`).
- **Dashboard** (`/admin/`): inalterado — continua agregando `briefing-links.list` + `orcamentos.list` client-side.
- **Clientes/Financeiro** (`/gestao/`): inalterado — lista clientes (mostrando badge de marca publicada/não), serviços, dashboard financeiro, upload de NF.
- **Briefings** (`/painel-briefings/`): inalterado — gerar link por tipo, listar respostas.
- **Orçamentos** (`/painel-orcamentos/`): inalterado — CRUD + link público.
- **Orçamento inteligente** (`/orcamento-inteligente/`): inalterado — calculadora por catálogo (segue vazia até alguém popular `catalogo_servicos` pela própria UI, pré-requisito de lançamento já sinalizado na pesquisa).
- **Marca** (`/marca/`, NOVA): seletor de cliente → upload de SVG mestre(s) → editor de paleta → botão gerar (progress por item) → preview grid → botão publicar (habilitado só com 100% dos uploads OK).
- **Aplicativos** (`/aplicativos/`): inalterado — launcher externo.
- **Legado** (`/painel/`, `/painel-ecommerce/`): inalterados, só ganham shell/auth — sem card novo no hub, acessíveis por URL direta como hoje.

---

## Fora de escopo desta proposta (decisões adjacentes, não decidi aqui)
- Aposentar `/painel/`, `/painel-ecommerce/` e suas 2 edge functions — depende do Wilke confirmar que 0 linhas = sem histórico perdido.
- Popular `catalogo_servicos` — pré-requisito de lançamento da calculadora, não parte da fusão do admin.
- Rotação real da senha (Fase 7) — cosmético de segurança, não bloqueia unificação.


---

# Arquitetura B — Admin ELOI Design Studio como SPA única

## 0. Decisão em uma frase

Um único `admin/index.html` (shell + router de hash em ~30 linhas, vanilla JS) carrega módulos como scripts planos (`modules/*.js`, sem bundler), fala com **um** edge function gateway (`eloi-admin`, ações namespaced por ponto, sessão HMAC stateless) para tudo que é admin, e as duas únicas rotas que **precisam** continuar públicas e sem senha (`orcamentos` no modo leitura por token, `briefing-submit`) sobrevivem **com o mesmo nome de função e a mesma URL**, então as páginas públicas (`/orcamento/`, `/entregas-marca/<slug>/`, `/briefing*/`) não precisam de nenhum edit. Zero tabela nova. Uma tabela ganha uso real (`catalogo_servicos`, hoje vazia). Um bucket novo (`entregas-marca`, público). Rasterização de logo migra de script Node local para Canvas API no navegador, conforme a pesquisa já validou.

**Correção que herdo da pesquisa, importante para quem for ler isto depois**: as 4 tabelas citadas no "aviso importante" do briefing como "vazias/inexistentes" **já existem em produção** com o schema abaixo confirmado agora via `list_tables`/`execute_sql` (somente leitura). Nada precisa ser recriado. O DDL na seção 4 é documentação do estado real, não uma migration a rodar.

---

## 1. Escopo

**Entra na fusão** (era 8 páginas admin, vira módulos de 1 SPA):
`/admin/`, `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/orcamento-inteligente/`, `/aplicativos/`, e os legados `/painel/` e `/painel-ecommerce/` (absorvidos como aba somente-leitura, não como páginas próprias).

**Fica fora, intacto, sem tocar** (páginas públicas para clientes finais):
`/orcamento/?t=<token>`, `/entregas-marca/<slug>/`, `/briefing/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/`, `/briefing-ecommerce/`, `/orcamento-precampanha/` (+ `/orcamento-precampanha/cliente/`). Nenhuma delas ganha SPA, nenhuma perde link já enviado a cliente.

---

## 2. IA / navegação

Roteamento **por hash**, não History API — decisão deliberada: o repo é hospedado como arquivos estáticos na Vercel sem `vercel.json` de rewrite hoje; hash funciona com zero configuração de servidor nova (nenhum catch-all a escrever/testar) e o botão voltar do navegador já funciona nativamente porque cada `location.hash = ...` empurra uma entrada de histórico sozinho. Se um dia quiserem URL bonita (`/admin/clientes` em vez de `/admin/#/clientes`), o upgrade é 1 arquivo `vercel.json` com rewrite catch-all + trocar `location.hash` por `history.pushState` — não vale construir isso agora, ninguém pediu.

```
/admin/#/dashboard              (default)
/admin/#/clientes
/admin/#/servicos
/admin/#/briefings              (tabs internas: Links · Respostas · Legado)
/admin/#/orcamentos             (tabs internas: Orçamentos · Catálogo)
/admin/#/entregas-marca         (lista de clientes com marca_slug)
/admin/#/entregas-marca/:slug   (editor de geração para 1 cliente)
/admin/#/aplicativos
```

Sub-seleção (qual orçamento está aberto, qual cliente está com modal aberto) fica em estado de módulo, não em rota — não há necessidade de deep-link para um modal específico hoje, então não construo isso (YAGNI, ninguém pediu compartilhar link de "orçamento nº42 aberto").

Router (ilustrativo, ~30 linhas, sem lib):

```js
// admin/app.js — trecho ilustrativo, não é código de produção
const routes = {}; // 'clientes' -> {mount(root), unmount()}
function registerModule(name, mod){ routes[name] = mod; }
let current = null;
function onHashChange(){
  const [name, ...rest] = (location.hash.slice(2) || 'dashboard').split('/');
  if (current) current.unmount?.();
  const mod = routes[name] || routes['dashboard'];
  setActiveNavItem(name);
  current = mod;
  mod.mount(document.getElementById('app'), rest);
}
window.addEventListener('hashchange', onHashChange);
window.addEventListener('DOMContentLoaded', onHashChange);
```

---

## 3. Modelo de autenticação unificado

**Hoje**: a mesma string `"eloidesign2026"` está hardcoded em 5 edge functions, comparada em texto puro a cada request; `sessionStorage.eloi_pw` é reenviado sempre. Já é de fato 1 sessão (mesma origin, mesma chave) — só não está desenhada como tal.

**Proposto**: 1 secret (`ADMIN_PASSWORD`, Supabase function secret), 1 função que faz login, token de sessão **stateless assinado** — sem tabela de sessão, sem JWT lib (Web Crypto `crypto.subtle.sign('HMAC', ...)` é nativo do runtime Deno, ladder rung 4).

```
POST eloi-admin {action:'auth.login', password}
  -> compara com ADMIN_PASSWORD
  -> payload = {exp: now+7d}
  -> token = base64url(payload) + '.' + base64url(HMAC_SHA256(sha256(ADMIN_PASSWORD), payload))
  -> devolve {token, exp}

Toda outra action:
  Authorization: Bearer <token>
  -> gateway recalcula HMAC, compara, checa exp -> 401 se falhar
  -> se exp está a menos de 50% do TTL, devolve um token novo no header de resposta (refresh silencioso, sem endpoint dedicado)
```

Guardado em `localStorage` (não `sessionStorage`): o objetivo de "sessão única" para 1 usuário admin que abre várias abas ao longo do dia é justamente não pedir senha de novo por aba — `sessionStorage` seria uma regressão do comportamento atual (risco #6 do levantamento: já compartilham sessão de fato).

Chave de assinatura = `sha256(ADMIN_PASSWORD)`, não um segredo separado — 1 secret só, e trocar a senha já invalida toda sessão aberta em qualquer aba/dispositivo instantaneamente (comportamento desejável, não bug). Não crio uma tabela de sessão/revogação — com 1 usuário, revogar = trocar a env var; uma blocklist de tokens é complexidade para um problema que não existe ainda.

Isso fecha os riscos #6 e #7 do levantamento (sessão "colada por acidente" vira sessão de verdade; ausência de expiração é resolvida) sem introduzir Supabase Auth/JWT de usuário real — que seria overkill para 1 pessoa.

---

## 4. Modelo de dados — schema real (lido agora via MCP read-only, `list_tables`/`execute_sql`, projeto `nlamznxoocmygfvnqcns`)

Nenhuma tabela abaixo precisa ser criada ou alterada estruturalmente — isto documenta o estado atual para servir de base ao gateway novo. A única migration real do pacote é o bucket de Storage no fim desta seção.

```sql
-- já existe, RLS on, 1 linha hoje
create table public.eloi_clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cor             text not null default '#7B2CBF',
  contato         text,
  created_at      timestamptz not null default now(),
  marca_slug      text unique,          -- já adicionado nesta sessão
  marca_publicada boolean not null default false
);

-- já existe, RLS on, 0 linhas
create table public.eloi_servicos (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references public.eloi_clientes(id),
  descricao             text not null,
  valor_cents           bigint not null default 0,
  status_execucao       text not null default 'em_execucao'
                          check (status_execucao in ('em_execucao','concluida')),
  pago                  boolean not null default false,
  data_pagamento        date,
  data_pagamento_efetivo date,          -- nota: só existe na tabela services do Financeiro; conferir se eloi_servicos tem esta coluna antes de portar 1:1 (ver ressalva no rodapé desta seção)
  nf_numero             text,
  nf_arquivo_url        text,
  observacoes           text,
  created_at            timestamptz not null default now()
);

-- já existe, RLS on, 0 linhas
create table public.briefing_links (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null default encode(extensions.gen_random_bytes(16),'hex'),
  cliente      text,
  tipo         text not null,           -- 'briefing' | 'briefing-ecommerce' | 'briefing-solarium' | 'briefing-guia-viver-bem'
  status       text not null default 'pendente',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  nome         text, email text, whatsapp text, empresa text,
  raw          jsonb
);

-- já existe, RLS on, 0 linhas
create table public.orcamentos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cliente      text,
  titulo       text,
  status       text default 'rascunho',
  itens        jsonb default '[]',
  valor_total  numeric default 0,
  observacoes  text,
  link         text,                    -- link manual opcional (esquema de link inconsistente por registro, ver risco #abaixo)
  share_token  uuid not null default gen_random_uuid(),
  numero       integer default nextval('orcamentos_numero_seq')
);

-- já existe, RLS on, 0 linhas — mantida só como arquivo de leitura (ver seção 9, fase 0)
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text,
  q1 text, q2 text, q3 text, q4 text, q5 text, q6 text, q7 text, q8 text, q9 text,
  q10_descricao text, q10_link text, q11_cores text, q11_texto text,
  q12 text, q13 text, q14 text, q15 text, q16 text, q17 text, q18 text, q18_outro text,
  raw jsonb,
  numero integer default nextval('briefings_numero_seq')
);

-- já existe, RLS on, 0 linhas — idem
create table public.ecommerce_briefings (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text, empresa text,
  raw jsonb
);

-- já existe, RLS on, 0 linhas — hoje vazia, nasce populável pela UI do módulo Orçamentos > Catálogo
create table public.catalogo_servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text,
  preco_base  numeric not null default 0,
  unidade     text not null default 'un',
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**Allowlist obrigatória para qualquer SQL/migration futura deste projeto**: `eloi_clientes`, `eloi_servicos`, `briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`, `catalogo_servicos`. O mesmo projeto Supabase hospeda ~17 tabelas do ELOI Financeiro (`clients`, `services`, `workspaces`, `transactions`, `categories`, `cards`, `recurrences`, `budgets`, `shared_expenses/participants/charges`, `invites`, `workspace_members`, `monthly_goals`, `push_subscriptions`, `app_secrets`) — confirmado agora via `list_tables`. `clients`/`services` (Financeiro) são nomes perigosamente parecidos com `eloi_clientes`/`eloi_servicos` (site); nunca gerar SQL sem apontar explicitamente para as tabelas `eloi_*`/as 5 específicas acima.

**Ressalva a verificar antes de codar** (não confirmei lendo o `.ts` real desta vez, por instrução de não re-pesquisar): a coluna `data_pagamento_efetivo` apareceu na tabela `services` do Financeiro, não tenho certeza se existe também em `eloi_servicos` — o `list_tables` que rodei agora confirma que **não** existe hoje em `eloi_servicos` (só `data_pagamento`). Corrigido acima antes de eu errar o DDL — mantenho só `data_pagamento`, que é o que existe de fato.

**Storage — única migration real deste pacote**, bucket novo (o primeiro público do projeto; os 2 existentes, `anexos` e `eloi-notas`, são privados):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-marca','entregas-marca', true, 26214400,
        array['image/svg+xml','image/png','application/json','application/zip'])
on conflict (id) do nothing;
-- sem RLS policy: leitura pública é padrão de bucket público (ignora RLS),
-- escrita só via signed upload URL emitida pelo gateway com service-role key.
```

Nenhuma tabela nova de sessão/auditoria/log — deliberadamente não construída (ver seção 3). Se um dia precisar de trilha de auditoria (quem mudou o quê), o upgrade é uma tabela `eloi_audit(actor, action, payload, created_at)` alimentada por 1 linha de `insert` no fim de cada handler do gateway — não vale construir agora.

---

## 5. Edge functions — de 6 para 3, sem editar nenhuma página pública

| Função (hoje) | Destino |
|---|---|
| `eloi-gestao` | absorvida por `eloi-admin` |
| `briefing-links` | absorvida por `eloi-admin` (ações `briefinglinks.*`) |
| `orcamentos` | **dividida**: ações admin (list/create/update/delete/catalog_*) vão para `eloi-admin`; a função `orcamentos` **continua existindo com o mesmo nome/URL**, só que enxugada para conter apenas a ação `public_get` — zero edição na página pública `/orcamento/index.html`, que continua batendo no mesmo endpoint de sempre |
| `get-briefings` | aposentada (servia só o `/painel/` legado) |
| `get-ecommerce-briefings` | aposentada (servia só o `/painel-ecommerce/` legado) |
| `briefing-submit` | **inalterada** — pública, sem senha, protegida por token, já era o padrão correto |

**Resultado final: 3 edge functions.**

1. **`eloi-admin`** — gateway autenticado (sessão HMAC da seção 3), todas as ações abaixo, namespacing por ponto (convenção que `eloi-gestao` já usava, vira padrão único):

```
auth.login              {password} -> {token, exp}

dashboard.stats         -> métricas consolidadas (funde o que /admin/ hoje monta
                            client-side chamando 2 funções: clientes ativos, serviços
                            em execução/a receber, briefings pendentes/respondidos,
                            orçamentos por status, marcas publicadas)

clientes.list / .upsert / .delete      (porta 1:1 de eloi-gestao)
servicos.list / .upsert / .delete      (porta 1:1, filtros cliente_id/status/pago/mês)
nf.upload_url / nf.view_url            (porta 1:1, signed URL no bucket eloi-notas)

briefinglinks.list / .create / .delete (porta de briefing-links, renomeada p/ namespace)
briefings.legado_list  {source:'briefings'|'ecommerce_briefings'}
                        -> leitura das 2 tabelas legadas, só para a aba "Legado"

orcamentos.list / .create / .update / .delete   (porta das ações admin de orcamentos)
catalogo.list / .upsert / .delete               (porta de catalog_* de orcamento-inteligente)

marca.upload_urls  {slug, paths:[...]}  -> batch de createSignedUploadUrl (mesmo padrão de nf.upload_url, em lote)
marca.publish       {cliente_id, slug}  -> seta eloi_clientes.marca_slug + marca_publicada=true
                                            (só chamado depois que TODOS os uploads confirmam ok)
marca.unpublish      {cliente_id}       -> marca_publicada=false (esconde a página pública sem apagar arquivo)
```

2. **`orcamentos`** — pública, sem senha, só a ação `public_get` (share_token) — mesmo nome, mesma URL, mesmo contrato de sempre.
3. **`briefing-submit`** — pública, sem senha, inalterada.

Por que não "1 função só, sempre" (nem para as públicas): misturar o código que compara `ADMIN_PASSWORD`/token de sessão com o código que qualquer visitante anônimo pode invocar aumenta o raio de um bug — um `if (action==='public_get') skip auth` esquecido em um refactor futuro vira brecha. Separar por fronteira de confiança (autenticado vs anônimo) é a razão concreta para 3 funções em vez de 1, não conveniência de organização de arquivo.

CORS: hoje é configurado 6 vezes; vira 1 lugar para o admin + 2 lugares (inalterados) para as públicas.

---

## 6. Pipeline de geração de marca no navegador (módulo `entregas-marca`)

Baseado 1:1 na pesquisa já feita (Canvas API client-side venceu resvg-wasm por YAGNI — ver achados). Resumo do fluxo dentro do módulo novo:

1. Upload de SVG(s) mestre (`fill:currentColor`) — client valida por regex antes de aceitar (rejeita `<filter>`, `<text>`, `<image>`, `foreignObject` — os mesmos limites que os masters reais já respeitam, confirmado lendo `grafite.svg`).
2. Editor de paleta em tela (linhas nome+hex, add/remove) — estado só em memória até "Gerar".
3. "Gerar": por variação × cor —
   - recolorir via `replace(/fill:\s*currentColor/g, 'fill:'+hex)` (regex, mesma técnica do script Node atual)
   - rasterizar via `data:image/svg+xml` → `<img>` → `<canvas>.drawImage` → `toBlob('image/png')`, 2000px (full) + 480px (preview) — API nativa, sem `sharp`
   - tudo fica em blobs em memória, chave = mesmo path scheme da árvore de pastas atual (`<slug>/logo/<variacao>/<cor>.svg|png|preview.png`)
4. Monta `manifest.json` em memória (mesmo shape de hoje).
5. Monta o zip **client-side** com `fflate.zipSync` sobre os blobs já em memória (exclui `*.preview.png`) — 1 dependência vendored localmente (arquivo `fflate.min.js` copiado no repo, não CDN), a primeira lib client-side do site; justificada porque reescrever CRC32+central-directory de ZIP à mão é escopo real de bug, não "poucas linhas" — e só carrega nesta página de admin, nunca na pública.
6. 1 POST `marca.upload_urls` → uploads paralelos (limite ~6) direto pro Storage com o signed URL (header `apikey` com a chave publishable — ponto único ainda não confirmado 100% por fonte primária, vale um spike de 5 min antes de construir, como a pesquisa já flagou).
7. Só depois que **todos** os uploads confirmam, `marca.publish`.
8. Página pública `/entregas-marca/<slug>/` passa a ler `manifest.json` da URL pública do bucket (`.../object/public/entregas-marca/<slug>/manifest.json`) em vez de relativa — único edit necessário nela é trocar a constante `BASE` de `"."` para a URL do bucket; formato do link `/entregas-marca/<slug>/` que já foi mandado a clientes não muda.

Nada disso precisa de Deno com `sharp` nem de resvg-wasm — mantenho a recomendação da pesquisa.

---

## 7. Telas por módulo

- **Dashboard**: cards (clientes ativos, serviços em execução, a receber no mês, briefings pendentes, orçamentos abertos, marcas publicadas) + funil + atividade recente — hoje montado client-side com 2 chamadas; vira 1 chamada (`dashboard.stats`) no gateway.
- **Clientes**: tabela + modal upsert (reaproveita os campos já existentes, incl. `marca_slug`/`marca_publicada`) + guarda de delete (bloqueia se tem serviços) — porta 1:1 de `/gestao/`.
- **Serviços**: tabela com filtros (cliente/status/pago/mês) + modal upsert + upload de NF (reaproveita o padrão de signed upload) — porta 1:1.
- **Briefings** (3 abas): *Links ativos* (porta de `/painel-briefings/` — gerar/copiar/excluir link por tipo); *Respostas* (detalhe reaproveitando `recomendar()` + dicionários de rótulos, hoje duplicados entre 2 páginas, aqui vivem em 1 arquivo só, e ganham as ferramentas hoje presas em `/painel/` — mapa `COLOR_NAMES`, gerador de pendências, gerador de brief pra IA, imprimir/PDF); *Legado* (somente leitura de `briefings`+`ecommerce_briefings` via `briefings.legado_list`, arquivo histórico).
- **Orçamentos** (2 abas): *Orçamentos* (porta de `/painel-orcamentos/` — list/create/update/delete, copiar link público/WhatsApp inalterado); *Catálogo* (porta de `/orcamento-inteligente/` — CRUD do catálogo + calculadora "gerar orçamento a partir do catálogo").
- **Entregas de marca**: lista de clientes com seção de marca → editor por slug (upload de mestres, paleta, preview ao vivo, gerar, barra de progresso de upload em lote, publicar/despublicar) — módulo inteiramente novo, descrito na seção 6.
- **Aplicativos**: launcher inalterado, só perde a gambiarra de usar `get-briefings` como checador de senha (a sessão já existe globalmente na SPA).

---

## 8. Estrutura de arquivos (sem build, com 1 exceção justificada)

```
admin/
  index.html          shell: topbar, sidenav, #app, wordmark.svg injetado 1x, shared.css
  app.js              router (seção 2) + api() com Authorization Bearer + helpers de UI (toast/modal/tabela)
  shared.css          paleta --c950..--c100, aurora, tipografia, .btn/.btn-ghost, toast — hoje duplicado em ~8 arquivos, vira 1
  wordmark.svg         hoje inline e idêntico em 6 arquivos, vira 1 fetch + injeção
  vendor/fflate.min.js  única dependência externa client-side do site, vendored (não CDN)
  modules/
    dashboard.js
    clientes.js
    servicos.js
    briefings.js        (+ recomendar.js e labels.js compartilhados, hoje duplicados 2x)
    orcamentos.js        (inclui a sub-aba catálogo)
    entregas-marca.js
    aplicativos.js
```

**Duas exceções deliberadas à convenção "1 index.html standalone com tudo inline"**, ambas justificadas:
1. **N arquivos de módulo em vez de 1 arquivo gigante**: a tarefa pede "1 página HTML vira o app inteiro" no sentido de 1 *entry point*/1 sessão/1 deploy — não literalmente 2500+ linhas num arquivo só (soma das 8 páginas atuais). Cada módulo é um `<script defer src="modules/x.js">` plano (IIFE que se registra em `AdminApp`), sem ES modules, sem import maps, sem bundler — o navegador só busca N arquivos estáticos, exatamente como já faz hoje com CSS/JS inline, só que fatiado por responsabilidade. Zero passo de build continua verdadeiro.
2. **`fflate` vendored**: motivo already coberto na seção 6, só entra na página de admin (nunca na pública), e é vendored (arquivo local versionado no repo), não `<script src="cdn...">` — mantém "sem dependência de rede externa em runtime" mesmo abrindo exceção a "zero libs".

---

## 9. Ordem de migração

**Fase 0 — verificação, sem código**: confirmar se `/briefing/` e `/briefing-ecommerce/` (públicas) ainda escrevem direto em `briefings`/`ecommerce_briefings` ou já migraram 100% para o fluxo `briefing_links`+`briefing-submit` — decide se `get-briefings`/`get-ecommerce-briefings` podem morrer sem perda de dado futuro. Sem isso confirmado, mantenho `briefings.legado_list` como rede de segurança em vez de simplesmente dropar as tabelas da UI.

**Fase 1 — backend aditivo, zero downtime**: deploy de `eloi-admin` com todas as ações da seção 5, **ao lado** das funções antigas (nada é removido ainda — as 8 páginas atuais continuam 100% funcionais, risco zero). Cria o bucket `entregas-marca`.

**Fase 2 — shell + auth + clientes + serviços**: SPA nova sobe fora do caminho de produção (ex.: pasta temporária ou branch preview da Vercel), QA do Wilke em paralelo com `/gestao/` antiga ainda no ar como fallback.

**Fase 3 — briefings + orçamentos**: módulos portados, apontando para `eloi-admin` (+ `orcamentos` já enxuta para `public_get`). `/painel-briefings/`, `/painel-orcamentos/`, `/orcamento-inteligente/` seguem no ar como fallback durante o QA.

**Fase 4 — entregas-marca**: pipeline da seção 6 construído e testado ponta-a-ponta contra um slug de teste (não `georgia-andrade` direto) até o output bater visualmente com o que está commitado hoje em `entregas-marca/georgia-andrade/`. Só depois migra o cliente real: sobe os masters pela UI nova, gera, publica, confere a página pública, e só então os arquivos estáticos antigos do git podem ser removidos (ou ficam congelados 1 ciclo como fallback).

**Fase 5 — troca da porta de entrada**: `/admin/index.html` vira de fato o shell da SPA. As pastas antigas (`/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/orcamento-inteligente/`) recebem um stub de redirect (`location.replace('/admin/#/clientes')` etc.) em vez de serem apagadas — preserva bookmark, zero link quebrado, apagável depois com confiança.

**Fase 6 — aposentadoria**: depois de estável, remove `get-briefings`, `get-ecommerce-briefings`, as versões antigas de `eloi-gestao`/`briefing-links`, e os stubs de redirect de `/painel/`/`/painel-ecommerce/`.

**Fase 7 (não construir agora)** — URLs bonitas via `pushState`+`vercel.json`, se um dia pedirem. Flag explícito de YAGNI.

---

## 10. Páginas públicas — por que nenhum link quebra

| Página pública | Link já em posse de cliente | O que muda por baixo | Edit necessário na página? |
|---|---|---|---|
| `/orcamento/?t=<share_token>` | formato do link, nunca muda | função `orcamentos` enxuta, mesmo nome/URL/contrato `public_get` | **nenhum** |
| `/entregas-marca/<slug>/` | formato do link, nunca muda | `entrega.js`: `BASE` de `"."` para URL pública do bucket | 1 constante (fora do escopo da fusão, mas inevitável — sem isso a página não existiria sem commit git por cliente) |
| `/briefing*/?t=<token>` (4 tipos) | formato do link, nunca muda | nenhuma — `briefing-submit` inalterada | nenhum |
| `/orcamento-precampanha/` e `/cliente/` | não usa token, fluxo próprio | fora do escopo desta fusão, não investigado aqui | nenhum planejado |

---

## 11. Riscos herdados — o que a Arquitetura B resolve, mitiga ou deixa de fora

- **Resolve**: segredo duplicado 5x (#6/#8 do levantamento) → 1 secret, 1 gateway. Sessão "colada por acidente" (#6) → sessão real com expiração, mesma UX. CSS/wordmark/`recomendar()` duplicados → 1 arquivo cada.
- **Mitiga**: falta de backup (#2) → Fase 1 é aditiva/paralela, nada é destruído até Fase 6, com fallback funcional em cada fase.
- **Deixa de fora deliberadamente (YAGNI)**: sessão de usuário real via Supabase Auth/JWT rotativo (1 usuário não justifica); tabela de auditoria; URLs bonitas com pushState; deleção de arquivos de Storage ao despublicar marca.
- **Ainda pendente, fora do meu escopo de leitura desta vez**: confirmar (Fase 0) se as páginas públicas de briefing legado ainda escrevem nas tabelas `briefings`/`ecommerce_briefings` antes de considerar `get-briefings`/`get-ecommerce-briefings` seguras para aposentar de vez.

---

## Arquivos e fontes usados nesta proposta (nenhum escrito/editado)

Leitura via MCP Supabase, somente leitura, projeto `nlamznxoocmygfvnqcns`: `list_tables` (schema `public`, verbose) e `execute_sql` (`select` em `storage.buckets`) — rodados agora para validar o schema exato usado na seção 4 e confirmar os 2 buckets existentes na seção 4/6. Todo o resto desta proposta usa os achados de pesquisa já fornecidos como base factual, conforme instruído. Nenhum arquivo do repo `briefing-eloidesign-repo` foi criado, editado ou apagado.


---

# Proposta C — Admin Unificado Multi-página com SSO Real


# Proposta C — Admin unificado, multi-página, sessão real verificada no servidor

Continua a convenção do repo (páginas HTML estáticas standalone, sem build, sem framework, deploy Vercel + Supabase Edge Functions). O que muda: as páginas passam a viver todas sob `/admin/<modulo>/`, compartilham 1 CSS/JS de shell, e a autenticação deixa de ser "senha hardcoded comparada em texto claro em 5 functions" para virar 1 mecanismo real de sessão (token opaco, guardado com hash no banco, com expiração e revogação) verificado no servidor a cada chamada.

Escopo confirmado fora da fusão: `/orcamento/?t=`, `/entregas-marca/<slug>/`, `/briefing/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/`, `/briefing-ecommerce/` — essas continuam exatamente como estão.

---

## 1. Estrutura de pastas/rotas final

```
/admin/
  login/index.html              ← única tela com formulário de senha
  index.html                    ← dashboard (funil + financeiro resumido)
  clientes/index.html           ← CRUD de eloi_clientes
  servicos/index.html           ← CRUD de eloi_servicos + dashboard financeiro
  briefings/index.html          ← briefing_links (fluxo novo) + abas legado (briefings, ecommerce_briefings)
  orcamentos/index.html         ← orcamentos (propostas) + catalogo_servicos (calculadora)
  marca/index.html              ← NOVO: gerador de variações de marca no navegador
  aplicativos/index.html        ← launcher (inalterado, só troca o gate)
  _shared/
    admin.css                   ← paleta, aurora, tipografia, .btn, toast — hoje duplicado em 8 arquivos
    admin-shell.js               ← wordmark inline (1x), topbar/nav, adminFetch(), guard de sessão
    wordmark.svg                 ← fonte única do SVG hoje colado em 6 arquivos

edge-functions/
  admin-auth/          (NOVO)   ← login, logout, logout_all, session.check
  eloi-gestao/         (existe) ← clientes.*, servicos.*, nf.*, dashboard.stats — troca auth
  briefing-links/      (existe) ← create/delete/list + legacy.briefings.list + legacy.ecommerce.list
  orcamentos/          (existe) ← list/create/update/delete/catalog_* (admin) + public_get (público, inalterado)
  briefing-submit/     (existe) ← inalterada, pública, por token
  marca/               (NOVO)   ← upload_urls (signed batch pro bucket entregas-marca)
  _shared/
    auth.ts             ← requireSession(req), usado por toda function "admin"
    cors.ts              ← se já existir um helper de CORS no repo, reaproveitar; senão, 1 arquivo novo

  APOSENTADAS: get-briefings, get-ecommerce-briefings
  (funcionalidade absorvida por briefing-links.legacy.*; ver seção 6)
```

Páginas públicas (`/orcamento/`, `/entregas-marca/<slug>/`, `/briefing*/`) continuam soltas na raiz, sem `/admin/` — não fazem parte desta reorganização.

---

## 2. Mecanismo de sessão — servidor-verificada, em detalhe

### Por que não JWT
Um único usuário admin (o Wilke), sem necessidade de claims/roles/multi-tenant. Token opaco + tabela de sessões no Postgres é mais simples que assinar/verificar JWT, é revogável de verdade (basta apagar a linha — JWT teria que esperar expirar ou manter blocklist, que é a mesma tabela de novo), e reaproveita o Postgres que já está ali. `extensions.gen_random_bytes`/`extensions.crypt`/`extensions.gen_salt` já são usados no schema atual (`briefing_links.token` usa `encode(extensions.gen_random_bytes(16),'hex')`) — confirma que **pgcrypto já está instalado e exposto**, então hashing de senha e de token não precisa de nenhuma lib nova, só SQL nativo.

### Fluxo
1. **Login** (`admin-auth` action `login`, único endpoint que aceita senha em texto claro, só nesta chamada):
   - `select id, password_hash, failed_attempts, locked_until from admin_users where username=$1`
   - Se `locked_until > now()` → 423, mensagem de bloqueio.
   - Verifica `extensions.crypt(senha_recebida, password_hash) = password_hash`.
   - Falhou: `failed_attempts += 1`; se `>= 10`, seta `locked_until = now() + 15min`.
   - Sucesso: gera token aleatório de 32 bytes (`crypto.getRandomValues`, nativo do runtime Deno — nenhuma lib), calcula `sha256(token)` (Web Crypto `crypto.subtle.digest`, também nativo), insere em `admin_sessions` com `expires_at = now() + 30 dias`, zera `failed_attempts`. Devolve **o token cru, uma única vez**, na resposta JSON — nunca mais sai do cliente em texto (fica em `localStorage`).

2. **Toda chamada admin subsequente** manda `Authorization: Bearer <token>` (trocando o padrão atual de `{password}` no corpo). Cada edge function "admin" abre com:
   ```ts
   const session = await requireSession(req); // lança 401 se inválido/expirado/revogado
   ```
   `requireSession` faz o hash do token recebido, busca por `token_hash` (nunca compara token cru — se o banco vazar, os tokens não vazam reversíveis), confere `expires_at`/`revoked_at`, e em caso de sucesso **desliza a expiração** (`update ... set last_seen_at=now(), expires_at=now()+30d`) — sessão ativa nunca expira no meio do uso, sessão parada expira sozinha em 30 dias.

3. **Logout** (`admin-auth` action `logout`): apaga/revoga a linha da sessão atual — logout de verdade, não só "esquece a senha no client" como hoje.
   **Logout everywhere** (`logout_all`): revoga todas as sessões do usuário — útil se o token vazar.

4. **401 tratado em 1 lugar só**: `admin-shell.js` expõe `adminFetch(fn, body)` que injeta o header, e em qualquer 401 limpa o `localStorage` e redireciona pra `/admin/login/`. Hoje isso é feito de 4 jeitos diferentes (ou não é feito) em 8 páginas — vira 1 função, 1 comportamento, consumida por todos os módulos. Resolve a inconsistência nº2 do levantamento.

### O que fica deliberadamente simples (single-user, sem inventar o que não foi pedido)
- `admin_users` é modelado com `username` (não amarrado a "1 linha só" no schema) para não fechar a porta a um segundo admin um dia, mas **não há tela de cadastro/convite** — Wilke é o único usuário confirmado; se precisar trocar a senha, roda 1 `update` via SQL (`password_hash = extensions.crypt('nova', extensions.gen_salt('bf'))`). Tela de "alterar senha" fica pra depois, se pedirem.
- Sem job de limpeza de sessões expiradas (`pg_cron` etc.) — volume é de poucas linhas pra sempre (1 usuário), sessão expirada só é ignorada pelo `expires_at` no `where`. Adicionar limpeza só se a tabela crescer de forma que não vai crescer.
- Sem CSRF token — não há cookie, o transporte é `Authorization` header lido só por JS same-origin-fetch explícito, então não há o cenário de CSRF clássico (form/GET automático de outro site carregando cookie).

---

## 3. Modelo de dados completo (DDL sketch)

### 3.1 Novas — autenticação (aditivas, não tocam em nada existente)

```sql
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,          -- extensions.crypt(senha, extensions.gen_salt('bf'))
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique,      -- sha256(token) hex; token cru nunca é persistido
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text
);
create index admin_sessions_expires_idx on public.admin_sessions (expires_at);

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
-- sem policies para anon/authenticated — acesso só via edge function com service-role,
-- igual ao padrão já documentado em db/eloi-gestao.sql para o bucket eloi-notas.
```

### 3.2 Existentes — confirmadas via `list_tables` (produção real, `nlamznxoocmygfvnqcns`), sem nenhuma recriação

> Correção que já estava registrada na sessão: as 4 tabelas do "AVISO IMPORTANTE" (`briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`) e `catalogo_servicos` **já existem em produção com RLS ativo** — só estão vazias (0 linhas), não inexistentes. O DDL abaixo é a reconstrução fiel do que já está lá, para referência da migração — nenhum `create table` real roda sobre elas.

```sql
-- eloi_clientes (1 linha em produção hoje)
create table public.eloi_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#7B2CBF',
  contato text,
  created_at timestamptz not null default now(),
  marca_slug text unique,
  marca_publicada boolean not null default false
);

-- eloi_servicos
create table public.eloi_servicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.eloi_clientes(id),
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

-- briefing_links (fluxo novo, por token)
create table public.briefing_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(16),'hex'),
  cliente text,
  tipo text not null,                 -- 'briefing' | 'briefing-ecommerce' | 'briefing-solarium' | 'briefing-guia-viver-bem'
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  nome text, email text, whatsapp text, empresa text,
  raw jsonb
);

-- orcamentos (propostas/orçamentos)
create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cliente text,
  titulo text,
  status text default 'rascunho',
  itens jsonb default '[]',
  valor_total numeric default 0,
  observacoes text,
  link text,                          -- link manual alternativo (ver inconsistência nº5 do levantamento)
  share_token uuid not null default gen_random_uuid(),
  numero int default nextval('orcamentos_numero_seq')
);

-- catalogo_servicos (usado por /admin/orcamentos/ aba Catálogo)
create table public.catalogo_servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  preco_base numeric not null default 0,
  unidade text not null default 'un',
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- briefings (LEGADO — colunas fixas, 0 linhas hoje, mantido só leitura em /admin/briefings/ aba "Arquivo")
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text,
  q1 text, q2 text, q3 text, q4 text, q5 text, q6 text, q7 text, q8 text, q9 text,
  q10_descricao text, q10_link text,
  q11_cores text, q11_texto text,
  q12 text, q13 text, q14 text, q15 text, q16 text, q17 text, q18 text, q18_outro text,
  raw jsonb,
  numero int default nextval('briefings_numero_seq')
);

-- ecommerce_briefings (LEGADO — 0 linhas hoje, mesmo tratamento)
create table public.ecommerce_briefings (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text, empresa text,
  raw jsonb
);
```

### 3.3 Storage — bucket novo para `/admin/marca/`

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-marca','entregas-marca', true, 26214400,
        array['image/svg+xml','image/png','application/json','application/zip'])
on conflict (id) do nothing;
-- primeiro bucket público do projeto — sem RLS policy necessária (leitura pública é
-- propriedade do bucket; escrita só via signed URL emitida pela function `marca` com service-role).
```

Nenhuma tabela nova para o estado da marca (variações/paleta/manifest): `manifest.json` dentro do próprio bucket já é a fonte da verdade — criar uma tabela `marca_geracoes` seria estado especulativo duplicando o que o Storage já guarda.

### 3.4 Zona proibida — confirmada via `list_tables`, nunca tocar

`workspaces`, `clients`, `services`, `transactions`, `categories`, `cards`, `recurrences`, `budgets`, `shared_expenses`, `shared_participants`, `shared_charges`, `invites`, `workspace_members`, `monthly_goals`, `push_subscriptions`, `app_secrets` — pertencem ao ELOI Financeiro, mesmo projeto Supabase. `clients`/`services` são case de colisão de nome direto com `eloi_clientes`/`eloi_servicos`; qualquer SQL desta migração usa allowlist explícita (`eloi_*` + `admin_users`, `admin_sessions`, `briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`, `catalogo_servicos`), nunca wildcard.

---

## 4. Edge functions e actions

| Function | Actions | Auth |
|---|---|---|
| `admin-auth` (NOVO) | `login`, `logout`, `logout_all`, `session.check` | `login` é o único endpoint que recebe senha; os demais exigem sessão válida |
| `eloi-gestao` (existe) | `clientes.list/upsert/delete`, `servicos.list/upsert/delete`, `nf.upload_url/view_url`, `dashboard.stats` | `requireSession` (trocou de `password` no corpo) |
| `briefing-links` (existe, estendida) | `create`, `delete`, `list`, **`legacy.briefings.list`** (nova), **`legacy.ecommerce.list`** (nova) | `requireSession` |
| `orcamentos` (existe) | `list/create/update/delete`, `catalog_list/catalog_save/catalog_delete` (admin) — **`public_get`** (pública, por `share_token`, inalterada) | admin: `requireSession` / `public_get`: sem sessão, como hoje |
| `briefing-submit` (existe) | (default, sem `action`) | pública, por token — inalterada |
| `marca` (NOVO) | `upload_urls` `{slug, paths[]}` → signed upload batch no bucket `entregas-marca` | `requireSession` |

Publicação de marca (`marca_publicada: true`) **não** é uma action nova — o frontend de `/admin/marca/` chama `eloi-gestao` `clientes.upsert` (já existe) depois que todos os uploads confirmarem OK. Evita duplicar lógica de escrita em `eloi_clientes` em duas functions.

`get-briefings` e `get-ecommerce-briefings` são **aposentadas**: hoje só existem pra validar senha e devolver 2 tabelas legadas com 0 linhas — isso vira `legacy.briefings.list`/`legacy.ecommerce.list` dentro de `briefing-links`, que já é o domínio de "respostas de briefing".

---

## 5. Shell compartilhado

`/admin/_shared/admin.css` — 1 arquivo com a paleta `--c950`…`--c100`, aurora animado, tipografia, `.btn`/`.btn-ghost`, toast: hoje copiado em 8 arquivos, referenciado via `<link rel="stylesheet" href="/admin/_shared/admin.css">` em cada módulo. Zero build step — é só HTML apontando pra um CSS estático, o próprio Vercel serve.

`/admin/_shared/admin-shell.js`:
```js
const FN_BASE = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1";
const TOKEN_KEY = "eloi_admin_token";

async function adminFetch(fn, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    location.href = "/admin/login/";
    throw new Error("unauthorized");
  }
  return res.json();
}

async function requireAdminSession() {
  if (!localStorage.getItem(TOKEN_KEY)) { location.href = "/admin/login/"; return; }
  await adminFetch("admin-auth", { action: "session.check" }); // 401 já redireciona sozinho
}

function renderAdminNav(active) { /* injeta wordmark + nav dos 6 módulos, marca `active` */ }
```

Cada `index.html` de módulo chama `requireAdminSession()` no load e usa `adminFetch()` pra tudo — resolve as 4 implementações divergentes de fetch+401 hoje espalhadas (inconsistências nº1/nº2 do levantamento).

---

## 6. Pipeline de geração de marca (módulo `/admin/marca/`)

Decisão já validada na pesquisa desta sessão, incorporada aqui como parte do módulo:

1. Admin sobe SVG(s) mestre (`fill:currentColor`) e edita a paleta (nome+hex) — tudo em memória.
2. "Gerar": por variação×cor — recolore via regex (`fill:\s*currentColor` → hex, mesma lógica do script Node atual), rasteriza via `data:image/svg+xml` → `<img>` → `<canvas>.drawImage` → `toBlob('image/png')` (2000px full + 480px preview), 100% Canvas API nativa, sem lib.
3. Monta `manifest.json` em memória.
4. Zipa client-side com `fflate.zipSync` sobre os blobs já em memória (única dependência externa do site inteiro, carregada só nesta página admin).
5. 1 POST pra `marca` `{action:"upload_urls", slug, paths}` → recebe signed URLs em lote.
6. Browser faz `PUT` direto pros signed URLs (paralelo, limite ~6) — precisa do header `apikey` (o Storage exige mesmo com function `verify_jwt` desligado; confirmar com spike de 5 min antes de construir).
7. Só depois de **todos** os uploads confirmarem, chama `eloi-gestao` `clientes.upsert {marca_publicada:true}`.
8. Página pública `/entregas-marca/<slug>/` vira template genérico lendo `manifest.json` direto da URL pública do Storage — elimina a necessidade de commitar 1 `index.html` por cliente no git.

Custo: ~10.5MB/cliente, folgado em qualquer tier (free ou Pro) — não é gargalo, não precisa de otimização agora.

---

## 7. Telas por módulo

- **`/admin/login/`** — usuário + senha; mensagem de bloqueio se `locked_until` ativo.
- **`/admin/` (dashboard)** — funil briefing→orçamento→cliente fechado, resumo financeiro do mês, atividade recente (reaproveita a lógica hoje espalhada entre hub e `dashboard.stats`).
- **`/admin/clientes/`** — lista com busca, modal novo/editar (nome, cor, contato, `marca_slug`, toggle `marca_publicada`, botão "abrir marca" → `/admin/marca/?cliente=<id>`), exclusão bloqueada se tem serviços vinculados.
- **`/admin/servicos/`** — lista com filtros (cliente/status_execucao/pago/mês), modal novo/editar, upload de NF (signed upload, mesmo padrão de `eloi-notas`), cards de resumo financeiro.
- **`/admin/briefings/`** — aba "Links & Respostas" (gerar link por cliente/tipo, listar/ver respostas via `briefing_links`) + aba "Arquivo (legado)" somente leitura (`briefings` + `ecommerce_briefings`).
- **`/admin/orcamentos/`** — aba "Propostas" (lista, criar/editar, itens, valor total, copiar link público `/orcamento/?t=<share_token>`, status) + aba "Catálogo" (CRUD `catalogo_servicos`) + aba "Calculadora" (a UI de `orcamento-inteligente` hoje, gera proposta a partir do catálogo).
- **`/admin/marca/`** — seletor de cliente, upload de SVG(s) mestre, editor de paleta, grid de preview (variação×cor), botão gerar, barra de progresso de upload, botão publicar com link público resultante.
- **`/admin/aplicativos/`** — launcher inalterado, só troca o gate de senha por `requireAdminSession()`.

---

## 8. Ordem de migração, com redirects

Fases pensadas pra nunca deixar uma tela financeira quebrada no meio do caminho: prova a sessão nova num módulo sem dado sensível antes de tocar em `eloi-gestao`.

**Fase 0 — Fundação (aditiva, zero risco às páginas atuais)**
- Roda migration criando `admin_users`/`admin_sessions` (não toca nas 7 tabelas existentes).
- Semeia 1 linha em `admin_users` com hash da senha atual (`eloidesign2026`) — nada quebra, páginas antigas continuam no esquema velho.
- Deploy de `admin-auth`.
- Nenhuma página muda ainda.

**Fase 1 — Shell + módulo piloto (marca, sem legado pra quebrar)**
- Cria `/admin/_shared/admin.css` + `admin-shell.js` + `/admin/login/`.
- Constrói `/admin/marca/` do zero já com sessão real — é o módulo novo, sem página antiga equivalente, então valida o mecanismo de auth com o menor blast radius possível antes de tocar em dinheiro de cliente.

**Fase 2 — Financeiro (`/gestao/` → `/admin/clientes/` + `/admin/servicos/`)**
- Migra `eloi-gestao` pra `requireSession`.
- Constrói as 2 páginas novas; roda em paralelo com `/gestao/` por um período curto de validação (schema não muda, então as 2 UIs podem coexistir apontando pro mesmo banco).
- `vercel.json`: `/gestao/:path*` → `/admin/servicos/` (302 enquanto valida, depois 301).

**Fase 3 — Briefings (`/painel-briefings/`, `/painel/`, `/painel-ecommerce/` → `/admin/briefings/`)**
- Estende `briefing-links` com `legacy.briefings.list`/`legacy.ecommerce.list`.
- Confirma (via `select count(*)`) que `briefings`/`ecommerce_briefings` seguem em 0 linhas antes de aposentar as functions antigas.
- Aposenta `get-briefings`, `get-ecommerce-briefings`.
- Redirects: `/painel-briefings/:path*`, `/painel/:path*`, `/painel-ecommerce/:path*` → `/admin/briefings/`.

**Fase 4 — Orçamentos (`/painel-orcamentos/`, `/orcamento-inteligente/` → `/admin/orcamentos/`)**
- Mesma function `orcamentos`, só troca auth das actions admin; `public_get` intocada.
- Redirects: `/painel-orcamentos/:path*`, `/orcamento-inteligente/:path*` → `/admin/orcamentos/`.

**Fase 5 — Aplicativos + hub antigo**
- `/aplicativos/` → `/admin/aplicativos/` (troca só o gate).
- `/admin/` hub antigo é substituído pelo novo dashboard em `/admin/index.html` — sem redirect necessário, é o mesmo path com conteúdo novo.
- Redirect: `/aplicativos/:path*` → `/admin/aplicativos/`.

**Fase 6 — Cleanup**
- Remove as constantes `PASSWORD = "eloidesign2026"` de todas as functions antigas.
- Deleta as functions aposentadas (`get-briefings`, `get-ecommerce-briefings`) de vez.
- Wilke troca a senha semeada na Fase 0 por uma definitiva via SQL direto.
- Todos os redirects viram `permanent:true` (301) depois de confirmado que ninguém mais bate nas URLs antigas (checar `get_logs` das functions antigas por alguns dias).

Todos os redirects entram em `vercel.json` (`redirects`), recurso nativo do Vercel — sem página HTML de redirect, sem JS de redirect, sem novo código.

```json
{
  "redirects": [
    { "source": "/gestao/:path*", "destination": "/admin/servicos/", "permanent": false },
    { "source": "/painel-briefings/:path*", "destination": "/admin/briefings/", "permanent": false },
    { "source": "/painel/:path*", "destination": "/admin/briefings/", "permanent": false },
    { "source": "/painel-ecommerce/:path*", "destination": "/admin/briefings/", "permanent": false },
    { "source": "/painel-orcamentos/:path*", "destination": "/admin/orcamentos/", "permanent": false },
    { "source": "/orcamento-inteligente/:path*", "destination": "/admin/orcamentos/", "permanent": false },
    { "source": "/aplicativos/:path*", "destination": "/admin/aplicativos/", "permanent": false }
  ]
}
```

Páginas públicas (`/orcamento/`, `/entregas-marca/<slug>/`, `/briefing*/`) não entram nessa lista — não movem.

---

## 9. O que fica de fora deliberadamente (YAGNI)

- Tela de cadastro/gestão de múltiplos admins — 1 usuário confirmado, schema já comporta um segundo se um dia precisar, mas nenhuma UI é construída pra isso agora.
- Job de limpeza de sessões expiradas — volume é trivial pra sempre.
- Tabela dedicada de estado de geração de marca — o `manifest.json` no Storage já é a fonte da verdade.
- Rotação automática de segredo/JWT — token opaco revogável cobre o requisito de "sessão real verificada no servidor" sem a complexidade de assinatura/verificação de JWT que ninguém pediu.
