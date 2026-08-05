# Plano Final — Admin Unificado ELOI Design Studio

> Gerado em 2026-07-15 via workflow multiagente (10 agentes: 3 pesquisa + 3 propostas + 3 juízes + 1 síntese). Apêndices na mesma pasta: mapeamento do código atual, rasterização SVG→PNG, storage, propostas descartadas (B e C), vereditos completos dos 3 juízes.

## Resumo executivo

Depois de 3 propostas arquiteturais e 3 vereditos independentes, a decisão é **Proposta A (Shell mínimo) como base**, ganhadora unânime nos 3 vereditos (nota média 22,0 contra 15,7 de C e 15,3 de B) por ser a que menos arrisca o financeiro real do Wilke (1 cliente já cadastrado, 1 PDF de nota fiscal já no bucket) e a que mais respeita a filosofia do repo (HTML estático standalone, zero build). Sobre essa base eu enxerto 2 ideias pontuais das propostas perdedoras que os próprios juízes validaram como ganho sem custo real: da Proposta B, a **deduplicação de `recomendar()`/dicionários de rótulo** (hoje copiados 2x) para um arquivo compartilhado; da Proposta C, a **verificação de dado legado antes de aposentar tabela** e a **rotação de senha antecipada** (não deixada para uma fase "opcional futura", que foi apontada como o maior furo de segurança residual de A pelos 3 juízes). Overengineering explícito da Proposta C (bcrypt, lockout de conta, tabela `admin_users` multi-usuário) e o gateway monolítico de risco concentrado da Proposta B **não entram** — nenhum dos dois foi pedido e ambos foram marcados como excesso pelos juízes.

## Comparativo das propostas

| Proposta | Nota média (3 juízes) | Principal risco apontado | Veredito |
|---|---|---|---|
| **A — Shell mínimo** | **22,0** | "Unificação" fica só na casca (login+topbar); pastas continuam soltas; fallback de senha antiga sem prazo de expiração | **Escolhida como base** |
| C — Multi-página + SSO real | 15,7 | Bcrypt + lockout + schema multi-admin para 1 usuário único (over-engineering sem ameaça real); `vercel.json` como vetor de risco de infra em todo o site | Ideias pontuais aproveitadas (verificação de legado, rotação de senha cedo) |
| B — SPA única | 15,3 | Gateway `eloi-admin` único concentra todo o blast radius; divide a function pública `orcamentos` que já serve link real de cliente; sem action de logout | Ideia pontual aproveitada (dedup de `recomendar()`/labels) |

## Arquitetura escolhida

### IA / navegação
Estrutura de pastas **não muda** — decisão deliberada, não omissão. Reorganizar tudo sob `/admin/<modulo>/` (o que C propõe) exige `vercel.json` com redirects, a única peça de infra das três propostas com escopo *todo o site*, não só o admin — os 3 juízes marcaram isso como risco desnecessário para o que foi pedido. O requisito "1 login, 1 navegação" é atendido por uma topbar compartilhada, não por mover URLs:

```
/admin/                  → hub / dashboard
/gestao/                 → clientes + serviços + financeiro
/painel-briefings/       → geração de link + respostas (fluxo novo, tokenizado)
/painel-orcamentos/      → orçamentos/propostas
/orcamento-inteligente/  → calculadora por catálogo
/marca/                  → NOVO — gerador de variações de marca
/aplicativos/            → launcher (ELOI Financeiro externo)
/painel/                 → legado, mantém-se enquanto Fase 4 não confirmar retirada
/painel-ecommerce/       → legado, idem
```
Páginas públicas (`/orcamento/?t=`, `/entregas-marca/<slug>/`, `/briefing*`) **não entram no shell** — sem topbar admin, sem token de sessão.

Se um dia Wilke quiser URL única de verdade (`/admin/clientes`, `/admin/orcamentos`...), isso vira um projeto separado que reaproveita a auth e o shell construídos aqui — não vale construir agora sem pedido explícito (ver seção de riscos abertos, item 3).

### Mecanismo de autenticação unificado
1 secret, 1 tabela, 1 função nova, 1 helper compartilhado — sem bcrypt, sem lockout, sem tabela de usuários (são over-engineering para 1 usuário confirmado; se um segundo admin virar necessidade real, essa é a hora de adicionar `admin_users`, não antes).

**Tabela** `admin_sessions` (ver DDL completo abaixo).

**Função nova** `admin-auth`, 3 actions:
- `login {password}` → compara com `Deno.env.get("ADMIN_PASSWORD")` (secret, não mais hardcoded), insere linha em `admin_sessions`, devolve `{token, expires_at}`.
- `logout {token}` → `delete from admin_sessions where token=$1`.
- `logout_all {token}` → exige token válido, depois `delete from admin_sessions` (zera tudo — como é 1 usuário único, "sair de todos os lugares" é zerar a tabela inteira; cobre o cenário de token vazado, que a Proposta B deixou sem solução).

**Helper** `supabase/functions/_shared/auth.ts`:
```ts
export async function verifyAdminToken(body: any): Promise<boolean> {
  const token = body?.token;
  if (!token) return false;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("admin_sessions").select("expires_at").eq("token", token).single();
  if (!data || new Date(data.expires_at) < new Date()) return false;
  await supabase.from("admin_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() })
    .eq("token", token); // sessão desliza enquanto o Wilke usa o painel
  return true;
}
```

**Diferença deliberada em relação à Proposta A original**: nenhuma função existente ganha um fallback tipo `ADMIN_PASSWORD ?? "eloidesign2026"`. Isso foi apontado pelos 3 juízes como o furo mais concreto de A — a senha vazada no histórico do git continuaria válida indefinidamente. Em vez disso: cada função mantém a comparação literal antiga **intocada** até sua fase de swap chegar (Fase 3), e nesse swap o `if (body?.password !== PASSWORD)` é **substituído por completo** por `if (!(await verifyAdminToken(body)))` — sem string antiga sobrevivendo em lugar nenhum do código final. E a rotação do valor de `ADMIN_PASSWORD` entra logo na Fase 6 (não como "opcional futuro").

**Cliente** — `/assets/eloi-admin/auth.js`, incluído via `<script src="/assets/eloi-admin/auth.js">` em todo `index.html` admin, `localStorage` (não `sessionStorage` — decisão deliberada do requisito, sessão sobrevive a fechar aba, mitigada pela expiração de 12h deslizante):
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
Resolve de graça a inconsistência de tratamento de 401 (hoje só `/gestao/` desloga sozinho em qualquer chamada; as outras 7 páginas fazem isso de formas diferentes ou não fazem).

### Rasterização SVG → PNG: Canvas API 100% client-side
Decisão validada de forma idêntica pelas 3 propostas e pela pesquisa técnica dedicada — não há divergência aqui, então não há trade-off a arbitrar:
- `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` → `new Image()` → `<canvas>.drawImage` → `canvas.toBlob('image/png')`. `data:` URL nunca tainta o canvas (confirmado via intent-to-ship do Chromium blink-dev).
- Gera 2000px (full) + 480px (preview) por variação×cor.
- **Sem `sharp`** (addon nativo, não roda em Deno Edge Function), **sem `resvg-wasm`** (viável mas seria dependência+build Docker novos para resolver o que o navegador já resolve de graça nos masters atuais: path único, fill chapado, sem filtro/texto/webfont).
- Fallback documentado se um master futuro usar filtro CSS complexo ou webfont: migrar só a etapa de rasterização para `@resvg/resvg-wasm` numa edge function — não construir agora.

### Storage
Bucket **novo, público** — o primeiro bucket público do projeto (os 2 existentes, `anexos` e `eloi-notas`, são privados):
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-marca', 'entregas-marca', true, 26214400,
        array['image/svg+xml','image/png','application/json','application/zip'])
on conflict (id) do nothing;
```
Sem RLS policy: leitura pública é propriedade do bucket `public=true`; escrita só via signed upload URL emitida pela edge function com service-role key. Custo/quota irrelevante na escala do negócio (~10,5MB/cliente medido em `georgia-andrade`; 1GB free tier ≈ 95 clientes, egress esperado muito abaixo do limite mensal).

## Modelo de dados completo

**Nada disto recria produção** — as 4 tabelas do "aviso importante" (`briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`) mais `catalogo_servicos` **já existem** com RLS ativo, confirmado via `list_tables`/`execute_sql` somente leitura nesta sessão. O DDL abaixo fecha a lacuna de versionamento (commitar em `db/`) e documenta o estado real — todo `create table` é `if not exists`, seguro para rodar contra um projeto novo do zero, sem efeito no banco atual.

**Allowlist obrigatória para qualquer SQL futuro deste projeto**: `eloi_clientes`, `eloi_servicos`, `briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`, `catalogo_servicos`, `admin_sessions`. O mesmo projeto Supabase hospeda ~15 tabelas do ELOI Financeiro (`clients`, `services`, `workspaces`, `transactions`, `categories`, `cards`, `recurrences`, `budgets`, `shared_expenses/participants/charges`, `invites`, `workspace_members`, `monthly_goals`, `push_subscriptions`, `app_secrets`) — `clients`/`services` colidem perigosamente de nome com `eloi_clientes`/`eloi_servicos`. Nunca gerar SQL sem apontar explicitamente para os nomes desta lista.

```sql
-- db/admin-auth.sql (NOVA)
create table if not exists public.admin_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours')
);
alter table public.admin_sessions enable row level security;
-- sem policies: só a service-role (edge functions) acessa.
```

```sql
-- db/eloi-gestao.sql (JÁ EXISTE, sem drift — incluído aqui só para referência completa)
create table if not exists public.eloi_clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cor             text not null default '#7B2CBF',
  contato         text,
  created_at      timestamptz not null default now(),
  marca_slug      text unique,
  marca_publicada boolean not null default false
);
alter table public.eloi_clientes enable row level security;

create table if not exists public.eloi_servicos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.eloi_clientes(id),
  descricao         text not null,
  valor_cents       bigint not null default 0,
  status_execucao   text not null default 'em_execucao'
                      check (status_execucao in ('em_execucao','concluida')),
  pago              boolean not null default false,
  data_pagamento    date,
  nf_numero         text,
  nf_arquivo_url    text,
  observacoes       text,
  created_at        timestamptz not null default now()
);
alter table public.eloi_servicos enable row level security;
```

```sql
-- db/briefing-links.sql (documentação — já existe em produção)
create table if not exists public.briefing_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  cliente      text,
  tipo         text not null, -- 'briefing' | 'briefing-ecommerce' | 'briefing-solarium' | 'briefing-guia-viver-bem'
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
-- db/orcamentos.sql (documentação — já existe em produção)
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
-- db/briefings-legado.sql (documentação — já existe em produção)
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
-- db/ecommerce-briefings-legado.sql (documentação — já existe em produção)
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
-- db/catalogo-servicos.sql (documentação — já existe em produção, 0 linhas hoje)
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

```sql
-- Storage — a única migration que produz efeito real em produção
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-marca', 'entregas-marca', true, 26214400,
        array['image/svg+xml','image/png','application/json','application/zip'])
on conflict (id) do nothing;
```

Nenhuma tabela nova para estado de geração de marca (variações/paleta) — `manifest.json` dentro do próprio bucket já é a fonte da verdade, criar uma tabela `marca_geracoes` seria estado especulativo duplicado.

## Edge functions

| Função | Status | Ação nesta migração |
|---|---|---|
| `admin-auth` | **NOVA** | `login`, `logout`, `logout_all` |
| `eloi-gestao` | existente | swap de auth (`password` → `verifyAdminToken`) + nova action `marca.upload_urls` |
| `orcamentos` | existente | swap de auth nas actions admin; `public_get` **intocada** (continua pública, sem sessão) |
| `briefing-links` | existente | swap de auth |
| `briefing-submit` | existente | **inalterada** — já é pública por token, correta desde sempre |
| `get-briefings` | existente, legado | swap de auth (ganha `token` real; hoje ignora `action`) — mantida até Fase 4 confirmar se pode aposentar |
| `get-ecommerce-briefings` | existente, legado | idem |

**Sem consolidação de funções** (diferente de B, que reduzia para 3 funções): manter `eloi-gestao`/`orcamentos`/`briefing-links` como estão, cada uma com seu próprio domínio, é o que limita o blast radius de um bug de deploy a 1 área de negócio por vez — exatamente o risco que os juízes apontaram como o maior furo de B.

`marca.upload_urls` em `eloi-gestao` (reaproveita 1:1 o padrão já existente de `nf.upload_url`, só em lote):
```ts
if (action === "marca.upload_urls") {
  const { slug, paths } = body; // paths: string[] com os caminhos dentro do bucket
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

## Pipeline de geração de marca no navegador

Módulo novo `/marca/`, do clique "Gerar" até o arquivo estar público e listado no manifesto:

1. **Selecionar cliente** — dropdown alimentado por `eloi-gestao` `clientes.list`, mostra `marca_slug`/`marca_publicada` atuais.
2. **Upload de SVG(s) mestre** (`fill:currentColor`) — `<input type="file" multiple accept=".svg">`, lido com `FileReader`, guardado em memória (`{variacaoId, svgText}`). Client valida por regex e rejeita `<filter>`, `<text>`, `<image>`, `foreignObject` antes de aceitar.
3. **Editor de paleta** na tela — lista `{nome, hex}` editável, add/remove linha, tudo em memória, sem rede.
4. **Clique "Gerar"** — loop client-side por variação × cor:
   - Recolorir: `svgText.replace(/fill:\s*currentColor/g, \`fill:${hex}\`)` (regex, mesma técnica do script Node atual `_tools/gerar-variacoes.mjs`).
   - Rasterizar: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` → `new Image()` → `<canvas>.drawImage` → `canvas.toBlob('image/png')`, gerando 2000px (full) e 480px (preview).
   - Guardar cada blob em memória com chave = path scheme: `<slug>/logo/<variacao>/<cor-slug>.svg|.png|.preview.png` (mesma função `slugify()` do script Node atual).
5. **Montar `manifest.json`** em memória (mesmo shape do manifesto atual).
6. **Montar o zip client-side** com `fflate.zipSync` sobre os blobs já em memória (excluindo `*.preview.png`), vendorizado em `/assets/vendor/fflate.min.js` — primeira dependência client-side do site, carregada só nesta página admin.
7. **1 POST** para `eloi-gestao` `{action:"marca.upload_urls", token, slug, paths:[...~107 caminhos]}` → recebe signed URLs em lote.
8. **Uploads paralelos** (limite ~6 simultâneos): `PUT` direto para cada `signed_url`, com header `apikey: <chave publishable/anon>` (obrigatório porque o Storage é outro serviço no gateway, mesmo com `verify_jwt` desligado na function — **spike de 5 min pra confirmar antes de construir**, é o único ponto não verificado 100% por fonte primária) e `cache-control: public, max-age=3600` (não `immutable` — o botão "gerar" pode rodar de novo com `upsert:true`).
9. **Só depois que TODOS os uploads confirmarem** `ok`, 1 POST final `eloi-gestao` `{action:"clientes.upsert", token, id, marca_slug, marca_publicada:true}` — evita publicar estado parcial se a geração cair no meio.
10. **Página pública** `/entregas-marca/<slug>/index.html` vira template genérico (1 arquivo, não mais 1 commit por cliente): lê `slug` da URL, `fetch(BASE + "/manifest.json")` direto da URL pública do bucket (`BASE = https://nlamznxoocmygfvnqcns.supabase.co/storage/v1/object/public/entregas-marca/<slug>`), monta a grade de download e o botão "baixar tudo" apontando pro zip já publicado.

## Telas do painel

- **Login** (compartilhada): mesmo HTML de senha que cada página já tem hoje, só o submit muda — chama `EloiAdminAuth.login(pw)` em vez de salvar a senha crua.
- **Dashboard** (`/admin/`): inalterado na lógica — segue agregando `briefing-links.list` + `orcamentos.list` client-side; ganha topbar/wordmark comuns.
- **Clientes / Financeiro** (`/gestao/`): CRUD de `eloi_clientes` (com badge de marca publicada/não e botão "abrir marca" → `/marca/?cliente=<id>`), CRUD de `eloi_servicos` com filtros (cliente/status/pago/mês), upload de NF (padrão signed URL já existente), dashboard financeiro do mês.
- **Briefings** (`/painel-briefings/` + `/painel/` + `/painel-ecommerce/` legados): gerar link por cliente/tipo (`briefing`, `briefing-ecommerce`, `briefing-solarium`, `briefing-guia-viver-bem`), listar/ver respostas via `briefing_links`; abas legadas somente-leitura de `briefings`/`ecommerce_briefings` reaproveitando `COLOR_NAMES`, gerador de pendências, gerador de brief pra IA e impressão/PDF que hoje só existem em `/painel/`.
- **Orçamentos** (`/painel-orcamentos/` + `/orcamento-inteligente/`): CRUD de propostas (itens, valor total, status, copiar link público/WhatsApp inalterado), aba Catálogo (CRUD `catalogo_servicos`), calculadora que gera orçamento a partir do catálogo.
- **Entregas de marca** (`/marca/`, NOVA): seletor de cliente → upload de SVG mestre(s) → editor de paleta → botão gerar (progresso por item) → grid de preview → botão publicar (habilitado só com 100% dos uploads confirmados).
- **Aplicativos** (`/aplicativos/`): launcher inalterado, só troca o gate de senha por `EloiAdminAuth`.

## Plano de migração faseado

**Fase 0 — Fundação de auth (aditivo puro, zero risco às páginas atuais)**
- Cria `admin_sessions`.
- Deploy `admin-auth` + `_shared/auth.ts` (função nova, ainda não referenciada por ninguém).
- Seta secret `ADMIN_PASSWORD` no projeto com o valor atual (tira do hardcode, zero mudança de comportamento).
- Testa manualmente: login → token + linha em `admin_sessions`; logout → linha apagada.
- Commita os 6 blocos `db/*.sql` da seção anterior (zero efeito em produção, fecha a lacuna de versionamento).

**Fase 1 — Shell visual + dedup (aditivo)**
- Extrai CSS/wordmark duplicados em 8 arquivos para `/assets/eloi-admin/admin.css` e `/assets/eloi-admin/wordmark.svg`.
- Extrai `recomendar()` + dicionários de rótulo (hoje duplicados entre `/painel-briefings/` e `/painel-ecommerce/`) para `/assets/eloi-admin/briefing-labels.js`.
- Nenhuma página consome isso ainda — só existe.

**Fase 2 — Canário: `/aplicativos/`**
- Troca senha→token nesta página primeiro: é a que hoje usa `get-briefings` só pra validar senha e descarta o payload — menor blast radius do conjunto.
- Aplica shell (CSS/wordmark) na mesma página.
- Valida login/logout/expiração de token na prática antes de tocar em qualquer dado real.

**Fase 3 — Rollout do padrão validado**
- Repete o swap de auth + shell em `eloi-gestao` → `briefing-links` → `orcamentos` → `/painel-orcamentos/` → `/painel-briefings/` → `/orcamento-inteligente/` → `/admin/` (hub).
- Cada página é 1 commit pequeno e independente — se uma quebrar, reverte só ela; as demais continuam funcionando.
- `eloi-gestao` (financeiro real) é tocada só depois de o padrão já estar validado no canário.

**Fase 4 — Verificação de legado + shell nos legados**
- Confirma via `select count(*)` que `briefings`/`ecommerce_briefings` seguem em 0 linhas (ou identifica se algum formulário público legado ainda escreve nelas — checagem herdada da Proposta C, custo baixo, evita apagar histórico por engano).
- Aplica swap de auth + shell em `get-briefings`/`get-ecommerce-briefings` e `/painel/`/`/painel-ecommerce/` — mantidas no ar, sem card novo no hub, decisão de aposentar de vez fica para depois da confirmação acima.

**Fase 5 — Módulo novo Entregas de Marca** (paralelo às fases 3-4, aditivo, não toca páginas existentes)
- Cria bucket `entregas-marca`.
- Adiciona action `marca.upload_urls` em `eloi-gestao`.
- Constrói `/marca/` completa.
- Vendoriza `fflate` em `/assets/vendor/fflate.min.js`.
- Testa o pipeline ponta-a-ponta com um **slug de teste** (não `georgia-andrade`) até o output bater visualmente com o que já está commitado hoje.
- Migra o template público `/entregas-marca/<slug>/index.html` para ler `manifest.json` da URL pública do bucket.
- Só depois, migra `georgia-andrade` de verdade: sobe os masters pela UI nova, gera, compara com o output atual, publica.

**Fase 6 — Rotação de senha + cleanup (ponto de não-retorno)**
- Troca o valor de `ADMIN_PASSWORD` por um novo — o valor atual já está no histórico do git e precisa parar de funcionar. **A partir daqui, qualquer página que não tenha passado pela Fase 3 para de autenticar** — por isso essa fase só roda depois de confirmar que todas as páginas admin já estão no fluxo de token.
- Remove qualquer `PASSWORD = "eloidesign2026"` residual esquecido em código.
- Confirma via `get_logs` das edge functions que ninguém mais bate direto com `{password: ...}` sem token.
- Congela (não apaga ainda) os arquivos estáticos antigos de `entregas-marca/georgia-andrade/` por 1 ciclo, como fallback.
- Decisão final sobre `/painel/`/`/painel-ecommerce/` (manter, redirecionar, desativar) fica para o Wilke, com base no resultado da Fase 4.

## Riscos abertos e decisões que só o Wilke pode tomar

1. **Aposentar `/painel/` e `/painel-ecommerce/`** (e suas 2 edge functions) — só depois da Fase 4 confirmar que as 0 linhas em `briefings`/`ecommerce_briefings` não escondem histórico perdido, ou que nenhum formulário público legado ainda escreve nelas.
2. **Popular `catalogo_servicos`** — pré-requisito de lançamento da calculadora "Orçamento inteligente", que hoje nasceria funcionalmente vazia; ninguém construiu essa etapa ainda, não faz parte desta fusão.
3. **Reestruturar URLs para `/admin/<modulo>/`** (padrão da Proposta C) — decisão consciente de **não fazer agora**, mantendo risco/esforço baixos. Se algum dia Wilke quiser essa fusão mais literal, é um projeto separado que reaproveita a auth e o shell construídos aqui, com `vercel.json` como peça nova de infra a testar isoladamente.
4. **Spike de 5 min pendente**: confirmar que o `PUT` direto no signed URL do Storage funciona com `fetch` puro + header `apikey` (anon/publishable key), sem adicionar `supabase-js` ao site — não é 100% confirmado por fonte primária, precisa ser testado antes de construir o pipeline de marca (Fase 5).
5. **Inconsistência de link público em `orcamentos`** — `linkPublico()` gera o link de 2 formas diferentes dependendo se o campo `link` manual está preenchido ou não; este plano não resolve isso, só documenta. Vale decidir se compensa padronizar.
6. **Quando apagar os arquivos estáticos antigos** de `entregas-marca/georgia-andrade/` depois da migração para o bucket — proposta é congelar por 1 ciclo (Fase 6), apagar depois com confiança.
7. **Segundo usuário admin** — este plano assume 1 usuário único (Wilke). Não construir suporte multi-usuário (login por username, tabela `admin_users`, etc.) a menos que ele confirme que isso é uma necessidade real e não hipotética.
8. **Janela de senha antiga ativa** — entre a Fase 0 (secret criado com o valor atual) e a Fase 6 (rotação), a senha `eloidesign2026` (já exposta no histórico do git) continua válida via `admin-auth`. Aceitável porque o valor já está comprometido de qualquer forma hoje, mas vale o Wilke saber que essa janela existe e não se estender além do necessário para completar as Fases 3-5.