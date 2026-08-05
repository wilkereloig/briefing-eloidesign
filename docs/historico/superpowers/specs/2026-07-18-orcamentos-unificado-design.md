# Orçamentos unificado — design

**Data:** 2026-07-18
**Status:** aprovado (Wilke, 2026-07-18)
**Substitui:** Task 7 do plano `docs/superpowers/plans/2026-07-17-p0-auditoria.md`

## Problema

O admin tem duas rotas que fazem a mesma coisa por caminhos diferentes:

- `/painel-orcamentos/` — CRUD, lista, link do cliente, WhatsApp, "criar serviço" a partir do orçamento. Itens digitados à mão.
- `/orcamento-inteligente/` — calculador: catálogo de serviços do banco + multiplicadores de complexidade/urgência/desconto. Grava rascunho na mesma tabela `orcamentos`.

Consequências:

1. Dois itens de sidebar pra um conceito só.
2. A regra de multiplicador vive duplicada: como constante no `orcamento-inteligente` **e** achatada, congelada, dentro do `itens` de cada orçamento já salvo (ex: `{nome: "Complexidade Média (×1.4)", valor: 700}`).
3. Por causa de (2), editar um item de um orçamento gerado pelo calculador não recalcula o ajuste — o total fica inconsistente com as linhas.

## Decisões

- **Uma rota só.** O calculador vira parte do fluxo de criação dentro de `/painel-orcamentos/`. Escolhido sobre "duas rotas com visual unificado" (mantinha o problema conceitual) e "unificar só os dados" (não resolvia a sidebar nem o fluxo).
- **Form único, catálogo opcional.** Sem abas, sem modo. O catálogo é um atalho pra preencher itens, que continuam editáveis à mão. Escolhido sobre "duas abas no modal" (mantém dois fluxos mentais) e "página cheia de edição" (quebra o padrão de modal do resto do admin).
- **Ajustes viram campos, recalculam sempre.** Escolhido sobre "ajustes travados como itens + botão recalcular" (estado pode ficar velho silenciosamente) e "sem ajustes automáticos" (perde a calculadora que motivou a página).
- **Sem backfill.** Orçamentos existentes ficam com os defaults neutros. Não reprocessar.

## Arquitetura

### Rotas

| Rota | Depois |
|------|--------|
| `/painel-orcamentos/` | Única rota admin de orçamento. Absorve o calculador. |
| `/orcamento-inteligente/` | Stub de redirect (`<meta http-equiv="refresh">` + link manual de fallback). Não deletar o arquivo — o link pode ter sido compartilhado. |
| `/orcamento-precampanha/` | Inalterado. Fora do escopo. |
| `/orcamento/?t=` | Inalterado como rota; muda o render (ver abaixo). |

`assets/eloi-admin/nav.js` perde a entrada `/orcamento-inteligente/`. Sobra um item: "Orçamentos".

### Dados

```sql
alter table orcamentos
  add column complexidade  text    not null default 'simples',
  add column urgencia      text    not null default 'normal',
  add column desconto_pct  numeric not null default 0;
```

Invariantes para todo orçamento **criado ou salvo a partir desta mudança** (registros antigos não tocados ficam de fora — ver "Backfill"):

- `itens` contém **apenas serviços**. Nunca linha de ajuste.
- `valor_total = round(soma(itens.valor) × mc × mu × (1 − desconto_pct/100), 2)`, onde `mc`/`mu` saem das tabelas de multiplicador pelo `complexidade`/`urgencia`.
- Cada `itens[].valor` já vem arredondado a 2 casas antes de somar (correção da Task 6, mantida).

**Backfill: nenhum, deliberadamente.** Os registros existentes pegam `'simples'`/`'normal'`/`0` → multiplicador efetivo 1.0, o que preserva o `valor_total` gravado exatamente como está. Os ajustes antigos permanecem achatados dentro de `itens` desses registros — visualmente idênticos ao que o cliente já viu. Reprocessá-los mudaria valores financeiros sem base nos dados existentes.

Efeito colateral aceito: um orçamento antigo aberto pra edição mostra as linhas de ajuste antigas como itens comuns e editáveis. Documentado, não corrigido.

### Lógica compartilhada

Novo arquivo `assets/eloi-admin/orcamento.js`, no padrão dos existentes (`periodo.js`, `nav.js`): IIFE, sem build, exporta `window.EloiOrcamento`.

```js
EloiOrcamento = {
  COMPLEX,      // [{key,label,m}] — simples 1.0 / media 1.4 / alta 1.8
  URGENCIA,     // [{key,label,m}] — normal 1.0 / expressa 1.3
  calcular,     // ({itens, complexidade, urgencia, desconto_pct}) -> {base, ajustes, total}
}
```

`calcular` retorna `ajustes` como array de `{nome, valor}` **derivado**, nunca persistido. Consumidores:

- `painel-orcamentos/index.html` — resumo ao vivo no form e total na lista.
- `orcamento/index.html` (view do cliente) — renderiza as linhas de ajuste a partir dos campos, em vez de lê-las de `itens`.

### UI — modal de orçamento

O modal atual ganha duas coisas:

1. **Botão "+ Do catálogo"** ao lado de "+ Adicionar item". Abre o seletor de serviços (o catálogo que hoje é o corpo do `orcamento-inteligente`, com quantidade por serviço). "Adicionar" injeta os selecionados como itens normais, editáveis. Fechar sem adicionar não muda nada.
2. **Seção "Ajustes"**, recolhível, fechada por padrão quando tudo está neutro: selects de complexidade e urgência, input de desconto (%).

Resumo ao vivo abaixo dos itens: `subtotal → linhas de ajuste → total`. Recalcula a cada edição de item, quantidade ou ajuste.

Herdado da Task 6 e mantido: aviso quando um serviço do catálogo tem preço-base zero.

### Edge functions

`edge-functions/orcamentos.ts` — **precisa de deploy**:

- `create` e `update`: passam `complexidade`, `urgencia`, `desconto_pct`, com os mesmos defaults do banco.
- `public_get`: o `select` passa a incluir os três campos, senão a view do cliente não consegue renderizar os ajustes.
- Validação: `complexidade` e `urgencia` devem estar entre as chaves conhecidas, senão 400. `desconto_pct` clampeado em 0–100.

`edge-functions/portal-cliente.ts` — inalterado (só lista `titulo`/`valor_total`/`share_token`).

### Erros e estados

- Catálogo falha ao carregar → botão "+ Do catálogo" desabilitado com texto explicando; o form manual continua funcionando. Nunca bloquear a criação de orçamento por causa do catálogo.
- Lista de orçamentos falha ao carregar → estado de erro visível e distinto de "nenhum orçamento ainda". (Correção que vinha da Task 7.)
- Orçamento sem itens → botão Salvar desabilitado.

## Escopo absorvido da Task 7

Esta reescrita incorpora as correções que estavam planejadas em separado pro `painel-orcamentos`, pra não fazer duas passadas no mesmo arquivo: gating de estado de erro na lista, validação do form, e o link do cliente.

## Riscos conhecidos, não resolvidos aqui

- Editar um orçamento já `enviado` muda o que o cliente vê no link já aberto. Comportamento que já existe hoje; esta mudança não piora nem melhora.
- Orçamentos antigos mostram ajustes antigos como itens editáveis (ver "Backfill").

## Verificação

- `node --check` no script extraído de cada HTML tocado.
- Script de asserts em Node pra `calcular()`: arredondamento, desconto 0 e 100, lista de itens vazia, multiplicador desconhecido caindo no default.
- Migration aplicada e conferida: contagem de linhas antes = depois, `valor_total` de uma amostra inalterado.
- Browser: criar orçamento pelo catálogo, editar um item, confirmar que o total recalcula; abrir `/orcamento/?t=` e conferir que as linhas de ajuste aparecem; conferir que `/orcamento-inteligente/` redireciona.
