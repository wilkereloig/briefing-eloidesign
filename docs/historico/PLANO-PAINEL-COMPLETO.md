# Plano — o que falta para o painel ser o único painel

Levantado em 2026-08-07 lendo o código, o banco e os painéis legados.
Objetivo declarado pelo dono: **um painel só**, com cliente, projeto, orçamento,
nota fiscal e dinheiro (pessoal e empresa) ligados, mais a área onde o cliente
baixa o material dele.

Este documento existe para ser executado. Cada item traz o que é, por que
importa, onde mexer e o que precisa ser verdade no fim. Os itens estão em ordem
de bloqueio: o 1 é o que impede desligar o painel velho.

**Regra que vale para todos:** ler `CLAUDE.md` antes, e `docs/GLOSSARY.md` antes
de nomear qualquer coisa. Dinheiro em cents inteiros — a única exceção herdada é
`orcamentos.valor_total`, que é em reais.

---

## Estado atual, em uma tabela

| O que o dono quer | Estado | Onde |
|---|---|---|
| Painel único, empresa e pessoal juntos | **Pronto** | `contexto` nas mesmas tabelas; `Config` separa por contexto |
| Financeiro completo | **Pronto, nunca usado** | 0 contas e 0 transações no banco — cadastrar contas é o primeiro passo |
| Cliente ligado a projeto, NF e dinheiro | **Pronto** | `ClienteFicha.tsx` cruza tudo por `cliente_id` |
| NF como anexo, não emissão | **Pronto** | `eloi_notas_fiscais.arquivo_path`; anexo na folha de NF |
| Área do cliente (ver e baixar) | **Pronto** | senha do portal e publicação de material no `/admin` |
| Orçamento | **Só no painel velho** | item 1 |
| Ler resposta de briefing / gerar convite | **Só no painel velho** | item 2 |
| Site institucional | **Pronto** | `index.html` |
| Cliente registrar/editar o próprio serviço e valor | **Não existe** | item 7 (novo, pedido em 07/08) |

---

## 1. Orçamentos no `/admin` — o bloqueador

Hoje criar ou editar uma proposta só acontece em `/painel-orcamentos/`. O
`/admin/projetos` só deixa aprovar o que já existe. Enquanto isso não mudar, o
painel velho não pode sair do ar e o ciclo comercial não fecha num lugar só.

### O que a tela precisa fazer

Lista de orçamentos (já vem por `orcamentos` → `list`, que injeta `servico_id`),
formulário de criar/editar com itens, ajustes e catálogo, e as ações de
compartilhar, aprovar e virar serviço.

### As regras de cálculo — copiar exatamente

A fonte é `assets/eloi-admin/orcamento.js`, e ela tem teste
(`orcamento.test.js`). **Não reescrever a regra: portar o arquivo para
`app/src/domain/orcamento.ts` com os testes junto.**

```
COMPLEX:  simples ×1.0 · media ×1.4 · alta ×1.8
URGENCIA: normal ×1.0 · expressa ×1.3

d      = clamp(desconto_pct, 0, 100)
base   = r2( soma de r2(item.valor) )     ← arredonda por item E na soma
afterC = base   × complexidade
afterU = afterC × urgencia
afterD = afterU × (1 - d/100)
total  = r2(afterD)

r2(n) = Math.round(n * 100) / 100
```

A ordem é complexidade → urgência → desconto e **não pode ser reordenada**: as
linhas de ajuste mostradas ao cliente são o delta de cada etapa em relação à
anterior. Caso de referência do teste: `100`, média, expressa, 10% → `163.80`.

Linha de ajuste só aparece quando o fator não é neutro. Chave desconhecida cai
no primeiro item da lista (`simples` / `normal`) sem erro.

### Pegadinhas que vão morder quem for ingênuo

- **`orcamentos.valor_total` é em REAIS.** Único campo de dinheiro fora da
  convenção de cents. Use `centsDeReais()` de `lib/dinheiro.ts` para comparar
  com qualquer outro valor. Passar `valor_total` cru em `fmtBRL()` mostra um
  valor 100× menor.
- **`update` da edge é substituição TOTAL, não patch.** Campo ausente vira
  `null` / `[]` / `0`. A assinatura em `api.ts` (`Partial<OrcamentoRow> & {id}`)
  sugere o contrário — é uma armadilha pronta. Mandar `{id, status}` apaga
  título, itens, valor e cliente. **Sempre montar o objeto completo**, ou
  consertar a edge para fazer patch parcial (foi exatamente esse bug que
  apareceu em `materiais.upsert` e foi corrigido em 07/08).
- **`complexidade`, `urgencia` e `desconto_pct` não estão em nenhuma migração** —
  foram criadas por ALTER ad-hoc. Por isso `OrcamentoRow` em `lib/tipos.ts` não
  tem esses campos. **Estender o tipo é o primeiro passo.** Aproveite e escreva
  a migração que documenta as três colunas.
- **Quantidade não existe como campo.** O catálogo multiplica na hora de
  inserir e grava o nome como `"Serviço × 3"`. Mudar isso quebra os registros
  existentes.
- **Não existe `enviado_em`.** `domain/decisoes.ts` usa `updated_at` como proxy
  de "enviado há N dias" — qualquer edição zera o contador. Se for criar a
  coluna, ajuste `decisoes.ts` junto.
- **`o.link` sequestra o compartilhamento.** Orçamento com `link` preenchido
  manda esse link em vez do de aprovação, e o cliente nunca vê os botões de
  aprovar/recusar. É intencional (propostas customizadas), mas fácil de acionar
  sem querer — a tela precisa deixar isso visível.
- **Aprovado que já virou serviço trava título, valor e cliente** (409 do
  backend). A tela velha não desabilita os campos e o usuário só descobre ao
  salvar. Na tela nova, desabilite.

### Contrato já pronto no backend

`edge-functions/orcamentos.ts`, todas por POST com `token` de admin no corpo:
`list`, `create`, `update`, `delete`, `catalog_list`, `catalog_save`,
`catalog_delete`. As duas públicas (`public_get`, `client_decide`) usam o campo
`token` para o `share_token` — mesmo nome, outro significado.

`catalog_save` e `catalog_delete` **existem e nunca foram chamadas por
ninguém**: hoje o catálogo só é editável direto no banco. A tela nova é a
oportunidade de fechar isso.

### Aprovar dispara o resto

O trigger `trg_eloi_orcamento_aprovado` cria o serviço em `eloi_servicos`
(atômico e idempotente). Vale tanto para o admin mudando o status quanto para o
cliente aprovando pelo link. Já existe a ação de reparo
`servicos.from_orcamento` para orçamentos aprovados antes do trigger existir.

### Pronto quando

- Dá para criar, editar, duplicar e excluir orçamento sem sair do `/admin`.
- O total gravado bate com `orcamento.test.js` portado, rodando no CI.
- Catálogo editável pela interface.
- Copiar link e WhatsApp funcionam, e a tela avisa quando `o.link` está
  sequestrando o compartilhamento.
- `docs/FEATURE_MAP.md` e `docs/ROUTE_MAP.md` atualizados no mesmo commit.

---

## 2. Briefing: ler a resposta e gerar o convite

O `/admin/briefings` hoje conta, filtra e vincula a cliente — mas **não mostra o
que o cliente respondeu**, e não gera convite. Duas coisas, dois níveis.

### 2a. Ver a resposta (o que dói mais)

`BriefingLegadoRow.raw` é tipado como `unknown` e nunca é renderizado. Para ler o
briefing de um cliente, hoje, é preciso abrir `/painel-briefings/`.

O painel velho resolve com três mapas paralelos, definidos inline no HTML:
rótulos (`LE`/`LV`), tradução de valores (`VE`/`VV`) e seções (`SE`/`SV`),
escolhidos por tipo. **Portar esses mapas para um módulo de dados**
(`app/src/lib/briefing-mapas.ts`), não copiar para dentro do componente.

Regras de renderização que precisam sobreviver ao porte:

- Campo ausente ou vazio **continua aparecendo**, com o corpo `—` apagado. Some
  a pergunta e some a informação de que ela não foi respondida.
- Listas chegam como string `"a, b, c"`: separar por vírgula, traduzir item a
  item pelo dicionário, deixar passar o que não estiver nele.
- Texto longo com `white-space: pre-wrap` — as quebras de linha do cliente são
  informação.
- Chave sem rótulo mostra a própria chave. Chave sem dicionário mostra o valor
  cru.

**Fallback obrigatório:** `briefing-guia-viver-bem` grava as perguntas em
português como chaves (`"1. Principal problema do site hoje"`). Nenhum painel
sabe exibir isso hoje — as respostas existem no banco e ninguém consegue ler.
A tela nova precisa de um caminho genérico "itera as chaves do `raw`" para
qualquer tipo sem mapa.

### 2b. Gerar convite

Formulário com nome do cliente, tipo (4 opções) e cliente cadastrado opcional →
`briefing-links` `action:'create'` → link montado como
`origin + TIPO_PATH[tipo] + '?t=' + token`. Copiar e WhatsApp.

```
briefing                 → /briefing/                  Identidade visual
briefing-ecommerce       → /briefing-ecommerce/        E-commerce (genérico)
briefing-solarium        → /briefing-solarium/         E-commerce — Solarium
briefing-guia-viver-bem  → /briefing-guia-viver-bem/   Reestruturação
```

O token nasce do default da coluna (`gen_random_bytes(16)` em hex), não do
front. `useFinancas().clientes` já dá a lista para o select.

### 2c. Revogar — buraco nos dois painéis

`briefing_links.revogado_em` existe, `briefing-submit` respeita, o `/admin` já
mostra o chip "Revogado" — **mas não existe nenhuma UI que consiga produzir
esse estado**. Revogar hoje é `update` na mão no banco. A edge expõe `delete`
(hard delete), que é outra coisa. Adicionar `action: 'revogar'` na edge e o
botão na tela.

### 2d. O que o `/painel/` tem e ninguém mais tem

`/painel/` não é uma versão velha do `/painel-briefings/` — é um painel de outra
tabela (`briefings`, respostas sem token) com uma camada analítica que não
existe em lugar nenhum:

- `COLOR_NAMES`: ~36 hex → nome em português, para renderizar a paleta que o
  cliente escolheu (`q11_cores`) como swatches nomeadas.
- `pendencias()`: 10 regras que viram checklist de follow-up (falta concorrente,
  falta registro no INPI, WhatsApp com menos de 10 dígitos…).
- `gerarBrief()`: monta o briefing em texto corrido, por seção, para colar no
  começo de um projeto. Mais o "Copiar tudo (para IA)".

Isso é trabalho de verdade, não enfeite. Decidir explicitamente se vai ser
portado ou descartado — e registrar a decisão em `docs/DECISIONS.md`.

### Pronto quando

- Dá para ler qualquer briefing respondido dentro do `/admin`, inclusive os de
  tipo sem mapa.
- Dá para gerar e revogar convite sem sair do `/admin`.
- Os dois `href="/painel-briefings/"` em `Briefings.tsx` (linhas 68 e 108) saíram.

---

## 3. A nota fiscal não chega ao cliente

Anexar o PDF na tela de Notas grava em `eloi_notas_fiscais.arquivo_path`. Mas o
portal do cliente lê NF de `eloi_servicos.nf_arquivo_url` — campo antigo, outra
tabela. São duas representações da mesma coisa, e a nova não aparece para o
cliente.

Escolher um dos dois caminhos e registrar em `docs/DECISIONS.md`:

- **`portal-cliente.ts` passa a ler `eloi_notas_fiscais`** (ação `notas.list` +
  `notas.view_url`, com o `path` validado contra o `cliente_id` da sessão, como
  já é feito em `entregas.view_url`), e o campo antigo vira legado com condição
  de saída; ou
- o anexo em `Notas.tsx` grava **também** em `eloi_servicos.nf_arquivo_url`
  quando a nota tem `servico_id` — mais barato, mantém a duplicidade.

O primeiro é o certo. O segundo é o rápido.

---

## 4. Correções de segurança pendentes

Nenhuma bloqueia o uso, todas são pequenas.

**`portal-cliente.ts` usa o primeiro elemento de `X-Forwarded-For`** para contar
tentativas por IP. O primeiro elemento é o que o cliente mandou — texto livre.
Um atacante que rotaciona o header nunca acumula tentativa. Corrigido em
`admin-auth.ts` em 07/08 (passou a usar o último, escrito pela borda); o portal
ficou para trás. Mesma linha, mesma correção.

**`briefing-submit` é público e não tem limite.** Aceita `raw` de qualquer
tamanho, sem rate limit, e **sobrescreve resposta já enviada** sem checar se o
status já é `respondido`. Um token vazado apaga o briefing preenchido. Checar o
status antes de gravar e limitar o tamanho do corpo.

**Sessões e tentativas acumulam sem limpeza.** `portal_sessions` (31 linhas),
`admin_sessions` (17), `portal_login_ip_attempts` (33) — nenhuma tem faxina de
registro expirado. O `admin-auth` novo faz a dele no login bem-sucedido; as
outras não. Um `pg_cron` diário resolve os três.

**Sessão de admin desliza 12h para sempre.** Não há expiração absoluta: um token
usado toda semana nunca morre, e ele vive em `localStorage`. Considerar um teto
(30 dias) além do deslizamento.

**Três funções `SECURITY DEFINER` executáveis por `anon`** (`accept_my_invites`,
`is_member`, `is_owner`) e a extensão `pg_net` no schema `public`. São do outro
produto que divide o mesmo projeto Supabase, mas estão no mesmo banco. Revogar
o `EXECUTE` do `anon`.

---

## 5. Melhorias que o dono vai querer depois

Não são bloqueio. Ficam registradas para não se perderem.

**Projeto como entidade de verdade.** Hoje "projeto" é derivado de orçamento +
serviço (`domain/projeto.ts`), e funciona para o funil. Não tem prazo, etapas
próprias, checklist nem pagamento por etapa. Se acompanhar prazo de entrega
virar necessidade, isso precisa nascer como tabela.

**Conciliação e importação.** Já anotado em `FEATURE_MAP` como pendência de
Dinheiro: conciliar saldo e importar CSV/XLSX do banco.

**Cliente-filho real** (`parent_id`). Hoje só existe `sub_cliente` como rótulo
de texto.

**Revogar orçamento.** `orcamentos.revogado_em` existe e as duas rotas públicas
respeitam, mas não há action de escrita nem UI.

---

## 6. Higiene do repositório

**Fim de linha.** Foi criado um `.gitattributes` com `* text=auto eol=lf`. Falta
rodar, uma vez:

```
git add --renormalize .
git commit -m "chore: normaliza fim de linha para LF"
```

Sem isso, ~126 arquivos continuam aparecendo como modificados no `git status`
sem uma única mudança de conteúdo, e a mudança real fica enterrada no meio.

**Links mortos depois da limpeza.** `assets/eloi-admin/nav.js` aponta para os
cinco painéis legados. Quando eles saírem, o menu fica com links quebrados. O
`marca/index.html` também instrui a usar `/gestao/`.

**Prontos para remover hoje:** `/gestao/` (perdeu a última função exclusiva em
07/08) e `/orcamento-inteligente/` (é só um `<meta refresh>`). Os outros
dependem dos itens 1 e 2.

**`/painel-ecommerce/` é redundante com `/painel-briefings/`** — os dicionários
são idênticos; o que ele tem de único é ler a tabela legada
`ecommerce_briefings`. Some junto com o item 2.

---

## 7. Login do cliente edita os próprios serviços — pedido novo (07/08)

Pedido do dono, feito depois do resto deste plano: cada cliente que já tem
senha do portal (ex.: F2 Experience) poder, dentro do próprio portal,
**registrar e alterar os serviços dele**, inclusive **definir o valor do
serviço** — hoje o portal só deixa ver e baixar arquivo (`servicos.list` é
somente leitura).

### Por que isto pede desenho, não só código

`eloi_servicos.valor_cents` é dado financeiro. O dono nunca pediu que o cliente
tivesse escrita direta sobre preço — o pedido original era controle financeiro
**dele** (do estúdio), vinculado ao cliente. Deixar o cliente escrever
`valor_cents` sem nenhuma revisão dá a ele poder de alterar um número que pode
alimentar relatório do estúdio (checar exatamente como `eloi_servicos` se liga
a `eloi_transacoes` — via `trg_eloi_orcamento_aprovado` e `domain/projeto.ts` —
antes de codar, para saber o alcance real).

**Recomendação:** mesma lógica que já existe para orçamento (cliente propõe,
quem aprova o número é o dono). Serviço criado ou alterado pelo cliente entra
como **pendente de revisão**; só vira oficial quando o admin confirma. Isso é
proposta, não decisão fechada — ver nota no final.

### Contrato novo em `edge-functions/portal-cliente.ts`

Duas actions, sempre com `cliente_id` vindo da sessão (`session.cliente_id`),
nunca do corpo — mesmo padrão já usado em `entregas.view_url`:

- **`servicos.create`** — cliente cria um serviço novo. Campos aceitos:
  `descricao`, `valor_cents` (o valor que ele propõe). Grava com
  `origem: 'cliente'`, `revisado_pelo_estudio: false`.
- **`servicos.update`** — só em serviço com `cliente_id = session.cliente_id`
  **e** `revisado_pelo_estudio = false` (serviço já aprovado trava para o
  cliente — mesmo padrão do 409 de orçamento aprovado, item 1). Campos
  editáveis: `descricao`, `valor_cents`. Nunca: `pago`, `data_pagamento`,
  `nf_numero`, `nf_arquivo_url`, `status_execucao`.

### Migração

Em `eloi_servicos`: `origem text not null default 'estudio'` (`estudio` |
`cliente`), `revisado_pelo_estudio boolean not null default true` (default
`true` preserva o histórico — só linha nova do cliente nasce `false`).
Documentar em `docs/DATA_MODEL.md`.

### `/admin`

A tela de Serviços/Projetos precisa: filtro ou badge "pendente de revisão do
cliente"; ação "aprovar" que vira `revisado_pelo_estudio = true` (trava a
edição do lado do cliente a partir daí). Sem isso o dono não teria como saber
que um valor mudou sem ele.

### `/portal/`

Hoje é HTML estático sem framework, mesmo padrão das outras páginas públicas
(`edge-functions/portal-cliente.ts` já expõe `servicos.list`, que a tela
consome). Ler o arquivo inteiro antes de mexer, para o formulário novo seguir o
mesmo estilo visual e de estado que já existe ali.

### Pronto quando

- F2 Experience loga no portal dela (senha já existe hoje) e só vê e edita os
  serviços com o `cliente_id` dela — nunca de outro cliente.
- Serviço criado/editado pelo cliente aparece no `/admin` como pendente até
  alguém aprovar.
- Depois de aprovado, o cliente não consegue mais editar aquele serviço pelo
  portal (só ver).
- Decisão registrada em `docs/DECISIONS.md`: por que existe o campo
  `revisado_pelo_estudio` e o que ele impede.

**Isto é uma proposta de desenho, não uma escolha fechada.** Antes de codar,
confirmar com o dono: (a) se "pendente de revisão" é aceitável, ou se ele quer
mesmo edição direta sem aprovação nenhuma; (b) se todo cliente com senha pode
criar serviço novo do zero, ou só editar os que o estúdio já criou pra ele.

---

## Ordem sugerida

1. **Item 6** (renormalizar) — cinco minutos, e todo diff daqui pra frente fica legível.
2. **Item 1** (orçamentos) — o maior, e o que destrava desligar o painel velho.
3. **Item 2a** (ver resposta do briefing) — o que mais incomoda no dia a dia.
4. **Item 4** (as correções de segurança) — pequenas, façam de uma vez.
5. **Item 3** (NF no portal) — decisão antes de código.
6. **Item 2b/2c** (gerar e revogar convite), e aí sim apagar os painéis legados.
7. **Item 7** (cliente edita o próprio serviço) — pedido novo; independente dos
   demais, mas exige a conversa de confirmação com o dono antes de começar.
