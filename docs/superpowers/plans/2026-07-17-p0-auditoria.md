# P0 Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 64 achados da auditoria (spec `docs/superpowers/specs/2026-07-17-p0-auditoria-design.md`) — integridade financeira/mês, vínculo cliente_id, sistema visual, nomenclatura — sem quebrar nada que já funciona.

**Architecture:** Repo estático HTML/JS sem build, sem framework de teste. Cada task edita 1-3 arquivos diretamente. Verificação = `node --check` (sintaxe de JS puro), grep estrutural (confirma string presente/ausente), query SQL (dado), e checagem manual no browser (preview local) pro passo final de cada onda. Sem dado fictício — todo número citado nas tasks vem de query real feita durante a auditoria (project `nlamznxoocmygfvnqcns`).

**Tech Stack:** HTML/CSS/JS vanilla, Supabase (Postgres + Edge Functions Deno), deploy Vercel (push em `master`).

## Global Constraints

- Nunca inventar `data_competencia` nem alterar `valor_cents`/`data_pagamento`/`nf_numero` de registro real sem base em dado já cadastrado (regra do usuário).
- Não fazer `git add -A` / não commitar `.claude/` ou `.superpowers/` (já no `.gitignore`).
- Não fazer download/vendorização de biblioteca de terceiro (`fflate.min.js`) sem pedir confirmação explícita ao usuário antes — está fora deste plano (ver nota na Task 9).
- Onda 4 (Task 19) só executa depois de aprovação humana explícita da tabela gerada na Task 18 — não é um gate automático de código, é uma pausa real no processo.
- Todo `git commit` usa mensagem `feat(p0): ...` ou `fix(p0): ...`, um commit por task.
- Deploy de edge function usa a tool `mcp__<supabase>__deploy_edge_function` com `project_id: nlamznxoocmygfvnqcns`.
- **`/tmp` não existe (Windows).** Todos os steps de verificação de sintaxe abaixo escrevem em `/tmp/*-check.js` — isso está errado. Usar o diretório de scratchpad da sessão no lugar, mantendo o mesmo nome de arquivo.
- **Task 8 foi DISSOLVIDA** — não executar. Ver `docs/superpowers/specs/2026-07-18-execucao-pendencias-design.md`. Steps 1–2 viraram a Task 4b do plano de Orçamentos; Steps 3–4 foram absorvidos pelas Tasks 5 e 6 do mesmo plano.

---

## Onda 1 — Integridade financeira e lógica de mês

### Task 1: `periodo.js` — helper de serviços sem competência

**Files:**
- Modify: `assets/eloi-admin/periodo.js`

**Interfaces:**
- Produces: `EloiPeriodo.semCompetencia(servicos)` → `{ count: number, cents: number, items: Array }` — usado pela Task 2.

- [ ] **Step 1: Adicionar a função e exportá-la**

Em `assets/eloi-admin/periodo.js`, logo após a função `anterior` (antes do bloco `function brl(cents){...}`), adicionar:

```js
  function semCompetencia(servicos){
    var alvo = (servicos||[]).filter(function(s){ return !s.data_competencia; });
    var cents = alvo.reduce(function(a,s){ return a + (Number(s.valor_cents)||0); }, 0);
    return { count: alvo.length, cents: cents, items: alvo };
  }
```

E no objeto `w.EloiPeriodo = {...}` no final do arquivo, adicionar `semCompetencia: semCompetencia,` na lista (junto de `anterior: anterior,`).

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check "assets/eloi-admin/periodo.js"`
Expected: sem saída (sucesso).

- [ ] **Step 3: Verificar lógica com script standalone**

Run:
```bash
node -e "
global.window = {};
require('./assets/eloi-admin/periodo.js');
const P = global.window.EloiPeriodo;
const servicos = [
  { valor_cents: 100000, data_competencia: '2026-04-01' },
  { valor_cents: 160000, data_competencia: null },
  { valor_cents: 75000, data_competencia: null },
];
const r = P.semCompetencia(servicos);
console.assert(r.count === 2, 'count deveria ser 2, veio ' + r.count);
console.assert(r.cents === 235000, 'cents deveria ser 235000, veio ' + r.cents);
console.log('OK', JSON.stringify(r));
"
```
Expected: `OK {"count":2,"cents":235000,...}` sem nenhuma linha de `Assertion failed`.

- [ ] **Step 4: Commit**

```bash
git add assets/eloi-admin/periodo.js
git commit -m "feat(p0): periodo.js expõe semCompetencia() para achar servicos sem mes definido"
```

---

### Task 2: `admin/index.html` — banner "sem competência" + fix "Clientes em destaque"

**Files:**
- Modify: `admin/index.html`

**Interfaces:**
- Consumes: `EloiPeriodo.semCompetencia(servicos)` (Task 1).

- [ ] **Step 1: Adicionar o slot HTML do banner**

Em `admin/index.html`, localizar (por volta da linha 110):

```html
  <div id="dash" style="display:none">
    <div class="fin" id="fin"></div>
```

Substituir por:

```html
  <div id="dash" style="display:none">
    <div class="fin" id="fin"></div>
    <div class="sem-comp" id="semComp" style="display:none"></div>
```

- [ ] **Step 2: Adicionar o CSS do banner**

Localizar (por volta da linha 46-52):

```css
    .fin{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    @media(max-width:760px){.fin{grid-template-columns:1fr 1fr}}
```

Adicionar logo depois:

```css
    .sem-comp{margin-top:10px;padding:10px 14px;background:rgba(240,196,106,.12);border:1px solid rgba(240,196,106,.35);border-radius:10px;font-size:.82rem}
    .sem-comp a{color:var(--amber);text-decoration:none}
    .sem-comp a:hover{text-decoration:underline}
```

- [ ] **Step 3: Renderizar o banner em `renderFin()`**

Localizar a função `renderFin()` (por volta da linha 205):

```js
function renderFin(){
  const cur = finDoPeriodo(PERIODO);
  const prev = PERIODO.mes ? finDoPeriodo(P.anterior(PERIODO)) : null;
  const est = FIN ? (FIN.aprovados_pendentes_cents||0) : 0;
  const estN = FIN ? (FIN.aprovados_pendentes_count||0) : 0;
  document.getElementById('fin').innerHTML = `
    <a class="fcard" href="/gestao/"><div class="fl">Faturado</div><div class="fv">${brl(cur.faturado)}</div>${prev?deltaHTML(cur.faturado,prev.faturado):''}</a>
    <a class="fcard good" href="/gestao/"><div class="fl">Recebido</div><div class="fv">${brl(cur.recebido)}</div>${prev?deltaHTML(cur.recebido,prev.recebido):''}</a>
    <a class="fcard amber" href="/gestao/"><div class="fl">A receber</div><div class="fv">${brl(cur.aReceber)}</div></a>
    <a class="fcard est" href="/painel-orcamentos/"><div class="fl">Estimativa</div><div class="fv">${brl(est)}</div><div class="delta">${estN} orç. aprovado(s) sem serviço</div></a>`;
}
```

Substituir por:

```js
function renderFin(){
  const cur = finDoPeriodo(PERIODO);
  const prev = PERIODO.mes ? finDoPeriodo(P.anterior(PERIODO)) : null;
  const est = FIN ? (FIN.aprovados_pendentes_cents||0) : 0;
  const estN = FIN ? (FIN.aprovados_pendentes_count||0) : 0;
  document.getElementById('fin').innerHTML = `
    <a class="fcard" href="/gestao/"><div class="fl">Faturado</div><div class="fv">${brl(cur.faturado)}</div>${prev?deltaHTML(cur.faturado,prev.faturado):''}</a>
    <a class="fcard good" href="/gestao/"><div class="fl">Recebido</div><div class="fv">${brl(cur.recebido)}</div>${prev?deltaHTML(cur.recebido,prev.recebido):''}</a>
    <a class="fcard amber" href="/gestao/"><div class="fl">A receber</div><div class="fv">${brl(cur.aReceber)}</div></a>
    <a class="fcard est" href="/painel-orcamentos/"><div class="fl">Estimativa</div><div class="fv">${brl(est)}</div><div class="delta">${estN} orç. aprovado(s) sem serviço</div></a>`;
  const semComp = P.semCompetencia(SERVICOS);
  const semCompEl = document.getElementById('semComp');
  if(semComp.count){
    semCompEl.style.display = 'block';
    semCompEl.innerHTML = `<a href="/gestao/">⚠ ${semComp.count} serviço(s) sem competência definida — ${brl(semComp.cents)} fora dos totais acima</a>`;
  } else {
    semCompEl.style.display = 'none';
  }
}
```

- [ ] **Step 4: Corrigir `renderClientes()` pra não descartar "Recebido" de cliente fora do mapa de competência**

Localizar (por volta da linha 263):

```js
function renderClientes(){
  const map={};
  SERVICOS.filter(s=>P.noPeriodo(PERIODO,s)).forEach(s=>{
    const c = map[s.cliente_id] || (map[s.cliente_id]={ id:s.cliente_id, nome:nomeCliente(s.cliente_id), cor:corCliente(s.cliente_id), fat:0, ar:0, exec:0 });
    c.fat += (+s.valor_cents||0); if(!s.pago) c.ar += (+s.valor_cents||0);
    if(s.status_execucao==='em_execucao') c.exec++;
  });
  SERVICOS.filter(s=>P.pagoNoPeriodo(PERIODO,s)).forEach(s=>{ if(map[s.cliente_id]){ map[s.cliente_id].rec=(map[s.cliente_id].rec||0)+(+s.valor_cents||0); } });
```

Substituir a última linha por:

```js
  SERVICOS.filter(s=>P.pagoNoPeriodo(PERIODO,s)).forEach(s=>{
    const c = map[s.cliente_id] || (map[s.cliente_id]={ id:s.cliente_id, nome:nomeCliente(s.cliente_id), cor:corCliente(s.cliente_id), fat:0, ar:0, exec:0 });
    c.rec = (c.rec||0) + (+s.valor_cents||0);
  });
```

- [ ] **Step 5: Verificar sintaxe**

Extrair o `<script>` de `admin/index.html` e checar com `node --check` (não dá pra rodar `node --check` direto num `.html`, então validar via um script temporário):

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
fs.writeFileSync('/tmp/admin-check.js', 'const document={getElementById:()=>({}),querySelectorAll:()=>[]},window={},fetch=()=>Promise.resolve({text:()=>Promise.resolve(\"\")}),location={pathname:\"/\"};\n' + m[1]);
"
node --check /tmp/admin-check.js
```
Expected: sem erro de sintaxe (pode dar erro de runtime por causa dos stubs — o que importa aqui é `node --check` não acusar erro de parsing).

- [ ] **Step 6: Verificação manual no browser**

Rodar preview local (porta livre, ver `PORTAS.md`), abrir `/admin/`, logar, confirmar: card "sem competência" aparece quando há serviço sem `data_competencia` real na base; "Clientes em destaque" mostra "Rec" mesmo pra cliente sem serviço com competência no período mas com pagamento no período.

- [ ] **Step 7: Commit**

```bash
git add admin/index.html
git commit -m "fix(p0): admin mostra servicos sem competencia e corrige Rec em Clientes em destaque"
```

---

### Task 3: `gestao/index.html` — fallback inteligente de mês + card "sem competência" + rótulos

**Files:**
- Modify: `gestao/index.html`

- [ ] **Step 1: Adicionar variável de estado do fallback**

Localizar (por volta da linha 302):

```js
let PERIODO = { ano: new Date().getFullYear(), mes: null };
```

Adicionar logo abaixo:

```js
let MES_FALLBACK = null; // 'YYYY-MM' quando o painel caiu num mes com dado por nao ter nada no mes atual
```

- [ ] **Step 2: Trocar a inicialização do período em `carregarTudo()`**

Localizar (linha 335):

```js
async function carregarTudo(){
  await carregarClientes();
  const { servicos } = await api('servicos.list', { filtro:{} });
  SERVICOS = servicos || [];
  const anos = anosDisponiveis();
  const now = new Date();
  const anoAtual = now.getFullYear();
  PERIODO = { ano: anoAtual, mes: (now.getMonth()+1) };
  await carregarDashboardExtra();  // só o card de orçamento (Task 5)
  render();
}
```

Substituir por:

```js
function mesMaisRecenteComDado(){
  let melhor = null;
  SERVICOS.forEach(s=>{
    if(s.data_competencia){
      const ym = String(s.data_competencia).slice(0,7);
      if(!melhor || ym > melhor) melhor = ym;
    }
  });
  return melhor;
}
async function carregarTudo(){
  await carregarClientes();
  const { servicos } = await api('servicos.list', { filtro:{} });
  SERVICOS = servicos || [];
  const anos = anosDisponiveis();
  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth()+1;
  const ymAtual = `${anoAtual}-${String(mesAtual).padStart(2,'0')}`;
  const temNoMesAtual = SERVICOS.some(s=>
    (s.data_competencia && String(s.data_competencia).slice(0,7)===ymAtual) ||
    (s.pago && s.data_pagamento && String(s.data_pagamento).slice(0,7)===ymAtual)
  );
  if(temNoMesAtual){
    PERIODO = { ano: anoAtual, mes: mesAtual };
    MES_FALLBACK = null;
  } else {
    const recente = mesMaisRecenteComDado();
    if(recente){
      const [ay, am] = recente.split('-').map(Number);
      PERIODO = { ano: ay, mes: am };
      MES_FALLBACK = recente;
    } else {
      PERIODO = { ano: anoAtual, mes: mesAtual };
      MES_FALLBACK = null;
    }
  }
  await carregarDashboardExtra();
  render();
}
```

- [ ] **Step 3: Adicionar slot HTML do aviso de fallback + do card "sem competência"**

Localizar (linha 168):

```html
  <div class="monthnav"><div class="months" id="monthTabs"></div><select id="yearSel" class="yearsel" onchange="setAno(this.value)"></select></div>
  <div class="metrics" id="metrics"></div>
```

Substituir por:

```html
  <div class="monthnav"><div class="months" id="monthTabs"></div><select id="yearSel" class="yearsel" onchange="setAno(this.value)"></select></div>
  <div class="fallback-note" id="fallbackNote" style="display:none"></div>
  <div class="metrics" id="metrics"></div>
  <div class="sem-comp" id="semComp" style="display:none"></div>
```

- [ ] **Step 4: CSS do aviso e do card**

Localizar o bloco de CSS de `.metrics`/`.stat` (buscar por `.metrics{` no arquivo) e adicionar logo depois:

```css
    .fallback-note{margin:10px 0;padding:9px 14px;background:rgba(157,78,221,.12);border:1px solid rgba(157,78,221,.35);border-radius:10px;font-size:.82rem;color:var(--c100)}
    .sem-comp{margin:10px 0;padding:10px 14px;background:rgba(240,196,106,.12);border:1px solid rgba(240,196,106,.35);border-radius:10px;font-size:.82rem;cursor:pointer}
    .sem-comp:hover{border-color:var(--amber)}
```

- [ ] **Step 5: Renderizar os dois elementos em `renderCards()`**

Localizar (linha 369):

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
```

Substituir por:

```js
function renderCards(){
  const inP = SERVICOS.filter(noPeriodo);
  const faturado = inP.reduce((a,s)=>a+(+s.valor_cents||0),0);
  const recebido = SERVICOS.filter(pagoNoPeriodo).reduce((a,s)=>a+(+s.valor_cents||0),0);
  const aReceber = inP.filter(s=>!s.pago).reduce((a,s)=>a+(+s.valor_cents||0),0);
  const emExec = SERVICOS.filter(s=>s.status_execucao==='em_execucao').length;
  const semNf = SERVICOS.filter(s=>!s.nf_numero);
  const semNfCents = semNf.reduce((a,s)=>a+(+s.valor_cents||0),0);
  const rotuloPeriodo = PERIODO.mes ? 'no mês' : 'no ano';
  const cards = [
    `<div class="stat" onclick="filtroCard('faturado')"><div class="sv">${brl(faturado)}</div><div class="sl">Faturado ${rotuloPeriodo}</div></div>`,
    `<div class="stat good" onclick="filtroCard('recebido')"><div class="sv">${brl(recebido)}</div><div class="sl">Recebido ${rotuloPeriodo}</div></div>`,
    `<div class="stat amber" onclick="filtroCard('areceber')"><div class="sv">${brl(aReceber)}</div><div class="sl">A receber</div></div>`,
    `<div class="stat" onclick="filtroCard('execucao')"><div class="sv">${emExec}</div><div class="sl">Em execução (todos os períodos)</div></div>`,
    `<div class="stat warn" onclick="filtroCard('nfpend')"><div class="sv">${semNf.length}</div><div class="sl">NF pendente (todos os períodos) · ${brl(semNfCents)} a faturar</div></div>`,
  ];
  if(ORC_PEND.count) cards.push(`<div class="stat amber"><div class="sv">${brl(ORC_PEND.cents)}</div><div class="sl">Orçamento aprovado sem serviço</div></div>`);
  document.getElementById('metrics').innerHTML = cards.join('');

  const fbEl = document.getElementById('fallbackNote');
  if(MES_FALLBACK){
    const [ay, am] = MES_FALLBACK.split('-').map(Number);
    fbEl.style.display = 'block';
    fbEl.textContent = `${MESES[now_mes_idx(am)]}/${ay} não tem lançamento — mostrando ${MESES[am-1]}/${ay}, o mês mais recente com dado.`;
  } else {
    fbEl.style.display = 'none';
  }

  const semComp = SERVICOS.filter(s=>!s.data_competencia);
  const semCompCents = semComp.reduce((a,s)=>a+(+s.valor_cents||0),0);
  const semCompEl = document.getElementById('semComp');
  if(semComp.length){
    semCompEl.style.display = 'block';
    semCompEl.innerHTML = `⚠ ${semComp.length} serviço(s) sem competência definida — ${brl(semCompCents)} fora dos totais de Faturado/A receber acima`;
    semCompEl.onclick = ()=>{ document.getElementById('fCliente').value=''; document.getElementById('fStatus').value=''; document.getElementById('fPago').value=''; document.getElementById('fNota').value=''; renderServicos(); document.getElementById('tabServicos').scrollIntoView({behavior:'smooth'}); };
  } else {
    semCompEl.style.display = 'none';
  }
}
function now_mes_idx(m){ return m-1; }
```

Nota: a mensagem do `fallbackNote` usa o mês/ano ATUAIS reais (não `MES_FALLBACK`) na primeira parte da frase — como `now` não está disponível dentro de `renderCards()`, simplificar a frase pra não depender do mês-atual-real (que já não importa pro usuário nesse ponto):

Trocar a linha do `fbEl.textContent` por uma versão mais simples, sem tentar remontar o "mês sem dado":

```js
    fbEl.textContent = `Sem lançamento no mês atual — mostrando ${MESES[am-1]}/${ay}, o mês mais recente com dado.`;
```

(remove a necessidade de `now_mes_idx`, então também remover a função `now_mes_idx` adicionada acima.)

- [ ] **Step 6: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('gestao/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/gestao-check.js', scripts);
"
node --check /tmp/gestao-check.js
```
Expected: sem erro de sintaxe.

- [ ] **Step 7: Verificação manual**

Preview local, `/gestao/`, logar. Hoje (2026-07) não há dado em julho — confirmar que o painel cai automaticamente em Junho/2026 (mês mais recente com `data_competencia`) e mostra o aviso. Trocar manualmente pra outro mês (ex: Abril) e confirmar que o aviso de fallback some. Confirmar card "sem competência" aparece com os 13 registros reais.

- [ ] **Step 8: Commit**

```bash
git add gestao/index.html
git commit -m "fix(p0): gestao cai no mes mais recente com dado, mostra servicos sem competencia, rotulo dinamico mes/ano"
```

---

### Task 4: `gestao/index.html` — fix duplicidade A-faturar/Faturado + separar rótulos + filtrar datalist de marca por cliente

**Files:**
- Modify: `gestao/index.html`

- [ ] **Step 1: Corrigir `renderServicos()` pra não duplicar serviço entre "A faturar" e "Faturado do mês"**

Localizar (linha 492):

```js
function renderServicos(){
  const filt=servicosFiltrados();
  // popula datalist de sub-clientes
  const subs=new Set(); SERVICOS.forEach(s=>{ if(s.sub_cliente) subs.add(s.sub_cliente); });
  const dl=document.getElementById('subClientes'); if(dl) dl.innerHTML=[...subs].sort().map(v=>`<option value="${esc(v)}">`).join('');
  const doMes = filt.filter(noPeriodo);
  const aFaturar = filt.filter(s=>!s.nf_numero);            // sem competência/sem NF = a faturar (geral)
```

Substituir a linha do `doMes` por:

```js
  const aFaturar = filt.filter(s=>!s.nf_numero);            // sem NF = a faturar (geral, sem filtro de periodo)
  const doMes = filt.filter(s=>noPeriodo(s) && s.nf_numero); // faturado do periodo = tem competencia no periodo E ja tem NF (nao repete quem esta em aFaturar)
```

(Nota: a ordem das duas linhas mudou porque `doMes` agora depende de referenciar a MESMA condição de `aFaturar` — `s.nf_numero` — então declarar `aFaturar` primeiro deixa a intenção clara, mas como são independentes uma da outra em termos de dado, a ordem de declaração não importa funcionalmente; manter `aFaturar` primeiro por legibilidade.)

- [ ] **Step 2: Filtrar o datalist de sub-cliente pelo cliente selecionado no modal**

Ainda em `renderServicos()`, trocar a linha do datalist global:

```js
  const subs=new Set(); SERVICOS.forEach(s=>{ if(s.sub_cliente) subs.add(s.sub_cliente); });
  const dl=document.getElementById('subClientes'); if(dl) dl.innerHTML=[...subs].sort().map(v=>`<option value="${esc(v)}">`).join('');
```

Manter como está (esse popula a lista GLOBAL usada pelos filtros da tela principal) — a filtragem por cliente é responsabilidade do MODAL de serviço, não da lista. Adicionar uma nova função e chamá-la quando o select de cliente do modal mudar. Localizar a função `abrirServico` (buscar `function abrirServico`) e, logo abaixo dela, adicionar:

```js
function atualizarDatalistSub(){
  const clienteId = document.getElementById('svcCliente').value;
  const subs = new Set();
  SERVICOS.forEach(s=>{ if(s.sub_cliente && s.cliente_id===clienteId) subs.add(s.sub_cliente); });
  const dl = document.getElementById('subClientes');
  dl.innerHTML = [...subs].sort().map(v=>`<option value="${esc(v)}">`).join('');
}
```

Localizar o `<select id="svcCliente">` no HTML (buscar `id="svcCliente"`) e adicionar o atributo `onchange="atualizarDatalistSub()"` a ele.

No final de `abrirServico(s)` (antes do fechamento da função, próximo de `document.getElementById('modalServico').classList.add('show');`), adicionar uma chamada:

```js
  atualizarDatalistSub();
  document.getElementById('modalServico').classList.add('show');
```

(troca a linha existente `document.getElementById('modalServico').classList.add('show');` por essas duas linhas.)

- [ ] **Step 3: Separar o rótulo "Data da NF (competência)"**

Localizar (linha 216):

```html
      <div class="fld"><label>Data da NF (competência)</label><input type="date" id="svcComp"></div>
```

Substituir por:

```html
      <div class="fld"><label>Competência (mês de referência)</label><input type="date" id="svcComp"></div>
```

- [ ] **Step 4: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('gestao/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/gestao-check2.js', scripts);
"
node --check /tmp/gestao-check2.js
```
Expected: sem erro.

- [ ] **Step 5: Verificação manual**

Preview local, `/gestao/`. Abrir modal de serviço de "Georgia Andrade" — confirmar que o autocomplete de sub-cliente NÃO sugere ASUS/VIBRA/etc. Abrir modal de um serviço de F2 Experience com sub-cliente ASUS — confirmar que sugere marcas de F2. Confirmar rótulo "Competência (mês de referência)" no modal.

- [ ] **Step 6: Commit**

```bash
git add gestao/index.html
git commit -m "fix(p0): gestao nao duplica servico entre A-faturar e Faturado, separa rotulo competencia, filtra sub-cliente por cliente do modal"
```

---

### Task 5: `edge-functions/eloi-gestao.ts` — remover campos mortos + endurecer validação

**Files:**
- Modify: `edge-functions/eloi-gestao.ts`

- [ ] **Step 1: Remover `faturado_mes`/`a_receber` de `dashboard.stats`**

Localizar (linha 240-275):

```ts
  if (action === "dashboard.stats") {
    const { data: rows, error } = await supabase
      .from("eloi_servicos")
      .select("valor_cents,status_execucao,pago,data_pagamento,nf_numero,cliente_id,orcamento_id");
    if (error) return json({ error: error.message }, 500);
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    let faturado_mes = 0, a_receber = 0, em_execucao = 0, concluido_sem_nf = 0;
    const porCli: Record<string, number> = {};
    const orcamentoIdsComServico = new Set<string>();
    for (const r of rows ?? []) {
      const v = Number(r.valor_cents) || 0;
      if (r.pago && r.data_pagamento && String(r.data_pagamento).slice(0, 7) === ym) faturado_mes += v;
      if (!r.pago) a_receber += v;
      if (r.status_execucao === "em_execucao") em_execucao++;
      if (r.status_execucao === "concluida" && !r.nf_numero) concluido_sem_nf++;
      porCli[r.cliente_id] = (porCli[r.cliente_id] ?? 0) + v;
      if (r.orcamento_id) orcamentoIdsComServico.add(r.orcamento_id);
    }
    const { data: clientes } = await supabase.from("eloi_clientes").select("id,nome,cor");
    const por_cliente = (clientes ?? [])
      .map((c) => ({ nome: c.nome, cor: c.cor, total_cents: porCli[c.id] ?? 0 }))
      .sort((a, b) => b.total_cents - a.total_cents);

    // orçamentos aprovados que ainda não viraram serviço (fase 1) -- financeiro incompleto sem isso
    const { data: orcsAprovados } = await supabase.from("orcamentos").select("id,valor_total").eq("status", "aprovado");
    let aprovados_pendentes_count = 0, aprovados_pendentes_cents = 0;
    for (const o of orcsAprovados ?? []) {
      if (!orcamentoIdsComServico.has(o.id)) {
        aprovados_pendentes_count++;
        aprovados_pendentes_cents += Math.round((Number(o.valor_total) || 0) * 100);
      }
    }

    return json({ faturado_mes, a_receber, em_execucao, concluido_sem_nf, por_cliente, aprovados_pendentes_count, aprovados_pendentes_cents });
  }
```

Substituir por (remove `now`/`ym`/`faturado_mes`/`a_receber`, mantém o resto igual):

```ts
  if (action === "dashboard.stats") {
    const { data: rows, error } = await supabase
      .from("eloi_servicos")
      .select("valor_cents,status_execucao,pago,data_pagamento,nf_numero,cliente_id,orcamento_id");
    if (error) return json({ error: error.message }, 500);
    let em_execucao = 0, concluido_sem_nf = 0;
    const porCli: Record<string, number> = {};
    const orcamentoIdsComServico = new Set<string>();
    for (const r of rows ?? []) {
      const v = Number(r.valor_cents) || 0;
      if (r.status_execucao === "em_execucao") em_execucao++;
      if (r.status_execucao === "concluida" && !r.nf_numero) concluido_sem_nf++;
      porCli[r.cliente_id] = (porCli[r.cliente_id] ?? 0) + v;
      if (r.orcamento_id) orcamentoIdsComServico.add(r.orcamento_id);
    }
    const { data: clientes } = await supabase.from("eloi_clientes").select("id,nome,cor");
    const por_cliente = (clientes ?? [])
      .map((c) => ({ nome: c.nome, cor: c.cor, total_cents: porCli[c.id] ?? 0 }))
      .sort((a, b) => b.total_cents - a.total_cents);

    // orçamentos aprovados que ainda não viraram serviço (fase 1) -- financeiro incompleto sem isso
    const { data: orcsAprovados } = await supabase.from("orcamentos").select("id,valor_total").eq("status", "aprovado");
    let aprovados_pendentes_count = 0, aprovados_pendentes_cents = 0;
    for (const o of orcsAprovados ?? []) {
      if (!orcamentoIdsComServico.has(o.id)) {
        aprovados_pendentes_count++;
        aprovados_pendentes_cents += Math.round((Number(o.valor_total) || 0) * 100);
      }
    }

    return json({ em_execucao, concluido_sem_nf, por_cliente, aprovados_pendentes_count, aprovados_pendentes_cents });
  }
```

- [ ] **Step 2: Endurecer validação em `servicos.upsert`**

Localizar (linha 140-155):

```ts
  if (action === "servicos.upsert") {
    const s = body?.servico || {};
    if (!s.cliente_id) return json({ error: "cliente_id obrigatório" }, 400);
    if (!s.descricao) return json({ error: "descricao obrigatória" }, 400);
    const row: any = {
      cliente_id: s.cliente_id,
      sub_cliente: (s.sub_cliente || "").trim() || null,
      descricao: s.descricao,
      valor_cents: Number(s.valor_cents) || 0,
      status_execucao: ["aguardando_inicio", "em_execucao", "concluida"].includes(s.status_execucao) ? s.status_execucao : "em_execucao",
      pago: s.pago === true,
      data_pagamento: s.data_pagamento || null,
      data_competencia: s.data_competencia || null,
      nf_numero: s.nf_numero || null,
      observacoes: s.observacoes || null,
    };
```

Substituir por:

```ts
  if (action === "servicos.upsert") {
    const s = body?.servico || {};
    const descricao = String(s.descricao || "").trim();
    const statusValido = ["aguardando_inicio", "em_execucao", "concluida"];
    if (!s.cliente_id) return json({ error: "cliente_id obrigatório" }, 400);
    if (!descricao) return json({ error: "descricao obrigatória" }, 400);
    if (s.status_execucao && !statusValido.includes(s.status_execucao)) {
      return json({ error: `status_execucao inválido — use um de: ${statusValido.join(", ")}` }, 400);
    }
    const valorCents = Number(s.valor_cents) || 0;
    if (valorCents < 0) return json({ error: "valor_cents não pode ser negativo" }, 400);
    const row: any = {
      cliente_id: s.cliente_id,
      sub_cliente: (s.sub_cliente || "").trim() || null,
      descricao,
      valor_cents: valorCents,
      status_execucao: s.status_execucao || "em_execucao",
      pago: s.pago === true,
      data_pagamento: s.data_pagamento || null,
      data_competencia: s.data_competencia || null,
      nf_numero: s.nf_numero || null,
      observacoes: s.observacoes || null,
    };
```

- [ ] **Step 3: `trim()` no nome do cliente em `clientes.upsert`**

Localizar (linha 72-74):

```ts
  if (action === "clientes.upsert") {
    const c = body?.cliente || {};
    if (!c.nome) return json({ error: "nome obrigatório" }, 400);
```

Substituir por:

```ts
  if (action === "clientes.upsert") {
    const c = body?.cliente || {};
    const nome = String(c.nome || "").trim();
    if (!nome) return json({ error: "nome obrigatório" }, 400);
```

E logo abaixo, no objeto `row`, trocar `nome: c.nome,` por `nome,`.

- [ ] **Step 4: Confirmar que nenhum frontend consome os campos removidos**

Run: `grep -rn "\.faturado_mes\|\.a_receber" --include="*.html" --include="*.js" --include="*.ts" .`
Expected: nenhuma ocorrência fora de `docs/` (histórico) — se aparecer algo em `admin/index.html`, `gestao/index.html` ou outro arquivo vivo, PARAR e investigar antes de prosseguir (não deveria acontecer — já confirmado pela auditoria).

- [ ] **Step 5: Deploy da edge function**

Usar a tool de deploy do Supabase MCP (`deploy_edge_function`) com `project_id: "nlamznxoocmygfvnqcns"`, `name: "eloi-gestao"`, conteúdo = arquivo `edge-functions/eloi-gestao.ts` atualizado.

- [ ] **Step 6: Smoke test pós-deploy**

Via query SQL read-only (`execute_sql`), confirmar que a tabela `eloi_servicos` não foi afetada (esperado — a mudança é só na função, não na tabela):
```sql
select count(*) from eloi_servicos;
```
Expected: mesma contagem de antes (47, mais o que tiver sido criado nas tasks anteriores — não deve mudar por causa desta task).

Testar a action `servicos.upsert` end-to-end fica coberto pela verificação manual da Task 4 (que já usa o modal de serviço).

- [ ] **Step 7: Commit**

```bash
git add edge-functions/eloi-gestao.ts
git commit -m "fix(p0): remove faturado_mes/a_receber mortos do dashboard.stats, endurece validacao de servicos/clientes.upsert"
```

---

## Onda 2 — Vínculo cliente_id e bugs funcionais por página

### Task 6: `orcamento-inteligente/index.html` — vínculo cliente_id + arredondamento + validação de preço

**Files:**
- Modify: `orcamento-inteligente/index.html`

- [ ] **Step 1: Adicionar select de cliente cadastrado**

Localizar (linha 143):

```html
          <div class="field"><label>Cliente</label><input id="f_cliente" placeholder="Nome do cliente"></div>
```

Substituir por:

```html
          <div class="field"><label>Cliente</label><input id="f_cliente" placeholder="Nome do cliente"></div>
          <div class="field"><label>Cliente cadastrado (opcional)</label><select id="f_cliente_id" onchange="const c=CLIENTES_OI.find(x=>x.id===this.value); if(c) document.getElementById('f_cliente').value=c.nome;"><option value="">— nenhum, usar nome acima —</option></select></div>
```

- [ ] **Step 2: Carregar a lista de clientes cadastrados**

Localizar o início do `<script>` (procurar por `const CATALOG` ou declaração de estado global no topo do script) e adicionar uma variável global:

```js
let CLIENTES_OI = [];
```

Localizar a função que carrega dados no boot (procurar `async function carregarApp` ou equivalente chamado em `if (EloiAdminAuth.token())`) e, dentro dela, adicionar a chamada pra popular `CLIENTES_OI` e o select:

```js
  try{
    const r = await EloiAdminAuth.call(SUPA+'/eloi-gestao', { action:'clientes.list' });
    CLIENTES_OI = r.clientes || [];
    document.getElementById('f_cliente_id').innerHTML = '<option value="">— nenhum, usar nome acima —</option>' +
      CLIENTES_OI.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  }catch(e){ CLIENTES_OI = []; }
```

(A constante `SUPA` já existe no arquivo apontando pra `.../functions/v1` — confirmar isso lendo o topo do arquivo antes de aplicar; se o padrão de chamada for diferente do usado em `painel-orcamentos`, seguir o padrão já existente em `orcamento-inteligente/index.html` para chamadas à edge function `eloi-gestao`.)

- [ ] **Step 3: Enviar `cliente_id` em `gerar()`**

Localizar `gerar()` (linha 355-380 aproximadamente), achar onde o objeto do orçamento é montado (variável `o` ou similar, contendo `cliente: cliente||null`) e adicionar `cliente_id: document.getElementById('f_cliente_id').value || null,` no mesmo objeto.

- [ ] **Step 4: Corrigir arredondamento — `valor_total` = soma dos itens já arredondados**

Localizar, dentro de `gerar()` (linha ~358-370), o ponto onde os itens (`l.valor` arredondados) são montados e onde `valor_total` é calculado a partir de `r.total` (valor bruto não-arredondado). Trocar o cálculo de `valor_total` pra somar os itens JÁ arredondados em vez de arredondar `r.total` separadamente:

```js
const itensArredondados = itens.map(l => ({ ...l, valor: Math.round(l.valor*100)/100 }));
const valorTotalCorreto = itensArredondados.reduce((a,l)=>a+l.valor, 0);
```

(usar `itensArredondados` no lugar de `itens` ao montar o payload de `create()`, e `valorTotalCorreto` no lugar de `Math.round(r.total*100)/100` para `valor_total`.)

- [ ] **Step 5: Validar `preco_base` antes de salvar no catálogo**

Localizar (linha 440):

```js
      preco_base: Number(r.querySelector('.e-preco').value)||0,
```

Não trocar a linha em si (o fallback `||0` continua necessário pra não quebrar o parse), mas adicionar uma checagem ANTES de montar o array de `jobs` em `salvarCatalogo()`: se algum `.e-preco` estiver vazio ou com preço 0, mostrar `toast('Aviso: 1+ serviço será salvo com preço R$0,00 — confira antes de continuar.')` sem bloquear o salvamento (é aviso, não trava, já que pode ser intencional em algum caso). Adicionar essa checagem logo no início da função `salvarCatalogo()`.

- [ ] **Step 6: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('orcamento-inteligente/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/oi-check.js', scripts);
"
node --check /tmp/oi-check.js
```
Expected: sem erro.

- [ ] **Step 7: Verificação manual**

Preview local, `/orcamento-inteligente/`. Selecionar cliente cadastrado no novo select, gerar orçamento, confirmar em `/painel-orcamentos/` que o orçamento aparece com `cliente_id` vinculado (abrir e checar que o select "Cliente cadastrado" já vem preenchido). Testar reabrir/salvar sem alterar nada e confirmar que `valor_total` não muda de um centavo.

- [ ] **Step 8: Commit**

```bash
git add orcamento-inteligente/index.html
git commit -m "fix(p0): orcamento-inteligente vincula cliente_id, corrige arredondamento do total, avisa preco zerado"
```

---

### Task 7: `orcamento-inteligente/index.html` — robustez do catálogo (retry seguro, categoria normalizada, item inativo)

**Files:**
- Modify: `orcamento-inteligente/index.html`

- [ ] **Step 1: `salvarCatalogo()` — trocar `Promise.all` por `Promise.allSettled`**

Localizar `salvarCatalogo()` (linha 430-456), achar o `Promise.all(jobs)` (ou equivalente) e trocar por `Promise.allSettled`, atualizando `dataset.id` de cada linha cujo `catalog_save` teve sucesso e mantendo em erro só as que falharam:

```js
async function salvarCatalogo(){
  const linhas = [...document.querySelectorAll('.catalog-editor-row')]; // confirmar seletor real lendo o HTML antes de aplicar
  const jobs = linhas.map(r => ({
    row: r,
    payload: {
      id: r.dataset.id || undefined,
      nome: r.querySelector('.e-nome').value.trim(),
      categoria: (r.querySelector('.e-cat').value || 'Outros').trim(),
      preco_base: Number(r.querySelector('.e-preco').value)||0,
      // demais campos conforme já existentes no arquivo original — preservar
    }
  }));
  const results = await Promise.allSettled(jobs.map(j => EloiAdminAuth.call(SUPA+'/orcamentos', { action:'catalog_save', servico: j.payload })));
  let falhas = 0;
  results.forEach((res, i) => {
    if(res.status === 'fulfilled' && res.value && res.value.servico){
      jobs[i].row.dataset.id = res.value.servico.id;
    } else {
      falhas++;
    }
  });
  if(falhas){ toast(`Catálogo salvo com ${falhas} erro(s) — linhas com problema continuam marcadas, tente salvar de novo só essas.`); }
  else { toast('Catálogo salvo!'); await carregarCatalogo(); }
}
```

(Ajustar nomes exatos de seletor/campo lendo o corpo real da função `salvarCatalogo()` e da linha do editor no arquivo antes de aplicar — o esqueleto acima preserva a estrutura de payload já existente, só troca `Promise.all` por `Promise.allSettled` com tratamento por linha.)

- [ ] **Step 2: Re-renderizar quantidade após `clamp` em `setQty()`**

Localizar `setQty(id,v)` (linha 294):

```js
function setQty(id,v){
```

Depois do `Math.max(1,Math.floor(Number(v)||1))` e da atualização de `SEL[id]`, adicionar uma linha que sincroniza o valor de volta no campo:

```js
  const input = document.querySelector(`.qty[data-id="${id}"]`); // confirmar o seletor real lendo o markup do input .qty
  if(input) input.value = SEL[id];
```

(Confirmar o atributo usado pra identificar a linha no `<input class="qty">` real do arquivo — pode ser `data-id`, `onchange` com o id capturado por closure, etc. — e ajustar o seletor de acordo antes de aplicar.)

- [ ] **Step 3: Normalizar categoria (trim) antes de agrupar**

Localizar o agrupamento por categoria em `renderCatalog()` (linha ~273):

```js
const c=s.categoria||'Outros'; if(!byCat[c]){byCat[c]=[];cats.push(c);} byCat[c].push(s);
```

Substituir por:

```js
const c=(s.categoria||'Outros').trim(); if(!byCat[c]){byCat[c]=[];cats.push(c);} byCat[c].push(s);
```

- [ ] **Step 4: Limpar seleção de item desativado no catálogo**

Localizar `montar()` (linha 309) e, no loop `CATALOG.forEach`, adicionar uma checagem que ignora (e remove de `SEL`) itens com `ativo===false`:

```js
CATALOG.forEach(s=>{
  if(s.ativo===false){ delete SEL[s.id]; return; }
  if(SEL[s.id]==null) return;
  // ... resto da lógica existente
});
```

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('orcamento-inteligente/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/oi-check2.js', scripts);
"
node --check /tmp/oi-check2.js
```
Expected: sem erro.

- [ ] **Step 6: Verificação manual**

Preview local, `/orcamento-inteligente/`. No editor de catálogo: digitar categoria com espaço extra ("Web " vs "Web") e confirmar que agrupa junto. Desativar um item selecionado no orçamento atual e confirmar que some do total. Digitar quantidade inválida (0, -5) e confirmar que o campo mostra o valor corrigido, não o bruto.

- [ ] **Step 7: Commit**

```bash
git add orcamento-inteligente/index.html
git commit -m "fix(p0): orcamento-inteligente evita duplicar catalogo em retry, normaliza categoria, limpa item desativado, sincroniza qty"
```

---

### ~~Task 8~~ — DISSOLVIDA, NÃO EXECUTAR

> Conflitava com as Tasks 3–6 do plano de Orçamentos, que reescrevem as mesmas linhas de `painel-orcamentos/index.html`.
> Steps 1–2 → Task 4b do plano de Orçamentos. Steps 3–4 → absorvidos pelas Tasks 5 e 6.
> Ver `docs/superpowers/specs/2026-07-18-execucao-pendencias-design.md`.
> Conteúdo original mantido abaixo só como referência para a Task 4b.

### ~~Task 8 (referência)~~: `painel-orcamentos/index.html` — gate de "Criar serviço", link público, validação

**Files:**
- Modify: `painel-orcamentos/index.html`

- [ ] **Step 1: Condicionar exibição do botão "Criar serviço" a `cliente_id`**

Localizar (linha 271):

```js
  document.getElementById('viewCriarServico').style.display = st==='aprovado' ? 'inline-flex' : 'none';
```

Substituir por (é preciso ter acesso ao orçamento atual sendo visualizado — usar a variável que já guarda esse registro na função onde essa linha vive; se a função recebe o orçamento como parâmetro `o`, usar `o.cliente_id`; confirmar o nome exato da variável lendo a função inteira antes de aplicar):

```js
  document.getElementById('viewCriarServico').style.display = (st==='aprovado' && o.cliente_id) ? 'inline-flex' : 'none';
```

Se `o` não estiver no escopo dessa linha, ajustar pra usar a variável de estado correta que representa o orçamento aberto no momento (ex: `ORC_ATUAL.cliente_id`) — inspecionar a função completa antes de decidir qual variável usar.

- [ ] **Step 2: Parar de assumir a rota `/cliente/` em `linkPublico()`**

Localizar `linkPublico(o)` (linha 285):

```js
function linkPublico(o){ if(o && o.link){ var base = o.link.replace(/\/+$/,'') + '/cliente/'; return /^https?:/i.test(base) ? base : location.origin + base; } return location.origin + '/orcamento/?t=' + ... }
```

Substituir a parte que monta `base` a partir de `o.link` pra usar o link exatamente como cadastrado, sem acrescentar `/cliente/`:

```js
function linkPublico(o){
  if(o && o.link){
    var base = o.link.trim();
    return /^https?:/i.test(base) ? base : location.origin + (base.startsWith('/') ? base : '/'+base);
  }
  return location.origin + '/orcamento/?t=' + (o && o.share_token || '');
}
```

(Confirmar o nome exato do campo do token — `share_token` ou outro — lendo a função original antes de aplicar; preservar a lógica do `return` final tal como já está no arquivo, só ajustando a parte de `o.link`.)

- [ ] **Step 3: Tratar valor negativo na view interna igual à página pública**

Localizar (linha 258):

```js
    ? itens.map(it=>`<div class="v-item"><span>${esc(it.nome||'—')}</span><span>${brl(it.valor)}</span></div>`).join('')
```

Substituir por:

```js
    ? itens.map(it=>{ const v = Number(it.valor)||0; return `<div class="v-item"><span>${esc(it.nome||'—')}</span><span${v<0?' style="color:var(--good)"':''}>${v<0?'− ':''}${brl(Math.abs(v))}</span></div>`; }).join('')
```

- [ ] **Step 4: Validar cliente/título em `salvar()`**

Localizar `salvar()` (linha 366) e, logo no início da função (antes de montar o objeto `o` ou logo depois, antes de chamar `call()`), adicionar:

```js
  const clienteVal = document.getElementById('f_cliente').value.trim();
  const tituloVal = document.getElementById('f_titulo').value.trim();
  if(!clienteVal || !tituloVal){ toast('Preencha cliente e título.'); return; }
```

(Confirmar os IDs exatos dos campos de cliente/título lendo o HTML do formulário antes de aplicar — evidência da auditoria aponta `f_cliente` e `f_titulo`.)

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('painel-orcamentos/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/po-check.js', scripts);
"
node --check /tmp/po-check.js
```
Expected: sem erro.

- [ ] **Step 6: Verificação manual**

Preview local, `/painel-orcamentos/`. Abrir orçamento aprovado sem cliente cadastrado vinculado — confirmar que "Criar serviço" não aparece. Vincular cliente cadastrado e confirmar que aparece e funciona. Tentar salvar orçamento sem cliente/título — confirmar toast de validação.

- [ ] **Step 7: Commit**

```bash
git add painel-orcamentos/index.html
git commit -m "fix(p0): painel-orcamentos exige cliente_id pra criar servico, corrige link publico, trata valor negativo, valida salvar"
```

---

### Task 9: `marca/index.html` — regex de cor, zip de entrega, instruções, slug

**Files:**
- Modify: `marca/index.html`

**Nota (fora deste plano):** `assets/vendor/fflate.min.js` continua ausente — o botão "Baixar .zip" segue inoperante até alguém vendorizar a lib (baixar/adicionar arquivo de terceiro exige aprovação explícita do usuário, fora do escopo desta task). Workaround atual: script Node `entregas-marca/_tools/gerar-variacoes.mjs`, já documentado no `SITEMAP.md`.

- [ ] **Step 1: Unificar a regex de `fill:currentColor`**

Localizar `validateSvg()` (linha 206):

```js
  if (!/fill\s*:\s*currentColor/i.test(text)) errors.push('não usa fill:currentColor');
```

Manter como está (já é a versão mais permissiva/correta). Localizar `gerar()` (linha 291):

```js
      const svg = v.svgText.replace(/fill:\s*currentColor/g, `fill: ${cor.hex}`);
```

Substituir por:

```js
      const svg = v.svgText.replace(/fill\s*:\s*currentColor/gi, `fill: ${cor.hex}`);
```

- [ ] **Step 2: Incluir `.preview.png` no zip**

Localizar o trecho que monta `files` para o zip dentro de `publicar()` (por volta da linha 355-364, buscar o comentário sobre "preview.png fica fora do zip"). Remover a exclusão do preview — incluir os 3 arquivos (svg, png, preview) no zip em vez de só svg+png. Ajustar o array/objeto de arquivos montado ali pra incluir a entrada `preview` (mesma extensão `.preview.png` já usada no manifest, linha 350) no payload que vai pro zip.

- [ ] **Step 3: Instruções pós-publicação — mencionar copiar o `.zip`**

Localizar as instruções de publicação (linha ~373-376, texto que diz "Extraia o zip em entregas-marca/..."). Adicionar, antes ou depois dessa linha, um passo explícito:

```
Copie também o arquivo .zip baixado pra dentro de entregas-marca/<slug>/ — o botão "Baixar tudo" da página pública do cliente depende desse arquivo estar lá.
```

- [ ] **Step 4: `slugify()` no campo de slug antes de usar em `publicar()`**

Localizar (linha 334):

```js
    const slug = document.getElementById('inpSlug').value.trim();
```

Substituir por:

```js
    const slug = slugify(document.getElementById('inpSlug').value.trim());
```

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('marca/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/marca-check.js', scripts);
"
node --check /tmp/marca-check.js
```
Expected: sem erro.

- [ ] **Step 6: Verificação manual**

Preview local, `/marca/`. Digitar slug com espaço/maiúscula no campo e confirmar que `publicar()` usa a versão slugificada. Conferir visualmente que o texto de instrução menciona copiar o `.zip`.

- [ ] **Step 7: Commit**

```bash
git add marca/index.html
git commit -m "fix(p0): marca unifica regex de currentColor, inclui preview.png no zip, avisa copiar zip, slugify no slug"
```

---

### Task 10: `painel-briefings/index.html` — validação, excluir convite, mensagem de vazio por filtro

**Files:**
- Modify: `painel-briefings/index.html`

- [ ] **Step 1: Validar nome do cliente em `gerar()`**

Localizar `gerar()` (linha 274-292):

```js
function gerar(){
  const cliente = document.getElementById('newCliente').value.trim();
```

Logo depois dessa linha, adicionar:

```js
  if(!cliente){ toast('Preencha o nome do cliente.'); return; }
```

- [ ] **Step 2: Adicionar botão de excluir convite (backend já suporta `action:'delete'`)**

Localizar `renderLista()` (linha 314) e o template de cada linha de convite (dentro do `.map()` que monta `.row`). Adicionar um botão de excluir junto dos já existentes ("Ver"/"Copiar link"):

```html
<button class="btn btn-sm btn-ghost" onclick="excluirConvite('${b.id}')">Excluir</button>
```

Adicionar a função, próxima de `whatsLink()` ou outra função utilitária do arquivo:

```js
async function excluirConvite(id){
  if(!confirm('Excluir este convite?')) return;
  try{
    await EloiAdminAuth.call(FN_LINKS, { action:'delete', id });
    toast('Convite excluído.');
    await carregar();
  }catch(e){ toast('Erro ao excluir: '+e.message); }
}
```

(Confirmar o nome exato da constante de URL da edge function — `FN_LINKS` conforme evidência da auditoria — e da função que recarrega a lista, lendo o arquivo antes de aplicar.)

- [ ] **Step 3: Diferenciar mensagem de lista vazia por filtro ativo**

Localizar (linha 318):

```js
  if(!arr.length){ el.innerHTML='<div class="empty">Nenhum convite aqui. Gere um link acima pra enviar ao cliente.</div>'; return; }
```

Substituir por:

```js
  if(!arr.length){
    const msg = (FILTRO!=='todos' && DADOS.length>0)
      ? `Nenhum convite ${FILTRO==='pendente'?'pendente':'respondido'} no momento.`
      : 'Nenhum convite aqui. Gere um link acima pra enviar ao cliente.';
    el.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
```

- [ ] **Step 4: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('painel-briefings/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
fs.writeFileSync('/tmp/pb-check.js', scripts);
"
node --check /tmp/pb-check.js
```
Expected: sem erro.

- [ ] **Step 5: Verificação manual**

Preview local, `/painel-briefings/`. Tentar gerar link sem nome — confirmar toast de validação. Gerar um convite de teste e excluí-lo pelo novo botão. Filtrar por "Pendentes" quando não houver nenhum — confirmar mensagem diferenciada.

- [ ] **Step 6: Commit**

```bash
git add painel-briefings/index.html
git commit -m "fix(p0): briefings valida cliente ao gerar link, adiciona excluir convite, diferencia mensagem de vazio por filtro"
```

---

## Onda 3 — Sistema visual, cor por cliente, consistência entre telas

### Task 11: `assets/eloi-admin/admin.css` — paleta semântica compartilhada + aplicar nas 3 telas divergentes

**Files:**
- Modify: `assets/eloi-admin/admin.css`
- Modify: `portal/index.html`
- Modify: `gestao/index.html`
- Modify: `painel-briefings/index.html`

- [ ] **Step 1: Ler `admin.css` inteiro pra confirmar o que já existe**

Run: `cat "assets/eloi-admin/admin.css"` (ou usar a tool de leitura) — confirmar que não existe já uma definição de `.badge-pago`/`.badge-pendente` antes de adicionar (evitar duplicar).

- [ ] **Step 2: Adicionar classes de status compartilhadas**

No final de `assets/eloi-admin/admin.css`, adicionar:

```css
/* status semântico compartilhado (P0 — Onda 3): 1 verde, 1 vermelho, usados em toda tela que mostra pago/pendente */
.badge-status-ok{background:rgba(174,232,174,.18);color:#aee8ae}
.badge-status-pend{background:rgba(243,180,180,.18);color:#f3b4b4}
```

- [ ] **Step 3: Aplicar em `portal/index.html`**

Localizar (linha 44):

```css
    .badge.aprovado,.badge.pago,.badge.respondido{background:rgba(74,222,128,.2);color:#4ade80}
```

E (linha 48):

```css
    .badge.aberto{background:rgba(248,113,113,.15);color:#f87171}
```

Substituir os dois blocos pra herdar da classe compartilhada (trocar os valores de `background`/`color` pelos mesmos usados em `.badge-status-ok`/`.badge-status-pend`):

```css
    .badge.aprovado,.badge.pago,.badge.respondido{background:rgba(174,232,174,.18);color:#aee8ae}
```
```css
    .badge.aberto{background:rgba(243,180,180,.18);color:#f3b4b4}
```

(Manter `.badge.recusado`, `.badge.rascunho`, `.badge.enviado`, `.badge.em_execucao`/`.badge.pendente`, `.badge.concluida` como estão — só as duas cores pago/aberto mudam pra bater com o resto do painel.)

- [ ] **Step 4: Confirmar que `gestao/index.html` e `painel-briefings/index.html` já usam essas cores (não deveriam precisar mudança)**

Run: `grep -n "\-\-good\|aee8ae\|f3b4b4" gestao/index.html painel-briefings/index.html`
Expected: já usam `#aee8ae`/`#f3b4b4` (conforme evidência da auditoria) — se algum não usar, ajustar pra bater com o mesmo par de cores.

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "
const fs = require('fs');
['portal/index.html'].forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/portal-check.js', scripts);
});
"
node --check /tmp/portal-check.js
```
Expected: sem erro (essa task só mexe em CSS, então o `node --check` é mais uma garantia de que a edição não corrompeu nenhum `<script>` adjacente por engano).

- [ ] **Step 6: Verificação manual**

Preview local, abrir `/portal/` (ou visualizar o CSS renderizado) e comparar a cor do badge "Pago"/"Em aberto" com a mesma cor em `/gestao/` — devem bater agora.

- [ ] **Step 7: Commit**

```bash
git add assets/eloi-admin/admin.css portal/index.html
git commit -m "fix(p0): unifica paleta semantica pago/pendente entre portal e resto do painel"
```

---

### Task 12: Cor do cliente aplicada em Briefings, Orçamentos e Portal

**Files:**
- Modify: `painel-briefings/index.html`
- Modify: `painel-orcamentos/index.html`
- Modify: `portal/index.html`

- [ ] **Step 1: `painel-briefings/index.html` — chip colorido no nome do cliente**

Localizar (linha 326, dentro do template de `renderLista()`):

```js
<div class="cliente">${esc(b.cliente||b.empresa||...)}</div>
```

(Confirmar o conteúdo exato dessa linha lendo o arquivo — a evidência da auditoria mostra `esc(b.cliente||b.empresa||...)`, o `...` precisa ser substituído pelo valor real presente no arquivo.) Se o convite tiver `cliente_id` vinculado (campo `newClienteId`/`b.cliente_id`), usar a cor do cliente cadastrado; senão, manter texto simples. Precisa de acesso à lista de clientes (`CLIENTES` ou equivalente já carregada na página) e sua cor. Trocar para:

```js
<div class="cliente">${b.cliente_id ? `<span class="chip" style="background:${esc(corDeCliente(b.cliente_id))}">${esc(b.cliente||b.empresa||'—')}</span>` : esc(b.cliente||b.empresa||'—')}</div>
```

Adicionar a função auxiliar (se não existir já uma lista de clientes carregada nesta página — confirmar lendo `carregarClientesSelect()`, já referenciado no boot do arquivo):

```js
function corDeCliente(id){ const c=(CLIENTES_LISTA||[]).find(x=>x.id===id); return c?c.cor:'#7B2CBF'; }
```

(Usar o nome real da variável que já guarda a lista de clientes carregada por `carregarClientesSelect()` — inspecionar essa função antes de aplicar; `CLIENTES_LISTA` é um placeholder de nome, ajustar pro nome real usado no arquivo.)

- [ ] **Step 2: `painel-orcamentos/index.html` — chip colorido no nome do cliente**

Localizar (linha 242):

```js
<div class="cli">${esc(o.cliente||'—')}</div>
```

Substituir por:

```js
<div class="cli">${o.cliente_id ? `<span class="chip" style="background:${esc(corDeCliente(o.cliente_id))}">${esc(o.cliente||'—')}</span>` : esc(o.cliente||'—')}</div>
```

Adicionar a mesma função auxiliar `corDeCliente(id)` usando a lista `CLIENTES` já carregada nesta página (confirmar nome exato da variável — a Task 6 já referenciou `CLIENTES` sendo usada em `painel-orcamentos` no select `f_cliente_id`).

- [ ] **Step 3: `portal/index.html` — cor do próprio cliente no topbar**

Localizar (linha 183):

```js
    document.getElementById('clienteNome').textContent = CLIENTE.nome || '';
```

Adicionar logo abaixo (aplica a cor do próprio cliente como acento visual no topbar, sem virar bloco de texto colorido demais — usar como `border-left` ou pequeno indicador, não como fundo do texto inteiro, seguindo a regra "não usar cor do cliente como fundo excessivo"):

```js
    const topbarEl = document.getElementById('clienteNome').closest('.topbar') || document.getElementById('clienteNome').parentElement;
    if(topbarEl && CLIENTE.cor) topbarEl.style.borderLeft = `3px solid ${CLIENTE.cor}`;
```

- [ ] **Step 4: Verificar sintaxe dos 3 arquivos**

```bash
for f in painel-briefings/index.html painel-orcamentos/index.html portal/index.html; do
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$f', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/check.js', scripts);
  "
  node --check /tmp/check.js || echo "FALHOU: $f"
done
```
Expected: nenhum "FALHOU" impresso.

- [ ] **Step 5: Verificação manual**

Preview local. `/painel-briefings/` e `/painel-orcamentos/`: confirmar que convites/orçamentos com cliente cadastrado vinculado mostram chip colorido igual à cor usada em `/gestao/`. `/portal/`: logar como Georgia Andrade (ou F2 Experience) e confirmar o acento de cor no topbar.

- [ ] **Step 6: Commit**

```bash
git add painel-briefings/index.html painel-orcamentos/index.html portal/index.html
git commit -m "fix(p0): aplica cor do cliente em briefings, orcamentos e portal (antes so admin+gestao tinham)"
```

---

### Task 13: Unificar regra de cor marca-vs-cliente (corrige "ASUS"/"Georgia Andrade" com cor diferente entre telas)

**Files:**
- Modify: `admin/index.html`
- Modify: `assets/eloi-admin/periodo.js`
- Modify: `gestao/index.html`

**Interfaces:**
- Consumes: `EloiPeriodo.corDaMarca(nome)` (já existe, `assets/eloi-admin/periodo.js:39` aprox.)

- [ ] **Step 1: `admin/index.html` — usar `corDaMarca` quando há sub_cliente, `corCliente` quando não há**

Localizar (linha 132):

```js
const { brl, esc, dataBR } = P;
```

Substituir por:

```js
const { brl, esc, dataBR, corDaMarca } = P;
```

Localizar `renderAtencao()` (linha 217-249) e trocar as duas ocorrências de `cor:corCliente(s.cliente_id)` (linhas ~222 e ~226) por uma expressão que usa `corDaMarca` quando o serviço tem `sub_cliente`:

```js
  SERVICOS.filter(s=>s.status_execucao==='concluida' && !s.nf_numero).forEach(s=>rows.push({
    ord:0, tag:'nf', tl:'NF pendente', cli:marcaDe(s), cor: s.sub_cliente ? corDaMarca(s.sub_cliente) : corCliente(s.cliente_id),
    txt:s.descricao, sub:brl(s.valor_cents)+' a faturar', d:s.data_competencia, href:'/gestao/'
  }));
  // pagamento pendente: com NF, nao pago
  SERVICOS.filter(s=>s.nf_numero && !s.pago).forEach(s=>rows.push({
    ord:1, tag:'pay', tl:'Pagamento', cli:marcaDe(s), cor: s.sub_cliente ? corDaMarca(s.sub_cliente) : corCliente(s.cliente_id),
    txt:s.descricao, sub:brl(s.valor_cents)+' a receber', d:s.data_competencia, href:'/gestao/'
  }));
```

- [ ] **Step 2: `admin/index.html` — usar `corCliente` (não roxo fixo) nas linhas de orçamento/briefing quando houver `cliente_id`**

Ainda em `renderAtencao()`, localizar:

```js
  ORCS.filter(o=>(o.status||'')==='enviado').forEach(o=>rows.push({
    ord:2, tag:'orc', tl:'Orçamento', cli:o.cliente||'—', cor:'#7B2CBF',
    txt:o.titulo||'Proposta', sub:brl((Number(o.valor_total)||0)*100)+' aguardando', d:o.created_at, href:'/painel-orcamentos/'
  }));
  // briefing pendente
  INV.filter(b=>b.status==='pendente').forEach(b=>rows.push({
    ord:3, tag:'brf', tl:'Briefing', cli:b.cliente||b.empresa||'—', cor:'#5A189A',
    txt:'Aguardando resposta', sub:'', d:b.created_at, href:'/painel-briefings/'
  }));
```

Substituir por:

```js
  ORCS.filter(o=>(o.status||'')==='enviado').forEach(o=>rows.push({
    ord:2, tag:'orc', tl:'Orçamento', cli:o.cliente||'—', cor: o.cliente_id ? corCliente(o.cliente_id) : '#7B2CBF',
    txt:o.titulo||'Proposta', sub:brl((Number(o.valor_total)||0)*100)+' aguardando', d:o.created_at, href:'/painel-orcamentos/'
  }));
  // briefing pendente
  INV.filter(b=>b.status==='pendente').forEach(b=>rows.push({
    ord:3, tag:'brf', tl:'Briefing', cli:b.cliente||b.empresa||'—', cor: b.cliente_id ? corCliente(b.cliente_id) : '#5A189A',
    txt:'Aguardando resposta', sub:'', d:b.created_at, href:'/painel-briefings/'
  }));
```

- [ ] **Step 3: `gestao/index.html` — ranking usa `corDoCliente` quando não há sub_cliente**

Localizar `renderRanking()` (linha 399-412):

```js
function renderRanking(){
  const inP = SERVICOS.filter(noPeriodo);
  const map = {};
  inP.forEach(s=>{
    const cli = CLIENTES.find(c=>c.id===s.cliente_id);
    const marca = s.sub_cliente || (cli?cli.nome:'—');
    const r = map[marca] || (map[marca]={ marca, cor:corDaMarca(marca), fat:0, rec:0, ar:0, n:0 });
    const v=+s.valor_cents||0; r.fat+=v; r.n++; if(!s.pago) r.ar+=v;
  });
```

Substituir a linha de criação de `r` por:

```js
    const r = map[marca] || (map[marca]={ marca, cor: s.sub_cliente ? corDaMarca(marca) : corDoCliente(s.cliente_id), fat:0, rec:0, ar:0, n:0 });
```

(Isso reaproveita `corDoCliente()`, que hoje é código morto — deixa de ser removida na Task 16 e passa a ser usada aqui; ajustar a Task 16 pra não remover essa função, só o dead-code das outras (`LAST_TEL`, comentário `/aplicativos/`) — ver nota na Task 16.)

- [ ] **Step 4: Verificar sintaxe**

```bash
for f in admin/index.html gestao/index.html; do
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$f', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/check.js', scripts);
  "
  node --check /tmp/check.js || echo "FALHOU: $f"
done
```
Expected: nenhum "FALHOU".

- [ ] **Step 5: Verificação manual**

Preview local. `/admin/`: em "Sua atenção", confirmar que um serviço da marca ASUS mostra a MESMA cor que `/gestao/` mostra pra ASUS no ranking. `/gestao/`: confirmar que "Georgia Andrade" (sem sub_cliente) aparece no ranking com a MESMA cor que aparece na aba Clientes e no cabeçalho de grupo de serviços dela.

- [ ] **Step 6: Commit**

```bash
git add admin/index.html gestao/index.html
git commit -m "fix(p0): unifica regra de cor marca-vs-cliente entre admin e gestao (corDaMarca so quando ha sub_cliente)"
```

---

### Task 14: Estados de erro visíveis (admin, portal) + remover CSS morto do portal

**Files:**
- Modify: `admin/index.html`
- Modify: `portal/index.html`

- [ ] **Step 1: `admin/index.html` — banner de erro quando `carregar()` falha**

Localizar (linha 109, HTML):

```html
  <div class="loading" id="loading">Carregando…</div>
```

Adicionar logo abaixo:

```html
  <div class="load-error" id="loadError" style="display:none">Não foi possível carregar os dados. <button onclick="carregar()">Tentar de novo</button></div>
```

Adicionar CSS (perto de `.loading{`):

```css
    .load-error{color:#f3b4b4;text-align:center;padding:20px;font-size:.88rem}
    .load-error button{margin-left:8px;background:transparent;border:1px solid #f3b4b4;color:#f3b4b4;border-radius:8px;padding:6px 12px;cursor:pointer;font-family:var(--font)}
```

Localizar `carregar()` (linha 155-174):

```js
async function carregar(){
  try{
    const [g, stats, briefs, orcs] = await Promise.allSettled([
      call('eloi-gestao',{action:'clientes.list'}),
      call('eloi-gestao',{action:'dashboard.stats'}),
      call('briefing-links',{action:'list'}),
      call('orcamentos',{action:'list'})
    ]);
    CLIENTES = g.status==='fulfilled' ? (g.value.clientes||[]) : [];
    FIN = stats.status==='fulfilled' ? stats.value : null;
    INV = briefs.status==='fulfilled' ? (briefs.value.invites||[]) : [];
    ORCS = orcs.status==='fulfilled' ? (orcs.value.orcamentos||[]) : [];
    const sv = await call('eloi-gestao',{action:'servicos.list',filtro:{}});
    SERVICOS = sv.servicos||[];
  }catch(e){ /* segue com o que tiver */ }
  PERIODO = P.criar();
  render();
  document.getElementById('loading').style.display='none';
  document.getElementById('dash').style.display='block';
}
```

Substituir por:

```js
async function carregar(){
  document.getElementById('loadError').style.display='none';
  document.getElementById('loading').style.display='block';
  let falhaTotal = false;
  try{
    const [g, stats, briefs, orcs] = await Promise.allSettled([
      call('eloi-gestao',{action:'clientes.list'}),
      call('eloi-gestao',{action:'dashboard.stats'}),
      call('briefing-links',{action:'list'}),
      call('orcamentos',{action:'list'})
    ]);
    CLIENTES = g.status==='fulfilled' ? (g.value.clientes||[]) : [];
    FIN = stats.status==='fulfilled' ? stats.value : null;
    INV = briefs.status==='fulfilled' ? (briefs.value.invites||[]) : [];
    ORCS = orcs.status==='fulfilled' ? (orcs.value.orcamentos||[]) : [];
    const sv = await call('eloi-gestao',{action:'servicos.list',filtro:{}});
    SERVICOS = sv.servicos||[];
  }catch(e){ falhaTotal = true; }
  document.getElementById('loading').style.display='none';
  if(falhaTotal){
    document.getElementById('loadError').style.display='block';
    document.getElementById('dash').style.display='none';
    return;
  }
  PERIODO = P.criar();
  render();
  document.getElementById('dash').style.display='block';
}
```

- [ ] **Step 2: `portal/index.html` — diferenciar erro de vazio em `carregarDados()`, `renderMarca()`, `renderArquivos()`**

Localizar `carregarDados()` (linha 171-187):

```js
async function carregarDados(){
  try {
    const [me, sv, oc, br] = await Promise.all([
      callPortal('me'),
      callPortal('servicos.list'),
      callPortal('orcamentos.list'),
      callPortal('briefings.list'),
    ]);
    CLIENTE = me.cliente || {};
    SERVICOS = sv.servicos || [];
    ORCAMENTOS = oc.orcamentos || [];
    BRIEFINGS = br.briefings || [];
    document.getElementById('clienteNome').textContent = CLIENTE.nome || '';
    renderNF(); renderOrc(); renderBriefing();
    renderMarca(); renderArquivos();
  } catch (e) { /* 401 já trocou pra tela de login dentro de callPortal */ }
}
```

Substituir por:

```js
async function carregarDados(){
  try {
    const [me, sv, oc, br] = await Promise.all([
      callPortal('me'),
      callPortal('servicos.list'),
      callPortal('orcamentos.list'),
      callPortal('briefings.list'),
    ]);
    CLIENTE = me.cliente || {};
    SERVICOS = sv.servicos || [];
    ORCAMENTOS = oc.orcamentos || [];
    BRIEFINGS = br.briefings || [];
    document.getElementById('clienteNome').textContent = CLIENTE.nome || '';
    renderNF(); renderOrc(); renderBriefing();
    renderMarca(); renderArquivos();
  } catch (e) {
    if(e && e.status === 401) return; // ja trocou pra tela de login dentro de callPortal
    document.querySelectorAll('.tab-pane').forEach(el=>{
      el.innerHTML = '<div class="empty"><div class="ic">⚠</div>Não foi possível carregar seus dados agora. <button onclick="carregarDados()">Tentar de novo</button></div>';
    });
  }
}
```

(Confirmar o seletor real do container de cada aba — `.tab-pane` é um placeholder; usar o mesmo seletor que agrupa `#tab-nf`, `#tab-marca`, `#tab-arquivos` etc., inspecionando o HTML antes de aplicar.)

Localizar `renderMarca()` (linha 190-225), trocar o `catch`:

```js
  } catch (e) {
    el.innerHTML = '<div class="empty"><div class="ic">🎨</div>Seus arquivos de marca ainda não foram publicados.</div>';
  }
```

Substituir por:

```js
  } catch (e) {
    if(e && e.status === 404){ el.innerHTML = '<div class="empty"><div class="ic">🎨</div>Seus arquivos de marca ainda não foram publicados.</div>'; return; }
    el.innerHTML = '<div class="empty"><div class="ic">⚠</div>Não foi possível carregar — <button onclick="renderMarca()">tentar de novo</button></div>';
  }
```

Aplicar o mesmo padrão em `renderArquivos()` (linha 232-248), trocando o `catch` equivalente. (Se a edge function `portal-cliente` não distinguir 404 de "vazio" hoje, tratar TODO erro como "não foi possível carregar" com retry, mantendo a mensagem de "ainda não publicado" só pro caso `d.manifest` ser `null`/`entregas` vier vazio com sucesso — que já é o caminho feliz existente, fora do `catch`.)

- [ ] **Step 3: Remover CSS morto de badge em `portal/index.html`**

Localizar (linha 46-47):

```css
    .badge.em_execucao,.badge.pendente{background:rgba(157,78,221,.2);color:var(--c100)}
    .badge.concluida{background:rgba(96,165,250,.2);color:#60a5fa}
```

`.badge.pendente` é usado (briefing) — manter essa parte. Separar a regra e remover só a parte morta (`.badge.em_execucao` e `.badge.concluida`, que nunca são aplicadas como classe):

```css
    .badge.pendente{background:rgba(157,78,221,.2);color:var(--c100)}
```

- [ ] **Step 4: Verificar sintaxe**

```bash
for f in admin/index.html portal/index.html; do
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$f', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/check.js', scripts);
  "
  node --check /tmp/check.js || echo "FALHOU: $f"
done
```
Expected: nenhum "FALHOU".

- [ ] **Step 5: Verificação manual**

Preview local. `/admin/`: simular falha (ex: desligar rede momentaneamente ou apontar `SUPA` pra URL inválida temporariamente só durante o teste, desfazendo depois) — confirmar banner de erro com botão "Tentar de novo", não dashboard zerado silencioso. `/portal/`: mesma ideia nas abas Marca/Arquivos.

- [ ] **Step 6: Commit**

```bash
git add admin/index.html portal/index.html
git commit -m "fix(p0): admin e portal mostram erro visivel quando falha carregar dados, em vez de parecer tudo vazio/ok"
```

---

### Task 15: Polimento visual em lote (hover, loading, responsivo)

**Files:**
- Modify: `gestao/index.html`
- Modify: `painel-briefings/index.html`
- Modify: `painel-orcamentos/index.html`
- Modify: `orcamento-inteligente/index.html`
- Modify: `marca/index.html`

- [ ] **Step 1: `gestao/index.html` — hover em `.cli-row`**

Localizar a regra `.cli-row{` (buscar no CSS, por volta da linha 110) e adicionar `cursor:pointer;transition:border-color .15s,background .15s` na regra existente, e logo depois adicionar:

```css
    .cli-row:hover{border-color:var(--c500);background:rgba(45,0,85,.6)}
```

- [ ] **Step 2: `painel-briefings/index.html` — hover em `.chip` + `flex-wrap` em `.row`**

Localizar `.chip{` (linha 56):

```css
    .chip{...cursor:pointer;transition:all .2s} .chip.active{background:var(--c700);...}
```

Adicionar logo depois (sem remover `.chip.active`):

```css
    .chip:hover{border-color:var(--c500);color:#fff}
```

Localizar `.row{` (linha 59) e adicionar `flex-wrap:wrap;` na declaração existente.

- [ ] **Step 3: `painel-orcamentos/index.html` — grid não estoura em telas <348px**

Localizar (linha 44):

```css
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
```

Substituir por:

```css
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px}
```

- [ ] **Step 4: `orcamento-inteligente/index.html` — aria-label nos controles sem rótulo no mobile**

Localizar o checkbox de "ativo" e o botão de excluir dentro do editor de catálogo (linha ~407-408, buscar por `class="e-ativo"` ou equivalente e o botão `✕`). Adicionar `aria-label="Ativo"` no checkbox e `aria-label="Excluir serviço do catálogo"` no botão de excluir.

- [ ] **Step 5: `marca/index.html` — alinhar `.pagetitle` ao padrão das outras telas**

Localizar `.pagetitle{` (linha 14):

```css
.pagetitle{font-size:1.3rem;...}
```

Substituir `font-size:1.3rem` por `font-size:1.5rem` e, se a regra não tiver peso de fonte definido, adicionar `font-variation-settings:'wght' 700` (mesmo padrão de `admin/index.html:104` `.greet` e `painel-briefings/index.html:20` `.topbar h1`).

- [ ] **Step 6: `gestao/index.html` e `painel-briefings/index.html` — indicador de carregamento inicial**

Em `gestao/index.html`, localizar `mostrarApp()` (linha ~328):

```js
async function mostrarApp(){
  document.getElementById('loginView').style.display='none';
  document.getElementById('app').classList.add('show');
  if(window.EloiNav) EloiNav.mount();
  await carregarTudo();
}
```

Adicionar um elemento de loading simples antes/depois — inserir no HTML, logo dentro de `<div id="app"...>` (procurar a abertura dessa div), um `<div class="loading" id="loadingG" style="display:block">Carregando…</div>`, e no CSS adicionar (se `.loading` já não existir nesse arquivo — checar antes):

```css
    .loading{color:var(--c300);text-align:center;padding:30px;font-size:.9rem}
```

Em `carregarTudo()`, no início da função adicionar nada (o elemento já começa visível) e no final (depois de `render()`) adicionar `document.getElementById('loadingG').style.display='none';`.

Aplicar o mesmo padrão (elemento `#loadingB` visível por padrão, escondido ao final de `carregar()`) em `painel-briefings/index.html`.

- [ ] **Step 7: Verificar sintaxe dos 5 arquivos**

```bash
for f in gestao/index.html painel-briefings/index.html painel-orcamentos/index.html orcamento-inteligente/index.html marca/index.html; do
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$f', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/check.js', scripts);
  "
  node --check /tmp/check.js || echo "FALHOU: $f"
done
```
Expected: nenhum "FALHOU".

- [ ] **Step 8: Verificação manual (redimensionar pra mobile também)**

Preview local, testar em viewport 375px e 320px: `/gestao/` (hover em linha de cliente), `/painel-briefings/` (chips, linha de convite não estoura), `/painel-orcamentos/` (grid de cards não estoura em 320px), `/orcamento-inteligente/` (modal mobile com aria-label), `/marca/` (título do mesmo tamanho que outras telas).

- [ ] **Step 9: Commit**

```bash
git add gestao/index.html painel-briefings/index.html painel-orcamentos/index.html orcamento-inteligente/index.html marca/index.html
git commit -m "fix(p0): polimento visual - hover, loading, responsivo, aria-label, titulo padronizado"
```

---

### Task 16: Limpeza de dead code

**Files:**
- Modify: `painel-briefings/index.html`
- Modify: `marca/index.html`

**Nota:** `corDoCliente()` em `gestao/index.html`, que era dead code na auditoria original, **passou a ser usada** na Task 13 (Step 3) — não remover. Esta task cobre só o que continua morto depois das tasks anteriores.

- [ ] **Step 1: Remover `LAST_TEL` de `painel-briefings/index.html`**

Localizar (linha 175):

```js
let DADOS = [], FILTRO = 'todos', LAST_LINK = '', LAST_TEL = '';
```

Substituir por:

```js
let DADOS = [], FILTRO = 'todos', LAST_LINK = '';
```

- [ ] **Step 2: Atualizar comentário desatualizado em `marca/index.html`**

Localizar (linha 162):

```js
/* ── AUTH / SHELL (mesmo padrão de /gestao/ e /aplicativos/) ── */
```

Substituir por:

```js
/* ── AUTH / SHELL (mesmo padrão de /gestao/ e /admin/) ── */
```

- [ ] **Step 3: Confirmar que não sobrou mais nenhuma referência viva a `/aplicativos/`**

Run: `grep -rn "aplicativos" --include="*.html" --include="*.js" --include="*.ts" . | grep -v "^\./docs/"`
Expected: nenhuma ocorrência (a linha do Step 2 era a última).

- [ ] **Step 4: Verificar sintaxe**

```bash
for f in painel-briefings/index.html marca/index.html; do
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$f', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  fs.writeFileSync('/tmp/check.js', scripts);
  "
  node --check /tmp/check.js || echo "FALHOU: $f"
done
```
Expected: nenhum "FALHOU".

- [ ] **Step 5: Commit**

```bash
git add painel-briefings/index.html marca/index.html
git commit -m "chore(p0): remove variavel morta e comentario desatualizado"
```

---

## Onda 4 — Padronização de nomes (dado real)

### Task 17: Corrigir grafia do cliente "F2 EXPERIENCE" → "F2 Experience"

**Files:**
- Nenhum arquivo de código — mudança de dado via SQL.

- [ ] **Step 1: Confirmar o registro antes de alterar**

Run (via `execute_sql`, `project_id: "nlamznxoocmygfvnqcns"`):
```sql
select id, nome from eloi_clientes where nome = 'F2 EXPERIENCE';
```
Expected: 1 linha, `id = 'b6f964c8-a93e-4093-8924-f170f198e736'`.

- [ ] **Step 2: Atualizar**

Run:
```sql
update eloi_clientes set nome = 'F2 Experience' where id = 'b6f964c8-a93e-4093-8924-f170f198e736' and nome = 'F2 EXPERIENCE';
```

- [ ] **Step 3: Confirmar**

Run:
```sql
select id, nome from eloi_clientes where id = 'b6f964c8-a93e-4093-8924-f170f198e736';
```
Expected: `nome = 'F2 Experience'`.

- [ ] **Step 4: Verificação manual**

Preview local, `/gestao/` e `/admin/` — confirmar que o nome do cliente aparece como "F2 Experience" em todo lugar (chip, ranking, lista). Sem commit de código nesta task (é só dado).

---

### Task 18: Gerar tabela de padronização de nomes de serviço (checkpoint humano)

**Files:**
- Create: `docs/superpowers/specs/2026-07-17-p0-onda4-tabela-nomes.md` (tabela de revisão, não é código de produção)

- [ ] **Step 1: Buscar todos os 47 serviços reais**

Run (via `execute_sql`):
```sql
select id, sub_cliente, descricao, valor_cents, observacoes from eloi_servicos order by cliente_id, data_competencia nulls last, created_at;
```

- [ ] **Step 2: Aplicar a regra de padronização (spec, seção Onda 4.2) a cada uma das 47 linhas**

Regra: remover CAIXA ALTA, extrair preço-por-item embutido pro texto de `observacoes` (formato `Item A: R$X,XX · Item B: R$Y,YY`), manter descrição curta e escaneável preservando o projeto/sentido original, manter siglas reais (PPT, NF, 3D, IA, PDF) maiúsculas, resto em capitalização normal de português. NÃO alterar `valor_cents`. As 5 linhas já traduzidas na spec (`docs/superpowers/specs/2026-07-17-p0-auditoria-design.md`, seção Onda 4.2) servem de padrão de estilo pras outras 42.

- [ ] **Step 3: Escrever a tabela completa de revisão**

Criar `docs/superpowers/specs/2026-07-17-p0-onda4-tabela-nomes.md` com uma tabela markdown de 3 colunas (`id` abreviado/últimos 8 caracteres, `descricao_antes` → `descricao_depois`, `observacoes_depois`) cobrindo as 47 linhas. Cada linha da tabela precisa ser rastreável ao `id` real (UUID completo numa coluna oculta/comentário, pra aplicar o UPDATE certo na Task 19).

- [ ] **Step 4: Commit da tabela (documento de revisão, não é código de produção)**

```bash
git add docs/superpowers/specs/2026-07-17-p0-onda4-tabela-nomes.md
git commit -m "docs(p0): tabela de padronizacao de nomes de servico p/ revisao do usuario (onda 4)"
```

- [ ] **Step 5: APRESENTAR a tabela ao usuário e PARAR**

Este é um checkpoint humano real, não um gate automático. Mostrar a tabela completa (ou um resumo navegável) e pedir confirmação explícita antes de prosseguir pra Task 19. Se o usuário pedir ajuste em qualquer linha, editar a tabela e pedir confirmação de novo antes de aplicar.

---

### Task 19: [GATED — só após aprovação da Task 18] Aplicar renomeação + limpar sub_cliente duplicado

**Files:**
- Nenhum arquivo de código — mudança de dado via SQL.

**Pré-condição:** usuário aprovou explicitamente a tabela da Task 18. Não iniciar esta task sem essa aprovação.

- [ ] **Step 1: Backup lógico antes de alterar (snapshot da tabela atual)**

Run (via `execute_sql`) e salvar o resultado num arquivo local antes de aplicar qualquer UPDATE:
```sql
select id, sub_cliente, descricao, observacoes from eloi_servicos;
```
Salvar a saída em `docs/superpowers/specs/2026-07-17-p0-onda4-backup-antes.json` (não commitado — é só rede de segurança local, pode ficar fora do git ou num commit separado marcado como backup).

- [ ] **Step 2: Aplicar as 47 atualizações de `descricao`/`observacoes` aprovadas na Task 18**

Para cada linha da tabela aprovada, rodar (via `execute_sql`):
```sql
update eloi_servicos set descricao = '<descricao_depois>', observacoes = '<observacoes_depois>' where id = '<uuid>';
```
(Um `UPDATE` por registro, usando os valores exatos aprovados na Task 18 — não gerar novo texto aqui, só aplicar o que já foi revisado.)

- [ ] **Step 3: Nular `sub_cliente` dos registros onde `sub_cliente` repete o nome do cliente**

Run:
```sql
update eloi_servicos set sub_cliente = null
where sub_cliente = 'F2 EXPERIENCE' and cliente_id = 'b6f964c8-a93e-4093-8924-f170f198e736';
```
Expected: 9 linhas afetadas (confirmar a contagem batendo com o que a auditoria encontrou).

- [ ] **Step 4: Verificar**

Run:
```sql
select count(*) as total, count(*) filter (where descricao = upper(descricao) and descricao ~ '[A-ZÀ-Ú]{3,}') as ainda_caps
from eloi_servicos;
```
Expected: `ainda_caps` bem menor que antes (idealmente 0, exceto siglas curtas que naturalmente batem o regex — conferir manualmente se sobrar algum).

Run:
```sql
select count(*) from eloi_servicos where sub_cliente = 'F2 EXPERIENCE';
```
Expected: `0`.

- [ ] **Step 5: Verificação manual**

Preview local, `/gestao/` — confirmar visualmente que a lista de serviços de F2 Experience não mostra mais o cabeçalho "F2 EXPERIENCE" duplicado (cliente + subgrupo), e que as descrições aparecem limpas, sem CAIXA ALTA nem preço embutido no título. `/portal/` — confirmar que a aba Notas Fiscais mostra descrição limpa pro cliente.

- [ ] **Step 6: Nenhum commit de código** (mudança é só de dado, já registrada no histórico do banco). Se quiser deixar rastro no git, commitar só o backup JSON gerado no Step 1, sem incluir segredo nenhum:

```bash
git add docs/superpowers/specs/2026-07-17-p0-onda4-backup-antes.json
git commit -m "docs(p0): snapshot dos servicos antes da padronizacao de nomes (onda 4)"
```

---

## Self-Review (spec coverage)

- Onda 1 (11 itens da spec) → Tasks 1-5. ✓
- Onda 2 (17 itens) → Tasks 6-10. ✓
- Onda 3 (21 itens) → Tasks 11-16. ✓
- Onda 4 (4 itens) → Tasks 17-19. ✓
- Item explicitamente fora de escopo (vendorizar `fflate.min.js`) → anotado na Task 9, não incluído como task automática (exige permissão de download).
- Checkpoint humano da Onda 4.2 (47 registros reais) → Task 18 gera e para; Task 19 só roda após aprovação — não é um "TODO", é uma pausa de processo real.
