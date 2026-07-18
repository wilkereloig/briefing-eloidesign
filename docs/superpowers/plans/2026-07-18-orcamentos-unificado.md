# Orçamentos Unificado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir `/orcamento-inteligente/` dentro de `/painel-orcamentos/`, transformando os multiplicadores de ajuste (complexidade/urgência/desconto) de linhas de item congeladas em colunas que recalculam sempre.

**Architecture:** Três colunas novas em `orcamentos`; um módulo compartilhado `assets/eloi-admin/orcamento.js` com a tabela de multiplicadores e a função `calcular()`; o painel ganha um seletor de catálogo e uma seção de ajustes; a view pública do cliente passa a derivar as linhas de ajuste em vez de lê-las gravadas; a rota antiga vira redirect.

**Tech Stack:** HTML estático sem build, JS ES5+/ES6 em `<script>` inline, Supabase (Postgres + edge functions Deno), deploy Vercel no push.

## Global Constraints

- **Sem build step.** Nada de import/export ES modules nos assets — seguir o padrão IIFE de `assets/eloi-admin/periodo.js` e `nav.js`, expondo em `window`.
- **Não inventar datas nem alterar valores financeiros sem base nos dados existentes.** A migration usa defaults neutros e não reprocessa nenhum registro.
- **Commitar só os arquivos da tarefa.** O repo tem WIP local não relacionado. Nunca `git add -A`.
- **Nunca `git commit --amend`.** Correção é commit novo.
- **Multiplicadores canônicos** (valores exatos, não mudar): complexidade `simples` ×1.0, `media` ×1.4, `alta` ×1.8; urgência `normal` ×1.0, `expressa` ×1.3.
- **Arredondamento:** cada `itens[].valor` arredondado a 2 casas antes de somar; `valor_total = Math.round(total*100)/100`.
- **Verificação sem framework de teste.** O repo não tem um. Sintaxe via `node --check` no `<script>` extraído; lógica via script standalone com `assert`.
- Scratchpad pra arquivos temporários (Windows, `/tmp` não existe): usar o diretório de scratchpad da sessão.

---

### Task 1: Migration + edge function

**Files:**
- Modify: `edge-functions/orcamentos.ts` (blocos `public_get` ~linha 41, `create` ~linha 77, `update` ~linha 93)
- Migration: aplicada via MCP Supabase, projeto `nlamznxoocmygfvnqcns`

**Interfaces:**
- Produces: colunas `complexidade text`, `urgencia text`, `desconto_pct numeric` na tabela `orcamentos`; as actions `create`/`update` passam a aceitar esses três campos; `public_get` passa a retorná-los.

- [ ] **Step 1: Registrar a contagem e uma amostra ANTES da migration**

Rodar via MCP Supabase `execute_sql`:

```sql
select count(*) as total, round(sum(valor_total),2) as soma from orcamentos;
```

Anotar os dois números. Eles têm que bater no Step 3.

- [ ] **Step 2: Aplicar a migration**

Via MCP Supabase `apply_migration`, nome `add_orcamento_ajustes`:

```sql
alter table orcamentos
  add column complexidade  text    not null default 'simples',
  add column urgencia      text    not null default 'normal',
  add column desconto_pct  numeric not null default 0;
```

- [ ] **Step 3: Confirmar que nenhum valor mudou**

```sql
select count(*) as total, round(sum(valor_total),2) as soma from orcamentos;
```

Esperado: exatamente os mesmos dois números do Step 1. Se divergir, PARAR e reportar — a migration não deve tocar em valor.

- [ ] **Step 4: Aceitar os campos no `create`**

Em `edge-functions/orcamentos.ts`, no bloco `if (action === "create")`, substituir o objeto do `.insert(...)` por:

```ts
    const { data, error } = await supabase.from("orcamentos").insert({
      cliente: o.cliente ?? null,
      cliente_id: o.cliente_id ?? null,
      titulo: o.titulo ?? null,
      status: o.status ?? "rascunho",
      itens: o.itens ?? [],
      valor_total: o.valor_total ?? 0,
      observacoes: o.observacoes ?? null,
      link: o.link ?? null,
      complexidade: complexidade,
      urgencia: urgencia,
      desconto_pct: descontoPct,
    }).select().single();
```

E logo acima de `const { data, error }`, dentro do mesmo bloco, inserir a validação:

```ts
    const COMPLEXIDADES = ["simples", "media", "alta"];
    const URGENCIAS = ["normal", "expressa"];
    const complexidade = o.complexidade ?? "simples";
    const urgencia = o.urgencia ?? "normal";
    if (!COMPLEXIDADES.includes(complexidade)) {
      return json({ error: `complexidade inválida — use uma de: ${COMPLEXIDADES.join(", ")}` }, 400);
    }
    if (!URGENCIAS.includes(urgencia)) {
      return json({ error: `urgencia inválida — use uma de: ${URGENCIAS.join(", ")}` }, 400);
    }
    const descontoPct = Math.min(100, Math.max(0, Number(o.desconto_pct) || 0));
```

- [ ] **Step 5: Mesma coisa no `update`**

No bloco `if (action === "update")`, inserir o MESMO trecho de validação (as cinco constantes + os dois `if` + `descontoPct`) logo depois de `if (!o.id) return json({ error: "id obrigatório" }, 400);`, e acrescentar os três campos ao objeto do `.update(...)`, junto de `updated_at`:

```ts
      complexidade: complexidade,
      urgencia: urgencia,
      desconto_pct: descontoPct,
      updated_at: new Date().toISOString(),
```

- [ ] **Step 6: Expor os campos no `public_get`**

No bloco `if (action === "public_get")`, trocar a linha do `.select(...)` por:

```ts
      .select("cliente,titulo,itens,valor_total,created_at,status,complexidade,urgencia,desconto_pct")
```

Sem isso a view do cliente não consegue montar as linhas de ajuste.

- [ ] **Step 7: Deploy da edge function**

Via MCP Supabase `deploy_edge_function`, projeto `nlamznxoocmygfvnqcns`, nome `orcamentos`, com o conteúdo completo de `edge-functions/orcamentos.ts`.

- [ ] **Step 8: Verificar o deploy contra o banco real**

Chamar a action `list` e conferir que os três campos novos vêm nos registros existentes com os valores default (`simples`/`normal`/`0`). Rodar via `execute_sql`:

```sql
select complexidade, urgencia, desconto_pct, count(*) from orcamentos group by 1,2,3;
```

Esperado: uma única linha, `simples | normal | 0 | <total de orçamentos>`.

- [ ] **Step 9: Commit**

```bash
git add edge-functions/orcamentos.ts
git commit -m "feat(orcamentos): colunas complexidade/urgencia/desconto_pct na edge fn + public_get"
```

---

### Task 2: Módulo de cálculo compartilhado

**Files:**
- Create: `assets/eloi-admin/orcamento.js`
- Test: script standalone com `assert` no scratchpad (não commitado)

**Interfaces:**
- Consumes: nada.
- Produces: `window.EloiOrcamento` com:
  - `COMPLEX` — array `[{key, label, m}]`
  - `URGENCIA` — array `[{key, label, m}]`
  - `calcular({itens, complexidade, urgencia, desconto_pct})` → `{base, ajustes, total}`, onde `ajustes` é `[{nome, valor}]` e `base`/`total` são números arredondados a 2 casas.
  - `multiplicadorDe(lista, key)` → objeto da lista, caindo no primeiro item se a key for desconhecida.

- [ ] **Step 1: Escrever o teste que falha**

Criar no scratchpad `orcamento-test.js`:

```js
const assert = require('assert');
global.window = {};
require('<CAMINHO_ABSOLUTO_DO_REPO>/assets/eloi-admin/orcamento.js');
const O = global.window.EloiOrcamento;

// base simples, sem ajuste
let r = O.calcular({itens:[{nome:'a',valor:100},{nome:'b',valor:50}], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 150);
assert.strictEqual(r.total, 150);
assert.strictEqual(r.ajustes.length, 0, 'multiplicador neutro nao gera linha de ajuste');

// complexidade media
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'media', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.total, 140);
assert.strictEqual(r.ajustes.length, 1);
assert.strictEqual(r.ajustes[0].valor, 40);

// complexidade + urgencia + desconto encadeados
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'media', urgencia:'expressa', desconto_pct:10});
assert.strictEqual(r.total, 163.8);   // 100 * 1.4 * 1.3 * 0.9
assert.strictEqual(r.ajustes.length, 3);

// desconto 100% zera
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:100});
assert.strictEqual(r.total, 0);

// lista vazia
r = O.calcular({itens:[], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 0);
assert.strictEqual(r.total, 0);

// key desconhecida cai no default neutro, nao quebra
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'inexistente', urgencia:null, desconto_pct:null});
assert.strictEqual(r.total, 100);

// desconto fora da faixa e clampeado
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:-50});
assert.strictEqual(r.total, 100);
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:999});
assert.strictEqual(r.total, 0);

// arredondamento: item com fracao suja
r = O.calcular({itens:[{nome:'a',valor:33.333}], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 33.33);

console.log('OK');
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node <scratchpad>/orcamento-test.js
```

Esperado: FALHA com `Cannot find module` ou `Cannot read properties of undefined (reading 'calcular')` — o arquivo ainda não existe.

- [ ] **Step 3: Escrever o módulo**

Criar `assets/eloi-admin/orcamento.js`:

```js
/* Cálculo de orçamento — compartilhado entre /painel-orcamentos/ e /orcamento/ (view do cliente).
   A regra de multiplicador vive AQUI e só aqui. Nunca gravar linha de ajuste em `itens`. */
(function(){
  var COMPLEX = [
    {key:'simples', label:'Simples', m:1.0},
    {key:'media',   label:'Média',   m:1.4},
    {key:'alta',    label:'Alta',    m:1.8}
  ];
  var URGENCIA = [
    {key:'normal',   label:'Normal',           m:1.0},
    {key:'expressa', label:'Expressa (curto)', m:1.3}
  ];

  function r2(n){ return Math.round((Number(n)||0)*100)/100; }

  function multiplicadorDe(lista, key){
    for(var i=0;i<lista.length;i++){ if(lista[i].key===key) return lista[i]; }
    return lista[0];
  }

  function calcular(o){
    o = o || {};
    var itens = Array.isArray(o.itens) ? o.itens : [];
    var c = multiplicadorDe(COMPLEX, o.complexidade);
    var u = multiplicadorDe(URGENCIA, o.urgencia);
    var d = Math.min(100, Math.max(0, Number(o.desconto_pct) || 0));

    var base = r2(itens.reduce(function(a,it){ return a + r2(it && it.valor); }, 0));
    var afterC = base * c.m;
    var afterU = afterC * u.m;
    var afterD = afterU * (1 - d/100);

    var ajustes = [];
    if(c.m !== 1) ajustes.push({nome:'Complexidade '+c.label+' (×'+c.m+')', valor:r2(afterC-base)});
    if(u.m !== 1) ajustes.push({nome:'Urgência '+u.label+' (×'+u.m+')',     valor:r2(afterU-afterC)});
    if(d > 0)     ajustes.push({nome:'Desconto '+d+'%',                      valor:r2(afterD-afterU)});

    return { base: base, ajustes: ajustes, total: r2(afterD) };
  }

  window.EloiOrcamento = {
    COMPLEX: COMPLEX,
    URGENCIA: URGENCIA,
    multiplicadorDe: multiplicadorDe,
    calcular: calcular
  };
})();
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node <scratchpad>/orcamento-test.js
```

Esperado: `OK`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add assets/eloi-admin/orcamento.js
git commit -m "feat(orcamentos): modulo compartilhado de calculo (multiplicadores + ajustes derivados)"
```

---

### Task 3: Ajustes no form do painel

**Files:**
- Modify: `painel-orcamentos/index.html` — HTML do modal (~linha 160-168), `<script src>` (~linha 183), `calcTotal()` (~318), `abrirNovo()` (~332), `abrirEdit()` (~347), `salvar()` (~366)

**Interfaces:**
- Consumes: `window.EloiOrcamento.{COMPLEX, URGENCIA, calcular}` da Task 2.
- Produces: `lerAjustes()` → `{complexidade, urgencia, desconto_pct}`; `calcTotal()` passa a retornar o total COM ajustes aplicados.

- [ ] **Step 1: Carregar o módulo**

Em `painel-orcamentos/index.html`, depois de `<script src="/assets/eloi-admin/nav.js"></script>`, acrescentar:

```html
<script src="/assets/eloi-admin/orcamento.js"></script>
```

- [ ] **Step 2: Adicionar a seção Ajustes no modal**

Substituir a linha `<div class="total-line">Total: <span id="totalView">R$ 0,00</span></div>` por:

```html
    <details class="ajustes" id="ajustesBox">
      <summary>Ajustes <span class="aj-resumo" id="ajResumo">nenhum</span></summary>
      <div class="two">
        <div class="field"><label>Complexidade</label><select id="f_complexidade" onchange="calcTotal()"></select></div>
        <div class="field"><label>Urgência</label><select id="f_urgencia" onchange="calcTotal()"></select></div>
      </div>
      <div class="field"><label>Desconto (%)</label><input type="number" id="f_desconto" min="0" max="100" step="1" value="0" oninput="calcTotal()"></div>
    </details>
    <div id="resumoBox"></div>
    <div class="total-line">Total: <span id="totalView">R$ 0,00</span></div>
```

- [ ] **Step 3: Adicionar o CSS**

Dentro do `<style>` existente, no fim, acrescentar:

```css
.ajustes{border:1px solid var(--c800);border-radius:10px;padding:10px 12px;margin:12px 0}
.ajustes summary{cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.01em}
.aj-resumo{font-weight:400;opacity:.6;margin-left:6px}
.resumo-line{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;opacity:.8}
.resumo-line.neg{color:#f0a}
```

- [ ] **Step 4: Popular os selects e recalcular com ajustes**

Substituir a função `calcTotal()` inteira por:

```js
function popularAjustesSelects(){
  const O=window.EloiOrcamento;
  document.getElementById('f_complexidade').innerHTML =
    O.COMPLEX.map(c=>`<option value="${c.key}">${c.label}${c.m!==1?' ×'+c.m:''}</option>`).join('');
  document.getElementById('f_urgencia').innerHTML =
    O.URGENCIA.map(u=>`<option value="${u.key}">${u.label}${u.m!==1?' ×'+u.m:''}</option>`).join('');
}
function lerAjustes(){
  return {
    complexidade: document.getElementById('f_complexidade').value || 'simples',
    urgencia: document.getElementById('f_urgencia').value || 'normal',
    desconto_pct: Math.min(100, Math.max(0, Number(document.getElementById('f_desconto').value)||0)),
  };
}
function calcTotal(){
  const aj = lerAjustes();
  const r = window.EloiOrcamento.calcular({itens:lerItens(), ...aj});
  const box=document.getElementById('resumoBox');
  if(r.ajustes.length){
    box.innerHTML = `<div class="resumo-line"><span>Subtotal</span><span>${brl(r.base)}</span></div>` +
      r.ajustes.map(a=>`<div class="resumo-line ${a.valor<0?'neg':''}"><span>${esc(a.nome)}</span><span>${a.valor<0?'−':'+'} ${brl(Math.abs(a.valor))}</span></div>`).join('');
  } else { box.innerHTML=''; }
  document.getElementById('ajResumo').textContent = r.ajustes.length ? `${r.ajustes.length} aplicado(s)` : 'nenhum';
  document.getElementById('totalView').textContent = brl(r.total);
  return r.total;
}
```

Nota: `calcTotal()` agora chama `lerItens()`, que já existe logo abaixo dela no arquivo. Hoisting de `function` cobre isso — não reordenar.

- [ ] **Step 5: Resetar os ajustes em `abrirNovo()`**

Em `abrirNovo()`, logo depois de `document.getElementById('itensBox').innerHTML='';`, inserir:

```js
  popularAjustesSelects();
  document.getElementById('f_complexidade').value='simples';
  document.getElementById('f_urgencia').value='normal';
  document.getElementById('f_desconto').value='0';
  document.getElementById('ajustesBox').open=false;
```

- [ ] **Step 6: Carregar os ajustes em `abrirEdit()`**

Em `abrirEdit(i)`, logo depois de `document.getElementById('itensBox').innerHTML='';`, inserir:

```js
  popularAjustesSelects();
  document.getElementById('f_complexidade').value=o.complexidade||'simples';
  document.getElementById('f_urgencia').value=o.urgencia||'normal';
  document.getElementById('f_desconto').value=o.desconto_pct||0;
  const temAjuste = (o.complexidade&&o.complexidade!=='simples')||(o.urgencia&&o.urgencia!=='normal')||Number(o.desconto_pct)>0;
  document.getElementById('ajustesBox').open=!!temAjuste;
```

- [ ] **Step 7: Enviar os campos no `salvar()`**

Em `salvar()`, substituir o objeto `o` por:

```js
  const o={
    id: document.getElementById('f_id').value || undefined,
    cliente: document.getElementById('f_cliente').value,
    cliente_id: document.getElementById('f_cliente_id').value || null,
    titulo: document.getElementById('f_titulo').value,
    status: document.getElementById('f_status').value,
    itens: lerItens(),
    valor_total: calcTotal(),
    link: document.getElementById('f_link').value,
    observacoes: document.getElementById('f_obs').value,
    ...lerAjustes(),
  };
```

- [ ] **Step 8: Verificar sintaxe**

Extrair o `<script>` e checar:

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('painel-orcamentos/index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(process.argv[1]+'/po-check.js',m);" <scratchpad>
node --check <scratchpad>/po-check.js && echo SYNTAX_OK
```

Esperado: `SYNTAX_OK`.

- [ ] **Step 9: Commit**

```bash
git add painel-orcamentos/index.html
git commit -m "feat(orcamentos): secao Ajustes no form, total recalcula com multiplicadores"
```

---

### Task 4: Seletor de catálogo no painel

**Files:**
- Modify: `painel-orcamentos/index.html` — botão ao lado de `+ Adicionar item` (~164), novo modal de catálogo antes de `<div class="toast">` (~180), `carregarDados()` (~208)

**Interfaces:**
- Consumes: `addItem(nome, valor)` e `calcTotal()` da Task 3; action `catalog_list` da edge fn `orcamentos` (já existe, retorna `{servicos:[{id,nome,preco_base,unidade,categoria,ativo}]}`).
- Produces: `CATALOG` global; `abrirCatalogo()`, `fecharCatalogo()`, `aplicarCatalogo()`.

- [ ] **Step 1: Carregar o catálogo junto com o resto**

Em `carregarDados()`, substituir o corpo por:

```js
async function carregarDados(){
  const [d, cli, cat] = await Promise.all([
    call('list',{}),
    EloiAdminAuth.call(FN_GESTAO,{action:'clientes.list'}).catch(()=>({clientes:[]})),
    call('catalog_list',{}).catch(()=>({servicos:null})),
  ]);
  ORCS = d.orcamentos||[];
  CLIENTES = cli.clientes||[];
  CATALOG = cat.servicos;                 // null = falhou; [] = vazio de verdade
  popularClientesSelect();
  render();
}
```

E declarar o global junto de `let ORCS = [];`:

```js
let CATALOG = null;
```

`CATALOG` fica `null` quando o fetch falha e array quando dá certo — a distinção importa no Step 4.

- [ ] **Step 2: Botão "+ Do catálogo"**

Substituir a linha `<button class="add-item" type="button" onclick="addItem()">+ Adicionar item</button>` por:

```html
    <div class="item-btns">
      <button class="add-item" type="button" onclick="addItem()">+ Adicionar item</button>
      <button class="add-item" type="button" id="catBtn" onclick="abrirCatalogo()">+ Do catálogo</button>
    </div>
```

CSS, no fim do `<style>`:

```css
.item-btns{display:flex;gap:8px;flex-wrap:wrap}
.item-btns .add-item{flex:1;min-width:150px}
.cat-group{margin-bottom:14px}
.cat-title{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.5;margin-bottom:6px}
.svc{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--c800);border-radius:8px;margin-bottom:6px;cursor:pointer}
.svc.on{border-color:var(--roxo)}
.svc .nm{font-size:14px}
.svc .pr{font-size:12px;opacity:.6}
.svc-right{margin-left:auto}
.svc .qty{width:64px}
.cat-aviso{font-size:13px;opacity:.7;padding:10px 0}
```

- [ ] **Step 3: Modal do catálogo**

Antes de `<div class="toast" id="toast">Salvo!</div>`, inserir:

```html
<div class="modal" id="catModal">
  <div class="form-card">
    <h2>Adicionar do catálogo</h2>
    <div id="catBox"></div>
    <div class="form-actions">
      <div style="display:flex;gap:10px;margin-left:auto">
        <button class="btn btn-ghost" onclick="fecharCatalogo()">Cancelar</button>
        <button class="btn btn-primary" onclick="aplicarCatalogo()">Adicionar aos itens</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Lógica do catálogo**

Antes de `// ── MODAL ──`, inserir:

```js
// ── CATÁLOGO ──
const CAT_SEL = {};   // id -> qty
function abrirCatalogo(){
  Object.keys(CAT_SEL).forEach(k=>delete CAT_SEL[k]);
  renderCatalogo();
  document.getElementById('catModal').classList.add('show');
}
function fecharCatalogo(){ document.getElementById('catModal').classList.remove('show'); }
function renderCatalogo(){
  const box=document.getElementById('catBox');
  if(CATALOG===null){
    box.innerHTML='<div class="cat-aviso">Não deu pra carregar o catálogo. Recarregue a página, ou adicione os itens à mão.</div>';
    return;
  }
  const ativos=(CATALOG||[]).filter(s=>s.ativo!==false);
  if(!ativos.length){ box.innerHTML='<div class="cat-aviso">Catálogo vazio.</div>'; return; }
  const cats=[]; const byCat={};
  ativos.forEach(s=>{ const c=s.categoria||'Outros'; if(!byCat[c]){byCat[c]=[];cats.push(c);} byCat[c].push(s); });
  box.innerHTML = cats.map(c=>`
    <div class="cat-group">
      <div class="cat-title">${esc(c)}</div>
      ${byCat[c].map(s=>{
        const on = CAT_SEL[s.id]!=null;
        const zero = !Number(s.preco_base);
        return `<label class="svc ${on?'on':''}">
          <input type="checkbox" ${on?'checked':''} onchange="catToggle('${s.id}',this.checked)">
          <span><span class="nm">${esc(s.nome)}</span><br><span class="pr">${brl(s.preco_base)} / ${esc(s.unidade||'un')}${zero?' — sem preço-base cadastrado':''}</span></span>
          <span class="svc-right"><input class="qty" type="number" min="1" step="1" value="${on?CAT_SEL[s.id]:1}" ${on?'':'disabled'} onclick="event.preventDefault()" oninput="catQty('${s.id}',this.value)"></span>
        </label>`;
      }).join('')}
    </div>`).join('');
}
function catToggle(id,on){ if(on) CAT_SEL[id]=CAT_SEL[id]||1; else delete CAT_SEL[id]; renderCatalogo(); }
function catQty(id,v){ const n=Math.max(1,Number(v)||1); if(CAT_SEL[id]!=null) CAT_SEL[id]=n; }
function aplicarCatalogo(){
  const ativos=(CATALOG||[]);
  let n=0;
  ativos.forEach(s=>{
    const qty=CAT_SEL[s.id];
    if(qty==null) return;
    const nome = qty>1 ? `${s.nome} × ${qty}` : s.nome;
    addItem(nome, Math.round(Number(s.preco_base)*qty*100)/100);
    n++;
  });
  fecharCatalogo();
  if(n) toast(`${n} item(ns) adicionado(s).`);
}
```

- [ ] **Step 5: Desabilitar o botão quando o catálogo falhou**

No fim de `abrirNovo()` e `abrirEdit()`, antes da linha `document.getElementById('modal').classList.add('show');`, inserir em AMBAS:

```js
  const cb=document.getElementById('catBtn');
  cb.disabled = (CATALOG===null);
  cb.title = CATALOG===null ? 'Catálogo indisponível — adicione os itens à mão' : '';
```

- [ ] **Step 6: Verificar sintaxe**

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('painel-orcamentos/index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(process.argv[1]+'/po-check.js',m);" <scratchpad>
node --check <scratchpad>/po-check.js && echo SYNTAX_OK
```

Esperado: `SYNTAX_OK`.

- [ ] **Step 7: Commit**

```bash
git add painel-orcamentos/index.html
git commit -m "feat(orcamentos): seletor de catalogo dentro do painel, itens editaveis"
```

---

### Task 5: Ajustes visíveis na view do cliente e no view interno

**Files:**
- Modify: `orcamento/index.html` — bloco de render (~linha 83-105), mais um `<script src>`
- Modify: `painel-orcamentos/index.html` — `abrirView()` (~252)

**Interfaces:**
- Consumes: `window.EloiOrcamento.calcular()` da Task 2; os campos novos vindos do `public_get` da Task 1.

- [ ] **Step 1: Carregar o módulo na view pública**

Em `orcamento/index.html`, imediatamente antes do `<script>` que contém `const FN`, inserir:

```html
<script src="/assets/eloi-admin/orcamento.js"></script>
```

O módulo não depende de auth — pode ser carregado numa página pública sem problema.

- [ ] **Step 2: Renderizar as linhas de ajuste derivadas**

Em `orcamento/index.html`, logo depois da linha que define `const linhas = ...` (o ternário que monta os itens), inserir:

```js
  const _r = window.EloiOrcamento.calcular({itens, complexidade:o.complexidade, urgencia:o.urgencia, desconto_pct:o.desconto_pct});
  const ajustesHtml = _r.ajustes.length
    ? `<div class="item"><span>Subtotal</span><span>${brl(_r.base)}</span></div>` +
      _r.ajustes.map(a=>`<div class="item"><span>${esc(a.nome)}</span><span>${a.valor<0?'−':'+'} ${brl(Math.abs(a.valor))}</span></div>`).join('')
    : '';
```

E na template string do `innerHTML`, trocar:

```js
        <div class="itens">${linhas}</div>
```

por:

```js
        <div class="itens">${linhas}${ajustesHtml}</div>
```

Nota: o `valor_total` gravado continua sendo o que aparece no `<div class="total">` — não trocar por `_r.total`. Pra orçamento novo os dois batem; pra orçamento antigo (ajustes achatados em `itens`, campos no default) `_r.ajustes` vem vazio e nada muda na tela. É exatamente esse o comportamento desejado.

- [ ] **Step 3: Mesmo tratamento no view interno do painel**

Em `painel-orcamentos/index.html`, dentro de `abrirView(i)`, logo depois da linha `const linhas = itens.length ... ;`, inserir:

```js
  const rv = window.EloiOrcamento.calcular({itens, complexidade:o.complexidade, urgencia:o.urgencia, desconto_pct:o.desconto_pct});
  const ajLinhas = rv.ajustes.length
    ? `<div class="v-item"><span>Subtotal</span><span>${brl(rv.base)}</span></div>` +
      rv.ajustes.map(a=>`<div class="v-item"><span>${esc(a.nome)}</span><span>${a.valor<0?'−':'+'} ${brl(Math.abs(a.valor))}</span></div>`).join('')
    : '';
```

E trocar `<div class="v-itens">${linhas}</div>` por `<div class="v-itens">${linhas}${ajLinhas}</div>`.

- [ ] **Step 4: Verificar sintaxe dos dois arquivos**

```bash
for f in orcamento painel-orcamentos; do
  node -e "const fs=require('fs');const h=fs.readFileSync(process.argv[1]+'/index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(process.argv[2]+'/'+process.argv[1].replace('/','_')+'-check.js',m);" "$f" <scratchpad>
  node --check <scratchpad>/${f}-check.js || exit 1
done
echo SYNTAX_OK
```

Esperado: `SYNTAX_OK`.

- [ ] **Step 5: Commit**

```bash
git add orcamento/index.html painel-orcamentos/index.html
git commit -m "feat(orcamentos): linhas de ajuste derivadas na view do cliente e no view interno"
```

---

### Task 6: Estados de erro e validação (absorvido da Task 7 do P0)

**Files:**
- Modify: `painel-orcamentos/index.html` — `carregarDados()`, `entrar()`, `render()`, `salvar()`

**Interfaces:**
- Consumes: `render()`, `toast()` já existentes.

- [ ] **Step 1: Distinguir "vazio" de "falhou"**

Hoje uma falha de conexão cai no mesmo estado visual de "nenhum orçamento ainda", o que faz parecer que está tudo certo e não tem nada cadastrado. Adicionar um flag. Declarar junto dos outros globais:

```js
let LOAD_ERRO = false;
```

Em `carregarDados()`, envolver a busca da lista:

```js
async function carregarDados(){
  LOAD_ERRO = false;
  let d;
  try{
    d = await call('list',{});
  }catch(e){
    LOAD_ERRO = true;
    ORCS = [];
    render();
    return;
  }
  const [cli, cat] = await Promise.all([
    EloiAdminAuth.call(FN_GESTAO,{action:'clientes.list'}).catch(()=>({clientes:[]})),
    call('catalog_list',{}).catch(()=>({servicos:null})),
  ]);
  ORCS = d.orcamentos||[];
  CLIENTES = cli.clientes||[];
  CATALOG = cat.servicos;
  popularClientesSelect();
  render();
}
```

- [ ] **Step 2: Mostrar o estado de erro**

Em `render()`, substituir a primeira linha do corpo (o `if(!ORCS.length)`) por:

```js
  if(LOAD_ERRO){
    lv.className='';
    lv.innerHTML='<div class="empty"><div class="ic">⚠</div>Não deu pra carregar os orçamentos. Isso é falha de conexão, não lista vazia.<br><button class="btn btn-ghost" style="margin-top:12px" onclick="carregarDados()">Tentar de novo</button></div>';
    return;
  }
  if(!ORCS.length){ lv.className=''; lv.innerHTML='<div class="empty"><div class="ic">💰</div>Nenhum orçamento ainda. Clique em "+ Novo orçamento".</div>'; return; }
```

- [ ] **Step 3: Validar antes de salvar**

Em `salvar()`, antes da construção do objeto `o`, inserir:

```js
  const itens = lerItens();
  if(!itens.length){ toast('Adicione ao menos um item.'); return; }
  if(!document.getElementById('f_titulo').value.trim() && !document.getElementById('f_cliente').value.trim()){
    toast('Preencha o título ou o cliente.'); return;
  }
```

E trocar `itens: lerItens(),` por `itens: itens,` no objeto, pra não ler duas vezes.

- [ ] **Step 4: Verificar sintaxe**

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('painel-orcamentos/index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(process.argv[1]+'/po-check.js',m);" <scratchpad>
node --check <scratchpad>/po-check.js && echo SYNTAX_OK
```

Esperado: `SYNTAX_OK`.

- [ ] **Step 5: Commit**

```bash
git add painel-orcamentos/index.html
git commit -m "fix(orcamentos): estado de erro distinto de lista vazia, validacao antes de salvar"
```

---

### Task 7: Aposentar a rota antiga

**Files:**
- Modify: `orcamento-inteligente/index.html` (substituição completa por stub)
- Modify: `assets/eloi-admin/nav.js` (~linha 13)
- Modify: `SITEMAP.md` (linhas 19-20 e a seção "Navegação admin")
- Modify: `CLAUDE.md` da raiz do repo, se citar a rota

**Interfaces:**
- Consumes: nada.

- [ ] **Step 1: Substituir a página pelo stub de redirect**

Substituir TODO o conteúdo de `orcamento-inteligente/index.html` por:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Movido — Painel de Orçamentos</title>
<meta http-equiv="refresh" content="0; url=/painel-orcamentos/">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10061c;color:#efe9f5;
       font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px}
  a{color:#c77dff}
</style>
</head>
<body>
  <div>
    <p>O orçamento inteligente virou parte do Painel de Orçamentos.</p>
    <p><a href="/painel-orcamentos/">Ir para o Painel de Orçamentos</a></p>
  </div>
</body>
</html>
```

O arquivo NÃO é deletado: o link pode ter sido compartilhado.

- [ ] **Step 2: Remover o item da sidebar**

Em `assets/eloi-admin/nav.js`, apagar a linha inteira:

```js
    ['/orcamento-inteligente/','Orçamento inteligente','M4 6h16v12H4zM8 18v2M16 18v2'],
```

- [ ] **Step 3: Atualizar o SITEMAP**

Em `SITEMAP.md`, trocar a linha da rota `/orcamento-inteligente/` por:

```markdown
| `/orcamento-inteligente/` | `orcamento-inteligente/index.html` | **Aposentado** — redirect pra `/painel-orcamentos/`. O calculador (catálogo + multiplicadores) virou parte do painel. Arquivo mantido porque o link pode ter sido compartilhado. |
```

E na linha do `/painel-orcamentos/`, trocar a descrição por:

```markdown
| `/painel-orcamentos/` | `painel-orcamentos/index.html` | Gestão de orçamentos: lista, CRUD, link/WhatsApp pro cliente, "criar serviço". Form único com catálogo opcional (botão "+ Do catálogo") e seção "Ajustes" (complexidade/urgência/desconto, colunas em `orcamentos`, recalculam sempre). |
```

Na seção "Navegação admin", remover `· Orçamento inteligente` da lista de itens da nav primária.

- [ ] **Step 4: Conferir se sobrou referência solta**

```bash
grep -rn "orcamento-inteligente" --include=*.html --include=*.js --include=*.md . | grep -v "^./docs/"
```

Esperado: só o próprio `orcamento-inteligente/index.html` (o stub) e as linhas do `SITEMAP.md`. Qualquer link de navegação restante em outra página deve ser corrigido pra `/painel-orcamentos/`.

- [ ] **Step 5: Commit**

```bash
git add orcamento-inteligente/index.html assets/eloi-admin/nav.js SITEMAP.md
git commit -m "chore(orcamentos): aposenta /orcamento-inteligente/ (redirect), tira da sidebar, atualiza SITEMAP"
```

---

### Task 8: Verificação end-to-end no browser

**Files:** nenhum (só verificação)

- [ ] **Step 1: Subir o preview**

Ler `PORTAS.md` na raiz de `ELOI SITES` e usar a porta reservada deste projeto. Se ela estiver ocupada por outra sessão, usar a próxima porta LIVRE listada — **não** editar `.claude/launch.json`, que é compartilhado.

- [ ] **Step 2: Criar um orçamento pelo catálogo**

Logar, `+ Novo orçamento` → `+ Do catálogo` → marcar 2 serviços com preço-base conhecido → Adicionar. Conferir que viraram dois itens editáveis com os valores certos.

- [ ] **Step 3: Conferir o recálculo**

Abrir "Ajustes", pôr complexidade `Média` e desconto `10`. Conferir na mão: `total == round(soma_itens * 1.4 * 0.9, 2)`. Depois editar o valor de um item e confirmar que o total muda sozinho, sem precisar reabrir nada.

- [ ] **Step 4: Salvar e reabrir**

Salvar. Reabrir pra edição. Confirmar que complexidade/urgência/desconto voltaram como foram salvos e que a seção "Ajustes" abriu sozinha (porque tem ajuste ativo).

- [ ] **Step 5: Conferir a view do cliente**

Copiar o link (`🔗 Copiar link`), abrir `/orcamento/?t=...`. Confirmar que aparecem: os itens, a linha "Subtotal", as linhas de ajuste, e que o Total bate com o do painel.

- [ ] **Step 6: Conferir um orçamento ANTIGO**

Abrir um orçamento criado antes desta mudança, no painel e no link público. Confirmar que o `valor_total` está idêntico ao de antes e que NÃO apareceu linha de ajuste nova (os defaults são neutros). Este é o teste de não-regressão financeira.

- [ ] **Step 7: Conferir o redirect**

Abrir `/orcamento-inteligente/`. Confirmar que vai pra `/painel-orcamentos/`. Confirmar que a sidebar tem um item "Orçamentos" só.

- [ ] **Step 8: Console limpo**

Confirmar zero erros no console em todas as telas acima.

---

## Notas de risco

- **Task 1 Step 3 é um gate.** Se a soma de `valor_total` mudar depois da migration, parar tudo e reportar. Nada nesta mudança deve alterar valor financeiro de registro existente.
- **Deploy da edge function afeta produção imediatamente**, antes do push do front. A ordem é segura: os campos novos são aditivos e o front antigo ignora o que não conhece.
- Orçamento antigo aberto pra edição mostra os ajustes velhos como itens comuns e editáveis. Documentado na spec, não corrigido aqui.
