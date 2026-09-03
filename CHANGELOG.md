# Changelog — ELOI Studio

Só o que muda comportamento, dado ou interface do produto. Ordem: mais recente primeiro.

## 2026-09-03 — Nota fiscal passa a ser a fonte única, cobrindo vários serviços

Existiam duas verdades sobre nota: `eloi_servicos.nf_numero` (43 serviços, o
que Projetos e a fila "Precisa de você" liam) e `eloi_notas_fiscais` (a tela
Notas, vazia). Anexar um PDF numa não fazia o "Sem nota fiscal" sumir na
outra. A migração de hoje uniu as duas; este commit faz as telas usarem a
fonte única.

### Alterado

- **`nf.upsert`** aceita `servico_ids`: a nota grava quais serviços cobre.
  `servico_ids` é retirado do objeto antes do upsert (não é coluna — passar
  junto fazia o Postgres recusar a linha inteira). Serviço de outro cliente é
  recusado. Desvincula quem saiu da lista e vincula quem entrou; o espelho
  `nf_numero` é do trigger nos dois casos.
- **`nf.upsert`** traduz a violação do índice único de número para "já existe
  uma nota com o número N" (409), em vez de erro cru do Postgres.
- **`nf.list`** devolve os serviços de cada nota — uma consulta para a página
  inteira, não uma por nota.
- **`nf.remover`** limpa `nota_fiscal_id`/`nf_numero` dos serviços antes de
  apagar. A FK é `SET NULL`: sem isso o serviço ficava espelhando o número de
  uma nota que não existe mais.
- **Tela Notas**: "Serviços concluídos sem nota" passa a olhar
  `nota_fiscal_id`, não o espelho nem o vínculo 1:1 antigo. Filtro de mês
  vira opcional (desligado) — as 42 notas do backfill são de fevereiro a
  julho e a tela abria vazia. Cada linha mostra os serviços cobertos.
- **Folha da nota**: seleção múltipla de serviços do cliente, com "só os que
  ainda não têm nota" ligado por padrão, soma dos escolhidos e atalho para
  usar a soma como valor da nota.
- **`NotaFiscal.servico_id`** marcado como legado no tipo: sempre nulo.

### Ordem de publicação

`npm run edges:deploy -- eloi-financas` antes do push.

## 2026-09-03 — Projetos passa a mostrar o trabalho inteiro; marca vira escolha, não texto

A tela Projetos cortava a lista pelo mês do painel. Como 43 dos 59 serviços
têm competência de fevereiro a julho, ela mostrava só o mês corrente — era a
causa principal da sensação de que o sistema estava desorganizado. E marca
("Vibra", "ASUS") era texto livre digitado a cada serviço.

### Alterado

- **Projetos**: o mês deixa de cortar por padrão. Caixa "Mostrar só o mês
  selecionado", desligada, com o seletor de mês ao lado. O `mes` do store
  não muda — Dinheiro, Notas, Calendário e Relatórios continuam lendo ele.
- **Projetos**: cliente, marca e etapa viram `<select>` (eram 6 pílulas de
  etapa; o inventário manda virar menu acima de 4). Sobram três pílulas de
  pendência: sem valor, sem nota, entregue e não pago. Contador de
  "N de M projetos" abaixo dos filtros.
- **Projetos**: agrupamento em dois níveis, cliente → marca, com total e
  contagem por marca. Cabeçalho de marca só aparece quando há mais de uma.
- **Projetos**: valor editável na própria linha para serviço não pago —
  sair do campo grava. É como os 11 serviços sem valor saem do caminho sem
  abrir folha um por um. Excluir serviço direto na linha, com `FolhaExcluir`.
- **Folha do serviço**: "Marca ou sub-cliente" (texto livre) vira `<select>`
  das marcas do cliente, com "+ Nova marca" abrindo `FolhaSubCliente`. Trocar
  de cliente limpa a marca — marca de outro cliente é recusada pelo banco.
- **Folha do serviço**: campo "Número da NF" sai. Quem define o número é a
  nota fiscal (D-22); o campo do serviço é espelho por trigger. A folha mostra
  a NF vinculada e aponta para a tela Notas fiscais.
- **Ficha do cliente**: painel "Marcas atendidas" com total, quantidade e
  pendências por marca, e botão de cadastrar.

### Adicionado

- `eloi-gestao`: `subclientes.list/upsert/delete` (delete recusa marca com
  serviço — desative), `servicos.valores_lote` (até 100 por vez, ignora
  serviço pago no servidor).
- `servicos.upsert` aceita `sub_cliente_id`/`nota_fiscal_id` e **para** de
  gravar `sub_cliente` e `nf_numero`: espelho tem um dono só, o trigger.
  Gravar valor à mão limpa a sugestão pendente do portal — sem isso o serviço
  ficava marcado como "cliente sugeriu" para sempre.
- `servicos.delete` recusa serviço com nota fiscal (409) ou já pago (409).
  Excluir é para engano recente; o resto tem histórico.

### Ordem de publicação

`npm run edges:deploy -- eloi-gestao` **antes** do push. Se o painel subir
primeiro, a lista de marcas volta vazia (tem `catch`) mas nenhuma marca pode
ser escolhida ou criada.

## 2026-09-03 — Sub-cliente vira entidade; nota fiscal vira fonte única (migração)

Só banco, nenhuma tela muda — o painel atual continua funcionando igual
depois de aplicar. Detalhe e motivo em `docs/DECISIONS.md` D-18 a D-22.

### Adicionado

- **`eloi_sub_clientes`** + `eloi_servicos.sub_cliente_id`. Backfill cria uma
  linha por texto distinto de `sub_cliente` (8 na F2); "F2 EXPERIENCE" dentro
  da F2 é trabalho direto → sem vínculo, texto limpo.
- **`eloi_servicos.nota_fiscal_id`** (1 nota : N serviços). Backfill cria 42
  notas `emitida` em `eloi_notas_fiscais` a partir dos 43 `nf_numero` (valor =
  soma dos serviços, competência = a menor) e vincula cada serviço.
- **Triggers de espelho**: `sub_cliente` e `nf_numero` continuam preenchidos
  (por trigger, não pela edge) porque `/gestao`, `domain/decisoes.ts`,
  `dashboard.stats` e o portal ainda leem. Id de sub-cliente de outro cliente
  é rejeitado no banco. Mudar `numero` da nota propaga pros serviços.
- Índice único parcial em `eloi_notas_fiscais.numero`.
- A migração confere a si mesma e aborta a transação se sobrar serviço com
  texto sem id ou `nf_numero` sem nota.
- Migração: `2026-09-03-sub-clientes-e-nota-1n.sql`. **Aplicar antes** de
  qualquer código da FASE 2 (subclientes na UI, nota cobrindo N serviços).

## 2026-09-03 — Sessão ganha teto de 30 dias; sessões e tentativas mortas passam a ser apagadas

Sessão de admin e de portal só deslizava: cada chamada empurrava
`expires_at` 12 h pra frente, sem teto. Token usado toda semana nunca morria
— vazou, valia pra sempre. E nada apagava linha de `admin_sessions`,
`portal_sessions` nem `portal_login_ip_attempts` (40 linhas acumuladas sem
nenhuma decidir mais nada).

### Alterado

- **`_shared/auth.ts`**: `sessaoValida` (inatividade 12 h **e** teto de 30
  dias desde `created_at`) e `proximaExpiracao` (desliza, mas nunca além do
  teto) — regra pura, com teste. `requireAdmin`/`requireCliente` usam as
  duas; sessão inválida encontrada é apagada na hora. O `verifyAdminToken`
  do `admin_preview` (portal-cliente) passa a aplicar a mesma regra — antes
  ignorava qualquer teto.
- **Faxina oportunista** (`faxinarSessoes`): no login bem-sucedido, cada
  edge apaga da própria tabela o que expirou ou passou do teto;
  portal-cliente também apaga `portal_login_ip_attempts` com mais de 24 h
  (o admin já fazia a dele). Sem cron.
- **Precisa de deploy** (`admin-auth`, `portal-cliente` e toda edge que
  importa `_shared/auth.ts`: `eloi-gestao`, `eloi-financas`, `orcamentos`,
  `briefing-links`, `get-briefings`, `get-ecommerce-briefings`). Sem
  migração: `created_at` já existe nas duas tabelas.

## 2026-09-03 — Briefing respondido não se sobrescreve; IP de throttle vem de um lugar só

`briefing-submit` (público) aceitava um segundo POST no mesmo token e trocava
`raw` sem perguntar — link vazado ou reenvio acidental apagava o que o
cliente já tinha mandado. Também não tinha limite nenhum por IP. E
`portal-cliente` ainda lia o **primeiro** elemento de `X-Forwarded-For` (o que
o cliente escreve), mesmo furo já corrigido no `admin-auth` em 08-07.

### Corrigido

- **`briefing-submit`**: token com `status = 'respondido'` responde 409 e não
  grava. Guarda de corrida no `update` (`.neq status respondido`). Reabrir
  vira ação de admin (entra com a tela de briefings no `/admin`, FASE 3).
- **`briefing-submit`**: throttle por IP, 10 envios / 15 min, falha fechada
  igual ao admin (contador indisponível → 503, não "zero"). Tabela própria
  `briefing_submit_ip_attempts` (migração `2026-09-03-briefing-submit-ip-throttle.sql`)
  — não divide contador com o login do portal. Faxina de >24h no sucesso.
- **`_shared/ip.ts`** (`ipDaRequisicao`): último elemento de `X-Forwarded-For`,
  com teste. `admin-auth` e `portal-cliente` passam a chamar daqui — uma
  implementação, não duas divergindo.
- Formulários de briefing continuam mostrando "enviado" quando o Formspree
  aceita mesmo que o banco responda 409 — o backup por e-mail chega ao dono,
  então o dado não se perde. Mensagem específica de "já respondido" no
  formulário fica pra quando a tela de briefings for refeita.
- **Precisa de migração + deploy** (`briefing-submit`, `portal-cliente`,
  `admin-auth`).

## 2026-09-03 — `release:check` e Configurações → Sistema: saber se produção é o repo

Em 2026-08-28 o repositório ficou 9 commits à frente das edges em produção
sem nenhum sinal — a Vercel publicou o `/admin` novo falando com edge velha.
Já tinha acontecido o inverso em 2026-07-27. Nada no fluxo detectava.

### Adicionado

- **`npm run release:check`** (`scripts/release-check.mjs`): roda `verify` e
  falha se há alteração não commitada em arquivo que publica, se `app/dist`
  não é o build de `app/src` (build é determinístico; compara por `git
  status` após buildar), ou se alguma edge mudou desde o último deploy
  registrado. Avisa sobre migrações novas, commits não enviados e arquivos
  soltos.
- **`edge-functions/DEPLOYS.json`**: commit + data do último deploy de cada
  edge. `deploy-edges.mjs` passa a gravar ali a cada deploy (commite junto).
  Estado inicial reconstruído cruzando `updated_at` do Supabase com o git log.
- **Configurações → Sistema**: domínio ativo, hash da fonte do painel, última
  migração no repositório e o registro de deploy das edges. Tudo injetado em
  build via `define` do Vite — **sem** commit hash nem data de build, de
  propósito: mudariam o `dist` a cada commit e o `release:check` falharia com
  árvore limpa. Versão do painel = hash do conteúdo de `app/src`.

## 2026-08-28 — Wordmark corrigido; portal deixa cliente corrigir valor com observação

Wordmark (`assets/eloi-admin/wordmark.svg`) ainda desenhava "ELOI DESIGN
STUDIO" em 3 linhas — débito registrado no `CLAUDE.md` desde 2026-08-05
(nome renomeado, arte nunca foi re-letrada). Aba Pendências do portal também
só deixava o cliente digitar valor pra serviço **sem** valor — um já
definido (`valor_cents > 0`) aparecia travado, sem como a F2 corrigir nem
deixar contexto.

### Alterado

- **Wordmark**: removida a linha "DESIGN" (6 paths vetoriais) e a linha
  "STUDIO" subiu no lugar — cirurgia geométrica no SVG existente (deletar +
  deslocar coordenadas), não redesenho de letra à mão. Resultado: "ELOI /
  STUDIO" em 2 linhas, mesma arte original, `viewBox` ajustado. Fecha o
  débito do `CLAUDE.md`.
- **Portal · Pendências**: toda linha (com ou sem valor) ganha campo de
  valor editável + campo de observação opcional. Corrigir um valor já
  definido não sobrescreve `valor_cents` direto — vira `valor_sugerido_cents`
  como qualquer sugestão, o dono confere e aprova (mesmo fluxo do commit
  `d8f9499`, só habilitado em mais linhas).
- **`eloi_servicos.valor_sugerido_observacao`** (nova coluna, migração
  `2026-08-28-servico-valor-sugerido-observacao.sql`): observação do cliente
  junto da sugestão. Coluna dedicada — não reaproveita `observacoes` (nota
  interna do estúdio, item 0.5 do Horizonte 0), pra não colidir escrita do
  cliente com anotação do dono. Limpa junto ao aprovar/rejeitar, igual
  `valor_sugerido_em`. `Projetos.tsx` mostra a observação junto do valor
  sugerido, antes do dono decidir.
- **Precisa de migração + deploy** (`eloi-gestao`, `portal-cliente`) pra
  valer em produção.

## 2026-08-28 — Orçamento em rascunho para de vazar pro cliente

`portal-cliente.ts` (`orcamentos.list`) não filtrava `status` — o portal
desenhava "Ver proposta completa" pra toda linha, inclusive rascunho.
`orcamentos.ts` (`public_get`, usado pelo link da proposta) também aceitava
qualquer status. Preço provisório e itens ainda em construção chegavam ao
cliente antes do estúdio decidir enviar — com a F2, que é quem define o
valor de cada serviço, isso entrega posição de negociação.

### Corrigido

- `portal-cliente.ts` · `orcamentos.list` exclui `status = 'rascunho'`.
- `orcamentos.ts` · `public_get` devolve "não encontrado" (mesmo caminho de
  token revogado, D-7) quando o orçamento do token ainda é rascunho.

Fecha o Horizonte 0 (docs/ROTEIRO-SISTEMA-2026-08-28.md) — 8 itens, 8 commits.

## 2026-08-28 — Ações de um clique param de falhar em silêncio

Cinco pontos chamavam a edge sem `try/catch`: cancelar/reabrir lançamento e
pausar/encerrar recorrência (`Dinheiro.tsx`), ativar/desativar conta
(`Config.tsx`), encerrar meta (`Relatorios.tsx`) e excluir — usado por
`Entregas`, `Arquivos`, `Notas` e `Dinheiro` via `FolhaExcluir`. Sessão
expirada ou rede caída: a promessa rejeita, a tela não muda, nenhuma
mensagem — a pessoa clica de novo achando que não pegou.

### Corrigido

- `FolhaExcluir` (`folhas.tsx`) ganha `catch` + mensagem inline — conserta as
  quatro telas que a usam de uma vez só, sem tocar em cada uma.
- `Dinheiro.tsx`, `Config.tsx`, `Relatorios.tsx`: `try/catch` nos handlers
  restantes, toast de erro (`Aviso` já tinha `tipo:'erro'`, sem uso — mesmo
  padrão do item 0.4).
- **Fora do escopo, deliberado:** o ROTEIRO sugere um utilitário
  `executar(acao, aoErrar)` compartilhado pelos cinco pontos. Cada handler já
  segue o padrão try/catch usado no resto do `admin/` (inclusive o que acabou
  de entrar no item 0.4); um wrapper novo só pra encurtar três linhas em cinco
  lugares diferentes é abstração sem necessidade.

## 2026-08-28 — Editar lançamento cancelado não ressuscita mais ele

`FolhaTransacao.tsx` nunca manda `status` no payload de edição (correto — quem
deriva status é o servidor), mas `eloi-financas.ts` (`transacoes.upsert`) usava
`t.status || statusPorValor(...)`, e sem `t.status` **sempre** recalculava do
zero. Cancelar uma despesa de R$ 2.000 e depois só corrigir a descrição fazia
ela voltar como "Vencido" e os R$ 2.000 reentrarem no resultado, sem aviso.

### Corrigido

- `transacoes.upsert` já buscava a linha anterior pra preservar
  `recebido_cents`; passa a usar esse mesmo `anterior` pra preservar
  `status = 'cancelado'` também, a menos que o request explicite outro
  status. Reabrir continua sendo só via `transacoes.cancelar` (`reabrir:
  true`), que já existia e não muda.
- Sem teste de handler: mesma lacuna dos itens 0.4/0.8 — a camada de handler
  das edges não tem harness de teste hoje (registrado como item próprio no
  Horizonte 4 do ROTEIRO). `deno check` + os 16 testes de `_shared/` passam.

## 2026-08-28 — Editar serviço não apaga mais as observações

`eloi-gestao.ts` (`servicos.upsert`) gravava `observacoes: s.observacoes || null`
sempre, inclusive no UPDATE — e `FolhaServico` não tinha esse campo, então
nunca enviava. Abrir "Editar", não mudar nada e salvar zerava a coluna, nos
59 serviços vindos do painel legado.

### Corrigido

- `servicos.upsert` só grava `observacoes` quando o corpo manda a chave
  (mesmo padrão já usado por `nf_arquivo_url`) — campo ausente preserva o
  valor atual.
- `FolhaServico` ganha o campo (textarea, `CampoTexto`), então agora tem
  como editar observações pelo painel novo.

## 2026-08-28 — Aprovar orçamento não falha mais em silêncio (e não zera dado)

`Projetos.tsx` mandava `{id, status:'aprovado'}` pro `orcamentos.ts` update.
`exigeCliente` lia `cliente_id` **do corpo enviado**, que não veio, e barrava
com 400 — o único caminho orçamento→projeto do painel nunca funcionava, e a
chamada não tinha `catch`, então nada aparecia na tela. Explica o dado real:
nenhum dos 59 serviços tem `orcamento_id`.

`update` também fazia substituição total (`?? null`, `?? []`, `?? 0`) usada
como patch — corrigir só o `exigeCliente` teria trocado o bug silencioso por
perda de dado de verdade: `{id, status}` sozinho já apagaria itens, valor e
cliente do orçamento.

### Corrigido

- `orcamentos.ts` · `update` vira patch de verdade: busca o orçamento atual e
  usa o valor existente pra todo campo ausente no corpo. `exigeCliente` passa
  a validar o resultado já mesclado, não o corpo cru.
- `Projetos.tsx` · `aprovar`, `aprovarSugestao` e `rejeitarSugestao` ganham
  `try/catch` com toast de erro (`Aviso` já suportava `tipo:'erro'`, não
  usado em lugar nenhum até agora).
- **Precisa de deploy** (`npm run edges:deploy -- orcamentos`) pra valer em
  produção — feito ao final, junto dos outros itens deste horizonte.

## 2026-08-28 — Digitar `1234.56` não vira mais R$ 123.456,00

`centsDeBRL` (`app/src/lib/dinheiro.ts`) apagava tudo que não fosse dígito ou
vírgula — o ponto sumia (`"1234.56"` virava `123456` → R$ 123.456,00) e o
sinal de menos também (`"-500,00"` virava R$ 500,00, positivo — conta em
cheque especial nascia errada). É a função usada por todo campo de dinheiro
do painel.

### Corrigido

- `centsDeBRL` passa a tratar ponto como decimal quando não há vírgula, e
  preserva o sinal de menos.
- **Fora do escopo, deliberado:** o ROTEIRO também sugere ecoar o valor
  formatado embaixo do campo enquanto se digita — mexe nos 6 pontos que usam
  a função (`folhas.tsx`, `FolhaTransacao.tsx`, `Notas.tsx`, `Relatorios.tsx`,
  `Dinheiro.tsx`), sem componente de input de dinheiro compartilhado hoje.
  Fica pra quando esse componente existir, pra não duplicar o eco em seis
  lugares.

## 2026-08-28 — Portal não entrega mais rascunho

`portal-cliente.ts` tinha a action `entregas.list`, que fazia `storage.list()`
cru na pasta do cliente e devolvia **todo** arquivo que encontrasse — sem
checar `status`. `materiais.list`, que filtra `status = 'publicado'`, existia
e nunca era chamada. Resultado: "Publicar"/"Despublicar"/"Excluir" em
`/admin/entregas` só escreviam em `eloi_materiais`, sem efeito nenhum no que
o cliente conseguia baixar — rascunho já era baixável, despublicar não tirava
nada.

### Corrigido

- `portal/index.html` (`renderArquivos`) passa a chamar `materiais.list`.
- Action `entregas.list` **removida** de `portal-cliente.ts` — não só o front
  parou de chamá-la: a rota em si saía do ar, porque continuar existindo era
  furo de acesso direto à API. **Precisa de `npm run edges:deploy --
  portal-cliente` pra valer em produção.**

## 2026-08-28 — Painel parava de abrir em 1º de setembro

`app/src/lib/financas-store.tsx:89` colava `-31` no fim de todo mês pra montar
o fim da janela de transações (`deslocarMes(mes, 12) + '-31'`). Em fevereiro,
abril, junho, setembro e novembro isso gera uma data que não existe
(`2027-09-31`). A edge só valida formato, não calendário
(`eloi-financas.ts:39`), então o literal passava e o Postgres recusava a
consulta — `transacoes.list` caía com 500, o store pegava no `catch` e
**todas** as telas do `/admin` mostravam o painel de erro. Ia estourar em
2026-09-01.

### Corrigido

- Novo `ultimoDiaDoMes()` em `financas-store.tsx` calcula o último dia real do
  mês em vez de assumir 31. `de`/`ate` da janela de transações passam a usar
  data sempre válida. Sem mudança de edge, sem deploy — o filtro continua
  `lte` do lado do servidor.
- Teste novo (`financas-store.test.ts`) cobre os cinco meses que quebravam e
  varre os 12 meses do ano pra garantir que a janela de 12 meses à frente
  nunca gera data inválida.

## 2026-08-28 — KV atualizado chega nas páginas estáticas

`assets/eloi-admin/admin.css` ainda definia o sistema visual antigo (roxo
`#5A189A`, fundo claro, fonte carbona-variable, sombras decorativas) — 14
páginas estáticas dependiam dele: portal do cliente, os 4 briefings, os 3
orçamentos, `/marca` e os painéis legados `/gestao` e `/painel-*`. `/admin`
(SPA React) e a home já estavam no KV atual; o resto do site não.

### Alterado

- **`assets/eloi-admin/admin.css` reescrito** com os tokens do KV aprovado
  (mesma fonte de `app/src/ui/tokens.css`): fundo `--pagina`/`--chao`, roxo
  `#7D2AE8`, lima, coral, azul, Archivo + Manrope, sem sombra decorativa
  (elevação por tom), foco em Lima. Nomes de variável antigos (`--brand`,
  `--bg`, `--ink`, `--good`/`--warn`/`--bad` etc.) viraram alias pros tokens
  novos, pra não quebrar página que ainda não foi tocada.
- **14 páginas migradas**: portal, briefing, briefing-ecommerce,
  briefing-guia-viver-bem, briefing-solarium, orcamento,
  orcamento-precampanha (+ versão cliente), marca, gestao, painel,
  painel-briefings, painel-ecommerce, painel-orcamentos. Cor/tipografia/
  espaço/sombra/raio revisados; `<script>` de cada página não foi tocado.
- **`gestao` e `painel-orcamentos`** — únicas implementações reais de "gerar
  senha do portal" e "criar/editar proposta" — passaram por revisão adversarial
  dedicada confirmando que a função não foi afetada, só a aparência.

### Fora do escopo (decisão consciente)

- Easings de animação "bounce" pré-existentes, texto/copy dos formulários,
  iconografia por-página — nada disso é cor/tipografia/espaço/sombra/raio.
- `orcamento-precampanha/*` ainda usa os nomes de variável antigos (via alias)
  em vez dos novos diretamente — visual correto, nome pendente de padronização.
- Wordmark (`assets/eloi-admin/wordmark.svg`) continua letrando "ELOI Design
  Studio" — débito de design já registrado, não é CSS.

## 2026-08-07 — O site institucional existe

Até aqui a home era um card com um botão "Preencher Briefing" e nada mais: sem
projetos, sem serviços, sem processo, sem contato além de um e-mail — e sem
`description`, Open Graph, `robots.txt` ou `sitemap.xml` em página nenhuma. Quem
buscava pelo estúdio não achava, e quem recebia o link via um retângulo cinza.

### Adicionado

- **`/` virou o site do estúdio**, implementando o comp aprovado
  `eloi-handoff/references/Site Eloi 2026.dc.html`: topo com proposta, marcas
  atendidas, serviços, processo em quatro etapas, projetos, contato e rodapé.
  KV escuro, Archivo + Manrope, tokens do handoff — **sem carregar o CSS do
  painel**, que era o que a home antiga fazia.
- **`robots.txt`** — vitrine liberada; painéis, portal, entregas nominais e
  briefings feitos sob medida bloqueados. Material de cliente não é resultado de busca.
- **`sitemap.xml`** com as três páginas de vitrine.
- **`assets/og-eloi.png`** (1200×630) montada com o wordmark vetorial da marca.
- **`description` + Open Graph** em `/`, `/briefing/` e `/briefing-ecommerce/`;
  **`noindex`** nas páginas internas.
- **JSON-LD `ProfessionalService`** na home, com e-mail, telefone e ano de fundação.

### Decisões de conteúdo

- **Só um número na vitrine** ("7 anos de estúdio"). O comp trazia mais três
  (40 peças/mês, 12 clientes ativos, 3 entregas/semana) que não foram confirmados —
  número de vitrine é o tipo de coisa que cliente confere.
- **Marcas atendidas: F2 Experience e Sweet & Coffee Week.** As outras do comp
  saíram por falta de confirmação.
- **Os espaços de imagem são grafismo do KV, não moldura vazia** — proposital até
  as fotos dos projetos existirem.
- ⚠️ **A copy dos dois cards de projeto veio do comp e não foi conferida** com o
  escopo real de cada trabalho. Revisar antes de divulgar o link.

### Acessibilidade

- Alvos de toque ≥ 44 px (a marca do topo e o link de seção precisaram de ajuste),
  skip link, foco visível, `prefers-reduced-motion`, hierarquia de headings sem
  saltos. Único alvo abaixo de 44 px é o link "portal" dentro de uma frase —
  exceção prevista para link em bloco de texto.

## 2026-08-07 — A área do cliente passa a ser operável pelo painel novo

Três ações que só existiam no painel estático `/gestao` agora estão no `/admin`.
Até aqui, atender um cliente do começo ao fim exigia dois painéis.

### Adicionado

- **Gerar a senha do portal na ficha do cliente.** Painel "Área do cliente", com o
  estado do acesso e o botão. A senha aparece uma vez, com botão de copiar — o
  banco guarda só o hash PBKDF2, então não há onde consultá-la depois.
- **Enviar material para o cliente pelo painel** (`Entregas` → "Nova entrega", ou
  direto da ficha do cliente). Arquivo, categoria, título, versão e a decisão de
  publicar. **Rascunho é o padrão:** subir não é a mesma decisão que liberar.
- **Publicar e despublicar da própria lista de entregas**, sem abrir a folha — é a
  ação mais repetida no dia de entrega.
- **Anexar o PDF da nota fiscal** na folha de NF, com substituição e link para ver
  o arquivo atual. O painel continua **não emitindo** nota: guarda a que já foi
  emitida fora dele.
- **`entregas.view_url` na edge `eloi-gestao`** — leitura assinada do bucket
  `eloi-entregas` pelo lado admin, que não existia. (O portal já tinha a dele, com
  checagem de dono.)

### Corrigido no mesmo dia (revisão adversarial do que acabou de ser escrito)

- **Publicar uma entrega apagava a descrição do material e o vínculo com o
  serviço.** `materiais.upsert` montava o UPDATE com o objeto inteiro, então
  campo ausente no corpo virava campo zerado no banco — e o botão "Publicar" da
  lista manda só `{id, status}`. A descrição apagada é a que o cliente lê no
  portal. O UPDATE agora é patch parcial: só entra a chave que veio.
- **"Substituir arquivo" não substituía nada.** O binário novo subia, a tela
  dizia "salvo", `path` não estava no UPDATE e o cliente seguia baixando o
  arquivo antigo — sem erro em lugar nenhum, que é o pior tipo de falha.
- **Despublicar não limpava `published_at`**, e a linha ficava "Rascunho ·
  publicado em 07/08".
- **Botão "Ver" na lista de entregas.** `entregas.view_url` tinha sido criada
  sem nenhum consumidor: dava para publicar um arquivo para o cliente e não ter
  como conferir o que foi publicado, a não ser entrando no portal dele.
- **Descrição vazia grava `NULL`**, não string vazia.

### Nota

- `/gestao` deixou de ter função exclusiva e está pronto para sair. **`/painel-orcamentos`,
  `/painel-briefings`, `/painel` e `/painel-ecommerce` continuam necessários**: criar
  proposta, gerar convite de briefing e ler o que o cliente respondeu ainda não
  existem no `/admin`.

## 2026-08-07 — Login do painel deixa de ser derrubável de fora

### Corrigido

- **Qualquer pessoa na internet conseguia trancar o painel por 15 minutos.** O
  throttle do login admin contava as falhas numa linha única (`admin_login_seguranca`)
  e a 5ª bloqueava o login inteiro — não o autor das tentativas. Como a edge
  `admin-auth` responde a qualquer requisição e o CORS era `*`, bastavam cinco
  POSTs com senha errada, de qualquer lugar, para o dono ficar de fora. E de novo
  a cada cinco POSTs.
  Agora a contagem é **por IP** (`admin_login_ip_attempts`, mesmo desenho de
  `portal_login_ip_attempts`): 5 tentativas por IP em 15 minutos. Um limite global
  de 300 por janela ficou só como rede de segurança contra abuso distribuído —
  folgado o bastante para nunca pegar uso normal.
- **Login bem-sucedido zera as tentativas daquele IP.** Sem isso, um dia de
  trabalho normal (outro navegador, sessão expirada, celular) empurraria o dono
  para o próprio limite.
- **Senha do admin comparada em tempo constante.** A comparação com `!==` saía no
  primeiro byte diferente.

### Mudado

- **CORS da `admin-auth` deixou de ser `*`.** Só produção e o dev local
  (`localhost:5207`) recebem `Access-Control-Allow-Origin`. Não protege contra
  `curl` — nada em CORS protege — mas tira do ar o cenário de uma página qualquer
  usar o navegador de terceiros para martelar o login. Sem curinga para preview da
  Vercel de propósito: `.vercel.app` é espaço compartilhado.

### Corrigido no mesmo dia (revisão adversarial)

- **O throttle falhava aberto.** `count` nulo — tabela inexistente porque a
  migration não foi aplicada, banco fora do ar, RLS alterada — era lido como
  "zero tentativas" e o login passava. Ou seja: fazer o deploy da function sem
  rodar o SQL deixaria o painel sem proteção alguma, funcionando normalmente,
  sem sinal para ninguém. Agora responde **503** e não deixa tentar.
- **O IP vinha do lado errado do `X-Forwarded-For`.** O primeiro elemento é o
  que o cliente mandou — texto livre que um atacante rotaciona para nunca somar
  cinco tentativas no mesmo "IP". Passou a usar o último, escrito pela borda.
  (`portal-cliente.ts` tem o mesmo problema; fica para outro commit.)

### Obsoleto

- **`admin_login_seguranca`** não é mais lida nem escrita por nenhuma function.
  Tabela mantida com `comment` explicando a condição de saída (drop depois de
  2026-09).

## 2026-08-05 — Auditoria, limpeza e renomeação para ELOI Studio

### Renomeado

- **O projeto passou a se chamar ELOI Studio** (técnico `eloi-studio`). Título das
  páginas, `manifest.json`, PWA do painel, `package.json`, assinatura `<Marca />`,
  `alt`/`aria-label` de logo, rodapés e documentação.
- **Não** renomeados, de propósito: tabelas `eloi_*`, edge functions, buckets,
  domínio, repositório GitHub e variáveis de ambiente — identificadores externos.
- ⚠️ O wordmark **desenhado** ainda letra "ELOI Design Studio". São curvas de SVG;
  re-letrar é trabalho de design.

### Removido

- **`/admin-app/`** — SPA React 18 substituída pelo painel atual. Nenhum consumidor
  além dos próprios rewrites. `vercel.json` agora redireciona `/admin-app*` →
  `/admin` com 301, então link antigo continua funcionando.
- `assets/eloi-admin/periodo.js` — perdeu o único consumidor quando o hub estático
  `/admin` saiu do repositório.
- `assets/fonts/Juturu-VariableVF.woff` — sem `@font-face`, `<link>` ou qualquer
  referência. As fontes em uso são Archivo e Manrope.

### Corrigido

- **`deno check` estava quebrado** e o CI roda esse comando: `jsr:@supabase/supabase-js@2`
  passou a puxar uma dependência npm de tipos. Resolvido com `deno.json`, **sem
  tocar em nenhuma edge function** — o repositório precisa continuar idêntico ao
  que está deployado.
- **Lint com 1091 avisos** que vinham do `dist/` commitado e escondiam qualquer
  aviso real. `dist/` ignorado; e a regra de Fast Refresh desligada nos 3 arquivos
  que sempre a disparam. A saída do lint agora é vazia.
- **Hex solto em `.tsx`** (`'#7D2AE8'`, duas vezes em `folhas.tsx`), contra a regra
  do próprio sistema visual. Passou a usar `corCliente[0]` dos tokens.
- **`<Marca>` tinha um parâmetro `complemento` que nenhum chamador usava** — era o
  caminho mais curto para a marca sair escrita de dois jeitos. Removido.
- **Os dois arquivos de token se declaravam "fonte única"** e já tinham divergido:
  `--margem`, `--gap-grade` e `--padding-card` existiam só no lado do app.
  Sincronizados, cabeçalhos corrigidos, e um teste novo falha se divergirem de novo.
- `ROUTE_MAP` descrevia o wordmark com `viewBox` e classe de cor errados.
- `.gitignore` não ignorava `node_modules/` nem `.env`.

### Reorganizado

- `db/` → `database/migrations/` · `SITEMAP.md` → `docs/ROUTE_MAP.md` ·
  `CONTEXT.md` → `docs/GLOSSARY.md`.
- Planos, specs e diagnósticos já executados foram para `docs/historico/`.
- `package.json` na raiz padroniza os comandos: `dev`, `build`, `lint`, `typecheck`,
  `test`, `edges:check`, `edges:test`, `edges:deploy` e `verify`.

### Documentação

Criados `README.md`, `CLAUDE.md`, `.env.example` e os mapas em `docs/`:
`PROJECT_MAP`, `ARCHITECTURE`, `FEATURE_MAP`, `DATA_MODEL`, `DESIGN_SYSTEM`,
`FILE_INVENTORY`, `DECISIONS`, `DEVELOPMENT_GUIDE` e `CLEANUP_REPORT`.

## 2026-08-05 — Revisão geral, correções e refinamento

### Corrigido (dinheiro)

- **Estorno não estornava.** O enum do banco (`eloi_status_mov`) tem o rótulo
  `cancelado`; o tipo TypeScript dizia `cancelada`. `estaCancelada()` nunca dava
  `true`, então um lançamento cancelado continuava somando em saldo, resultado, a
  receber e a pagar, e o chip caía no fallback "Previsto".
- **Mesmo dinheiro contado duas vezes.** Um lançamento `realizado` sem
  `recebido_cents` informado entrava inteiro em "recebido" (via `valorLiquidado`)
  **e** inteiro em "a receber" (via `saldoAberto`). Agora `saldoAberto` desconta o
  que `valorLiquidado` enxerga: liquidado + em aberto sempre fecha no combinado.
- **Parcelamento estava quebrado em produção.** O molde da parcela zerava o `id`
  com `id: undefined`; em insert de várias linhas o postgrest-js normaliza as
  chaves e preenche o que falta com `null`, então o banco recusava com
  `null value in column "id" violates not-null`. Nenhuma compra parcelada era
  gravada. Agora o `id` sai por destructuring. Verificado em produção: 3× de
  R$ 100,01 = 33,35 + 33,33 + 33,33, com vencimento 31/08 → 30/09 → 31/10.
- **Editar lançamento duplicava a linha.** O formulário não mandava o `id`, então
  cada salvamento gravava um registro novo.
- **Editar apagava pagamento parcial.** O `upsert` zerava `recebido_cents` quando o
  campo não vinha no payload. Agora o servidor preserva o valor atual.
- **Lançamento sem competência sumia do painel.** A janela do `transacoes.list`
  comparava só `data_competencia`, e `NULL` nunca satisfaz `gte`/`lte`. A janela
  passou a cair em competência **com fallback para vencimento**, igual à cascata do
  front (`competenciaDe`).
- Transferência agora tem `categoria_id` forçado a `null` no servidor, e receita/
  despesa exigem conta. `transacoes.parcelar` ganhou as mesmas validações do
  `upsert` — não era porta dos fundos para gravar linha inválida em lote.
- Liquidar um lançamento cancelado passa a ser recusado.

### Corrigido (integração e interface)

- A fila "Precisa de você" recebia `orcamentos: []` fixo: a decisão "proposta
  enviada há N dias sem resposta" nunca aparecia.
- "Nova" nos painéis de contas pessoais abria o formulário com contexto Empresa.
- Rota desconhecida em `/admin/*` mostrava tela em branco; agora tem estado de
  página não encontrada dentro do shell, e fora de `/admin` redireciona.
- O `Suspense` das telas saiu do `main.tsx` para dentro do `Shell`: navegar não
  troca mais o trilho e o cabeçalho por uma linha de texto.
- Toast (`Aviso`) podia reiniciar o próprio relógio a cada re-render do pai.
- Folha/modal ganhou armadilha de foco, foco inicial e devolução do foco para
  quem a abriu.
- **Trilho de 72 px (tablet)**: a assinatura e o botão "Sair" vazavam a largura
  (76–80 px num trilho de 72) e apareciam cortados. Rótulos só a partir de 1024,
  quando o trilho abre para 236.
- **Cabeçalho de tela no tablet**: com filtros e seletor de mês na mesma linha,
  "agosto de 2026" virava três linhas de uma palavra. O cabeçalho passa a quebrar.
- **Rolagem horizontal no celular** em Visão geral, Financeiro e Calendário. Duas
  causas: a barra inferior usava `repeat(5,1fr)` (mínimo automático — o rótulo
  "Visão geral" empurrava a coluna para 107 px e a barra ia a 537 num aparelho de
  375) e `.cabecalho-acoes` era `flex:none`, travado no max-content de 644 px.
  Verificado sem rolagem em 320, 375, 768 e 1440.
- Alvos de toque abaixo de 44 px na tela de acesso ("Manter conectado" e
  "Esqueci a senha").

### Adicionado (vínculos e fluxos que faltavam)

- **Cliente**: cadastro e edição no painel (`/admin/clientes` e na ficha).
- **Projeto**: criar/editar serviço e **aprovar proposta** — a aprovação dispara o
  trigger que converte orçamento em serviço.
- **Estorno**: cancelar e reabrir lançamento, preservando o histórico.
- **Cartão**: pagar fatura como transferência conta→cartão (nunca despesa nova, que
  duplicaria as compras já lançadas).
- **Recorrência**: pausar, retomar e encerrar sem apagar o que já foi gerado.
- **Meta/orçamento**: encerrar (desativa, preserva o planejado).
- **Nota fiscal**: vínculo com o recebimento correspondente, e exclusão.
- **Arquivo**: vínculo opcional a serviço, lançamento e nota, além do cliente.
- **Lançamento**: campo de fornecedor e vínculo a projeto/serviço.
- Ficha do cliente passou a mostrar propostas e arquivos.

### Telas de acesso

- Redesenho completo com o KV: composição dividida no desktop (identidade +
  formulário) e versão compacta no toque, com o formulário perto do topo por causa
  do teclado virtual.
- Mostrar/ocultar senha, aviso de Caps Lock, trava de envio duplo, foco automático
  só no desktop, `autocomplete` de gerenciador de senha.
- Estados próprios para **sessão expirada** e **bloqueio por tentativas** (429) —
  antes qualquer falha virava "senha inválida".
- **Manter conectado**: desligado, o token vai para `sessionStorage` e morre ao
  fechar a aba.
- "Esqueci a senha" explica a recuperação real (variável `ADMIN_PASSWORD` +
  redeploy da `admin-auth`) em vez de simular um fluxo que não existe.

### Segurança

- `conta_id` e as datas da janela passam por validação antes de entrar no filtro
  `or` do PostgREST, que é montado por concatenação de string.

### Limpeza

- Saiu o wrapper `financeiro.*` (edge `eloi-financeiro`) do client do app: é do
  painel estático legado `/gestao`, não deste produto. `eloi-financeiro` saiu da
  allowlist de functions, e os tipos `CaixaRow`/`FinanceiroStats` foram removidos.
- `decisoesDoDia` deixou `movimentos` opcional (conceito só do legado).
