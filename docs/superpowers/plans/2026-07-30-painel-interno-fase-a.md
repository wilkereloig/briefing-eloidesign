# Painel Interno — Fase A (dados + layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base de dados e layout do sub-projeto 2 (Painel interno): fecha os 3 gaps de backend que o design pressupõe, constrói a camada de domínio (`Projeto`/`Etapa`/`Decisão`) e o client de API com nomes de campo corretos, aplica o sistema visual KV v3 (tokens, sidebar 202px, topbar, silhuetas) com as 7 rotas registradas (telas ainda placeholder). Fase A termina com `/admin` navegável nas 7 áreas, visual final, dado real já disponível pela camada de API — só falta preencher o conteúdo de cada tela (Fase B, plano separado, depois desta).

**Architecture:** Camada de domínio pura (`app/src/domain/`) sem dependência de React, testada com Vitest, consumida por um client de API por domínio (`app/src/lib/api.ts`) que já existe e ganha wrappers. Layout novo (`app/src/routes/admin/`) com rotas aninhadas do react-router-dom v7 (`children` + `<Outlet/>`), sidebar fixo 202px. 3 edge functions ganham 1 action nova cada (sem criar function nova — regra D6 da Fundação).

**Tech Stack:** O que já está em `app/` (Vite 8, React 19, react-router-dom 7, TypeScript, Vitest, oxlint) + Deno nas edges. Nenhuma dependência nova.

## Global Constraints

- **Design de referência:** `docs/superpowers/specs/2026-07-30-painel-interno-design.md` (spec) e `docs/superpowers/specs/design-assets/painel-kv3/README.md` (visual completo — cores, tipografia, telas, motion, a11y). Vocabulário em `CONTEXT.md` (raiz do repo).
- **Dinheiro:** `eloi_servicos.valor_cents` e `eloi_movimentos_financeiros.valor_cents` são cents. `orcamentos.valor_total` é **reais** — sempre passar por `centsDeReais()` antes de comparar/somar com os demais.
- **Edges:** proibido criar function nova pra isso — cada gap fecha como **action nova numa function que já existe**. `verify_jwt` sempre `false`; deploy só via `node scripts/deploy-edges.mjs <fn>` (nunca dashboard).
- **Migrations:** só aditivas (`add column if not exists`, `create table if not exists`). Aplicar via MCP `apply_migration`.
- **Allowlist de tabelas:** só `eloi_*`, `orcamentos`, `briefing_links`, `briefings`, `ecommerce_briefings`, `admin_sessions`/`portal_sessions`, `admin_login_seguranca` (nova, Task 10). `clients`/`services` do app Financeiro continuam invisíveis.
- **Copy pt-BR.** Logo ELOI nunca centralizada. Fonte única `carbona-variable`.
- **Commit só arquivos da tarefa.** `novo-visual/` (pasta não rastreada vista no `git status`) e qualquer outro WIP alheio ficam fora — não commitar sem perguntar.
- Preview de branch aponta pro Supabase de **produção** — testes manuais usam dado descartável, nunca dado real de cliente.

---

### Task 1: Gap de backend — `materiais.list` (tela Entregas)

**Files:**
- Modify: `edge-functions/eloi-gestao.ts:343` (logo após o bloco `materiais.delete`, antes do comentário `// ── DASHBOARD ──`)

**Interfaces:**
- Produces: action `materiais.list` em `eloi-gestao` — payload `{filtro?: {status?, cliente_id?}}`, retorna `{materiais: MaterialRow[]}` (ver `MaterialRow` na Task 4).

- [ ] **Step 1: Adicionar a action**

Em `edge-functions/eloi-gestao.ts`, localizar:

```ts
  if (action === "materiais.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("eloi_materiais").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── DASHBOARD ──
```

Substituir por (insere a action nova entre as duas):

```ts
  if (action === "materiais.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("eloi_materiais").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "materiais.list") {
    const filtro = body?.filtro || {};
    let q = supabase.from("eloi_materiais").select("*").order("created_at", { ascending: false });
    if (filtro.status) q = q.eq("status", filtro.status);
    if (filtro.cliente_id) q = q.eq("cliente_id", filtro.cliente_id);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ materiais: data });
  }

  // ── DASHBOARD ──
```

- [ ] **Step 2: Typecheck**

Run: `deno check edge-functions/eloi-gestao.ts`
Expected: sem erro.

- [ ] **Step 3: Deploy e verificar**

Run: `node scripts/deploy-edges.mjs eloi-gestao --dry-run` (confere o stage), depois com `SUPABASE_ACCESS_TOKEN` no env: `node scripts/deploy-edges.mjs eloi-gestao`.
Verificar manualmente (ex.: `curl` ou o painel legado `/gestao/` continuam funcionando — a mudança é aditiva, nada quebra): chamar `materiais.list` com token admin válido deve retornar `{materiais: [...]}` (array, pode ser vazio).

- [ ] **Step 4: Commit**

```bash
git add edge-functions/eloi-gestao.ts
git commit -m "Painel interno: action materiais.list (tela Entregas)"
```

---

### Task 2: Gap de backend — "Vincular cliente" em briefings legados e convites

**Files:**
- Create: `db/2026-07-30-briefings-legado-cliente-id.sql`
- Modify: `edge-functions/get-briefings.ts`, `edge-functions/get-ecommerce-briefings.ts`, `edge-functions/briefing-links.ts:62-64`

**Interfaces:**
- Produces: colunas `briefings.cliente_id` e `ecommerce_briefings.cliente_id`; action `vincular_cliente` (payload `{id, cliente_id}`, retorna `{briefing: BriefingLegadoRow}`) em `get-briefings`/`get-ecommerce-briefings`; action `vincular_cliente` (mesmo payload, retorna `{invite: BriefingLinkRow}`) em `briefing-links`.

- [ ] **Step 1: Migration**

`db/2026-07-30-briefings-legado-cliente-id.sql`:

```sql
-- Design do painel novo pede "Vincular cliente" em respostas legadas (sem
-- token) — as duas tabelas legadas nunca tiveram esse vínculo. Aditiva.
alter table public.briefings add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.ecommerce_briefings add column if not exists cliente_id uuid references public.eloi_clientes(id);
```

Aplicar via MCP `apply_migration` (name `briefings_legado_cliente_id`). Verificar: `select cliente_id from briefings limit 1;` e o mesmo em `ecommerce_briefings` — coluna existe, NULL.

- [ ] **Step 2: `get-briefings.ts` ganha `vincular_cliente`**

Arquivo inteiro (`edge-functions/get-briefings.ts`) — substituir de:

```ts
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let token = "";
  try {
    const body = await req.json();
    token = body?.token ?? "";
  } catch (_) { /* ignore */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await requireAdmin(supabase, token))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("briefings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ briefings: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
```

Para:

```ts
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
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (body?.action === "vincular_cliente") {
    const id = String(body?.id || "");
    const cliente_id = body?.cliente_id || null;
    if (!id || !cliente_id) {
      return new Response(JSON.stringify({ error: "id e cliente_id obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase.from("briefings")
      .update({ cliente_id }).eq("id", id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ briefing: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("briefings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ briefings: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 3: `get-ecommerce-briefings.ts` — mesmo tratamento**

Em `edge-functions/get-ecommerce-briefings.ts`, substituir de:

```ts
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let token = "";
  try {
    const body = await req.json();
    token = body?.token ?? "";
  } catch (_) { /* ignore */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await requireAdmin(supabase, token))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("ecommerce_briefings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ briefings: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
```

Para:

```ts
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
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (body?.action === "vincular_cliente") {
    const id = String(body?.id || "");
    const cliente_id = body?.cliente_id || null;
    if (!id || !cliente_id) {
      return new Response(JSON.stringify({ error: "id e cliente_id obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase.from("ecommerce_briefings")
      .update({ cliente_id }).eq("id", id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ briefing: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("ecommerce_briefings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ briefings: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 4: `briefing-links.ts` ganha `vincular_cliente`**

Em `edge-functions/briefing-links.ts`, localizar:

```ts
  if (action === "delete") {
    // nota: body.token é o token de sessão admin (injetado por EloiAdminAuth.call);
    // o convite é identificado por id, igual às demais edge functions (clientes.delete, orcamentos delete etc.)
    const id = (body?.id || "").toString();
    await supabase.from("briefing_links").delete().eq("id", id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // default: list
```

Substituir por:

```ts
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
```

- [ ] **Step 5: Typecheck + deploy**

Run: `deno check edge-functions/get-briefings.ts edge-functions/get-ecommerce-briefings.ts edge-functions/briefing-links.ts`
Deploy: `node scripts/deploy-edges.mjs get-briefings get-ecommerce-briefings briefing-links` (com `SUPABASE_ACCESS_TOKEN`).

- [ ] **Step 6: Testar com registro descartável**

```sql
insert into briefing_links (token, tipo, status) values ('teste-vinculo-123', 'identidade', 'pendente');
```

Chamar `vincular_cliente` com o `id` dessa linha (não o token) e um `cliente_id` real de teste → confirmar `cliente_id` preenchido. Limpar: `delete from briefing_links where token = 'teste-vinculo-123';`

- [ ] **Step 7: Commit**

```bash
git add db/2026-07-30-briefings-legado-cliente-id.sql edge-functions/get-briefings.ts edge-functions/get-ecommerce-briefings.ts edge-functions/briefing-links.ts
git commit -m "Painel interno: vincular cliente em briefings legados e convites (coluna + action)"
```

---

### Task 3: `dinheiro.ts` ganha `centsDeReais`

**Files:**
- Modify: `app/src/lib/dinheiro.ts`, `app/src/lib/dinheiro.test.ts`

**Interfaces:**
- Produces: `centsDeReais(valorReais: number): number` em `app/src/lib/dinheiro.ts`.

- [ ] **Step 1: Teste que falha**

Em `app/src/lib/dinheiro.test.ts`, adicionar (arquivo completo):

```ts
import { describe, it, expect } from 'vitest'
import { fmtBRL, centsDeBRL, centsDeReais } from './dinheiro'

describe('dinheiro', () => {
  it('formata cents em BRL', () => {
    expect(fmtBRL(1165000)).toBe('R$ 11.650,00')
    expect(fmtBRL(0)).toBe('R$ 0,00')
  })
  it('parseia entrada humana pra cents sem float', () => {
    expect(centsDeBRL('11.650,00')).toBe(1165000)
    expect(centsDeBRL('R$ 1.234,5')).toBe(123450)
    expect(centsDeBRL('800')).toBe(80000)
    expect(centsDeBRL('')).toBe(0)
  })
  it('converte orcamentos.valor_total (reais) pra cents, mesma conta do trigger SQL', () => {
    expect(centsDeReais(11650)).toBe(1165000)
    expect(centsDeReais(0)).toBe(0)
    expect(centsDeReais(99.999)).toBe(10000)
  })
})
```

- [ ] **Step 2: Rodar — FAIL**

Run: `cd app && npx vitest run`
Expected: FAIL — `centsDeReais` não exportado.

- [ ] **Step 3: Implementar**

Em `app/src/lib/dinheiro.ts`, adicionar ao final:

```ts

// orcamentos.valor_total é o ÚNICO campo monetário do sistema em reais, não
// cents (ver CONTEXT.md). Mesma conta do trigger SQL trg_eloi_orcamento_aprovado
// (round(valor_total * 100)) — manter os dois em sincronia se um dia mudar.
export function centsDeReais(valorReais: number): number {
  return Math.round(valorReais * 100)
}
```

- [ ] **Step 4: Rodar — PASS**

Run: `cd app && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/dinheiro.ts app/src/lib/dinheiro.test.ts
git commit -m "Painel interno: centsDeReais para orcamentos.valor_total"
```

---

### Task 4: Tipos reais + domínio `Projeto`/`Etapa`

**Files:**
- Create: `app/src/lib/tipos.ts`, `app/src/domain/projeto.ts`, `app/src/domain/projeto.test.ts`

**Interfaces:**
- Produces: tipos `ClienteRow`, `ServicoRow`, `OrcamentoRow`, `MovimentoRow`, `CaixaRow`, `MaterialRow`, `BriefingLinkRow`, `BriefingLegadoRow`, `FinanceiroStats` (`app/src/lib/tipos.ts`); `Etapa`, `Projeto`, `etapaDoProjeto()`, `juntarProjetos()` (`app/src/domain/projeto.ts`).

- [ ] **Step 1: `app/src/lib/tipos.ts`**

```ts
// Campos batem com o schema real (db/*.sql) — não com admin-app/src/types/domain.ts,
// que tem nomes que nunca existiram no banco (criado_em, status, data). Ver
// CONTEXT.md e docs/superpowers/specs/2026-07-30-painel-interno-design.md.

export interface ClienteRow {
  id: string
  nome: string
  cor: string | null
  contato: string | null
  marca_slug: string | null
  marca_publicada: boolean
  created_at: string
  portal_ativo: boolean
  portal_senha_prefix: string | null
  portal_senha_gerada_em: string | null
  portal_tentativas_falhas: number
  portal_bloqueado_ate: string | null
  total_servicos: number
  total_cents: number
}

export type StatusExecucao = 'aguardando_inicio' | 'em_execucao' | 'concluida'

export interface ServicoRow {
  id: string
  cliente_id: string
  orcamento_id: string | null
  sub_cliente: string | null
  descricao: string
  valor_cents: number
  status_execucao: StatusExecucao
  pago: boolean
  data_pagamento: string | null
  data_competencia: string | null
  nf_numero: string | null
  nf_arquivo_url: string | null
  observacoes: string | null
  created_at: string
}

export type OrcamentoStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado'

export interface OrcamentoRow {
  id: string
  created_at: string
  updated_at: string
  cliente: string | null
  cliente_id: string | null
  titulo: string
  status: OrcamentoStatus
  itens: unknown
  valor_total: number // REAIS, não cents — ver lib/dinheiro.ts:centsDeReais
  observacoes: string | null
  link: string | null
  share_token: string | null
  numero: number | null
  revogado_em: string | null
}

export type MovimentoStatus = 'previsto' | 'realizado' | 'cancelado'
export type MovimentoTipo = 'entrada' | 'saida'

export interface MovimentoRow {
  id: string
  caixa_id: string
  tipo: MovimentoTipo
  status: MovimentoStatus
  descricao: string
  valor_cents: number
  cliente_id: string | null
  servico_id: string | null
  orcamento_id: string | null
  data_competencia: string | null
  data_movimento: string | null
  forma_pagamento: string | null
  observacoes: string | null
}

export interface CaixaRow {
  id: string
  nome: string
  tipo: 'caixa' | 'conta_bancaria' | 'carteira' | 'cartao' | 'outro'
  saldo_inicial_cents: number
  saldo_cents: number
}

export type MaterialStatus = 'rascunho' | 'publicado' | 'arquivado'
export type MaterialCategoria = 'arquivo' | 'apresentacao' | 'fonte' | 'nota_fiscal' | 'outro'

export interface MaterialRow {
  id: string
  cliente_id: string
  servico_id: string | null
  titulo: string
  descricao: string | null
  categoria: MaterialCategoria
  versao: number | null
  status: MaterialStatus
  path: string
  published_at: string | null
  created_at: string
}

export interface BriefingLinkRow {
  id: string
  token: string
  cliente: string | null
  cliente_id: string | null
  tipo: string
  status: 'pendente' | 'respondido'
  created_at: string
  revogado_em: string | null
}

export interface BriefingLegadoRow {
  id: string
  created_at: string
  nome: string | null
  email: string | null
  whatsapp: string | null
  empresa?: string | null
  cliente_id?: string | null
  raw: unknown
}

export interface FinanceiroStats {
  faturado_cents: number
  recebido_cents: number
  a_receber_cents: number
  despesas_cents: number
  saldo_cents: number
  entradas_previstas_cents: number
  saidas_previstas_cents: number
  em_execucao: number
  concluido_sem_nf: number
  pagamentos_pendentes: number
}
```

- [ ] **Step 2: Teste que falha — `etapaDoProjeto`/`juntarProjetos`**

`app/src/domain/projeto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { etapaDoProjeto, juntarProjetos } from './projeto'
import type { OrcamentoRow, ServicoRow } from '../lib/tipos'

function orc(over: Partial<OrcamentoRow> = {}): OrcamentoRow {
  return {
    id: 'o1', created_at: '2026-01-01', updated_at: '2026-01-01', cliente: null,
    cliente_id: 'c1', titulo: 'Site novo', status: 'enviado', itens: [], valor_total: 1000,
    observacoes: null, link: null, share_token: null, numero: 1, revogado_em: null, ...over,
  }
}
function srv(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 's1', cliente_id: 'c1', orcamento_id: 'o1', sub_cliente: null, descricao: 'Site novo',
    valor_cents: 100000, status_execucao: 'aguardando_inicio', pago: false, data_pagamento: null,
    data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
    created_at: '2026-01-01', ...over,
  }
}

describe('etapaDoProjeto', () => {
  it('rascunho ou enviado sem servico -> orcamento', () => {
    expect(etapaDoProjeto('rascunho', null)).toBe('orcamento')
    expect(etapaDoProjeto('enviado', null)).toBe('orcamento')
  })
  it('recusado sem servico -> null (fora do board)', () => {
    expect(etapaDoProjeto('recusado', null)).toBeNull()
  })
  it('aprovado sem servico vinculado -> aprovado (defensivo, trigger deveria ter criado)', () => {
    expect(etapaDoProjeto('aprovado', null)).toBe('aprovado')
  })
  it('servico aguardando_inicio -> aprovado', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'aguardando_inicio' }))).toBe('aprovado')
  })
  it('servico em_execucao -> execucao', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'em_execucao' }))).toBe('execucao')
  })
  it('servico concluida + nao pago -> entregue', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'concluida', pago: false }))).toBe('entregue')
  })
  it('servico concluida + pago -> pago', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'concluida', pago: true }))).toBe('pago')
  })
})

describe('juntarProjetos', () => {
  it('orcamento enviado sem servico vira 1 projeto na etapa orcamento', () => {
    const ps = juntarProjetos([orc()], [])
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ etapa: 'orcamento', clienteId: 'c1', valorCents: 100000 })
  })
  it('orcamento recusado nao aparece', () => {
    expect(juntarProjetos([orc({ status: 'recusado' })], [])).toHaveLength(0)
  })
  it('orcamento aprovado + servico vinculado usa a etapa do servico, nao duplica', () => {
    const ps = juntarProjetos([orc({ status: 'aprovado' })], [srv()])
    expect(ps).toHaveLength(1)
    expect(ps[0].etapa).toBe('aprovado')
  })
  it('servico sem orcamento_id (criado a mao) e um projeto proprio', () => {
    const ps = juntarProjetos([], [srv({ orcamento_id: null, status_execucao: 'em_execucao' })])
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ etapa: 'execucao', orcamento: null })
  })
  it('rascunho conta como etapa orcamento (trabalho ja iniciado, so nao enviado)', () => {
    const ps = juntarProjetos([orc({ status: 'rascunho' })], [])
    expect(ps[0].etapa).toBe('orcamento')
  })
})
```

- [ ] **Step 3: Rodar — deve FALHAR**

Run: `cd app && npx vitest run`
Expected: FAIL — `Cannot find module './projeto'`.

- [ ] **Step 4: Implementar `app/src/domain/projeto.ts`**

```ts
import type { OrcamentoRow, OrcamentoStatus, ServicoRow } from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'

// Etapa é CALCULADA, não uma coluna (ver CONTEXT.md "Etapa"). Ordem do
// funil: orcamento -> aprovado -> execucao -> entregue -> pago.
export type Etapa = 'orcamento' | 'aprovado' | 'execucao' | 'entregue' | 'pago'

export interface Projeto {
  id: string
  clienteId: string | null
  titulo: string
  etapa: Etapa
  valorCents: number
  orcamento: OrcamentoRow | null
  servico: ServicoRow | null
}

type ServicoParaEtapa = Pick<ServicoRow, 'status_execucao' | 'pago'>

export function etapaDoProjeto(
  orcamentoStatus: OrcamentoStatus | null,
  servico: ServicoParaEtapa | null,
): Etapa | null {
  if (servico) {
    if (servico.status_execucao === 'aguardando_inicio') return 'aprovado'
    if (servico.status_execucao === 'em_execucao') return 'execucao'
    return servico.pago ? 'pago' : 'entregue'
  }
  // Sem servico vinculado: se o orcamento ja foi aprovado, o trigger
  // trg_eloi_orcamento_aprovado deveria ter criado um — cai aqui só no caso
  // defensivo de o vinculo ainda não ter propagado.
  if (orcamentoStatus === 'aprovado') return 'aprovado'
  if (orcamentoStatus === 'rascunho' || orcamentoStatus === 'enviado') return 'orcamento'
  return null // recusado, ou nem orcamento nem servico
}

export function juntarProjetos(orcamentos: OrcamentoRow[], servicos: ServicoRow[]): Projeto[] {
  const servicoPorOrcamento = new Map(
    servicos.filter((s) => s.orcamento_id).map((s) => [s.orcamento_id as string, s]),
  )
  const projetos: Projeto[] = []

  for (const o of orcamentos) {
    const servico = servicoPorOrcamento.get(o.id) ?? null
    const etapa = etapaDoProjeto(o.status, servico)
    if (!etapa) continue
    projetos.push({
      id: `orc:${o.id}`,
      clienteId: o.cliente_id,
      titulo: o.titulo,
      etapa,
      valorCents: servico ? servico.valor_cents : centsDeReais(o.valor_total),
      orcamento: o,
      servico,
    })
  }

  for (const s of servicos) {
    if (s.orcamento_id) continue // já considerado no laço acima
    const etapa = etapaDoProjeto(null, s)
    if (!etapa) continue
    projetos.push({
      id: `srv:${s.id}`,
      clienteId: s.cliente_id,
      titulo: s.descricao,
      etapa,
      valorCents: s.valor_cents,
      orcamento: null,
      servico: s,
    })
  }

  return projetos
}
```

- [ ] **Step 5: Rodar — PASS**

Run: `cd app && npx vitest run` → PASS (todos os testes, incluindo os das Tasks anteriores).

- [ ] **Step 6: Typecheck + commit**

Run: `cd app && npx tsc -b`
Expected: sem erro.

```bash
git add app/src/lib/tipos.ts app/src/domain/projeto.ts app/src/domain/projeto.test.ts
git commit -m "Painel interno: tipos reais + dominio Projeto/Etapa"
```

---

### Task 5: Domínio `Decisão` (tela Hoje)

**Files:**
- Create: `app/src/domain/decisoes.ts`, `app/src/domain/decisoes.test.ts`

**Interfaces:**
- Consumes: `ServicoRow`, `MovimentoRow`, `OrcamentoRow` (Task 4).
- Produces: `Decisao`, `Prazo`, `decisoesDoDia(input)`, `prazos(input)` em `app/src/domain/decisoes.ts`.

- [ ] **Step 1: Teste que falha**

`app/src/domain/decisoes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decisoesDoDia, prazos } from './decisoes'
import type { ServicoRow, MovimentoRow, OrcamentoRow } from '../lib/tipos'

const AGORA = new Date('2026-07-30T12:00:00Z').getTime()
const DIA = 24 * 3600 * 1000

function srv(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 's1', cliente_id: 'c1', orcamento_id: null, sub_cliente: null, descricao: 'Identidade visual',
    valor_cents: 500000, status_execucao: 'concluida', pago: false, data_pagamento: null,
    data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
    created_at: '2026-01-01', ...over,
  }
}
function mov(over: Partial<MovimentoRow> = {}): MovimentoRow {
  return {
    id: 'm1', caixa_id: 'cx1', tipo: 'entrada', status: 'previsto', descricao: 'Parcela 2',
    valor_cents: 200000, cliente_id: 'c1', servico_id: null, orcamento_id: null,
    data_competencia: null, data_movimento: null, forma_pagamento: null, observacoes: null, ...over,
  }
}
function orc(over: Partial<OrcamentoRow> = {}): OrcamentoRow {
  return {
    id: 'o1', created_at: '2026-07-01', updated_at: '2026-07-01', cliente: null, cliente_id: 'c1',
    titulo: 'Site novo', status: 'enviado', itens: [], valor_total: 5000, observacoes: null,
    link: null, share_token: null, numero: 1, revogado_em: null, ...over,
  }
}

describe('decisoesDoDia', () => {
  it('servico concluido sem NF vira decisao lancar_nf', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: null, pago: true })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'lancar_nf', id: 'nf:s1' }))
  })
  it('servico concluido nao pago vira decisao cobrar_pagamento', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: '123', pago: false })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'normal' }))
  })
  it('servico concluido nao pago com competencia vencida vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ nf_numero: '123', pago: false, data_competencia: '2026-07-01' })],
      movimentos: [], orcamentos: [], agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'atrasado' }))
  })
  it('servico em execucao nao gera nenhuma decisao', () => {
    const ds = decisoesDoDia({ servicos: [srv({ status_execucao: 'em_execucao' })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toHaveLength(0)
  })
  it('movimento previsto vencido vira conferir_recebimento', () => {
    const ds = decisoesDoDia({ servicos: [], movimentos: [mov({ data_movimento: '2026-07-20' })], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'conferir_recebimento', urgencia: 'atrasado' }))
  })
  it('movimento previsto futuro nao vira decisao', () => {
    const ds = decisoesDoDia({ servicos: [], movimentos: [mov({ data_movimento: '2026-08-20' })], orcamentos: [], agora: AGORA })
    expect(ds).toHaveLength(0)
  })
  it('orcamento enviado ha 5+ dias vira cobrar_decisao', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 6 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'normal' }))
  })
  it('orcamento enviado ha 10+ dias vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 11 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'atrasado' }))
  })
  it('orcamento enviado ha menos de 5 dias nao gera decisao', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 2 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toHaveLength(0)
  })
})

describe('prazos', () => {
  it('ordena por distancia, atrasados primeiro (dias negativo)', () => {
    const ps = prazos({
      servicos: [
        srv({ id: 'a', status_execucao: 'em_execucao', data_competencia: new Date(AGORA + 3 * DIA).toISOString() }),
        srv({ id: 'b', status_execucao: 'em_execucao', data_competencia: new Date(AGORA - 1 * DIA).toISOString() }),
      ],
      agora: AGORA,
    })
    expect(ps.map((p) => p.id)).toEqual(['b', 'a'])
    expect(ps[0].dias).toBeLessThan(0)
  })
  it('ignora servico concluido ou sem data_competencia', () => {
    const ps = prazos({
      servicos: [srv({ status_execucao: 'concluida', data_competencia: '2026-08-01' }), srv({ id: 'x', data_competencia: null })],
      agora: AGORA,
    })
    expect(ps).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar — FAIL**

Run: `cd app && npx vitest run` → FAIL (`Cannot find module './decisoes'`).

- [ ] **Step 3: Implementar `app/src/domain/decisoes.ts`**

```ts
import type { ServicoRow, MovimentoRow, OrcamentoRow } from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'

export type Urgencia = 'normal' | 'atrasado'
export type AcaoDecisao = 'lancar_nf' | 'cobrar_pagamento' | 'conferir_recebimento' | 'cobrar_decisao'

export interface Decisao {
  id: string
  titulo: string
  detalhe: string
  clienteId: string | null
  valorCents: number | null
  acao: AcaoDecisao
  urgencia: Urgencia
}

const DIA_MS = 24 * 60 * 60 * 1000

export function decisoesDoDia(input: {
  servicos: ServicoRow[]
  movimentos: MovimentoRow[]
  orcamentos: OrcamentoRow[]
  agora?: number
}): Decisao[] {
  const agora = input.agora ?? Date.now()
  const decisoes: Decisao[] = []

  for (const s of input.servicos) {
    if (s.status_execucao !== 'concluida') continue
    if (!s.nf_numero) {
      decisoes.push({
        id: `nf:${s.id}`, titulo: s.descricao, detalhe: 'Concluído sem nota fiscal',
        clienteId: s.cliente_id, valorCents: s.valor_cents, acao: 'lancar_nf', urgencia: 'normal',
      })
    }
    if (!s.pago) {
      const venceu = s.data_competencia ? new Date(s.data_competencia).getTime() < agora : false
      decisoes.push({
        id: `pag:${s.id}`, titulo: s.descricao,
        detalhe: venceu ? 'Pagamento atrasado' : 'Aguardando pagamento',
        clienteId: s.cliente_id, valorCents: s.valor_cents, acao: 'cobrar_pagamento',
        urgencia: venceu ? 'atrasado' : 'normal',
      })
    }
  }

  for (const m of input.movimentos) {
    if (m.status !== 'previsto' || !m.data_movimento) continue
    if (new Date(m.data_movimento).getTime() < agora) {
      decisoes.push({
        id: `mov:${m.id}`, titulo: m.descricao, detalhe: 'Previsto não confirmado',
        clienteId: m.cliente_id, valorCents: m.valor_cents, acao: 'conferir_recebimento', urgencia: 'atrasado',
      })
    }
  }

  for (const o of input.orcamentos) {
    if (o.status !== 'enviado') continue
    // orcamentos não guarda "enviado_em" — updated_at aproxima "desde quando
    // está enviado" (única data que muda quando o status muda).
    const dias = (agora - new Date(o.updated_at).getTime()) / DIA_MS
    if (dias >= 5) {
      decisoes.push({
        id: `dec:${o.id}`, titulo: o.titulo, detalhe: `Enviado há ${Math.floor(dias)} dias sem resposta`,
        clienteId: o.cliente_id, valorCents: centsDeReais(o.valor_total), acao: 'cobrar_decisao',
        urgencia: dias >= 10 ? 'atrasado' : 'normal',
      })
    }
  }

  return decisoes
}

export interface Prazo {
  id: string
  titulo: string
  clienteId: string | null
  dias: number // negativo = atrasado
}

export function prazos(input: { servicos: ServicoRow[]; agora?: number }): Prazo[] {
  const agora = input.agora ?? Date.now()
  return input.servicos
    .filter((s) => s.status_execucao !== 'concluida' && s.data_competencia)
    .map((s) => ({
      id: s.id,
      titulo: s.descricao,
      clienteId: s.cliente_id,
      dias: Math.round((new Date(s.data_competencia as string).getTime() - agora) / DIA_MS),
    }))
    .sort((a, b) => a.dias - b.dias)
}
```

- [ ] **Step 4: Rodar — PASS**

Run: `cd app && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/domain/decisoes.ts app/src/domain/decisoes.test.ts
git commit -m "Painel interno: dominio Decisao/Prazo (tela Hoje)"
```

---

### Task 6: `api.ts` — allowlist + wrappers por domínio

**Files:**
- Modify: `app/src/lib/api.ts`
- Create: `app/src/lib/api-dominios.test.ts`

**Interfaces:**
- Consumes: `ClienteRow`, `ServicoRow`, `OrcamentoRow`, `CaixaRow`, `MovimentoRow`, `MaterialRow`, `BriefingLinkRow`, `BriefingLegadoRow`, `FinanceiroStats` (Task 4).
- Produces: `clientes`, `servicos`, `orcamentos`, `financeiro`, `briefingsApi`, `materiaisApi` exportados de `app/src/lib/api.ts`.

- [ ] **Step 1: Ampliar a allowlist**

Em `app/src/lib/api.ts`, trocar:

```ts
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'orcamentos' | 'briefing-links'
```

Por:

```ts
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'orcamentos' | 'briefing-links'
  | 'get-briefings' | 'get-ecommerce-briefings'
```

- [ ] **Step 2: Teste que falha — wrappers**

`app/src/lib/api-dominios.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientes, servicos, financeiro, briefingsApi, TOKEN_KEY } from './api'

const store: Record<string, string> = { [TOKEN_KEY]: 'tok' }
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})
beforeEach(() => { vi.restoreAllMocks() })

function mockFetch(body: unknown) {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('wrappers de dominio', () => {
  it('clientes.list chama a action certa e desembrulha .clientes', async () => {
    const f = mockFetch({ clientes: [{ id: 'c1' }] })
    const r = await clientes.list()
    expect(r).toEqual([{ id: 'c1' }])
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('eloi-gestao')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'clientes.list' })
  })
  it('servicos.upsert manda o servico no payload e desembrulha .servico', async () => {
    const f = mockFetch({ servico: { id: 's1' } })
    const r = await servicos.upsert({ id: 's1', descricao: 'x' })
    expect(r).toEqual({ id: 's1' })
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'servicos.upsert', servico: { id: 's1', descricao: 'x' } })
  })
  it('financeiro.movimentoUpsert chama eloi-financeiro/movimentos.upsert', async () => {
    const f = mockFetch({ movimento: { id: 'm1' } })
    await financeiro.movimentoUpsert({ descricao: 'y', valor_cents: 100 })
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('eloi-financeiro')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'movimentos.upsert' })
  })
  it('briefingsApi.legadoVisual chama get-briefings com action list', async () => {
    const f = mockFetch({ briefings: [] })
    await briefingsApi.legadoVisual()
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('get-briefings')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'list' })
  })
  it('briefingsApi.vincularConvite chama briefing-links/vincular_cliente', async () => {
    const f = mockFetch({ invite: { id: 'i1' } })
    await briefingsApi.vincularConvite('i1', 'c1')
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'vincular_cliente', id: 'i1', cliente_id: 'c1' })
  })
})
```

- [ ] **Step 3: Rodar — FAIL**

Run: `cd app && npx vitest run` → FAIL (`clientes`/`servicos`/etc. não exportados).

- [ ] **Step 4: Implementar os wrappers**

Ao final de `app/src/lib/api.ts`, adicionar:

```ts

// ── Wrappers por domínio — nomes de campo batem com app/src/lib/tipos.ts,
// não com admin-app/src/lib/api.ts (que vaza os bugs de campo do domain.ts antigo).
import type {
  ClienteRow, ServicoRow, OrcamentoRow, CaixaRow, MovimentoRow,
  MaterialRow, BriefingLinkRow, BriefingLegadoRow, FinanceiroStats,
} from './tipos'

export const clientes = {
  list: () => call<{ clientes: ClienteRow[] }>('eloi-gestao', 'clientes.list').then((r) => r.clientes),
  detail: (cliente_id: string) => call<{
    cliente: ClienteRow; orcamentos: OrcamentoRow[]; servicos: ServicoRow[]
    briefings: unknown[]; movimentos: MovimentoRow[]; materiais: MaterialRow[]
    resumo: { faturado_cents: number; recebido_cents: number; a_receber_cents: number }
  }>('eloi-gestao', 'clientes.detail', { cliente_id }),
  upsert: (cliente: Partial<ClienteRow> & { id?: string }) =>
    call<{ cliente: ClienteRow }>('eloi-gestao', 'clientes.upsert', { cliente }).then((r) => r.cliente),
  gerarSenhaPortal: (cliente_id: string) =>
    call<{ senha: string }>('eloi-gestao', 'clientes.gerar_senha_portal', { cliente_id }).then((r) => r.senha),
}

export const servicos = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ servicos: ServicoRow[] }>('eloi-gestao', 'servicos.list', filtro ? { filtro } : {}).then((r) => r.servicos),
  upsert: (servico: Partial<ServicoRow> & { id?: string }) =>
    call<{ servico: ServicoRow }>('eloi-gestao', 'servicos.upsert', { servico }).then((r) => r.servico),
}

export const orcamentos = {
  list: () => call<{ orcamentos: OrcamentoRow[] }>('orcamentos', 'list').then((r) => r.orcamentos),
  update: (orcamento: Partial<OrcamentoRow> & { id: string }) =>
    call<{ orcamento: OrcamentoRow }>('orcamentos', 'update', { orcamento }).then((r) => r.orcamento),
}

export const financeiro = {
  caixasList: () => call<{ caixas: CaixaRow[] }>('eloi-financeiro', 'caixas.list').then((r) => r.caixas),
  movimentosList: (filtro?: Record<string, unknown>) =>
    call<{ movimentos: MovimentoRow[] }>('eloi-financeiro', 'movimentos.list', filtro ? { filtro } : {}).then((r) => r.movimentos),
  movimentoUpsert: (movimento: Partial<MovimentoRow> & { id?: string }) =>
    call<{ movimento: MovimentoRow }>('eloi-financeiro', 'movimentos.upsert', { movimento }).then((r) => r.movimento),
  stats: () => call<FinanceiroStats>('eloi-financeiro', 'financeiro.stats'),
}

export const briefingsApi = {
  convites: () => call<{ invites: BriefingLinkRow[] }>('briefing-links', 'list').then((r) => r.invites),
  legadoVisual: () => call<{ briefings: BriefingLegadoRow[] }>('get-briefings', 'list').then((r) => r.briefings),
  legadoEcommerce: () => call<{ briefings: BriefingLegadoRow[] }>('get-ecommerce-briefings', 'list').then((r) => r.briefings),
  vincularLegadoVisual: (id: string, cliente_id: string) =>
    call('get-briefings', 'vincular_cliente', { id, cliente_id }),
  vincularLegadoEcommerce: (id: string, cliente_id: string) =>
    call('get-ecommerce-briefings', 'vincular_cliente', { id, cliente_id }),
  vincularConvite: (id: string, cliente_id: string) =>
    call('briefing-links', 'vincular_cliente', { id, cliente_id }),
}

export const materiaisApi = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ materiais: MaterialRow[] }>('eloi-gestao', 'materiais.list', filtro ? { filtro } : {}).then((r) => r.materiais),
}
```

Nota: `get-briefings`/`get-ecommerce-briefings` hoje aceitam `action:'list'` explícito porque a Task 2 os fez cair no branch de listagem quando `action !== 'vincular_cliente'` (não checam `'list'` literal) — mandar `action:'list'` funciona igual a omitir.

- [ ] **Step 5: Rodar — PASS**

Run: `cd app && npx vitest run` → PASS (todos os arquivos).

- [ ] **Step 6: Typecheck + commit**

Run: `cd app && npx tsc -b`

```bash
git add app/src/lib/api.ts app/src/lib/api-dominios.test.ts
git commit -m "Painel interno: wrappers de api por dominio (clientes/servicos/orcamentos/financeiro/briefings/materiais)"
```

---

### Task 7: Tokens visuais KV v3

**Files:**
- Create: `app/src/ui/tokens.css`
- Modify: `app/src/app.css` (só a seção `.login`; o resto fica intacto até a Task 8), `app/index.html`

**Interfaces:**
- Produces: variáveis CSS `--pagina/--chao/--chao-2/--trilho/--roxo/--roxo-claro/--roxo-texto/--lima/--laranja/--lilas/--azul/--rosa/--tinta-forte/--tinta-media/--tinta-fraca/--linha/--linha-forte/--malha/--font` em `:root` (ver `design-assets/painel-kv3/README.md` seção "Design tokens" pros valores completos e o porquê de cada um).

- [ ] **Step 1: `app/src/ui/tokens.css`**

```css
:root {
  --pagina: #120432;
  --chao: #1B0647;
  --chao-2: #24085C;
  --trilho: #0C0220;
  --roxo: #7D2AE8;
  --roxo-claro: #9457F0;
  --roxo-texto: #C0A0FA; /* #7D2AE8 sobre --chao dá ~2,4:1 -- nunca usar pra texto */
  --lima: #DFF806;
  --laranja: #FD4400;
  --lilas: #EEB4E7;
  --azul: #5B7CFD;
  --rosa: #FDD5D3;
  --tinta-forte: #FFF1F0;
  --tinta-media: #B79FC4;
  --tinta-fraca: #8E77A6;
  --linha: rgba(253, 213, 211, .14);
  --linha-forte: rgba(253, 213, 211, .28);
  --malha: 202px;
  --font: 'carbona-variable', system-ui, -apple-system, sans-serif;
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

:focus-visible {
  outline: 2px solid var(--lima);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Restilizar `.login` em `app/src/app.css`**

Trocar (é o único bloco alterado nesta task — `.shell-top`/`.shell-main`/`.carregando`/`.btn-ghost` continuam como estão até a Task 8, que substitui o Shell inteiro):

```css
:root{--bg:#F7F4FB;--surface:#fff;--line:#E7DEF2;--ink:#240043;--muted:#6B5685;
  --brand:#5A189A;--bad:#BE123C;--r:8px;--font:'carbona-variable',sans-serif}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.6}
.login{max-width:min(430px,calc(100% - 40px));margin:11vh auto 0;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r);padding:40px 38px;text-align:left}
.login h1{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:22px}
.login input{width:100%;border:1px solid #957BB8;border-radius:var(--r);padding:14px 16px;font:inherit}
.login button{width:100%;margin-top:12px;background:var(--brand);color:#fff;border:0;
  border-radius:var(--r);padding:15px 18px;font:inherit;cursor:pointer}
.err{color:var(--bad);font-size:.85rem;margin-top:12px;min-height:1.2em}
```

Por (KV v3 — fundo escuro, mesma estrutura de campos):

```css
@import './ui/tokens.css';

/* Ponte temporária: .shell-top/.btn-ghost/.carregando (abaixo) ainda usam os
   nomes antigos até a Task 8 os substituir — sem isso ficam com var()
   indefinida (sem cor de fundo/borda) assim que o :root antigo sai daqui. */
:root{--surface:#fff;--line:#E7DEF2;--muted:#6B5685;--r:8px}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--pagina);color:var(--tinta-forte);line-height:1.6}
.login{max-width:min(430px,calc(100% - 40px));margin:11vh auto 0;background:var(--chao);
  border:1px solid var(--linha);border-radius:0;padding:40px 38px;text-align:left}
.login h1{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--tinta-fraca);margin-bottom:22px;font-weight:400}
.login input{width:100%;background:var(--pagina);color:var(--tinta-forte);border:1px solid var(--linha-forte);
  border-radius:0;padding:14px 16px;font:inherit}
.login button{width:100%;margin-top:12px;background:var(--lima);color:var(--pagina);border:0;
  border-radius:0;padding:15px 18px;font:inherit;font-weight:640;cursor:pointer}
.login button:disabled{opacity:.6;cursor:default}
.err{color:var(--laranja);font-size:.85rem;margin-top:12px;min-height:1.2em}
```

- [ ] **Step 3: Confirmar fonte carregada**

Ler `app/index.html` — deve já ter `<link rel="stylesheet" href="https://use.typekit.net/ngx4uek.css">` (da Fundação). Se não tiver, adicionar no `<head>`.

- [ ] **Step 4: Validar visualmente**

Run: `cd app && npm run dev` → abrir `http://localhost:5207/admin`.
Expected: tela de login com fundo roxo escuro (`#120432`), campo e botão lima, sem cantos arredondados. Shell (pós-login) continua com a aparência antiga por enquanto — só o login mudou.

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/tokens.css app/src/app.css
git commit -m "Painel interno: tokens KV v3 + login reestilizado"
```

---

### Task 8: Shell, sidebar 202px, silhuetas e as 7 rotas

**Files:**
- Create: `app/src/routes/admin/nav.ts`, `app/src/routes/admin/Sidebar.tsx`, `app/src/routes/admin/Silhueta.tsx`, `app/src/routes/admin/telas/Hoje.tsx`, `app/src/routes/admin/telas/Projetos.tsx`, `app/src/routes/admin/telas/Clientes.tsx`, `app/src/routes/admin/telas/ClienteFicha.tsx`, `app/src/routes/admin/telas/Dinheiro.tsx`, `app/src/routes/admin/telas/Briefings.tsx`, `app/src/routes/admin/telas/Entregas.tsx`
- Modify: `app/src/routes/admin/Shell.tsx`, `app/src/main.tsx`, `app/src/app.css`

**Interfaces:**
- Consumes: `useAdmin()` (`AdminAuth.tsx`, já existe).
- Produces: rotas `/admin`, `/admin/projetos`, `/admin/clientes`, `/admin/clientes/:id`, `/admin/dinheiro`, `/admin/briefings`, `/admin/entregas` — todas dentro do Shell com sidebar; telas ainda placeholder (conteúdo real é o próximo plano, Fase B).

- [ ] **Step 1: `app/src/routes/admin/nav.ts`**

Fonte única da navegação — substitui os 3 lugares que hoje hardcodam largura/itens de sidebar (`nav.js` 236px, `admin.css` `--sidebar-w` órfã, `admin-app/src/styles.css` 220px; ver achado no design-spec).

```ts
export interface ItemNav {
  path: string
  label: string
  glifo: 'quadrado' | 'circulo' | 'arco' | 'contorno'
}

export const NAV_PRIMARIA: ItemNav[] = [
  { path: '/admin', label: 'Hoje', glifo: 'quadrado' },
  { path: '/admin/projetos', label: 'Projetos', glifo: 'arco' },
  { path: '/admin/clientes', label: 'Clientes', glifo: 'circulo' },
  { path: '/admin/dinheiro', label: 'Dinheiro', glifo: 'circulo' },
  { path: '/admin/briefings', label: 'Briefings', glifo: 'quadrado' },
]

export const NAV_FERRAMENTAS: ItemNav[] = [
  { path: '/admin/entregas', label: 'Entregas', glifo: 'contorno' },
]
```

- [ ] **Step 2: `app/src/routes/admin/Silhueta.tsx`**

```tsx
import type { CSSProperties } from 'react'
import type { ItemNav } from './nav'

export function Silhueta({ forma, cor, tamanho = 14 }: { forma: ItemNav['glifo']; cor: string; tamanho?: number }) {
  const base: CSSProperties = { width: tamanho, height: tamanho, flexShrink: 0, display: 'inline-block' }
  if (forma === 'quadrado') return <span aria-hidden style={{ ...base, background: cor }} />
  if (forma === 'circulo') return <span aria-hidden style={{ ...base, background: cor, borderRadius: '50%' }} />
  if (forma === 'arco') return <span aria-hidden style={{ ...base, background: cor, borderRadius: '0 0 100% 0' }} />
  return <span aria-hidden style={{ ...base, background: 'transparent', border: `2px solid ${cor}`, boxSizing: 'border-box' }} />
}
```

- [ ] **Step 3: `app/src/routes/admin/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { useAdmin } from '../../auth/AdminAuth'
import { NAV_PRIMARIA, NAV_FERRAMENTAS } from './nav'
import { Silhueta } from './Silhueta'

export function Sidebar() {
  const { sair } = useAdmin()
  return (
    <aside className="trilho">
      <div className="trilho-marca">
        <img src="/wordmark-kv.svg" alt="ELOI Design Studio" height={52} />
      </div>
      <nav>
        {NAV_PRIMARIA.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/admin'}
            className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
            <Silhueta forma={item.glifo} cor="currentColor" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="trilho-ferramentas">
        <span className="trilho-rotulo">Ferramentas</span>
        {NAV_FERRAMENTAS.map((item) => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
            <Silhueta forma={item.glifo} cor="currentColor" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="trilho-rodape">
        <span>Malha 202</span>
        <button className="btn-ghost" onClick={sair}>Sair</button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: As 7 telas placeholder**

`app/src/routes/admin/telas/Hoje.tsx`:
```tsx
export default function Hoje() {
  return <div className="tela"><h1>Hoje</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

`app/src/routes/admin/telas/Projetos.tsx`:
```tsx
export default function Projetos() {
  return <div className="tela"><h1>Projetos</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

`app/src/routes/admin/telas/Clientes.tsx`:
```tsx
export default function Clientes() {
  return <div className="tela"><h1>Clientes</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

`app/src/routes/admin/telas/ClienteFicha.tsx`:
```tsx
import { useParams } from 'react-router-dom'

export default function ClienteFicha() {
  const { id } = useParams()
  return <div className="tela"><h1>Ficha do cliente</h1><p>id={id} — chega no próximo plano (Fase B).</p></div>
}
```

`app/src/routes/admin/telas/Dinheiro.tsx`:
```tsx
export default function Dinheiro() {
  return <div className="tela"><h1>Dinheiro</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

`app/src/routes/admin/telas/Briefings.tsx`:
```tsx
export default function Briefings() {
  return <div className="tela"><h1>Briefings</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

`app/src/routes/admin/telas/Entregas.tsx`:
```tsx
export default function Entregas() {
  return <div className="tela"><h1>Entregas</h1><p>Chega no próximo plano (Fase B — telas).</p></div>
}
```

- [ ] **Step 5: Reescrever `app/src/routes/admin/Shell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

// Shell monta sidebar + área de conteúdo; cada rota filha (telas/) cuida do
// próprio cabeçalho, porque o design varia por tela (seletor de mês em Hoje,
// filtros em Projetos etc.) — ver design-assets/painel-kv3/README.md.
export default function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Rotas aninhadas em `app/src/main.tsx`**

```tsx
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminAuthProvider, RequireAdmin } from './auth/AdminAuth'
import './app.css'

// TODAS as rotas lazy (D2): quem abre /admin não baixa código de briefing
// e vice-versa. Requisito, não otimização. Dentro de /admin, as 7 telas
// entram no MESMO chunk do Shell (ponytail: 1 operador só, code-splitting
// por sub-tela não paga o preço da complexidade extra).
const Shell = lazy(() => import('./routes/admin/Shell'))
const Hoje = lazy(() => import('./routes/admin/telas/Hoje'))
const Projetos = lazy(() => import('./routes/admin/telas/Projetos'))
const Clientes = lazy(() => import('./routes/admin/telas/Clientes'))
const ClienteFicha = lazy(() => import('./routes/admin/telas/ClienteFicha'))
const Dinheiro = lazy(() => import('./routes/admin/telas/Dinheiro'))
const Briefings = lazy(() => import('./routes/admin/telas/Briefings'))
const Entregas = lazy(() => import('./routes/admin/telas/Entregas'))

const router = createBrowserRouter([
  {
    path: '/admin',
    element: <RequireAdmin><Suspense fallback={<p className="carregando">Carregando…</p>}><Shell /></Suspense></RequireAdmin>,
    children: [
      { index: true, element: <Hoje /> },
      { path: 'projetos', element: <Projetos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'clientes/:id', element: <ClienteFicha /> },
      { path: 'dinheiro', element: <Dinheiro /> },
      { path: 'briefings', element: <Briefings /> },
      { path: 'entregas', element: <Entregas /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 7: CSS do shell — trocar `.shell-top`/`.shell-main` por `.app-shell`/`.trilho`/`.app-main`**

Em `app/src/app.css`, remover (não são mais usadas, o Shell novo não as renderiza):

```css
.shell-top{display:flex;justify-content:space-between;align-items:center;padding:16px 28px;
  background:var(--surface);border-bottom:1px solid var(--line)}
.shell-main{padding:24px 28px}
.btn-ghost{background:none;border:1px solid var(--line);border-radius:var(--r);
  padding:8px 16px;font:inherit;cursor:pointer;color:var(--muted)}
.carregando{padding:40px;color:var(--muted)}
```

Adicionar no lugar:

```css
.carregando{padding:40px;color:var(--tinta-fraca)}
.btn-ghost{background:none;border:1px solid var(--linha-forte);border-radius:0;
  padding:8px 16px;font:inherit;cursor:pointer;color:var(--tinta-media)}

.app-shell{display:grid;grid-template-columns:var(--malha) minmax(0,1fr);min-height:100vh;
  background-color:var(--pagina);
  background-image:repeating-linear-gradient(90deg,rgba(253,213,211,.05) 0 1px,transparent 1px var(--malha)),
    repeating-linear-gradient(0deg,rgba(253,213,211,.03) 0 1px,transparent 1px var(--malha))}
.app-main{min-width:0;padding:30px 34px}

.trilho{background:var(--trilho);border-right:1px solid var(--linha);display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh}
.trilho-marca{padding:0 22px 26px}
.trilho nav{display:flex;flex-direction:column}
.trilho-item{display:flex;align-items:center;gap:10px;padding:11px 22px;color:var(--tinta-media);
  font-size:13.5px;text-decoration:none;border-left:3px solid transparent}
.trilho-item:hover{background:var(--chao)}
.trilho-item.ativo{background:var(--chao);border-left-color:var(--lima);color:var(--tinta-forte);font-weight:620}
.trilho-ferramentas{margin-top:auto;padding-top:12px;border-top:1px solid var(--linha)}
.trilho-rotulo{display:block;padding:10px 22px 4px;font-size:10px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--tinta-fraca)}
.trilho-rodape{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;
  border-top:1px solid var(--linha);font-size:11px;color:var(--tinta-fraca)}

.tela h1{font-size:38px;line-height:1;letter-spacing:-.035em;font-weight:620;color:var(--tinta-forte)}
.tela p{color:var(--tinta-media);margin-top:10px}

@media (max-width:1199px){
  .app-shell{grid-template-columns:var(--malha) minmax(0,1fr)}
}
@media (max-width:899px){
  .app-shell{grid-template-columns:1fr;padding-bottom:58px}
  .trilho{position:fixed;bottom:0;left:0;right:0;top:auto;height:58px;flex-direction:row;
    border-right:0;border-top:1px solid var(--linha);padding-bottom:env(safe-area-inset-bottom)}
  .trilho-marca,.trilho-ferramentas,.trilho-rodape{display:none}
  .trilho nav{flex-direction:row;width:100%;justify-content:space-around}
  .trilho-item{flex-direction:column;gap:2px;padding:6px 4px;font-size:10px;border-left:0;
    border-top:3px solid transparent;min-width:44px}
  .trilho-item.ativo{border-left-color:transparent;border-top-color:var(--lima)}
  .app-main{padding:20px}
}
```

- [ ] **Step 8: Copiar wordmark tintada**

```bash
cp "docs/superpowers/specs/design-assets/painel-kv3/design/kv-sistema/assets/eloi-admin/wordmark-kv.svg" "app/public/wordmark-kv.svg"
```

(`app/public/` serve estático na raiz do build — a Sidebar referencia `/wordmark-kv.svg` direto, sem passar pelo bundler.)

- [ ] **Step 9: Validar**

Run: `cd app && npm run build` → sem erro. `cd app && npm run dev` → abrir `/admin`, logar.
Expected: sidebar escuro 202px à esquerda com Hoje/Projetos/Clientes/Dinheiro/Briefings + Ferramentas›Entregas, item ativo com borda lima, wordmark visível (clara sobre fundo escuro). Clicar em cada item navega e mostra o placeholder da tela. Abaixo de 900px (`resize_window` ou DevTools), sidebar vira barra fixa no rodapé.
Run: `cd app && npx vitest run` → PASS (nada quebrou).

- [ ] **Step 10: Commit**

```bash
git add app/src/routes/admin/ app/src/main.tsx app/src/app.css app/public/wordmark-kv.svg
git commit -m "Painel interno: shell com sidebar 202px, silhuetas e as 7 rotas (telas placeholder)"
```

---

### Task 9: Limpeza de assets — wordmark, fonte não usada, `/marca/`

**Files:**
- Create: `app/public/wordmark-tinta.svg`
- Modify: `assets/eloi-admin/nav.js`
- Delete: `assets/eloi-admin/wordmark-light.svg`, `assets/fonts/Juturu-VariableVF.woff2` (se existir)

**Interfaces:**
- N/A (só assets e um ajuste de link).

- [ ] **Step 1: Copiar a wordmark de placa clara**

```bash
cp "docs/superpowers/specs/design-assets/painel-kv3/design/kv-sistema/assets/eloi-admin/wordmark-tinta.svg" "app/public/wordmark-tinta.svg"
```

(Fica pronta pra uso futuro em qualquer superfície clara da SPA — ex. círculo lilás do site, sub-projeto 6.)

- [ ] **Step 2: Remover o SVG órfão**

```bash
git rm assets/eloi-admin/wordmark-light.svg
```

(Confirmado no design-spec: nenhum arquivo do repo referencia esse arquivo.)

- [ ] **Step 3: Remover a fonte não usada, se existir**

Run: `ls assets/fonts/Juturu-VariableVF.woff2 2>/dev/null && echo existe || echo nao-existe`
Se existir e nenhuma tela usar (`grep -r Juturu assets/ app/ *.html --include="*.css" --include="*.html"` não deve retornar nada além do próprio arquivo):

```bash
git rm assets/fonts/Juturu-VariableVF.woff2
```

- [ ] **Step 4: `/marca/` — trocar o sidebar injetado por um link único**

`/marca/` é a única página que vai sobrar usando `assets/eloi-admin/nav.js` depois que este sub-projeto tirar `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/` do ar (isso acontece no plano de Fase B, não aqui) — quando isso acontecer, o `PRIMARY` do nav.js vai apontar 4 dos 5 itens pra rotas mortas. Registrar isso agora como comentário, pra não esquecer:

Em `assets/eloi-admin/nav.js`, no topo do arquivo, adicionar:

```js
// TODO (painel interno, Fase B): quando /gestao/, /painel-briefings/,
// /painel-orcamentos/, /painel/ e /painel-ecommerce/ saírem do ar, PRIMARY
// abaixo fica com 4 links mortos — /marca/ é a única página que ainda usa
// este nav. Trocar por um link único "← Painel" pra /admin nessa hora.
```

Não mexer no restante do arquivo agora — `/gestao/` etc. ainda estão no ar até o fim da Fase B, e o nav precisa continuar funcionando pra elas até lá.

- [ ] **Step 5: Validar**

Run: `cd app && npm run build` → sem erro. Abrir `/marca/` manualmente (fora do `app/`, é HTML estático) → sidebar antigo continua funcionando (nada mudou de comportamento, só o comentário).

- [ ] **Step 6: Commit**

```bash
git add app/public/wordmark-tinta.svg assets/eloi-admin/nav.js
git rm assets/eloi-admin/wordmark-light.svg
git commit -m "Painel interno: wordmark tintada, remove SVG orfao, marca TODO em nav.js"
```

(Ajuste o comando de fonte/commit conforme o resultado do Step 3 — só inclua `assets/fonts/` se o arquivo existir e for removido.)

---

### Task 10: Throttle no login admin (opcional — default incluir, ver spec)

**Files:**
- Create: `db/2026-07-30-admin-login-throttle.sql`
- Modify: `edge-functions/admin-auth.ts`

**Interfaces:**
- Produces: tabela `admin_login_seguranca` (1 linha global — D3: 1 admin pra sempre); `admin-auth.login` bloqueia por 15min depois de 5 senhas erradas, mesmo mecanismo de `portal-cliente.ts`.

- [ ] **Step 1: Migration**

`db/2026-07-30-admin-login-throttle.sql`:

```sql
-- Porta o lockout que portal-cliente.ts já tem (5 tentativas -> 15min) pro
-- login admin, que hoje não tem limite nenhum. 1 admin para sempre (D3) =
-- 1 linha global, não por usuário (o padrão "singleton row" do Postgres:
-- id boolean + check garante no máximo 1 linha).
create table if not exists public.admin_login_seguranca (
  id boolean primary key default true check (id),
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz
);
insert into public.admin_login_seguranca (id) values (true) on conflict (id) do nothing;

-- sem policies: só service-role (edge functions) acessa, igual admin_sessions.
alter table public.admin_login_seguranca enable row level security;
```

Aplicar via MCP `apply_migration` (name `admin_login_throttle`). Verificar: `select * from admin_login_seguranca;` → 1 linha, `tentativas_falhas=0`, `bloqueado_ate=null`.

- [ ] **Step 2: Editar `admin-auth.ts`**

Em `edge-functions/admin-auth.ts`, trocar:

```ts
  if (action === "login") {
    const expected = Deno.env.get("ADMIN_PASSWORD");
    if (!expected) return json({ error: "ADMIN_PASSWORD não configurado no projeto" }, 500);
    if (body?.password !== expected) return json({ error: "senha inválida" }, 401);

    const { data, error } = await supabase.from("admin_sessions").insert({}).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: data.token, expires_at: data.expires_at });
  }
```

Por:

```ts
  if (action === "login") {
    const expected = Deno.env.get("ADMIN_PASSWORD");
    if (!expected) return json({ error: "ADMIN_PASSWORD não configurado no projeto" }, 500);

    const { data: seg } = await supabase.from("admin_login_seguranca")
      .select("tentativas_falhas, bloqueado_ate").eq("id", true).maybeSingle();
    if (seg?.bloqueado_ate && new Date(seg.bloqueado_ate) > new Date()) {
      return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429);
    }

    if (body?.password !== expected) {
      const tentativas = (seg?.tentativas_falhas ?? 0) + 1;
      const patch: Record<string, unknown> = { tentativas_falhas: tentativas };
      if (tentativas >= 5) { patch.bloqueado_ate = new Date(Date.now() + 15 * 60_000).toISOString(); patch.tentativas_falhas = 0; }
      await supabase.from("admin_login_seguranca").update(patch).eq("id", true);
      return json({ error: "senha inválida" }, 401);
    }

    await supabase.from("admin_login_seguranca").update({ tentativas_falhas: 0, bloqueado_ate: null }).eq("id", true);
    const { data, error } = await supabase.from("admin_sessions").insert({}).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: data.token, expires_at: data.expires_at });
  }
```

- [ ] **Step 3: Typecheck + deploy**

Run: `deno check edge-functions/admin-auth.ts`
Deploy: `node scripts/deploy-edges.mjs admin-auth` (com `SUPABASE_ACCESS_TOKEN`).

- [ ] **Step 4: Testar (senha errada de propósito, NÃO a senha real)**

Errar a senha 5 vezes na tela de login → 6ª tentativa (mesmo com a senha CERTA) deve responder 429 "muitas tentativas". Aguardar 15min ou `update admin_login_seguranca set bloqueado_ate = null;` manualmente pra destravar depois do teste. Login com senha certa (sem estar bloqueado) → funciona normal e zera `tentativas_falhas`.

- [ ] **Step 5: Commit**

```bash
git add db/2026-07-30-admin-login-throttle.sql edge-functions/admin-auth.ts
git commit -m "Painel interno: throttle no login admin (5 tentativas / 15min, porta portal-cliente)"
```

---

### Task 11: Fechar a Fase A

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-painel-interno-design.md` (marcar seção de decisões abertas como resolvida, se ainda não foi)

**Interfaces:**
- N/A — task de fechamento.

- [ ] **Step 1: Suite completa**

Run: `cd app && npx tsc -b && npx vitest run && npm run build`
Expected: typecheck sem erro, todos os testes PASS, build gera `app/dist/`.

Run: `deno check edge-functions/*.ts`
Expected: sem erro.

Run: `deno test edge-functions/_tests/`
Expected: PASS (testes da Fundação continuam passando — nada nesta fase tocou `_shared/`).

- [ ] **Step 2: Commit do dist**

```bash
git add app/dist
git commit -m "Painel interno: build da Fase A"
```

- [ ] **Step 3: Push + CI**

```bash
git push origin master
```

`gh run watch` (ou aba Actions) → verde.

- [ ] **Step 4: Smoke em produção**

Abrir `/admin` em produção → login → sidebar KV v3 com as 7 áreas navegáveis (conteúdo ainda placeholder). `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/`, `/marca/`, `/portal/`, `/orcamento/?t=` real, `/briefing/?mode=admin` — tudo continua funcionando sem mudança (esta fase não retirou nenhum painel antigo, só adicionou).

- [ ] **Step 5: Registrar o que falta**

A Fase A termina aqui. O que falta pro sub-projeto 2 fechar de vez (fica pro plano de Fase B, escrito depois desta fase implementada e validada):
- Preencher as 7 telas com dado real (consumindo os wrappers da Task 6 e o domínio das Tasks 4/5).
- Retirar `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/`, `admin-app/` (`vercel.json` + arquivos) — só depois que as 7 telas cobrirem o que eles fazem hoje.
- Ajustar `nav.js`/`admin.css` de `/marca/` pro link único (TODO deixado na Task 9).
