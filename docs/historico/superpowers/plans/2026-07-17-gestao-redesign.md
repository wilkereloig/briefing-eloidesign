# Redesign Gestão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a área de Gestão (`gestao/index.html`) numa visão financeira/operacional mensal, separando Faturado/Recebido/A receber, com navegação por mês, ranking por marca e destaque de NF pendente — preservando dados, rotas e funções.

**Architecture:** Abordagem C (cliente calcula). O frontend busca a lista completa de serviços uma vez via `servicos.list` e calcula período/cards/ranking/agrupamento em JS puro (troca de mês = instantânea, sem rede). Backend muda o mínimo: 1 migration (coluna `data_competencia` + backfill) e o `servicos.upsert` do edge function passa a gravar `data_competencia`.

**Tech Stack:** HTML/CSS/JS estático (sem build, sem framework de testes), Supabase Postgres + Edge Function Deno (`eloi-gestao`), preview via `python -m http.server` (porta 5186), verificação via browser MCP + `curl`.

## Global Constraints

- Projeto estático, sem build e **sem test runner** → "teste" = verificação no browser preview (read_page/screenshot/console) e `curl`; nunca inventar framework de teste.
- Preservar: rotas, auth (`EloiAdminAuth`/`admin_sessions`/`eloi_pw`), portais, orçamentos, entregas, senha de portal, modais existentes.
- **Nenhum dado destruído.** Migration só adiciona coluna e faz backfill (`update`).
- Identidade visual noturna roxa mantida (vars `--c950…--c100`, aurora). Evolução, não ruptura.
- Supabase project_id: `nlamznxoocmygfvnqcns`. Cliente F2 id: `b6f964c8-a93e-4093-8924-f170f198e736`.
- Semântica fixa: **Faturado** = Σ valor com `data_competencia` no mês. **Recebido** = Σ valor com `pago=true` E `data_pagamento` no mês. **A receber** = Σ valor `pago=false` com `data_competencia` no mês. **Em execução** e **NF pendente** = contagens **gerais** (independem do mês). Ranking = por **marca** (`sub_cliente || cliente.nome`).
- NF pendente = serviço com `nf_numero` nulo/vazio. Selo lilás quente (`--warn`/#C77DFF), nunca vermelho.
- Commits pequenos por tarefa. Não commitar WIP alheio à tarefa.

---

### Task 1: Migration — coluna `data_competencia` + backfill

**Files:**
- Create: `db/gestao-data-competencia.sql` (registro versionado da migration)
- DB: aplicar via Supabase MCP `apply_migration` (name: `gestao_data_competencia`)

**Interfaces:**
- Produces: coluna `eloi_servicos.data_competencia date` (nullable). 37 notas (`nf_numero` não nulo) ficam com `data_competencia = data_pagamento` (data de emissão que já foi gravada ali). 12 serviços sem NF permanecem `null`.

- [ ] **Step 1: Escrever o SQL da migration**

Conteúdo de `db/gestao-data-competencia.sql`:

```sql
-- Gestão redesign: separa competência (mês da NF) do pagamento.
alter table eloi_servicos add column if not exists data_competencia date;

-- Backfill: nas 37 notas, a data de emissão foi gravada em data_pagamento.
update eloi_servicos
   set data_competencia = data_pagamento
 where nf_numero is not null
   and nf_numero <> ''
   and data_competencia is null;
```

- [ ] **Step 2: Aplicar a migration**

Via MCP: `apply_migration(project_id="nlamznxoocmygfvnqcns", name="gestao_data_competencia", query=<conteúdo acima>)`.

- [ ] **Step 3: Verificar backfill**

Via MCP `execute_sql`:
```sql
select count(*) filter (where data_competencia is not null) as com_comp,
       count(*) filter (where data_competencia is null) as sem_comp,
       min(data_competencia) as primeira, max(data_competencia) as ultima
  from eloi_servicos where cliente_id='b6f964c8-a93e-4093-8924-f170f198e736';
```
Esperado: `com_comp = 37`, `sem_comp = 12`, `primeira = 2026-02-05`, `ultima = 2026-06-16`.

- [ ] **Step 4: Commit**

```bash
git add db/gestao-data-competencia.sql
git commit -m "feat(gestao): coluna data_competencia + backfill das 37 notas"
```

---

### Task 2: Edge function — `servicos.upsert` grava `data_competencia`

**Files:**
- Modify: `edge-functions/eloi-gestao.ts` (bloco `servicos.upsert`, ~linha 144)
- Deploy: MCP `deploy_edge_function` (name `eloi-gestao`, `verify_jwt:false`)

**Interfaces:**
- Consumes: coluna `data_competencia` (Task 1).
- Produces: `servico.data_competencia` persistido no upsert e retornado por `servicos.list` (já usa `select *`).

- [ ] **Step 1: Adicionar o campo no `row` do upsert**

No objeto `row` de `servicos.upsert`, após a linha `data_pagamento: s.data_pagamento || null,` adicionar:
```ts
      data_competencia: s.data_competencia || null,
```

- [ ] **Step 2: Redeploy do edge function**

Via MCP `deploy_edge_function` com o arquivo completo atualizado (`project_id="nlamznxoocmygfvnqcns"`, `name="eloi-gestao"`, `entrypoint_path="index.ts"`, `verify_jwt=false`). Confirmar retorno com `version` incrementada e `status:"ACTIVE"`.

- [ ] **Step 3: Verificar que list devolve a coluna**

Via MCP `execute_sql`:
```sql
select nf_numero, data_competencia, data_pagamento from eloi_servicos
 where nf_numero='9';
```
Esperado: `data_competencia = 2026-02-26`.

- [ ] **Step 4: Commit**

```bash
git add edge-functions/eloi-gestao.ts
git commit -m "feat(gestao): servicos.upsert grava data_competencia"
```

---

### Task 3: Frontend — camada de dados (fetch-all, estado de período, helpers)

**Files:**
- Modify: `gestao/index.html` (bloco `<script>`)

**Interfaces:**
- Consumes: `api('servicos.list')` retornando `{servicos:[...]}` com `data_competencia`.
- Produces (globais/funções JS que as próximas tasks usam):
  - `let SERVICOS = []` — todos os serviços carregados uma vez.
  - `let PERIODO = { ano: <int>, mes: <int|null> }` — `mes` 1..12 ou `null`=Todos.
  - `mesDe(s)` → `'YYYY-MM'|null` a partir de `s.data_competencia`.
  - `noPeriodo(s)` → bool: `data_competencia` cai em `PERIODO` (se `mes=null`, filtra só por ano; se serviço sem competência → false).
  - `pagoNoPeriodo(s)` → bool: `s.pago && s.data_pagamento` cai em `PERIODO`.
  - `anosDisponiveis()` → array de anos presentes em `data_competencia`/`data_pagamento`.
  - `render()` — recomputa e redesenha cards+ranking+lista+clientes conforme `PERIODO`.

- [ ] **Step 1: Substituir `carregarServicos`/`carregarTudo` pela camada única**

Em `carregarTudo`, após `carregarClientes()`, buscar todos os serviços uma vez e definir período inicial. Adicionar/alterar:
```js
async function carregarTudo(){
  await carregarClientes();
  const { servicos } = await api('servicos.list', { filtro:{} });
  SERVICOS = servicos || [];
  const anos = anosDisponiveis();
  const now = new Date();
  const anoAtual = now.getFullYear();
  PERIODO = { ano: anos.includes(anoAtual) ? anoAtual : (anos[anos.length-1] || anoAtual), mes: (now.getMonth()+1) };
  // se o mês atual não tem dados nem é "todos", começa em Todos
  if(!SERVICOS.some(s=>mesDe(s)===`${PERIODO.ano}-${String(PERIODO.mes).padStart(2,'0')}`)) PERIODO.mes = null;
  await carregarDashboardExtra();  // só o card de orçamento (Task 5)
  render();
}
function mesDe(s){ return s.data_competencia ? String(s.data_competencia).slice(0,7) : null; }
function ymPeriodo(){ return PERIODO.mes ? `${PERIODO.ano}-${String(PERIODO.mes).padStart(2,'0')}` : null; }
function noPeriodo(s){ const m=mesDe(s); if(!m) return false; return PERIODO.mes ? m===ymPeriodo() : m.slice(0,4)===String(PERIODO.ano); }
function pagoNoPeriodo(s){ if(!s.pago||!s.data_pagamento) return false; const m=String(s.data_pagamento).slice(0,7); return PERIODO.mes ? m===ymPeriodo() : m.slice(0,4)===String(PERIODO.ano); }
function anosDisponiveis(){ const set=new Set(); SERVICOS.forEach(s=>{ if(s.data_competencia) set.add(String(s.data_competencia).slice(0,4)); if(s.data_pagamento) set.add(String(s.data_pagamento).slice(0,4)); }); return [...set].map(Number).sort((a,b)=>a-b); }
function render(){ renderNav(); renderCards(); renderRanking(); renderServicos(); if(document.getElementById('tabClientes').style.display!=='none') carregarClientes(); }
```

- [ ] **Step 2: Neutralizar chamadas antigas**

Remover as chamadas diretas a `carregarDashboard()` e `carregarServicos()` espalhadas (nos `salvarServico`/`excluirServico`/`salvarCliente`/`excluirCliente`): substituir por `await recarregar()`. Adicionar helper:
```js
async function recarregar(){ const { servicos } = await api('servicos.list',{filtro:{}}); SERVICOS = servicos||[]; await carregarClientes(); await carregarDashboardExtra(); render(); }
```
As funções `renderNav/renderCards/renderRanking/renderServicos/carregarDashboardExtra` são criadas nas Tasks 4-8; até lá podem ser stubs vazios `function renderNav(){} ...` para não quebrar.

- [ ] **Step 3: Verificar no browser (sem erro de console)**

Preview: `preview_start({name:"briefing-eloidesign-repo"})`, navegar `http://localhost:5186/gestao/`, logar, `read_console_messages({onlyErrors:true})`. Esperado: sem erros; `SERVICOS.length` = 49 (via `javascript_tool`: `SERVICOS.length`).

- [ ] **Step 4: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): camada de dados unica + estado de periodo"
```

---

### Task 4: Frontend — navegação mensal (abas + ano)

**Files:**
- Modify: `gestao/index.html` (HTML: inserir container de nav antes de `#metrics`; CSS: estilos das abas; JS: `renderNav`, `setMes`, `setAno`)

**Interfaces:**
- Consumes: `PERIODO`, `anosDisponiveis()`, `render()`.
- Produces: `renderNav()` desenha abas Jan..Dez + Todos + seletor de ano; `setMes(m)`/`setAno(a)` atualizam `PERIODO` e chamam `render()`.

- [ ] **Step 1: HTML — inserir barra de navegação**

Antes de `<div class="metrics" id="metrics"></div>` (linha ~141) inserir:
```html
  <div class="monthnav"><div class="months" id="monthTabs"></div><select id="yearSel" class="yearsel" onchange="setAno(this.value)"></select></div>
```

- [ ] **Step 2: CSS — estilos da nav**

Adicionar ao `<style>`:
```css
.monthnav{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.months{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex:1;padding-bottom:2px}
.months::-webkit-scrollbar{display:none}
.mtab{flex:0 0 auto;background:none;border:none;color:var(--c300);font-family:var(--font);font-size:.82rem;padding:7px 13px;border-radius:99px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.mtab:hover{color:#fff}
.mtab.active{background:var(--c700);color:#fff;font-variation-settings:'wght' 600}
.yearsel{background:var(--c950);border:1px solid var(--c800);border-radius:99px;color:#fff;font-family:var(--font);font-size:.82rem;padding:7px 12px;outline:none}
```

- [ ] **Step 3: JS — implementar `renderNav`/`setMes`/`setAno`**

```js
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function renderNav(){
  const tabs = MESES.map((nm,i)=>`<button class="mtab${PERIODO.mes===i+1?' active':''}" onclick="setMes(${i+1})">${nm}</button>`).join('')
    + `<button class="mtab${PERIODO.mes===null?' active':''}" onclick="setMes(null)">Todos</button>`;
  document.getElementById('monthTabs').innerHTML = tabs;
  const anos = anosDisponiveis(); const ys=document.getElementById('yearSel');
  ys.style.display = anos.length>1 ? 'block' : 'none';
  ys.innerHTML = anos.map(a=>`<option value="${a}"${a===PERIODO.ano?' selected':''}>${a}</option>`).join('');
}
function setMes(m){ PERIODO.mes = m; render(); }
function setAno(a){ PERIODO.ano = Number(a); render(); }
```
Remover o stub vazio de `renderNav` da Task 3.

- [ ] **Step 4: Verificar no browser**

Reload, `read_page`. Esperado: 12 abas + "Todos" + (ano oculto pois só 2026). Clicar "Fev" → aba fica ativa (screenshot). Sem erro de console.

- [ ] **Step 5: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): navegacao mensal por abas + ano"
```

---

### Task 5: Frontend — cards financeiros (5) + card orçamento

**Files:**
- Modify: `gestao/index.html` (JS: `renderCards`, `carregarDashboardExtra`; CSS: refino `.stat`)

**Interfaces:**
- Consumes: `SERVICOS`, `noPeriodo`, `pagoNoPeriodo`, `PERIODO`.
- Produces: `renderCards()` preenche `#metrics`; `carregarDashboardExtra()` guarda `ORC_PEND` a partir de `dashboard.stats`. `filtroCard(tipo)` seta filtros da lista e rola até ela.

- [ ] **Step 1: JS — `carregarDashboardExtra` (só o card de orçamento)**

```js
let ORC_PEND = { count:0, cents:0 };
async function carregarDashboardExtra(){
  try{ const s = await api('dashboard.stats'); ORC_PEND = { count:s.aprovados_pendentes_count||0, cents:s.aprovados_pendentes_cents||0 }; }
  catch(_){ ORC_PEND = { count:0, cents:0 }; }
}
```

- [ ] **Step 2: JS — `renderCards`**

```js
function renderCards(){
  const inP = SERVICOS.filter(noPeriodo);
  const faturado = inP.reduce((a,s)=>a+(+s.valor_cents||0),0);
  const recebido = SERVICOS.filter(pagoNoPeriodo).reduce((a,s)=>a+(+s.valor_cents||0),0);
  const aReceber = inP.filter(s=>!s.pago).reduce((a,s)=>a+(+s.valor_cents||0),0);
  const emExec = SERVICOS.filter(s=>s.status_execucao==='em_execucao').length;
  const semNf = SERVICOS.filter(s=>!s.nf_numero);
  const semNfCents = semNf.reduce((a,s)=>a+(+s.valor_cents||0),0);
  const cards = [
    `<div class="stat" onclick="filtroCard('faturado')"><div class="sv">${brl(faturado)}</div><div class="sl">Faturado no mês</div></div>`,
    `<div class="stat good" onclick="filtroCard('recebido')"><div class="sv">${brl(recebido)}</div><div class="sl">Recebido no mês</div></div>`,
    `<div class="stat amber" onclick="filtroCard('areceber')"><div class="sv">${brl(aReceber)}</div><div class="sl">A receber</div></div>`,
    `<div class="stat" onclick="filtroCard('execucao')"><div class="sv">${emExec}</div><div class="sl">Em execução</div></div>`,
    `<div class="stat warn" onclick="filtroCard('nfpend')"><div class="sv">${semNf.length}</div><div class="sl">NF pendente · ${brl(semNfCents)} a faturar</div></div>`,
  ];
  if(ORC_PEND.count) cards.push(`<div class="stat amber"><div class="sv">${brl(ORC_PEND.cents)}</div><div class="sl">Orçamento aprovado sem serviço</div></div>`);
  document.getElementById('metrics').innerHTML = cards.join('');
}
function filtroCard(t){
  const set=(id,v)=>{const el=document.getElementById(id); if(el){el.value=v;}};
  if(t==='recebido'){ set('fPago','true'); set('fNota',''); set('fStatus',''); }
  else if(t==='areceber'){ set('fPago','false'); set('fNota',''); set('fStatus',''); }
  else if(t==='execucao'){ set('fStatus','em_execucao'); set('fPago',''); set('fNota',''); }
  else if(t==='nfpend'){ set('fNota','pendente'); set('fPago',''); set('fStatus',''); }
  else { set('fPago',''); set('fStatus',''); set('fNota',''); }
  renderServicos(); document.getElementById('tabServicos').scrollIntoView({behavior:'smooth'});
}
```
Remover o antigo `carregarDashboard` (substituído). Remover stub de `renderCards`.

- [ ] **Step 3: CSS — cor âmbar + cursor**

Adicionar:
```css
.stat{cursor:pointer;transition:border-color .15s,transform .12s}
.stat:hover{border-color:var(--c600);transform:translateY(-1px)}
.stat.amber .sv{color:#f0c46a}
```

- [ ] **Step 4: Verificar no browser**

Reload, logar. `read_page` nos cards. Em "Todos": Faturado = R$ 55.930,00 (37 notas: 51.930 + NF#9 4.100 = 56.030? conferir soma real dos com competência) e "NF pendente · 12". Trocar pra "Fev" → faturado muda pro subtotal de fevereiro. Screenshot. Sem erro de console.

- [ ] **Step 5: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): cards financeiros faturado/recebido/a-receber/nf-pendente"
```

---

### Task 6: Frontend — ranking mensal por marca

**Files:**
- Modify: `gestao/index.html` (HTML: título do `.rankwrap`; JS: `renderRanking`; CSS: barra)

**Interfaces:**
- Consumes: `SERVICOS`, `noPeriodo`, `pagoNoPeriodo`, `CLIENTES`.
- Produces: `renderRanking()` preenche `#rank` com linhas por marca.

- [ ] **Step 1: HTML — renomear título**

Trocar `<h3>Faturamento por cliente</h3>` por `<h3>Faturamento por marca no período</h3>`.

- [ ] **Step 2: JS — `renderRanking`**

```js
function corDoCliente(id){ const c=CLIENTES.find(x=>x.id===id); return c?c.cor:'#7B2CBF'; }
function renderRanking(){
  const inP = SERVICOS.filter(noPeriodo);
  const map = {};
  inP.forEach(s=>{
    const cli = CLIENTES.find(c=>c.id===s.cliente_id);
    const marca = s.sub_cliente || (cli?cli.nome:'—');
    const r = map[marca] || (map[marca]={ marca, cor:corDoCliente(s.cliente_id), fat:0, rec:0, ar:0, n:0 });
    const v=+s.valor_cents||0; r.fat+=v; r.n++; if(!s.pago) r.ar+=v;
  });
  SERVICOS.filter(pagoNoPeriodo).forEach(s=>{
    const cli = CLIENTES.find(c=>c.id===s.cliente_id);
    const marca = s.sub_cliente || (cli?cli.nome:'—');
    if(map[marca]) map[marca].rec += (+s.valor_cents||0);
  });
  const rows = Object.values(map).sort((a,b)=>b.fat-a.fat);
  const rw = document.getElementById('rankwrap');
  if(!rows.length){ rw.style.display='none'; return; }
  rw.style.display='block';
  const max = rows[0].fat || 1;
  document.getElementById('rank').innerHTML = rows.map(r=>`
    <div class="rank-row">
      <span class="chip" style="background:${esc(r.cor)}">${esc(r.marca)}</span>
      <span style="font-size:.74rem;color:var(--c300)">${r.n} serv.</span>
      <div class="rbar"><span style="width:${Math.round(r.fat/max*100)}%;background:${esc(r.cor)}"></span></div>
      <span class="rv" title="faturado">${brl(r.fat)}</span>
      <span style="font-size:.72rem;color:var(--good)" title="recebido">${brl(r.rec)}</span>
      <span style="font-size:.72rem;color:#f0c46a" title="a receber">${brl(r.ar)}</span>
    </div>`).join('');
}
```
Remover stub de `renderRanking`.

- [ ] **Step 3: CSS — barra proporcional**

```css
.rank-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.85rem;flex-wrap:wrap}
.rbar{flex:1;min-width:80px;height:6px;background:rgba(157,78,221,.15);border-radius:99px;overflow:hidden}
.rbar span{display:block;height:100%;border-radius:99px}
```

- [ ] **Step 4: Verificar no browser**

Reload. Em "Todos": primeira linha PLANO&PLANO com barra cheia; ASUS/VIBRA/etc menores. Cada linha mostra faturado/recebido/a-receber. Screenshot. Sem erro console.

- [ ] **Step 5: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): ranking por marca com barra faturado/recebido/a-receber"
```

---

### Task 7: Frontend — lista de serviços (agrupamento, badges, NF pendente, filtros)

**Files:**
- Modify: `gestao/index.html` (HTML: filtros; JS: `renderServicos`, `linhaServico`; CSS: badges)

**Interfaces:**
- Consumes: `SERVICOS`, `noPeriodo`, `CLIENTES`, filtros do DOM.
- Produces: `renderServicos()` desenha `#servicosList` (bloco "A faturar" + grupos Cliente›Marca); `linhaServico(s,c)` retorna o cartão.

- [ ] **Step 1: HTML — reescrever filtros**

Substituir todo o `<div class="filters">…</div>` da aba serviços por:
```html
    <details class="filtersbox" open>
      <summary>Filtros</summary>
      <div class="filters">
        <div><label>Cliente</label><select id="fCliente" onchange="renderServicos()"><option value="">Todos</option></select></div>
        <div><label>Status do serviço</label><select id="fStatus" onchange="renderServicos()"><option value="">Todos</option><option value="aguardando_inicio">Aguardando início</option><option value="em_execucao">Em execução</option><option value="concluida">Concluída</option></select></div>
        <div><label>Pagamento</label><select id="fPago" onchange="renderServicos()"><option value="">Todos</option><option value="true">Pago</option><option value="false">A receber</option></select></div>
        <div><label>Nota fiscal</label><select id="fNota" onchange="renderServicos()"><option value="">Todas</option><option value="emitida">Emitida</option><option value="pendente">Pendente</option></select></div>
        <div><label>Busca</label><input type="text" id="fBusca" placeholder="serviço..." oninput="renderServicos()"></div>
        <div style="margin-left:auto"><button class="btn" onclick="abrirServico()">+ Serviço</button></div>
      </div>
    </details>
```

- [ ] **Step 2: CSS — filtersbox + badges NF + bloco a faturar**

```css
.filtersbox{margin-bottom:14px}
.filtersbox>summary{cursor:pointer;color:var(--c300);font-size:.78rem;list-style:none;margin-bottom:8px}
.filtersbox>summary::-webkit-details-marker{display:none}
.badge.nfok{background:rgba(56,142,60,.14);border-color:#4a7d4f;color:var(--good)}
.badge.nfpend{background:rgba(199,125,255,.16);border-color:var(--c500);color:var(--c100)}
.afaturar-h{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:var(--c100);margin:4px 0 8px;font-variation-settings:'wght' 600}
```

- [ ] **Step 3: JS — `renderServicos` (filtros + "A faturar" + grupos)**

```js
function servicosFiltrados(){
  const fc=document.getElementById('fCliente').value;
  const fs=document.getElementById('fStatus').value;
  const fp=document.getElementById('fPago').value;
  const fn=document.getElementById('fNota').value;
  const fb=(document.getElementById('fBusca').value||'').toLowerCase();
  return SERVICOS.filter(s=>{
    if(fc && s.cliente_id!==fc) return false;
    if(fs && s.status_execucao!==fs) return false;
    if(fp && String(!!s.pago)!==fp) return false;
    if(fn==='emitida' && !s.nf_numero) return false;
    if(fn==='pendente' && s.nf_numero) return false;
    if(fb && !(String(s.descricao||'')+' '+String(s.sub_cliente||'')).toLowerCase().includes(fb)) return false;
    return true;
  });
}
function grupoHTML(itens){
  const byCli={}; itens.forEach(s=>(byCli[s.cliente_id]??=[]).push(s));
  const ordem=CLIENTES.filter(c=>byCli[c.id]);
  return ordem.map(c=>{
    const arrC=byCli[c.id]; const tot=arrC.reduce((a,s)=>a+(+s.valor_cents||0),0);
    const bySub={}; arrC.forEach(s=>(bySub[s.sub_cliente||'']??=[]).push(s));
    const chaves=Object.keys(bySub).sort((a,b)=>a===''?-1:b===''?1:a.localeCompare(b));
    const corpo=chaves.map(sk=>{
      const arr=bySub[sk];
      if(!sk) return arr.map(s=>linhaServico(s,c)).join('');
      const st=arr.reduce((a,s)=>a+(+s.valor_cents||0),0);
      return `<div class="subgrp"><div class="subgrp-h">↳ ${esc(sk)} <span class="gtot">${arr.length} • ${brl(st)}</span></div>${arr.map(s=>linhaServico(s,c)).join('')}</div>`;
    }).join('');
    return `<div class="grupo"><div class="grupo-h"><span class="chip" style="background:${esc(c.cor)}">${esc(c.nome)}</span><span class="gtot">${arrC.length} • ${brl(tot)}</span></div>${corpo}</div>`;
  }).join('');
}
function renderServicos(){
  const filt=servicosFiltrados();
  // popula datalist de sub-clientes
  const subs=new Set(); SERVICOS.forEach(s=>{ if(s.sub_cliente) subs.add(s.sub_cliente); });
  const dl=document.getElementById('subClientes'); if(dl) dl.innerHTML=[...subs].sort().map(v=>`<option value="${esc(v)}">`).join('');
  const doMes = filt.filter(noPeriodo);
  const aFaturar = filt.filter(s=>!s.nf_numero);            // sem competência/sem NF = a faturar (geral)
  const list=document.getElementById('servicosList');
  let html='';
  if(aFaturar.length){ html += `<div class="afaturar-h">A faturar (sem NF) — ${aFaturar.length} · ${brl(aFaturar.reduce((a,s)=>a+(+s.valor_cents||0),0))}</div>` + grupoHTML(aFaturar); }
  if(doMes.length){ html += (aFaturar.length?`<div class="afaturar-h" style="margin-top:18px">Faturado ${PERIODO.mes?MESES[PERIODO.mes-1]+'/'+PERIODO.ano:'(todos)'}</div>`:'') + grupoHTML(doMes); }
  list.innerHTML = html || '<div class="empty">Nenhum serviço no período. Ajuste o mês ou os filtros.</div>';
}
```

- [ ] **Step 4: JS — `linhaServico` com badge NF + competência**

Substituir `linhaServico` por:
```js
function linhaServico(s,c){
  const stb = s.status_execucao==='concluida' ? '<span class="badge concl">Concluída</span>'
    : s.status_execucao==='aguardando_inicio' ? '<span class="badge aguard">Aguardando início</span>'
    : '<span class="badge exec">Em execução</span>';
  const pgb = s.pago ? '<span class="badge pago">Pago</span>' : '<span class="badge naopago">A receber</span>';
  const nfb = s.nf_numero ? `<span class="badge nfok">NF ${esc(s.nf_numero)}</span>` : '<span class="badge nfpend">NF pendente</span>';
  const meta = [ s.data_competencia?('comp. '+dataBR(s.data_competencia)):'', s.data_pagamento?('pg '+dataBR(s.data_pagamento)):'', s.observacoes?esc(s.observacoes):'' ].filter(Boolean).join(' • ');
  const nfBtn = s.nf_arquivo_url ? `<button class="nf-pill" onclick="event.stopPropagation();verNF('${esc(s.nf_arquivo_url)}')">📄</button>` : '';
  return `<div class="svc" onclick='abrirServico(${JSON.stringify(s).replace(/'/g,"&#39;")})'>
    <div class="desc"><div class="d">${esc(s.descricao)}</div>${meta?`<div class="m">${meta}</div>`:''}</div>
    ${stb}${pgb}${nfb}${nfBtn}<div class="valor">${brl(s.valor_cents)}</div>
  </div>`;
}
```
Remover o antigo `carregarServicos` (não é mais chamado; `render()` usa `renderServicos`). Manter `verNF`.

- [ ] **Step 5: Verificar no browser**

Reload. Em "Fev": grupo F2 › marcas (VIBRA, ASUS, PLANO&PLANO...) com notas de fev; bloco "A faturar (sem NF) — 12". Filtro Nota=Pendente → só os 12. Filtro Nota=Emitida → some o bloco a faturar. Busca "vibra" filtra. Screenshot. Sem erro console.

- [ ] **Step 6: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): lista por competencia, bloco a-faturar, badge NF pendente, filtros"
```

---

### Task 8: Frontend — aba Clientes com resumo do período

**Files:**
- Modify: `gestao/index.html` (JS: `carregarClientes` — parte da lista de cards de cliente)

**Interfaces:**
- Consumes: `CLIENTES`, `SERVICOS`, `noPeriodo`, `pagoNoPeriodo`.
- Produces: cada `.cli-row` mostra resumo do período. Preserva ações (senha portal, arquivos, link marca, editar).

- [ ] **Step 1: JS — enriquecer o `.cli-row`**

Na função `carregarClientes`, no `.map` da lista (`list.innerHTML = clientes.map(...)`), calcular resumo por cliente e trocar o `<span class="cmeta">…</span>` por métricas do período:
```js
  list.innerHTML = clientes.map(c=>{
    const meus = SERVICOS.filter(s=>s.cliente_id===c.id);
    const inP = meus.filter(noPeriodo);
    const fat = inP.reduce((a,s)=>a+(+s.valor_cents||0),0);
    const rec = meus.filter(pagoNoPeriodo).reduce((a,s)=>a+(+s.valor_cents||0),0);
    const ar  = inP.filter(s=>!s.pago).reduce((a,s)=>a+(+s.valor_cents||0),0);
    const exec = meus.filter(s=>s.status_execucao==='em_execucao').length;
    const semNf = meus.filter(s=>!s.nf_numero).length;
    return `
    <div class="cli-row" onclick='abrirCliente(${JSON.stringify(c).replace(/'/g,"&#39;")})'>
      <span class="chip" style="background:${esc(c.cor)}">${esc(c.nome)}</span>
      ${c.contato?`<span style="font-size:.8rem;color:var(--c300)">${esc(c.contato)}</span>`:''}
      ${c.marca_slug?`<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick='event.stopPropagation();copiarLinkMarca(${JSON.stringify(c.marca_slug)})'>🔗 ${c.marca_publicada?'link marca':'link marca (rascunho)'}</button>`:''}
      <button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick='event.stopPropagation();gerarSenhaPortal(${JSON.stringify(c.id)})'>🔐 Senha portal</button>
      <button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick='event.stopPropagation();abrirEntregas(${JSON.stringify(c.id)},${JSON.stringify(c.nome)})'>📁 Arquivos</button>
      <span class="cmeta">Fat ${brl(fat)} · Rec ${brl(rec)} · A receber ${brl(ar)}<br>${exec} em exec. · ${semNf} NF pend.</span>
    </div>`;
  }).join('');
```
Manter a parte de cima da função (`api('clientes.list')`, popular selects) intacta.

- [ ] **Step 2: Verificar no browser**

Reload → aba Clientes. Card F2 mostra "Fat/Rec/A receber" do período + "em exec · NF pend". Trocar mês muda os números (F2 precisa re-render: `render()` chama `carregarClientes` quando a aba está visível — confirmar). Screenshot.

- [ ] **Step 3: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): aba clientes com resumo financeiro do periodo"
```

---

### Task 9: Frontend — campo data_competencia no modal + polimento visual/responsivo

**Files:**
- Modify: `gestao/index.html` (HTML modal serviço; JS `abrirServico`/`salvarServico`; CSS responsivo/respiro)

**Interfaces:**
- Consumes: `data_competencia` no upsert (Task 2).
- Produces: modal grava/edita `data_competencia`; layout revisado desktop+mobile.

- [ ] **Step 1: HTML — campo competência no modal**

No modal serviço, na `.frow` que tem "Nº Nota" e "Data pagamento", adicionar antes um campo:
```html
      <div class="fld"><label>Data da NF (competência)</label><input type="date" id="svcComp"></div>
```
(pode ficar numa `.frow` própria acima da de pagamento para não apertar).

- [ ] **Step 2: JS — ler/gravar competência**

Em `abrirServico`, após a linha de `svcData`:
```js
  document.getElementById('svcComp').value = d&&d.data_competencia?String(d.data_competencia).slice(0,10):'';
```
Em `salvarServico`, no objeto `servico`, adicionar:
```js
    data_competencia: document.getElementById('svcComp').value || null,
```

- [ ] **Step 3: CSS — respiro + responsivo**

Adicionar:
```css
.metrics{gap:14px;margin-bottom:18px}
@media(max-width:640px){
  .metrics{grid-template-columns:repeat(2,1fr)}
  .topbar .logo{width:104px}
  .filters{gap:6px}
  .rank-row .rv{margin-left:0}
}
```

- [ ] **Step 4: Verificar desktop + mobile**

Desktop: editar um serviço, ver "Data da NF" preenchida; salvar mantém. Mobile: `resize_window({preset:"mobile"})`, reload — abas com scroll-x, cards em 2 colunas, filtros recolhíveis (`<details>`). Screenshot dos dois. Sem erro console.

- [ ] **Step 5: Commit**

```bash
git add gestao/index.html
git commit -m "feat(gestao): campo competencia no modal + polimento responsivo"
```

---

### Task 10: Verificação final ponta-a-ponta + coerência de totais

**Files:** nenhum (verificação); corrigir inline se algo quebrar.

- [ ] **Step 1: Conferir coerência faturado vs DB**

Via `execute_sql`:
```sql
select to_char(data_competencia,'YYYY-MM') ym, to_char(sum(valor_cents)/100.0,'FM999G990D00') fat
  from eloi_servicos where data_competencia is not null group by 1 order by 1;
```
Comparar cada mês com o card "Faturado no mês" da aba correspondente no browser. Devem bater.

- [ ] **Step 2: Fluxo completo no browser**

Percorrer: Todos → cada mês com dado (Fev, Mar, Abr, Jun) conferindo cards+ranking+lista; aba Clientes; criar um serviço teste com competência e apagá-lo (confirma upsert/recarregar). `read_console_messages({onlyErrors:true})` = vazio.

- [ ] **Step 3: Commit final (se houve correção)**

```bash
git add gestao/index.html
git commit -m "fix(gestao): ajustes de coerencia pos-verificacao"
```

---

## Self-Review (cobertura da spec)

- Modelo de dados (data_competencia + backfill) → Task 1 ✓
- Backend upsert grava competência → Task 2 ✓
- Camada cliente + estado período → Task 3 ✓
- Navegação mensal + ano → Task 4 ✓
- 5 cards + semântica Faturado≠Recebido + card orçamento + clique→filtro → Task 5 ✓
- Ranking por marca com barra → Task 6 ✓
- Lista por competência, bloco "A faturar", badge NF pendente, filtros renomeados, remove filtro mês → Task 7 ✓
- Aba Clientes resumo do período → Task 8 ✓
- Campo competência no modal + visual/responsivo → Task 9 ✓
- Verificação coerência desktop+mobile → Task 10 ✓
- Contagens Em execução/NF pendente **gerais** → Tasks 5/8 (usam SERVICOS sem noPeriodo) ✓
- Nenhum dado destruído; rotas/auth/portais/orçamentos intactos ✓
