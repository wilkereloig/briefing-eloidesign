
Sessão 100% leitura: `Read`/`Grep` no repo local e `execute_sql` SELECT-only + `get_edge_function`/`list_tables` no projeto `nlamznxoocmygfvnqcns`. Nada foi escrito no banco nem no repo. Achei também um plano anterior já pronto (`docs/painel-admin-unificado/plano.md`, gerado hoje) que cobre a fusão do admin do Wilke (login único, `admin_sessions`) — **ainda não aplicado no banco** (confirmei via `list_tables`: `admin_sessions` não existe em produção hoje). Esse plano é ortogonal ao pedido de hoje (área de CLIENTE, não do Wilke) mas dou os dois em conjunto porque reaproveito o mesmo padrão de sessão dele.

## 0. Investigação (passos 1 e 2 da tarefa)

**Campo `cliente`/`empresa`: texto livre digitado pelo Wilke, não dropdown — confirmado no código:**
- `painel-orcamentos/index.html:141` — `<input id="f_cliente" placeholder="Nome do cliente">`
- `painel-briefings/index.html:116` — `<input type="text" id="newCliente" placeholder="Ex: Solarium Cosméticos">`

Nenhum dos dois lê de `eloi_clientes`. Confirmação de que isso é arriscado, não hipotética — dado real de produção:

| Tabela | Linhas | Valor de `cliente`/`empresa` |
|---|---|---|
| `orcamentos` | **1** | `"Campanha 2026 (candidata)"` |
| `briefing_links` | **0** | — |
| `eloi_clientes` | 1 | `"Georgia Andrade"` (id `9963f88d-...`, slug `georgia-andrade`) |

O único orçamento real em produção **não bate com nenhum nome de cliente cadastrado** — é um rótulo de projeto/campanha, não o nome do cliente. Isso mata de vez qualquer ideia de backfill automático por match de string (`ILIKE`/similaridade): com 1 linha real, o "backfill" é 1 decisão manual do Wilke (é da Georgia? é um rascunho sem cliente definido ainda?), não um script. `briefing_links` tem 0 linhas — não há o que migrar, a coluna nasce vazia.

*(nota: `list_tables` mostra `rows: 0` para `orcamentos` — é estimativa de estatística do Postgres, defasada; `execute_sql` com `count(*)` real retornou 1. Usei o valor real.)*

## 1. Migração `cliente_id` (passo 3 da tarefa)

Aditiva, nullable, não quebra nada que já lê `cliente`/`empresa` como texto (página pública `/orcamento/?t=`, `painel-briefings` list, `briefing-submit`):

```sql
alter table public.orcamentos      add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.briefing_links  add column if not exists cliente_id uuid references public.eloi_clientes(id);
create index if not exists orcamentos_cliente_id_idx     on public.orcamentos(cliente_id);
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);
```

**Backfill:** nenhum SQL automático — os dados mostram que seria errado. `briefing_links` (0 linhas) não precisa de nada. `orcamentos` (1 linha) fica para o Wilke decidir manualmente, pela própria UI nova (item abaixo), se `cliente_id` = Georgia Andrade ou fica `null` (rascunho ainda sem cliente).

**Daqui pra frente, na UI (`painel-orcamentos`, `painel-briefings`):** troco o `<input>` livre por um `<select>` (populado por `eloi-gestao` `clientes.list`, que já existe) + opção "Avulso / outro" que mantém o texto livre. Ao escolher um cliente do dropdown, preenche o campo de texto com o nome (ainda editável — não tiro a liberdade de digitar algo diferente, tipo "Campanha 2026" em vez do nome do cliente) e manda `cliente_id` junto. As edge functions `orcamentos`/`briefing-links` ganham 1 campo opcional a mais em `create`/`update` (`o.cliente_id ?? null`) — zero mudança de contrato pra quem já consome `cliente` como texto.

```html
<div class="field"><label>Cliente</label>
  <select id="f_cliente_id" onchange="onClienteSelect()">
    <option value="">— avulso / outro —</option>
    <!-- populado de eloi-gestao clientes.list -->
  </select>
  <input id="f_cliente" placeholder="Nome do cliente" style="margin-top:6px">
</div>
```
`onClienteSelect()`: se selecionou um cliente real, copia `nome` pro `#f_cliente`; `salvar()` manda `cliente_id: document.getElementById('f_cliente_id').value || null` além do `cliente` texto de sempre.

## 2. Reconciliação marca pública × NF privada (passo 4 da tarefa)

**Decisão: marca continua pública por fora (sem senha), e ganha só uma entrada dentro do portal — não fica "mais segura de verdade", fica mais descobrível.** Justificativa pro caso real:

- **Natureza do dado é diferente.** NF tem CNPJ/valor/dados fiscais — sensível de verdade. Orçamento tem preço negociado — sensível pro cliente (concorrente não pode ver quanto ele paga). Marca é arte-final **já aprovada e entregue** — o cliente vai literalmente publicar essas mesmas peças no site/rede social/impresso dele em seguida. Tratar como segredo não faz sentido de negócio.
- **Não regride comportamento já decidido e possivelmente já em uso.** A decisão anterior documentada ("arquivos de marca já aprovados, não sensíveis") já está em produção — `/entregas-marca/georgia-andrade/` pode já ter sido mandado pro cliente, pro gráfico dele, pra agência de mídia. Colocar atrás de login quebra qualquer link já entregue, pra um público (cliente final não-técnico) que já tem baixo tolerância a fricção de login.
- **Já existe um escape hatch por cliente, sem inventar nada novo:** `eloi_clientes.marca_publicada` (boolean, já existe, já tem UI em `/gestao/`) é literalmente o kill-switch — se um rebranding específico precisar ficar oculto antes do aprovado final, o Wilke desmarca essa flag e a página para de responder, sem precisar de senha nenhuma no meio do caminho.
- **Trade-off que assumo explicitamente:** `marca_slug` é um slug legível (`georgia-andrade`), não um token aleatório — outro cliente que *adivinhasse* o slug de um terceiro veria a marca dele. Aceitável porque (a) não é indexado/linkado publicamente em lugar nenhum fora da própria entrega, (b) o dado exposto não é acionável contra o cliente (não é senha, não é CNPJ, é um logo), (c) a base de clientes da ELOI é pequena — o "ataque" de adivinhar slug de concorrente é esforço muito acima do valor do que se ganha.

**Alternativa descartada:** tudo atrás de login. Rejeitada porque muda comportamento já entregue (quebra link em posse de cliente), e adiciona fricção de senha para o artefato menos sensível do conjunto — o oposto de onde a fricção deveria estar.

Na prática: o portal do cliente simplesmente linka pra `/entregas-marca/<slug>/` (URL pública, sem token, sem signed URL) — zero código novo de proxy pra isso.

## 3. Edge function `portal-cliente` (passo 5 da tarefa)

### Auth: login só por senha, sem usuário

Senha é **gerada pelo Wilke** (não escolhida pelo cliente) — isso é o que sustenta "achar o cliente sem ambiguidade": com poucos clientes (1 hoje), o login testa a senha recebida contra o hash de **todos** os clientes com senha de portal configurada (`select ... where portal_senha_hash is not null`) e aceita só se exatamente 1 bater. PBKDF2 nativo do Deno (`crypto.subtle`, sem dependência nova — stdlib resolve).

**Restrição 1 (nunca texto puro):** hash + salt por linha, sem fallback de senha em claro em lugar nenhum.

**Restrição 2 (2 clientes com a mesma senha):** resolvida em 2 camadas —
1. *Prevenção na geração:* ao gerar a senha de um cliente (ação nova `clientes.gerar_senha_portal` em `eloi-gestao`, reaproveitando a function existente), o backend testa a senha candidata contra os hashes de todos os outros clientes antes de salvar; se colidir, gera outra (probabilidade real ~0, mas o código nunca assume isso).
2. *Defesa em profundidade no login:* se a busca por hash bater em **mais de 1** cliente (só aconteceria se a prevenção acima falhar ou for burlada manualmente no banco), o login é recusado com o mesmo erro genérico de "senha incorreta" — nunca loga um dos dois na cara de sorte — e um `console.error` fica no log da function pro Wilke perceber via `get_logs`.

**Restrição 3 (rate limit):** como o login não informa qual cliente (só a senha), a chave de rate-limit é o IP de origem — tabela `portal_login_attempts`, bloqueia com 429 acima de 10 tentativas em 15 min por IP. Simples de propósito — visão de escala é 1 dígito de clientes.

```sql
-- db/portal-cliente.sql (proposto, NÃO aplicado)

alter table public.eloi_clientes
  add column if not exists portal_senha_hash text,
  add column if not exists portal_senha_salt text;

create table if not exists public.portal_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  cliente_id   uuid not null references public.eloi_clientes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours')
); -- mesmo padrão de admin_sessions do plano aprovado (sessão desliza 12h)
alter table public.portal_sessions enable row level security;

create table if not exists public.portal_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
alter table public.portal_login_attempts enable row level security;
-- ponytail: sem índice/limpeza de linhas antigas — volume é 1 cliente hoje.
-- Se crescer: index (ip, attempted_at) + cron apagando linhas com >24h.
```

### `supabase/functions/_shared/portal-auth.ts`
```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function pbkdf2(password: string, saltHex: string, iterations = 100_000) {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function verifyPortalToken(body: any): Promise<string | null> {
  const token = body?.token; if (!token) return null;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("portal_sessions").select("cliente_id,expires_at").eq("token", token).single();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  await supabase.from("portal_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12*3600*1000).toISOString() })
    .eq("token", token);
  return data.cliente_id;
}
```

### `supabase/functions/portal-auth/index.ts` — login/logout do cliente (separado de `admin-auth`, mesma família de padrão)
```ts
if (body.action === "login") {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const since = new Date(Date.now() - 15*60*1000).toISOString();
  const { count } = await supabase.from("portal_login_attempts")
    .select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", since);
  if ((count ?? 0) >= 10) return json({ error: "muitas tentativas, aguarde" }, 429);

  const { data: candidatos } = await supabase.from("eloi_clientes")
    .select("id,portal_senha_hash,portal_senha_salt").not("portal_senha_hash", "is", null);
  const matches: string[] = [];
  for (const c of candidatos ?? []) {
    if (timingSafeEqual(await pbkdf2(body.password || "", c.portal_senha_salt), c.portal_senha_hash))
      matches.push(c.id);
  }
  await supabase.from("portal_login_attempts").insert({ ip });

  if (matches.length !== 1) {
    if (matches.length > 1) console.error("PORTAL: colisão de senha entre clientes", matches);
    return json({ error: "senha incorreta" }, 401);
  }
  const { data: sess } = await supabase.from("portal_sessions").insert({ cliente_id: matches[0] }).select().single();
  return json({ token: sess.token, expires_at: sess.expires_at });
}
if (body.action === "logout") {
  if (body.token) await supabase.from("portal_sessions").delete().eq("token", body.token);
  return json({ ok: true });
}
```

### `supabase/functions/portal-cliente/index.ts` — dados do cliente logado
Todas as queries são filtradas por `cliente_id` **resolvido do token**, nunca aceito no body — é isso que impede um cliente logado de pedir dado de outro só trocando um parâmetro.

```ts
const clienteId = await verifyPortalToken(body);
if (!clienteId) return json({ error: "unauthorized" }, 401);

// "me": nome + ponteiro pra marca (bucket já é público -> front monta o link direto, sem signed url)
if (body.action === "me") {
  const { data } = await supabase.from("eloi_clientes")
    .select("nome,marca_slug,marca_publicada").eq("id", clienteId).single();
  return json({ cliente: data });
}

if (body.action === "servicos.list") { // NF: lista sem expor o path bruto do bucket privado
  const { data } = await supabase.from("eloi_servicos")
    .select("id,descricao,valor_cents,status_execucao,pago,data_pagamento,nf_numero,created_at,nf_arquivo_url")
    .eq("cliente_id", clienteId).order("created_at", { ascending: false });
  return json({ servicos: (data ?? []).map(({ nf_arquivo_url, ...s }) => ({ ...s, tem_nf: !!nf_arquivo_url })) });
}

if (body.action === "nf.view_url") { // reaproveita 1:1 o padrão de eloi-gestao nf.view_url
  const { data: s } = await supabase.from("eloi_servicos")
    .select("cliente_id,nf_arquivo_url").eq("id", body.servico_id).single();
  if (!s || s.cliente_id !== clienteId || !s.nf_arquivo_url) return json({ error: "não encontrado" }, 404);
  const { data, error } = await supabase.storage.from("eloi-notas").createSignedUrl(s.nf_arquivo_url, 120);
  if (error) return json({ error: error.message }, 500);
  return json({ url: data.signedUrl });
}

if (body.action === "orcamentos.list") {
  const { data } = await supabase.from("orcamentos").select("*")
    .eq("cliente_id", clienteId).order("created_at", { ascending: false });
  return json({ orcamentos: data });
}

if (body.action === "briefings.list") {
  const { data } = await supabase.from("briefing_links").select("*")
    .eq("cliente_id", clienteId).order("created_at", { ascending: false });
  return json({ briefings: data });
}
```

Registros antigos sem `cliente_id` (o único orçamento real hoje, até o Wilke associar manualmente) simplesmente não aparecem no portal — comportamento correto, não bug: portal só mostra o que está inequivocamente ligado ao cliente logado.

## O que fica de fora de propósito (YAGNI)
- Sem tabela nova 1:1 pra senha do cliente — 2 colunas em `eloi_clientes` bastam, é dado do cliente.
- Sem recuperação de senha por e-mail (fora de escopo, o Wilke reenvia por WhatsApp gerando outra).
- Sem cleanup automático de `portal_login_attempts`/`portal_sessions` — volume real de hoje não justifica; adicionar quando o número de clientes ativos crescer o suficiente pra a tabela pesar (`ponytail:` marcado no SQL acima).
- Sem RLS policy nova além do `enable row level security` sem policy (mesmo padrão de `admin_sessions`) — só a service-role (edge function) acessa essas tabelas, front-end nunca fala direto com o Postgres.

## Arquivos lidos
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel-orcamentos\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel-briefings\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\SITEMAP.md`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\docs\painel-admin-unificado\plano.md`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\docs\painel-admin-unificado\apendice-1-mapeamento-codigo-atual.md`
- MCP Supabase (`nlamznxoocmygfvnqcns`, SELECT-only): `execute_sql` em `orcamentos`, `briefing_links`, `eloi_clientes`; `list_tables` verbose (schema `public`); `get_edge_function` em `eloi-gestao`, `orcamentos`, `briefing-submit`.

Nada foi escrito no banco nem no repositório — só leitura, conforme instruído.
