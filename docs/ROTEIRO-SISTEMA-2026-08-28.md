# Roteiro do sistema — ELOI Studio

Auditoria completa de 2026-08-28, feita **no código e no banco de produção**, com
quatro varreduras independentes (financeiro · gestão · cliente/público ·
qualidade e legado). Destino: uma sessão do Claude Code executar horizonte a
horizonte.

Este documento é o mapa geral. O **Horizonte 1** está detalhado à parte, em
`docs/PLANO-OPERACAO-2026-08-28.md` — não repito aqui.

**Legenda de esforço:** `P` até ~1 h · `M` meio dia · `G` vários dias.
Todo achado abaixo foi localizado no código; os marcados **[conferido]** eu
reproduzi ou confirmei direto no banco/execução.

---

## Horizonte 0 — Apagar incêndio

Sete defeitos que já causam perda hoje, ou vão causar em dias. Nada aqui é
melhoria: é conserto. Tudo cabe em um ou dois commits.

### 0.1 · O painel para de abrir em 1º de setembro **[conferido]** · `P`
`app/src/lib/financas-store.tsx:89` — `const ate = deslocarMes(mes, 12) + '-31'`
cola o dia 31 em qualquer mês. Com o foco em setembro, `ate` vira `2027-09-31`.
A edge valida só por regex (`eloi-financas.ts:39`, `ehData`), o literal passa, e
o Postgres recusa com *date/time field value out of range*. `transacoes.list`
devolve 500, o store cai no `catch` e **todas** as telas mostram o painel de erro.

Reproduzi a conta: `2026-09 → 2027-09-31`, `2027-02 → 2028-02-31`. Quebra em
fevereiro, abril, junho, **setembro** e novembro. Agosto tem 31 dias — é só por
isso que hoje funciona.

**Conserto:** usar o dia 1 do mês seguinte com `lt`, ou o último dia real do mês.
É o item mais urgente do documento inteiro.

### 0.2 · O portal entrega arquivo que você não publicou **[conferido]** · `M`
`portal/index.html:234` chama `entregas.list`, que em
`edge-functions/portal-cliente.ts:218` faz `storage.list()` na pasta do cliente e
devolve **todo path que encontrar**. A action `materiais.list`, que filtra
`status = 'publicado'`, existe e **nunca é chamada por ninguém**.

Publicar, despublicar e excluir em `/admin/entregas` escrevem só em
`eloi_materiais`. Resultado: rascunho já é baixável; "Despublicar" não tira nada;
"Excluir" tira a linha e mantém o download. O texto da folha
(`folhas.tsx:500` — "o cliente só enxerga o que está publicado") e o aviso "saiu
do portal" (`Entregas.tsx:47`) estão dizendo o que não acontece.

**Conserto:** o portal passa a listar por `materiais.list`; `entregas.view_url`
continua servindo o download, mas só de path que veio dali.

### 0.3 · Digitar `1234.56` grava R$ 123.456,00 **[conferido]** · `P`
`app/src/lib/dinheiro.ts:8` — `centsDeBRL` apaga tudo que não é dígito ou
vírgula. Rodei: `"1234.56"` → R$ 123.456,00; `"1500.50"` → R$ 150.050,00. O
mesmo `replace` come o sinal de menos: `"-500,00"` → R$ 500,00, então conta em
cheque especial nasce com saldo positivo.

Todo campo de dinheiro do painel usa essa função e nenhum ecoa o valor
interpretado antes de salvar. É o erro mais provável do primeiro dia de uso, com
as tabelas ainda vazias.

**Conserto:** aceitar ponto como decimal quando não houver vírgula, preservar o
sinal, e mostrar o valor formatado embaixo do campo enquanto se digita.

### 0.4 · O botão "Aprovar" de Projetos falha sempre, em silêncio · `P`
`app/src/routes/admin/telas/Projetos.tsx:36` manda `{id, status:'aprovado'}`.
`edge-functions/orcamentos.ts:107` (`exigeCliente`) lê `o.cliente_id` **do corpo
enviado**, que não veio, e devolve 400 "orçamento não pode ser aprovado sem
cliente cadastrado". A chamada é `void aprovar(p)` sem `catch`: nada aparece.

É o único caminho orçamento→projeto do painel — e explica o dado real:
**nenhum dos 59 serviços tem `orcamento_id`**.

**Cuidado ao consertar:** `orcamentos.ts:157` é substituição total usada como
patch (`?? null`, `?? []`, `?? 0`). Mandar só `cliente_id` a mais transformaria o
bug silencioso em perda de dado — o orçamento aprovado ficaria com valor 0.
Consertar os dois no mesmo commit: `update` vira patch de verdade.

### 0.5 · Editar um serviço apaga as observações · `P`
`edge-functions/eloi-gestao.ts:220` grava `observacoes: s.observacoes || null`
inclusive no UPDATE, e a `FolhaServico` não tem esse campo, logo nunca o envia.
Abrir "Editar", não mudar nada e salvar **zera a coluna**.

São 59 serviços vindos do painel legado. O mesmo arquivo já faz o certo com
`nf_arquivo_url` (`if (typeof s.nf_arquivo_url === "string")`) — é estender o
padrão, e passar a expor o campo na folha.

### 0.6 · Editar um lançamento cancelado o ressuscita · `P`
`app/src/routes/admin/FolhaTransacao.tsx:84` monta o payload sem `status`, e a
edge recalcula (`eloi-financas.ts:190`: `status: t.status || statusPorValor(...)`).
Cancelo uma despesa de R$ 2.000, depois corrijo a descrição — ela volta como
"Vencido" e os R$ 2.000 reentram no resultado, sem aviso.

### 0.7 · Todas as ações de um clique falham em silêncio · `P`
`Dinheiro.tsx:52` (cancelar/reabrir, pausar/encerrar recorrência),
`Config.tsx:27` (ativar/desativar conta), `Relatorios.tsx:31` (encerrar meta),
`folhas.tsx:749` (`FolhaExcluir`, usada por Entregas, Arquivos e Notas) chamam a
edge **sem `try/catch`**. Sessão expirada ou rede caída: a promessa rejeita, a
tela não muda, nenhuma mensagem. A pessoa clica de novo achando que não pegou.

**Conserto:** o mesmo `setErro` + toast que as folhas já usam. Um utilitário
`executar(acao, aoErrar)` resolve os cinco de uma vez.

### 0.8 · Orçamento em rascunho é visível para o cliente · `P`
`edge-functions/portal-cliente.ts:187` (`orcamentos.list`) não filtra `status`, o
portal desenha "Ver proposta completa" em toda linha
(`portal/index.html:288`) e `orcamentos.ts:32` (`public_get`) também aceita
qualquer status. Preço provisório e itens em construção chegam ao cliente antes
de você decidir enviar — com a F2, que é quem define valor, isso entrega a
posição de negociação. Filtrar `status <> 'rascunho'` nos dois lados.

---

## Horizonte 1 — Operação: serviços, sub-clientes, NF e portal da F2

Já detalhado em **`docs/PLANO-OPERACAO-2026-08-28.md`** (fases 0 a 5):
`eloi_sub_clientes` como entidade real, Projetos sem o corte de mês, edição de
valor em linha, nota fiscal 1:N com espelho por trigger, fechar o fluxo de valor
sugerido que entrou no commit `d8f9499`, tela de Fechamento por sub-cliente e
atalhos.

Dois achados novos desta auditoria entram lá:

- **Os indicadores de Projetos não respeitam o filtro** (`Projetos.tsx:92`):
  `porEtapa()` roda sobre todos os meses e alimenta os quatro cartões do topo e a
  contagem das abas, enquanto a lista abaixo é filtrada. Hoje a aba diz
  "Pago · 43" e clicar mostra "Nenhum projeto nesse filtro". `P`
- **Serviço sem `data_competencia` aparece em todos os meses**
  (`Projetos.tsx:63`) — são 16 hoje. A regra existe para orçamento não aprovado;
  para serviço solto, ela infla a leitura de todo mês. `P`

---

## Horizonte 2 — Completar o painel

O que falta para o `/admin` ser realmente um painel completo. Agrupado por tela.

### Hoje — a fila de trabalho precisa deixar trabalhar
- **"Precisa de você" é uma lista morta** (`Hoje.tsx:92`): cada decisão vira um
  `<li>` sem link nem botão. O `decisoes.ts` já calcula a `acao`
  (`cobrar_pagamento`, `emitir_nf`, `pagar_conta`, `aprovar_valor`) e o campo é
  **descartado**. Mapear cada ação para abrir a folha certa. `M`
- **O contador mente** (`Hoje.tsx:37`): `.slice(0, 8)` acontece antes da
  contagem, então com 30 pendências o painel afirma "8 itens". `P`
- **A mesma cobrança aparece duas vezes** (`decisoes.ts:34` e `:79`): uma pelo
  serviço não pago, outra pela transação vencida, sem de-duplicar por
  `servico_id` — e com o corte em 8, decisão duplicada empurra decisão real para
  fora da tela. `P`
- **A sugestão de valor da F2 não aparece aqui** — só na linha de Projetos, e
  some se o serviço for de outro mês. É o laço central do negócio. `P`

### Dinheiro — o núcleo nunca foi usado; é aqui que ele trava no primeiro dia
- **"Pagar fatura" tira dinheiro e não abate a fatura** (`Dinheiro.tsx:404`):
  cria uma transferência conta→cartão, mas `faturaAberta`
  (`domain/financeiro.ts:149`) soma o aberto das **saídas** do cartão, que a
  transferência não toca. Clicar duas vezes drena o dobro. `M`
- **Baixa registrada errada não tem desfazer** (`folhas.tsx:139`,
  `eloi-financas.ts:230`): só soma, e a folha de edição nunca reenvia
  `recebido_cents`. Registrei R$ 5.000 no lugar de R$ 500 e não há caminho de
  volta que preserve o histórico. Num núcleo de dinheiro, desfazer é obrigatório. `P`
- **Competência não é editável** (`FolhaTransacao.tsx:92`): a folha grava
  `data_competencia = vencimento`. O domínio inteiro é construído sobre
  "competência ≠ liquidação" e a única tela que cria lançamento não expõe o
  campo. Entrego em julho, recebo em setembro, e o DRE mostra o mês errado. `P`
- **"Já paguei" grava sempre hoje** (`FolhaTransacao.tsx:106`): sem campo de
  data. Importa exatamente agora, que o primeiro trabalho é lançar o histórico —
  tudo ficaria liquidado no mesmo dia. `P`
- **Sem extrato nem filtro por conta** — e o servidor já sabe fazer
  (`eloi-financas.ts:119` aceita `conta_id`, `categoria_id`, `tipo`, `status`,
  `em_aberto`). Sem extrato por conta não existe conferência contra o app do
  banco. `M`
- **Encerrar recorrência é um clique sem confirmação e sem volta**
  (`Dinheiro.tsx:238`): faz `ativa = false`, e o bootstrap só carrega `ativa =
  true` — some para sempre, embora `retomar` exista na edge. `P`
- **Excluir parcelamento apaga junto as parcelas já pagas**
  (`eloi-financas.ts:291`): `delete` por `grupo_id` sem checar `recebido_cents`. `P`
- **Com zero contas, o botão "Lançar" é um beco sem saída**
  (`Dinheiro.tsx:97`): abre a folha com o select vazio e a validação exige conta.
  O Hoje trata esse caso; o Dinheiro não. `P`
- **Zero categorias no primeiro uso, e categoria não se edita nem desativa**
  (`Config.tsx:91`): não há seed, os chips são inertes e `FolhaCategoria` só
  cria — embora a edge aceite `id`. Todo relatório por categoria nasce vazio. `M`
- **Cartão sem ciclo:** `dia_fechamento`/`dia_vencimento` são exigidos, validados
  e exibidos, e **nunca entram em cálculo**; `saldo_inicial_cents` do cartão
  também não é lido por ninguém. Cadastrar um cartão com fatura de R$ 3.400
  mostra R$ 0,00. `M`
- **Despesa não recebe comprovante** (`Arquivos.tsx:219`): a folha exige cliente
  e só lista transações daquele cliente; despesa tem `fornecedor`, não cliente.
  `eloi_arquivos.transacao_id` existe no schema e não tem caminho na interface. `M`

### Relatórios
- **Sem seletor de mês próprio** (`Relatorios.tsx:67`) — para trocar o período é
  preciso ir a outra tela e voltar. `P`
- **Rankings sem período declarado** (`:53`): somam a janela inteira do store
  (11 meses atrás + 12 à frente), misturando o que entrou com o que ainda vai
  entrar. `P`
- **Nada é exportável**: não há uma linha de CSV ou PDF em todo o `app/src`. O
  contador pede planilha, não captura de tela. `M`
- **Orçamento de gasto nunca termina** (`:265`): a folha não tem campo `fim`,
  embora o tipo, a coluna e o cálculo o usem. "Alimentação de agosto" continua
  somando em outubro e diz "Estourou" para sempre. `P`
- **Meta sem categoria conta toda receita do contexto** (`:367`): ignora
  `conta_id`, que a folha nem oferece. O primeiro cliente que pagar marca a
  reserva de emergência como cumprida. `P`

### Projetos, Clientes e Briefings
- **Não existe UI para excluir serviço nem cliente** —
  `eloi-gestao.ts:279` (`servicos.delete`) e `:139` (`clientes.delete`, já com
  guarda 409) existem e não têm wrapper em `api.ts`. `P`
- **`servicos.from_orcamento` é a ferramenta de reparo sem botão**
  (`eloi-gestao.ts:257`): idempotente, com as mensagens de erro já escritas. `P`
- **`dashboard.stats` é código morto** (`eloi-gestao.ts:417`) — e é o único lugar
  que calcula *orçamento aprovado que não virou serviço*. `P`
- **`clientes.detail` também é código morto** (`:150`) e o resumo que ele devolve
  sai de `eloi_movimentos_financeiros`, tabela legada e vazia. Ou adota, ou sai. `P`
- **Marca publicada e portal ativo são só de leitura** (`folhas.tsx:336`): os
  chips existem nas duas telas e nada muda o estado. Também não há como desativar
  o acesso de um cliente nem desbloquear quem errou a senha. `P`
- **`revogado_em` tem três leitores e nenhum escritor** (`orcamentos.ts:39`,
  `briefing-submit.ts:42`): a tela até desenha um chip "Revogado" que nunca pode
  aparecer. Link de proposta enviado é permanente. `P`
- **Briefing respondido não pode ser lido no painel** (`Briefings.tsx:146`): as
  edges devolvem o `raw` inteiro e a tela mostra só nome, e-mail e data. `M`
- **Convite de briefing: não dá para criar, copiar nem revogar** — `create` e
  `delete` existem em `briefing-links.ts` sem wrapper, e a tela manda o dono para
  `/painel-briefings` em outra aba. `M`
- **Orçamento: criar, editar e catálogo só existem no painel estático** —
  `create`, `delete`, `catalog_*` estão prontos e autenticados em
  `orcamentos.ts`. Falta tela. `G`
- **Ficha do cliente:** envia material e não mostra o que já foi enviado
  (`ClienteFicha.tsx:120`); o acervo não filtra por cliente; não há anotação
  livre, contato estruturado (e-mail/WhatsApp com link) nem busca global. `M`
- **Entregas: excluir deixa o binário no Storage** (`eloi-gestao.ts:399`), e
  `entregas.delete` existe sem wrapper e sem botão. Trocar o arquivo de um
  material abandona o antigo. `P`

---

## Horizonte 3 — O que o cliente vê

O portal é a única tela que gente de fora usa, e é onde a régua do próprio
projeto está mais frouxa.

### Portal do cliente
- **Nenhuma divisão por sub-cliente** — a F2 vê 59 serviços numa lista só, sem
  saber o que é da VIBRA e o que é da CONSTEL. É a divisão que você pediu; está
  na Fase 3 do plano de operação. `P`
- **Falha de rede vira estado vazio** (`portal/index.html:232,246`): o `catch`
  escreve "Seus arquivos ainda não foram publicados" e "Nenhum arquivo
  disponível". Qualquer 500 diz ao cliente que você não entregou nada — e ele
  liga reclamando. Erro e vazio são telas diferentes. `P`
- **Sem estado de carregamento:** entre o login e as quatro chamadas, as seis
  abas ficam vazias. `P`
- **Sem recuperação de senha e sem forma de falar com o estúdio** — zero
  ocorrências de "esqueci", "contato", "whatsapp" ou `mailto` no arquivo. Quem
  errou 5 vezes toma bloqueio de 15 min e lê "Senha incorreta", sem saída. Um
  link de WhatsApp no rodapé do login resolve quase tudo. `M`
- **Nota fiscal some conforme por onde foi anexada** (`portal-cliente.ts:177`):
  `nf.view_url` só assina `eloi_servicos.nf_arquivo_url`, e o painel novo grava
  em `eloi_notas_fiscais.arquivo_path`. Ler das duas fontes até a Fase 2 fechar. `M`
- **Sugestão recusada some sem explicação; aprovada não avisa**
  (`eloi-gestao.ts:247`): a linha volta a "Sem valor definido" e a F2 não sabe se
  foi recusa, bug ou se precisa mandar de novo. Sem campo de motivo, sem data de
  aceite, sem instrução de pagamento. `M`
- **Sem acompanhamento de projeto e sem pedido de alteração**: as seis abas são
  inventário. A home promete "quatro etapas, nenhuma surpresa" e "duas rodadas de
  ajuste" e o portal não sustenta nenhuma das duas. `status_execucao` já tem o
  dado. `G`
- **Acessibilidade zero e alvos pequenos**: nenhum `aria-` e nenhum `role=` no
  arquivo; abas são `<button>` soltos; o campo onde a F2 digita dinheiro tem
  ~35 px e o `.btn-sm` ~30 px, contra os 44 px que o próprio projeto exige. E
  nove emojis no lugar do sprite autoral. `M`

### Proposta e briefing
- **Aprovar proposta é um clique sem confirmação e sem volta**
  (`orcamento/index.html:108`): `client_decide` é público, sem throttle e sem
  expiração; a aprovação dispara o trigger que cria o serviço e depois responde
  409. Um toque errado no celular — ou qualquer pessoa a quem o link foi
  encaminhado — fecha contrato. Falta também "pedir alteração": hoje a única
  saída de quem quer negociar é recusar. `P` (confirmação) / `M` (expiração)
- **A proposta mostra ao cliente os multiplicadores internos**
  (`assets/eloi-admin/orcamento.js:34`): imprime "Complexidade Alta (×1.8)",
  "Urgência Expressa (×1.3)" e o subtotal antes do ajuste. É convite direto a
  pedir a base. Mostrar rótulo e valor, nunca o fator. `P`
- **"Briefing enviado!" aparece mesmo quando só o e-mail passou**
  (`briefing/index.html:1180`, e as outras três páginas): o sucesso é
  `supaOk || formOk`, e o Formspree quase sempre responde 200. Token inválido ou
  revogado → o cliente lê "Recebemos com sucesso" e o link continua pendente. `P`
- **`?mode=admin` desliga a validação para qualquer visitante**
  (`briefing/index.html:1053-1057`): `IS_ADMIN` sai da query string e o
  avanço de etapa pula `validateStep` inteiro. Qualquer um envia briefing vazio. `P`
- **Aviso de privacidade não existe** — todo briefing vai também para o
  Formspree, e não há uma ocorrência de "privacidade" ou "LGPD" em nenhuma
  página. Formulário público brasileiro coletando nome, e-mail e WhatsApp precisa
  dizer quem recebe e para quê. Uma linha acima do botão e uma `/privacidade`. `P`
- **A entrega de marca fica em branco se o manifest falhar**
  (`entregas-marca/_shared/entrega.js:6`): `fetch` + `json()` sem `try` e sem
  checar `res.ok`, dentro de uma IIFE async sem `.catch`. Sinal ruim no celular =
  página branca, sem mensagem e sem "tentar de novo" — justo onde o cliente veio
  buscar os arquivos finais. `P`
- **O portão da marca é só JavaScript** (`entregas-marca/_shared/gate.js:27`):
  falha aberto em qualquer erro ≠ 401, e PDF, .zip e SVGs seguem acessíveis por
  URL direta. A action `marca.manifest`, que serve o bucket privado por signed
  URL, está pronta e **não é chamada por ninguém**. A migração para o bucket
  privado ficou pela metade. `G`

### Site institucional
- **O site de um estúdio de identidade visual não mostra nenhum trabalho**
  (`index.html:396`): os dois "projetos recentes" são `<div>` com barras de cor.
  É a lacuna que mais custa trabalho novo. Faltam foto real, página de caso e
  prova social. `G`
- **Canonical, Open Graph e sitemap apontam para o domínio errado**
  (`index.html:8,15,35`, `sitemap.xml`, `robots.txt`): tudo declara
  `briefing-eloidesign.vercel.app`, mas o domínio real é `www.eloidesign.com.br`.
  O buscador é instruído a indexar o endereço da Vercel, e o domínio de marca
  nunca acumula ranking. `P`
- **O rodapé público anuncia a área administrativa** (`index.html:487`). Não é a
  defesa — o login é —, mas ocupa no rodapé um espaço que deveria ser do
  Instagram ou do portfólio. `P`
- **O manifest instalável oferece atalhos para o painel interno**
  (`manifest.json:22`): os três `shortcuts` são `/admin/`, `/gestao/` e
  `/painel-briefings/`, e o manifest é linkado pelo portal, pela proposta e pelas
  quatro páginas de briefing. `start_url` ainda leva o cliente para o site, não
  para o portal. `P`

---

## Horizonte 4 — Fundação: segurança, qualidade e dívida

### Segurança
- **CORS `*` em oito das nove edges** (`eloi-financas.ts:19`, `eloi-gestao.ts:16`,
  `portal-cliente.ts:16`, `orcamentos.ts:5`, `briefing-links.ts:6`,
  `get-briefings.ts:5`, `get-ecommerce-briefings.ts:5`, `briefing-submit.ts:5`,
  `eloi-financeiro.ts:21`). Só `admin-auth` recebeu a allowlist da D-17 — e o
  raciocínio que a motivou vale igual aqui, onde a resposta contém dinheiro e
  dado de cliente. `P`
- **Mass assignment em seis `upsert`** (`eloi-financas.ts:181,305,392,412,420,429`):
  `{ ...t }` deixa qualquer coluna do corpo entrar na tabela, inclusive `id` (um
  upsert com o id de outra linha a sobrescreve), `grupo_id` e `created_at`.
  `eloi-gestao.ts:210` já faz o certo, montando `row` campo a campo. `M`
- **`briefing-submit` é escrita pública sem throttle, sem teto e sem guarda de
  status** (`briefing-submit.ts:30`): um segundo POST com o mesmo token
  sobrescreve resposta já entregue, sem rastro; `raw` entra sem limite de
  tamanho. Um link reencaminhado no WhatsApp basta. `M`
- **O throttle do portal é burlável e falha aberto** (`portal-cliente.ts:70`):
  usa o **primeiro** elemento do `X-Forwarded-For` — texto que o cliente manda e
  rotaciona — e `(count ?? 0) >= 20` transforma erro de contagem em zero. O
  próprio comentário do `admin-auth.ts` admite a dívida. `P`
- **Sessão sem teto absoluto** (`_shared/auth.ts:14`): cada requisição empurra
  `expires_at` para +12 h, então uma sessão usada todo dia nunca expira. Um token
  copiado de um `localStorage` vale para sempre; a única revogação é
  `logout_all`, que derruba você junto. `M`
- **Três tabelas escritas por não-autenticado, nenhuma com faxina** —
  hoje: 20 sessões de admin, 33 de portal e 36 tentativas de login acumuladas.
  `admin-auth.ts:191` já mostra o padrão certo (faxina oportunista no sucesso). `P`
- **Listas de briefing devolvem PII inteira, sem corte**
  (`get-briefings.ts`, `get-ecommerce-briefings.ts`, `briefing-links.ts`):
  `select("*")` sem `limit` — abrir `/admin/briefings` baixa nome, e-mail,
  WhatsApp, o `raw` completo e o token de convite de **todos**, para desenhar uma
  tela que mostra título e data. `P`
- **Duas políticas `anon` de INSERT existem** em `briefings` e
  `ecommerce_briefings` **[conferido no banco]**. São necessárias para o
  formulário público funcionar (e ele funciona — há registros), mas contradizem o
  "RLS nega tudo para `anon`" repetido em `ARCHITECTURE.md` e `DATA_MODEL.md`, e
  são um endpoint de escrita anônima sem limite nenhum. Documentar a exceção e
  pôr um teto. `P`
- **O deploy publica o repositório inteiro** (`vercel.json:5`,
  `outputDirectory: "."`): `edge-functions/*.ts`, `database/migrations/*.sql`,
  `docs/` e `CLAUDE.md` ficam servidos em URL previsível. O `robots.txt` pede
  para não indexar — pedido não é bloqueio, e os docs nomeiam clientes e
  sub-clientes reais. Servir só o que é público. `P`

### Acessibilidade e design system
- **A logo é centralizada no cabeçalho do celular** (`Shell.tsx:41` +
  `app.css:109`): `<Marca/>` entre o botão de menu e um `<span aria-hidden/>`
  vazio, dentro de `space-between`. Quebra a regra que o `DECISIONS.md` chama de
  inegociável. Agrava: o `COMPONENT_INVENTORY.md` manda "assinatura no centro" —
  **os dois documentos se contradizem e o código seguiu o errado**. `P`
- **Dois tokens de texto reprovam em contraste** (`ui/tokens.css:34`):
  `--texto-4` = 3,58:1 e `--texto-off` = 2,58:1 sobre `--chao` (AA pede 4,5:1). O
  primeiro é a cor de toda etiqueta de indicador, em 10 px; o segundo é todo
  placeholder. `M`
- **Chip com texto branco sobre Coral e sobre Azul** (`ui/tokens.ts:37,39`):
  3,50:1 e 3,65:1 em 11 px — justo "Vencido" e "Em execução", os dois que
  precisam ser lidos de relance. Trocar o texto para `--tinta` resolve sem mexer
  no fundo. `P`
- **Célula do calendário nasce com 36 px** (`componentes.css:286`): o
  `min-height` é 44, mas a largura vem da grade — num celular de 360 px sobram
  252 px para 7 colunas, com 42 botões vizinhos. `P`

### Estados, testes e desempenho
- **Três telas mostram o erro sem saída** (`Arquivos.tsx:90`,
  `Briefings.tsx:87`, `Entregas.tsx:110`): painel vermelho sem "Tentar de novo",
  embora o componente `Erro` já receba `aoTentar` e `offline`. `P`
- **O PWA promete offline e não tem service worker**: `manifest` declara
  `standalone`, não há SW no repositório, e `ui/componentes.tsx:144` chega a
  escrever "os dados na tela são do último acesso" — promessa que nada sustenta.
  Ou implementa, ou tira a frase. `G` / `P`
- **A camada de handler das edges tem zero teste**: 1.847 linhas em nove funções;
  os 16 testes Deno cobrem só as 71 linhas de `_shared/`. Fica sem guarda o teto
  de liquidação, o `statusPorValor` e a checagem de posse do portal. `G`
- **A regra de parcela está duplicada sem trava** (`eloi-financas.ts:45` e
  `domain/financeiro.ts:164`): a única garantia é um comentário. O repositório já
  resolveu esse padrão uma vez em `ui/tokens.test.ts`, que falha se os dois
  arquivos divergirem — falta o equivalente aqui. `M`
- **A allowlist de CORS não tem teste** (`admin-auth.ts:84`), enquanto
  `avaliarTentativa` tem sete, incluindo um que impede reintroduzir o DoS. O
  mesmo cuidado não existe para impedir que um `*` volte à lista. `P`
- **Toda ação recarrega o painel inteiro** (`financas-store.tsx:79`): seis
  chamadas mais `recorrencias.gerar`, com esqueleto piscando e perda da posição
  de rolagem. Dar baixa em dez contas custa dez recargas completas. `M`
- **Nenhuma requisição é cancelável** (`api.ts:114` não aceita `AbortSignal`):
  duas setas no seletor de mês podem deixar o resultado do mês antigo na tela;
  três telas fazem `setState` depois de desmontar. `M`
- **`recorrencias.gerar` é n+1 no caminho crítico** (`eloi-financas.ts:332`): até
  24 `SELECT`+`INSERT` em série por recorrência, antes da primeira pintura. `M`
- **Nenhuma lista tem paginação**: clientes, serviços, materiais e orçamentos nem
  têm `.limit()`; transações cortam em 2000 **sem avisar a interface**. Hoje não
  dói; o desenho é o que dói. `G`

### Ferramental
- **O CI builda e joga o resultado fora** (`ci.yml:16`): nunca compara a saída
  com `app/dist`, que é o que a Vercel serve. Um `git diff --exit-code app/dist`
  depois do build fecha de vez a armadilha do "esqueci o `npm run build`". `P`
- **`npm run typecheck` não checa nada**: `tsc --noEmit` sobre um `tsconfig`
  solution-style (`"files": []` + `references`) sai 0 mesmo com erro; só o
  `build` (`tsc -b`) pega. Vale no CI também. `P`
- **O CI reimplementa os scripts** em vez de chamar `npm run verify`,
  `edges:check` e `edges:test` — divergir é questão de tempo. `P`
- **`deploy-edges.mjs` empurra e nunca confere** (`scripts/deploy-edges.mjs:31`):
  não lista o que está deployado, não compara versões e não tem `--all`. O script
  existe por causa do drift de 2026-07-27 e não resolve a detecção dele. `M`
- **`/marca/` está quebrado desde sempre** (`marca/index.html:146`): carrega
  `/assets/vendor/fflate.min.js` e o diretório `assets/vendor/` **não existe**
  [conferido]. Toda visita toma 404 e o "Baixar .zip" cai no `alert`. Colar o
  UMD (~30 KB) resolve. `P`

### Legado — o que ainda prende cada painel
- **`/gestao`** — cinco funções sem equivalente no `/admin`: `clientes.delete`,
  `servicos.delete`, `nf.upload_url`, `nf.view_url` e `entregas.list`/`delete`.
  As duas de NF são as que prendem de verdade: gravam
  `eloi_servicos.nf_arquivo_url`, que é o campo que o portal lê para mostrar a
  nota ao cliente. `clientes.gerar_senha_portal` **já migrou** — a D-11 está
  desatualizada nesse ponto. `G`
- **`/painel-orcamentos`** — `create`, `delete`, `catalog_*` e
  `servicos.from_orcamento`. `G`
- **`/painel-briefings`** — a action `create` de `briefing-links`. A D-11 não o
  lista entre os painéis com função única; lista. `M`
- **`/painel` e `/painel-ecommerce`** — falta só abrir o `raw` da resposta dentro
  do `/admin`. É a menor distância dos cinco. `M`
- **`eloi-financeiro` e as tabelas legadas** — `eloi_caixas` está órfã, mas
  `eloi_movimentos_financeiros` **não**: `eloi-gestao.ts:161` ainda a lê para
  montar o resumo de `clientes.detail`. Migrar esse resumo para `eloi_transacoes`
  é pré-requisito, e não estava registrado na D-08. `M`
- **Docs contra código, em quatro pontos verificáveis**: `ROUTE_MAP.md` não lista
  `/admin/briefings` nem `/admin/entregas`; `ARCHITECTURE.md:51`,
  `DEVELOPMENT_GUIDE.md:146` e `FEATURE_MAP.md:117` ainda dão
  `admin_login_seguranca` como o throttle vigente, contra a D-16; e o
  `COMPONENT_INVENTORY` contradiz o `DESIGN_SYSTEM` sobre a posição da logo. `M`

---

## Ordem sugerida

```
Horizonte 0   agora            ~1 dia   conserta o que já está errado
Horizonte 1   esta semana      ~4 dias  operação: sub-cliente, NF, portal da F2
Horizonte 2   próximas 2 sem.  ~6 dias  completar o painel
Horizonte 4a  junto do 2       ~1 dia   segurança: CORS, mass assignment, throttle
Horizonte 3   depois           ~5 dias  portal, proposta, briefing, site
Horizonte 4b  contínuo         —        testes, desempenho, legado, docs
```

Regra que vale para todos: **`npm run verify` antes de cada commit**,
`npm run build` sempre (o `app/dist` é o que a Vercel publica), migração aplicada
antes do deploy da edge correspondente, deploy de edge só pelo script, e as
regras de design do `CLAUDE.md` — cor de token, 44 px, cor nunca informa sozinha,
logo à esquerda, ícone do sprite.

## Duas coisas que esta auditoria NÃO cobriu

- Conciliação bancária e importação de extrato (OFX/CSV) — o núcleo financeiro
  está vazio e vai ser preenchido à mão. É `G` e fica para quando houver primeiro
  uso real. Um campo `conciliado` sozinho é `M` e já ajuda.
- Fechamento contábil de competência (travar um mês já reportado). Sem ele, um
  lançamento retroativo muda um mês fechado sem deixar rastro.
