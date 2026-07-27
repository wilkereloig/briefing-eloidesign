# Fundação do Rebuild ELOI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base técnica da SPA única: `app/` (Vite+React+TS) servindo shell logado em `/admin`, `_shared/auth.ts` nas edges, deploy de edges pelo repo, migration `revogado_em`, CI — sem tocar nenhuma tela de negócio nem quebrar rota atual.

**Architecture:** SPA com rotas lazy em `app/`, dist COMMITADO (padrão do repo — `admin-app/dist` já é assim; Vercel não builda nada). Edges continuam 1 arquivo por função em `edge-functions/`, ganham `_shared/`; deploy via script que remonta o layout do supabase CLI. Sessões: `admin_sessions` (localStorage `eloi_admin_token`) e `portal_sessions` separadas.

**Tech Stack:** Vite 6 + React 18 + TypeScript + react-router-dom 7 + Vitest · Deno (edges + testes) · supabase CLI via `npx` · GitHub Actions.

## Global Constraints

- **Rotas congeladas** (nunca alterar comportamento): `/orcamento/?t=`, `/briefing/`, `/briefing-ecommerce/`, `/briefing-solarium/`, `/briefing-guia-viver-bem/`, `/portal/`, `/entregas-marca/<slug>/`.
- **Edges separadas** — proibido consolidar funções (`plano.md:261`). `verify_jwt` SEMPRE `false` (CORS só permite `content-type`; auth = token de sessão no body). Deploy: `--no-verify-jwt` obrigatório.
- **Nunca deployar edge pelo dashboard** — só pelo script deste plano ou MCP com arquivo do repo. Produção divergiu do repo em 2026-07-27; não repetir.
- **Allowlist de tabelas:** código novo só conhece `eloi_*`, `orcamentos`, `briefing_links`, `admin_sessions`, `portal_sessions`, `briefings`, `ecommerce_briefings`. `clients`/`services` (app Financeiro, mesmo projeto Supabase) são INVISÍVEIS.
- **Supabase project:** `nlamznxoocmygfvnqcns`.
- Copy pt-BR. Logo ELOI nunca centralizada. Fonte única `carbona-variable` (sistema deliberado).
- Commit só arquivos da tarefa (`novo-visual/` e WIP alheio ficam fora). Push pro master = deploy Vercel: nas tarefas marcadas "PUSH", validar antes.
- Migrations: só aditivas. Preview/dev apontam pro Supabase de PRODUÇÃO — nunca testar com dados da Georgia; usar registro de teste descartável.

---

### Task 1: Scaffold `app/` + Vitest + util de dinheiro

**Files:**
- Create: `app/` (scaffold Vite), `app/src/lib/dinheiro.ts`, `app/src/lib/dinheiro.test.ts`
- Modify: `app/vite.config.ts`, `app/package.json`

**Interfaces:**
- Produces: `fmtBRL(cents: number): string` e `centsDeBRL(s: string): number` em `app/src/lib/dinheiro.ts`; comandos `npm run build` / `npm test` dentro de `app/`.

- [ ] **Step 1: Scaffold**

```bash
cd "C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo"
npm create vite@latest app -- --template react-ts
cd app
npm install
npm install react-router-dom
npm install -D vitest
```

Expected: pasta `app/` com `src/`, `vite.config.ts`, build funcional.

- [ ] **Step 2: Configurar Vite (base + porta + dist commitado)**

Substituir `app/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = caminho REAL do dist no repo estático: o vercel.json reescreve
// /admin/* -> /app/dist/index.html e os assets saem como /app/dist/assets/*
// (arquivos estáticos de verdade, sem rewrite — diferente do admin-app antigo).
export default defineConfig({
  plugins: [react()],
  base: '/app/dist/',
  server: { port: 5207, strictPort: true }, // PORTAS.md: 5207 reservada p/ app/
  test: { environment: 'node' },
})
```

Em `app/package.json` adicionar script: `"test": "vitest run"`. Remover `"dist"` do `app/.gitignore` se o scaffold criar (dist é COMMITADO — padrão do repo).

- [ ] **Step 3: Teste que falha — dinheiro**

`app/src/lib/dinheiro.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fmtBRL, centsDeBRL } from './dinheiro'

describe('dinheiro', () => {
  it('formata cents em BRL', () => {
    expect(fmtBRL(1165000)).toBe('R$\u00a011.650,00')
    expect(fmtBRL(0)).toBe('R$\u00a00,00')
  })
  it('parseia entrada humana pra cents sem float', () => {
    expect(centsDeBRL('11.650,00')).toBe(1165000)
    expect(centsDeBRL('R$ 1.234,5')).toBe(123450)
    expect(centsDeBRL('800')).toBe(80000)
    expect(centsDeBRL('')).toBe(0)
  })
})
```

- [ ] **Step 4: Rodar — deve FALHAR**

Run: `cd app && npx vitest run`
Expected: FAIL — `Cannot find module './dinheiro'`.

- [ ] **Step 5: Implementar `app/src/lib/dinheiro.ts`**

```ts
// Dinheiro é SEMPRE inteiro em cents (contrato do banco: valor_cents).
// Nada de float: parse manual de "1.234,56" — split na vírgula, dígitos puros.
export function fmtBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
}

export function centsDeBRL(s: string): number {
  const limpo = s.replace(/[^\d,]/g, '')
  if (!limpo) return 0
  const [intParte, decParte = ''] = limpo.split(',')
  const dec = (decParte + '00').slice(0, 2)
  return parseInt(intParte.replace(/\D/g, '') || '0', 10) * 100 + parseInt(dec, 10)
}
```

- [ ] **Step 6: Rodar — deve PASSAR**

Run: `cd app && npx vitest run` → PASS (2 tests).
Run: `npm run build` → gera `app/dist/` sem erro.

- [ ] **Step 7: Registrar porta e commit**

Adicionar linha no `../PORTAS.md` (tabela): `| briefing-eloidesign app/ (vite dev) | 5207 | npm/vite | app/ |` e atualizar "próxima livre: 5208".

```bash
git add app/ "../PORTAS.md"
git commit -m "Fundacao: scaffold app/ (Vite+React+TS) + util de dinheiro testado"
```

(⚠️ `PORTAS.md` está FORA do repo git — se `git add` reclamar, editar o arquivo e commitar só `app/`.)

---

### Task 2: Client de API + AuthProvider

**Files:**
- Create: `app/src/lib/api.ts`, `app/src/lib/api.test.ts`, `app/src/auth/AdminAuth.tsx`

**Interfaces:**
- Consumes: contrato do edge `admin-auth`: `{action:'login', password}` → `{token}`; `{action:'logout', token}`. Token vive em `localStorage['eloi_admin_token']`.
- Produces: `api.call(fn, action, payload)`, `api.login(password)`, `api.logout()`, `api.temSessao()` em `api.ts`; componente `<RequireAdmin>` e hook `useAdmin()` em `AdminAuth.tsx`.

- [ ] **Step 1: Teste que falha — api client**

`app/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, TOKEN_KEY } from './api'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

beforeEach(() => { for (const k in store) delete store[k]; vi.restoreAllMocks() })

describe('api', () => {
  it('login guarda token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'abc' }), { status: 200 })))
    await api.login('senha')
    expect(store[TOKEN_KEY]).toBe('abc')
  })
  it('call injeta token no body', async () => {
    store[TOKEN_KEY] = 'tok123'
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    await api.call('eloi-gestao', 'clientes.list')
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'clientes.list', token: 'tok123' })
  })
  it('401 derruba token e lança', async () => {
    store[TOKEN_KEY] = 'morto'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })))
    await expect(api.call('eloi-gestao', 'x')).rejects.toThrow()
    expect(store[TOKEN_KEY]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar — FAIL** (`Cannot find module './api'`).

- [ ] **Step 3: Implementar `app/src/lib/api.ts`**

```ts
const BASE = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'
export const TOKEN_KEY = 'eloi_admin_token' // mesmo do painel legado — sessão compartilhada

// ALLOWLIST: este client só fala com estas functions. Tabelas do app
// Financeiro (clients/services) não existem pra este código.
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'orcamentos' | 'briefing-links'

async function call<T = unknown>(fn: Fn, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const res = await fetch(BASE + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...payload }),
  })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    throw new Error('sessão expirada')
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { const j = await res.json(); if (j?.error) msg = String(j.error) } catch { /* corpo não-JSON */ }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  call,
  temSessao: () => !!localStorage.getItem(TOKEN_KEY),
  async login(password: string) {
    const res = await fetch(BASE + 'admin-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(res.status === 401 ? 'senha inválida' : (d?.error || 'erro do servidor'))
    localStorage.setItem(TOKEN_KEY, d.token)
  },
  logout() {
    const t = localStorage.getItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
    if (t) fetch(BASE + 'admin-auth', { method: 'POST', body: JSON.stringify({ action: 'logout', token: t }) })
  },
}
```

- [ ] **Step 4: Rodar — PASS** (`npx vitest run`, 5 tests no total).

- [ ] **Step 5: `app/src/auth/AdminAuth.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

// Guard ÚNICO do perímetro /admin/* (D4): telas novas nascem protegidas
// porque o router as coloca DENTRO de <RequireAdmin> — não porque alguém
// lembrou de checar sessão nelas.
const Ctx = createContext<{ logado: boolean; entrar: (pw: string) => Promise<void>; sair: () => void }>(null!)
export const useAdmin = () => useContext(Ctx)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [logado, setLogado] = useState(api.temSessao())
  return (
    <Ctx.Provider value={{
      logado,
      entrar: async (pw) => { await api.login(pw); setLogado(true) },
      sair: () => { api.logout(); setLogado(false) },
    }}>{children}</Ctx.Provider>
  )
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { logado } = useAdmin()
  if (!logado) return <LoginGate />
  return <>{children}</>
}

function LoginGate() {
  const { entrar } = useAdmin()
  const [pw, setPw] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)
  return (
    <form className="login" onSubmit={async (e) => {
      e.preventDefault(); setIndo(true); setErro('')
      try { await entrar(pw) } catch (err) { setErro((err as Error).message) } finally { setIndo(false) }
    }}>
      <h1>Área do Wilke</h1>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="Senha de acesso" autoComplete="current-password" autoFocus />
      <button disabled={indo}>{indo ? 'Verificando…' : 'Entrar'}</button>
      <div className="err">{erro}</div>
    </form>
  )
}
```

- [ ] **Step 6: Build + commit**

Run: `npm run build` → OK. `npx vitest run` → PASS.

```bash
git add app/src/lib/api.ts app/src/lib/api.test.ts app/src/auth/AdminAuth.tsx
git commit -m "Fundacao: client de API com allowlist + AuthProvider/guard admin"
```

---

### Task 3: Router lazy + shell `/admin` + dist

**Files:**
- Create: `app/src/routes/admin/Shell.tsx`, `app/src/app.css`
- Modify: `app/src/main.tsx` (substituir), deletar `app/src/App.tsx`/`App.css` do scaffold

**Interfaces:**
- Consumes: `AdminAuthProvider`, `RequireAdmin`, `useAdmin` (Task 2).
- Produces: rota `/admin` renderizando shell logado; `app/dist/` commitado.

- [ ] **Step 1: `app/src/main.tsx`**

```tsx
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminAuthProvider, RequireAdmin } from './auth/AdminAuth'
import './app.css'

// TODAS as rotas lazy (D2): quem abre /admin não baixa código de briefing
// e vice-versa. Requisito, não otimização.
const Shell = lazy(() => import('./routes/admin/Shell'))

const router = createBrowserRouter(
  [{
    path: '/admin/*',
    element: <RequireAdmin><Suspense fallback={<p className="carregando">Carregando…</p>}><Shell /></Suspense></RequireAdmin>,
  }],
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: `app/src/routes/admin/Shell.tsx`**

```tsx
import { useAdmin } from '../../auth/AdminAuth'

// Shell VAZIO de propósito: a Fundação termina aqui. As telas de negócio
// (clientes, orçamentos, financeiro) entram no sub-projeto 2.
export default function Shell() {
  const { sair } = useAdmin()
  return (
    <div className="shell">
      <header className="shell-top">
        <strong>ELOI Design Studio</strong>
        <button className="btn-ghost" onClick={sair}>Sair</button>
      </header>
      <main className="shell-main">
        <h1>Painel novo</h1>
        <p>Fundação instalada. As telas chegam no próximo sub-projeto.</p>
        <p><a href="/admin/">← voltar pro painel atual</a></p>
      </main>
    </div>
  )
}
```

(Nota: o link "voltar" aponta pro hub atual `/admin/` — enquanto o rewrite da Task 4 não estiver no ar, `/admin/` continua sendo o HTML legado, então este link é inofensivo; depois do rewrite ele vira a própria SPA e o link some no sub-projeto 2.)

- [ ] **Step 3: `app/src/app.css`** — mínimo, tokens da marca (mesmos valores do admin.css):

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
.shell-top{display:flex;justify-content:space-between;align-items:center;padding:16px 28px;
  background:var(--surface);border-bottom:1px solid var(--line)}
.shell-main{padding:24px 28px}
.btn-ghost{background:none;border:1px solid var(--line);border-radius:var(--r);
  padding:8px 16px;font:inherit;cursor:pointer;color:var(--muted)}
.carregando{padding:40px;color:var(--muted)}
```

Adicionar no `app/index.html` (head): `<link rel="stylesheet" href="https://use.typekit.net/ngx4uek.css">` e `<title>ELOI Design Studio</title>`, `<html lang="pt-BR">`.

- [ ] **Step 4: Validar dev**

Run: `cd app && npm run dev` → abrir `http://localhost:5207/admin`
Expected: tela de login (esquerda-alinhada); com a senha admin real → shell "Painel novo"; Sair volta pro login. Testes: `npx vitest run` → PASS.

- [ ] **Step 5: Build + commit dist**

```bash
npm run build
git add app/
git commit -m "Fundacao: rota /admin lazy com shell logado; dist commitado"
```

---

### Task 4: `vercel.json` + PUSH + smoke de produção

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `app/dist/` commitado (Task 3).
- Produces: `/admin` e `/admin/qualquer` servidos pela SPA em produção; hub legado migra pra… **atenção: `/admin/` legado morre AQUI** — o shell novo assume. Rotas `/gestao`, `/painel-*`, `/marca` seguem intocadas.

- [ ] **Step 1: Rewrites**

`vercel.json` (substituir — manter as 3 linhas do admin-app enquanto ele existir):

```json
{
  "rewrites": [
    { "source": "/admin", "destination": "/app/dist/index.html" },
    { "source": "/admin/:path*", "destination": "/app/dist/index.html" },
    { "source": "/admin-app/assets/:path*", "destination": "/admin-app/dist/assets/:path*" },
    { "source": "/admin-app/:path*", "destination": "/admin-app/dist/index.html" },
    { "source": "/admin-app", "destination": "/admin-app/dist/index.html" }
  ]
}
```

⚠️ Isso tira o hub `admin/index.html` do ar (o rewrite ganha do arquivo estático). O hub é navegação pura — os destinos (`/gestao` etc.) continuam acessíveis por URL e pelo trilho lateral das outras páginas. Se o Wilke quiser o hub de volta antes do sub-projeto 2, reverter é 1 linha.

- [ ] **Step 2: Smoke local**

Sem como testar rewrite localmente (python http.server não lê vercel.json) → validar em preview de branch:

```bash
git checkout -b fundacao-vercel
git add vercel.json
git commit -m "Fundacao: /admin/* servido pela SPA (app/dist)"
git push origin fundacao-vercel
```

Abrir o deployment de preview do Vercel (URL no dashboard/PR): `/admin` → login SPA; logar; `/admin/qualquer-coisa` → shell (SPA, não 404); `/gestao/`, `/portal/`, `/orcamento/?t=x` → inalterados.

- [ ] **Step 3: Merge + push master**

```bash
git checkout master && git merge fundacao-vercel && git push origin master
```

Smoke produção (10 rotas): `/admin` (SPA), `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/`, `/marca/`, `/portal/`, `/briefing/?mode=admin`, `/` — tudo carrega, console limpo. **Aceites 1–3 fechados.**

---

### Task 5: `_shared/senha.ts` + `_shared/auth.ts` + testes Deno

**Files:**
- Create: `edge-functions/_shared/senha.ts`, `edge-functions/_shared/auth.ts`, `edge-functions/_tests/senha.test.ts`, `edge-functions/_tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `normalizarSenha(raw: string): { prefix: string; secret: string }` (senha.ts)
  - `requireAdmin(supabase: SupaLike, token: string | undefined): Promise<boolean>` e `requireCliente(supabase: SupaLike, token: string | undefined): Promise<{ cliente_id: string } | null>` (auth.ts) — sliding 12h, mesmos contratos de hoje.

- [ ] **Step 1: Deno disponível?**

Run: `deno --version` — se falhar: `winget install DenoLand.Deno` e reabrir shell.

- [ ] **Step 2: Teste que falha — senha**

`edge-functions/_tests/senha.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { normalizarSenha } from "../_shared/senha.ts";

Deno.test("normaliza igual ao login do portal (espaços/hífens fora, uppercase)", () => {
  const r = normalizarSenha("k883-eloi-georgia-andrade-2026");
  assertEquals(r.prefix, "K883");
  assertEquals(r.secret, "ELOIGEORGIAANDRADE2026");
});
Deno.test("senha curta não explode", () => {
  assertEquals(normalizarSenha("ab"), { prefix: "AB", secret: "" });
  assertEquals(normalizarSenha(""), { prefix: "", secret: "" });
});
```

Run: `deno test edge-functions/_tests/senha.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: `edge-functions/_shared/senha.ts`**

```ts
// Contrato do login do portal (portal-cliente.ts): a senha digitada vira
// replace(/[\s-]/g,"").toUpperCase(); os 4 primeiros chars resolvem o cliente
// (portal_senha_prefix), o resto é conferido contra o hash PBKDF2.
// QUALQUER mudança aqui muda o que o hash significa — não mexer sem regerar senhas.
export function normalizarSenha(raw: string): { prefix: string; secret: string } {
  const norm = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
  return { prefix: norm.slice(0, 4), secret: norm.slice(4) };
}
```

Run: teste → PASS.

- [ ] **Step 4: Teste que falha — auth**

`edge-functions/_tests/auth.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { requireAdmin } from "../_shared/auth.ts";

// Stub mínimo do supabase-js: só o encadeamento que auth.ts usa.
function stub(row: { expires_at: string } | null) {
  const updates: unknown[] = [];
  return {
    updates,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (u: unknown) => { updates.push(u); return { eq: async () => ({}) }; },
    }),
  };
}

Deno.test("sem token → false", async () => {
  assertEquals(await requireAdmin(stub(null), undefined), false);
});
Deno.test("token desconhecido → false", async () => {
  assertEquals(await requireAdmin(stub(null), "x"), false);
});
Deno.test("token expirado → false", async () => {
  const s = stub({ expires_at: new Date(Date.now() - 1000).toISOString() });
  assertEquals(await requireAdmin(s, "x"), false);
});
Deno.test("token vivo → true e desliza a sessão", async () => {
  const s = stub({ expires_at: new Date(Date.now() + 3600_000).toISOString() });
  assertEquals(await requireAdmin(s, "x"), true);
  assertEquals(s.updates.length, 1);
});
```

Run: FAIL.

- [ ] **Step 5: `edge-functions/_shared/auth.ts`**

```ts
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
```

- [ ] **Step 6: Rodar tudo — PASS**

Run: `deno test edge-functions/_tests/` → 6 passed.

- [ ] **Step 7: Commit**

```bash
git add edge-functions/_shared/ edge-functions/_tests/
git commit -m "Fundacao: _shared/auth.ts e senha.ts com testes Deno"
```

---

### Task 6: Script `deploy-edges`

**Files:**
- Create: `scripts/deploy-edges.mjs`
- Modify: `.gitignore` (adicionar `.deploy-edges/`)

**Interfaces:**
- Consumes: `edge-functions/*.ts` + `edge-functions/_shared/*.ts`.
- Produces: `node scripts/deploy-edges.mjs <nome...>` e `--dry-run`. Exige env `SUPABASE_ACCESS_TOKEN` (token pessoal do dashboard → Account → Access Tokens).

- [ ] **Step 1: Script**

```js
// scripts/deploy-edges.mjs — deploy de edge functions A PARTIR DO REPO.
// Motivo de existir: em 2026-07-27 produção estava à frente do repo e um
// diagnóstico inteiro saiu errado. Regra: dashboard NUNCA; só este script.
// Uso:  node scripts/deploy-edges.mjs eloi-gestao [outra...] [--dry-run]
// Env:  SUPABASE_ACCESS_TOKEN (dashboard → Account → Access Tokens)
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const PROJECT = 'nlamznxoocmygfvnqcns'
const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const fns = args.filter(a => a !== '--dry-run')
if (!fns.length) { console.error('uso: node scripts/deploy-edges.mjs <fn...> [--dry-run]'); process.exit(1) }

const STAGE = '.deploy-edges'
rmSync(STAGE, { recursive: true, force: true })
for (const fn of fns) {
  const src = `edge-functions/${fn}.ts`
  if (!existsSync(src)) { console.error(`não existe: ${src}`); process.exit(1) }
  mkdirSync(`${STAGE}/supabase/functions/${fn}`, { recursive: true })
  // CLI espera functions/<fn>/index.ts; imports ./_shared/ viram ../_shared/
  writeFileSync(`${STAGE}/supabase/functions/${fn}/index.ts`,
    readFileSync(src, 'utf8').replaceAll('./_shared/', '../_shared/'))
}
if (existsSync('edge-functions/_shared'))
  cpSync('edge-functions/_shared', `${STAGE}/supabase/functions/_shared`, { recursive: true })

console.log(dry ? '[dry-run] estágio montado em .deploy-edges/ — nada deployado:' : 'deployando:', fns.join(', '))
if (dry) process.exit(0)
if (!process.env.SUPABASE_ACCESS_TOKEN) { console.error('falta SUPABASE_ACCESS_TOKEN'); process.exit(1) }
for (const fn of fns) {
  // --no-verify-jwt OBRIGATÓRIO: auth é token de sessão no body (CORS só content-type)
  execSync(`npx --yes supabase functions deploy ${fn} --project-ref ${PROJECT} --no-verify-jwt`,
    { cwd: STAGE, stdio: 'inherit' })
}
```

- [ ] **Step 2: Dry-run**

Run: `node scripts/deploy-edges.mjs eloi-gestao --dry-run`
Expected: cria `.deploy-edges/supabase/functions/eloi-gestao/index.ts` idêntico ao repo (nenhum `./_shared/` ainda) e sai sem deployar.

- [ ] **Step 3: Deploy real de validação**

Run (com `SUPABASE_ACCESS_TOKEN` no env): `node scripts/deploy-edges.mjs eloi-gestao`
Expected: v14 ACTIVE. Verificar: no `/gestao/` logado, lista de clientes carrega e sem `portal_senha_hash` (DevTools → resposta de `clientes.list`). **Aceite 4 fechado.**

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-edges.mjs .gitignore
git commit -m "Fundacao: deploy de edges pelo repo (script + supabase CLI)"
```

---

### Task 7: Sincronizar TODAS as edges da produção pro repo (fecha S4)

**Files:**
- Create/Modify: `edge-functions/<slug>.ts` para cada function ativa que faltar ou divergir (lista real vem do passo 1; esperadas: `admin-auth`, `portal-cliente`, `orcamentos`, `eloi-financeiro`, `briefing-links`, `briefing-submit`, `public_get`)

**Interfaces:**
- Produces: repo == produção, byte a byte (fora `eloi-gestao`, já sincronizada). Pré-requisito das Tasks 8–9.

- [ ] **Step 1: Listar produção**

Via MCP Supabase: `list_edge_functions` (project `nlamznxoocmygfvnqcns`). Anotar slugs + versões.

- [ ] **Step 2: Baixar cada uma**

Para cada slug: `get_edge_function` → comparar com `edge-functions/<slug>.ts`. Divergiu ou não existe no repo → gravar o conteúdo de produção no repo, verbatim (sem "melhorar" nada nesta task — sincronia primeiro, refactor na Task 8).

- [ ] **Step 3: Conferir que nada local se perdeu**

Run: `git diff --stat edge-functions/`
Expected: só adições/updates vindos de produção. Se alguma função do repo tiver mudança local NÃO deployada, parar e avisar o Wilke (conflito repo × produção — decisão dele).

- [ ] **Step 4: Commit**

```bash
git add edge-functions/
git commit -m "Fundacao: edges sincronizadas com producao (fecha S4 - briefing-submit versionada)"
```

---

### Task 8: Refactor — `verifyAdminToken` vira `_shared/auth.ts` em todas as edges

**Files:**
- Modify: cada `edge-functions/<slug>.ts` que contenha cópia de `verifyAdminToken` (grep no passo 1; esperadas ~6-7: `eloi-gestao`, `orcamentos`, `eloi-financeiro`, `briefing-links`, `eloi-materiais?`…) e `portal-cliente.ts` (verificação de `portal_sessions` → `requireCliente`; normalização de senha → `normalizarSenha`)

**Interfaces:**
- Consumes: `requireAdmin`, `requireCliente`, `normalizarSenha` (Task 5); script de deploy (Task 6).
- Produces: zero cópias locais de verificação de sessão; comportamento idêntico.

- [ ] **Step 1: Mapear cópias**

Run: `grep -rn "verifyAdminToken\|portal_sessions" edge-functions --include="*.ts" -l`
Anotar a lista real.

- [ ] **Step 2: Refactor mecânico, função a função**

Em cada arquivo:
1. Remover a função local `verifyAdminToken` (ou o bloco de verificação de `portal_sessions` no `portal-cliente.ts`).
2. Adicionar `import { requireAdmin } from "./_shared/auth.ts";` (ou `requireCliente`/`normalizarSenha`).
3. Trocar `if (!(await verifyAdminToken(supabase, body?.token)))` → `if (!(await requireAdmin(supabase, body?.token)))`.
4. No `portal-cliente.ts`, trocar a normalização inline (`String(body?.senha||"").replace(/[\s-]/g,"").toUpperCase()` + slices) por `const { prefix, secret } = normalizarSenha(body?.senha)`. NADA mais muda — lockout, throttle, DUMMY_HASH ficam onde estão.

- [ ] **Step 3: Testes + typecheck**

Run: `deno test edge-functions/_tests/` → PASS. `deno check edge-functions/*.ts` → sem erro.

- [ ] **Step 4: Deploy TODAS as refatoradas**

Run: `node scripts/deploy-edges.mjs <lista da task>`
Verificar em produção, na ordem: login admin (`/gestao/`), lista clientes, login portal com senha de teste INVÁLIDA tipo `ZZZZ-x` (esperado: "Senha incorreta", não 500 — prova que `portal-cliente` continua vivo sem gastar tentativa da Georgia).

- [ ] **Step 5: Commit**

```bash
git add edge-functions/
git commit -m "Fundacao: verificacao de sessao unificada em _shared/auth.ts (7 copias mortas)"
```

---

### Task 9: Migration `revogado_em` + checagem nas edges de token

**Files:**
- Create: `db/2026-07-27-revogado-em.sql`
- Modify: `edge-functions/public_get.ts`, `edge-functions/briefing-submit.ts`, `edge-functions/briefing-links.ts` (nomes confirmados na Task 7)

**Interfaces:**
- Consumes: edges sincronizadas (Task 7), deploy script (Task 6).
- Produces: colunas `orcamentos.revogado_em` e `briefing_links.revogado_em`; token revogado → 404. UI de revogar fica pros sub-projetos 2/4.

- [ ] **Step 1: `db/2026-07-27-revogado-em.sql`**

```sql
-- D7: revogação manual de links permanentes (?t=). Aditiva: links vivos
-- nascem com NULL = válidos. Sem expiração automática (decisão explícita).
alter table orcamentos     add column if not exists revogado_em timestamptz;
alter table briefing_links add column if not exists revogado_em timestamptz;
```

- [ ] **Step 2: Aplicar**

Via MCP: `apply_migration` (name `revogado_em`, query acima).
Verificar: `select revogado_em from orcamentos limit 1;` → coluna existe, tudo NULL.

- [ ] **Step 3: Checagem nas edges**

Em cada edge que resolve `?t=` (localizar a query por `share_token` ou `.eq("token"`): adicionar `.is("revogado_em", null)` à query. Token revogado passa a cair no caminho de "não encontrado" que a função já tem (404) — sem branch novo.

- [ ] **Step 4: Testar com registro descartável**

```sql
-- criar link de teste, revogar, conferir 404, apagar
insert into briefing_links (token, tipo, status) values ('teste-revoga-123', 'identidade', 'pendente');
update briefing_links set revogado_em = now() where token = 'teste-revoga-123';
```

Deploy: `node scripts/deploy-edges.mjs <edges alteradas>`. Abrir `/briefing/?t=teste-revoga-123` → form deve tratar como token inválido. Conferir também um `orcamento/?t=` REAL vivo → continua abrindo (**aceite 5**). Limpar: `delete from briefing_links where token = 'teste-revoga-123';`

- [ ] **Step 5: Commit**

```bash
git add db/2026-07-27-revogado-em.sql edge-functions/
git commit -m "Fundacao: revogacao manual de tokens ?t= (coluna + checagem nas edges)"
```

---

### Task 10: CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `app/` com `npm test` (Task 1), testes Deno (Task 5).
- Produces: check verde no push; **aceite 6**.

- [ ] **Step 1: Workflow**

```yaml
name: ci
on:
  push: { branches: [master] }
  pull_request:
jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: app/package-lock.json }
      - run: npm ci
        working-directory: app
      - run: npx tsc --noEmit
        working-directory: app
      - run: npx vitest run
        working-directory: app
      - run: npm run build
        working-directory: app
  edges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno test edge-functions/_tests/
```

- [ ] **Step 2: Push + verificar**

```bash
git add .github/workflows/ci.yml
git commit -m "Fundacao: CI (typecheck + vitest + build + deno test)"
git push origin master
```

`gh run watch` (ou aba Actions) → verde. **Aceite 6 fechado.**

- [ ] **Step 3: Fechar a Fundação**

Checklist de aceite da spec (1–6) — todos conferidos nas tasks 3, 4, 6, 9, 10. Atualizar `SITEMAP.md` (rota `/admin` = SPA nova; hub legado aposentado) e `CLAUDE.md` se necessário. Commit final de docs.

---

## Self-review (feito na escrita)

- **Cobertura da spec:** A (Tasks 1–4) · B (2, 5, 8) · C (6, 7, 9) · D (1, 5, 10) · erro/estados (LoginGate + 401 handling em api.ts) · aceites 1–6 mapeados.
- **Placeholders:** Tasks 7–9 dependem de código que só existe em produção — os passos dão o comando exato de obtenção (`get_edge_function`), o critério de parada (divergência local → perguntar) e a mudança exata (`.is("revogado_em", null)`, troca de import). É o máximo de concretude possível sem inventar código que não vi.
- **Consistência de tipos:** `requireAdmin` devolve `boolean` (mesmo contrato do `verifyAdminToken` atual — troca 1:1 na Task 8); `requireCliente` devolve objeto/null (portal precisa do `cliente_id`); `normalizarSenha` bate com a normalização real do `portal-cliente.ts`.
