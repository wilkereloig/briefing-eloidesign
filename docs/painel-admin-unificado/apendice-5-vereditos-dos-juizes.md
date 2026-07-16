# Juiz 1 — ranking: Proposta A — Shell mínimo sobre o que já existe > Proposta C — Admin Unificado Multi-página com SSO Real > Arquitetura B — Admin ELOI Design Studio como SPA única

# Avaliação — Proposta A vs B vs C

Lente: o que dá mais trabalho de verdade, o que quebra primeiro em produção, o que cada proposta superestima ou subestima na própria complexidade.

## Tabela de notas (1–5)

| Critério | A — Shell mínimo | B — SPA única | C — Multi-página SSO real |
|---|---|---|---|
| 1. Fit filosofia do repo | **5** | **3** | **4** |
| 2. Esforço/risco de implementação | **5** | **2** | **3** |
| 3. Risco de migração p/ produção | **5** | **2** | **3** |
| 4. Manutenibilidade 1 pessoa | **3** | **3** | **2** |
| 5. Atende os 2 requisitos | **3** | **5** | **4** |
| **Total** | **21** | **15** | **16** |

---

## Critério 1 — Fit com a filosofia do repo

- **A (5)**: zero mudança de modelo. Cada página continua `index.html` standalone, inline, chamando edge function via fetch POST — só ganha 2 `<link>/<script>` de include e troca `password` por `token` no corpo. É literalmente o menor desvio possível da convenção descrita no briefing.
- **C (4)**: preserva "1 página = 1 arquivo standalone" por módulo, mas introduz `vercel.json` (infra que **não existe hoje** no repo) e reorganiza fisicamente pastas — desvio maior que A, mas ainda reconhecível como o mesmo padrão.
- **B (2 pontos abaixo de A, 3)**: a própria proposta admite "duas exceções deliberadas à convenção" (N módulos JS + dependência vendored) — é a que mais se afasta do modelo "HTML standalone com tudo inline". Router de hash + módulos registrados via IIFE é um padrão novo que o repo nunca teve.

## Critério 2 — Esforço/risco de implementação

- **A (5)**: diffs de 2 linhas nas functions existentes, CSS/SVG extraídos verbatim, zero reescrita de lógica de UI. É o único que consegue provar isso concretamente (diff mostrado no próprio texto).
- **C (3)**: mover pastas físicas + criar bcrypt/lockout/sessions do zero + `vercel.json` é trabalho real, mas cada página em si é só realocada, não reescrita — esforço médio.
- **B (2)**: **subestima o próprio esforço**. Vender "sem build, só N arquivos estáticos" esconde que cada módulo (`clientes.js`, `servicos.js`, `briefings.js`, `orcamentos.js`...) precisa reimplementar do zero toda a lógica de tabela/modal/filtro que hoje já existe pronta dentro de 8 HTMLs — isso é reescrever ~8 páginas de lógica de UI num formato novo (mount/unmount + router), não copiar-colar. É objetivamente o maior volume de código novo das três propostas, apesar do enquadramento "menor arquitetura".

## Critério 3 — Risco de migração para produção real

- **A (5)**: rollout página por página, cada fase revertível isoladamente, nenhuma URL de admin muda, sessão desliza sem novo mecanismo de infra. Canário (`/aplicativos/`) é a escolha certa (descarta o payload, menor blast radius possível).
- **C (3)**: fases por pasta com redirect 302→301 é um bom padrão, mas **duas coisas concretas** aumentam o risco: (1) `vercel.json` é config nova, de escopo *todo o site*, não só admin — um regex de redirect malfeito tem raio de explosão maior que qualquer edge function; (2) todo bookmark/URL de admin que Wilke já usa diariamente muda de lugar (mitigado por redirect, mas é fricção real durante a janela de transição).
- **B (2)**: **o maior furo concreto da proposta**. `eloi-admin` absorve `eloi-gestao` + `briefing-links` + ações admin de `orcamentos` num **único arquivo/função** — qualquer bug de deploy nessa função agora derruba clientes, serviços, financeiro, briefings, orçamentos e marca *ao mesmo tempo*, exatamente o risco #1 que a própria pesquisa identificou ("erro de deploy em qualquer uma quebra o financeiro, não só uma tela de teste") — e a proposta B reintroduz esse risco concentrando tudo, em vez de mitigá-lo. Além disso a Fase 5 ("admin/index.html vira de fato o shell da SPA") é um corte abrupto de entrada única — se algo quebrar no shell/router, cai o admin inteiro, não um módulo. E não há plano nenhum para os bookmarks das 8 URLs antigas (`/gestao/`, `/painel-briefings/`...) — ao contrário de C, que resolve isso com `vercel.json`.

## Critério 4 — Manutenibilidade de longo prazo (1 pessoa, sem equipe)

- **A (3)**: CSS/wordmark/auth consolidados, mas a duplicação de lógica de negócio (tabelas, modais, `recomendar()`, dicionários de rótulo) **não é tocada** — a própria pesquisa aponta essa duplicação e a proposta A simplesmente não reage a ela. Cada página continua sendo mantida individualmente para qualquer coisa além do chrome.
- **B (3)**: único ponto onde há uma promessa real de deduplicar `recomendar()`/labels ("hoje duplicados... aqui vivem em 1 arquivo só"). Mas isso é anulado por dois problemas de manutenção futura: (1) `eloi-admin` como arquivo único crescendo para conter auth+dashboard+clientes+serviços+nf+briefings+legado+orçamentos+catálogo+marca é pior para "abrir e entender rápido" do que funções pequenas por domínio; (2) **não existe ação de logout/revogação** na lista de actions do `admin-auth` (só `auth.login`) — se o token vazar, a única forma de invalidar é trocar a senha global, o que desloga Wilke de todas as abas também. Isso é um buraco funcional, não só teórico.
- **C (2)**: pior nota aqui porque adiciona **manutenção permanente não pedida**: bcrypt (`crypt`/`gen_salt('bf')`), contador de tentativas falhas, bloqueio de 15min, tabela `admin_users` com `username unique` desenhada para "não fechar a porta a um segundo admin" — tudo isso para **1 usuário confirmado, sem ameaça de força bruta real** (URL só conhecida pelo próprio Wilke). É complexidade que ele carrega para sempre sem nunca ter pedido — o exemplo mais claro de over-engineering das três propostas (viola a régua "no unrequested abstractions": ninguém pediu lockout, ninguém pediu suportar 2º admin).

## Critério 5 — Atende de verdade os 2 requisitos do Wilke

Geração de marca no navegador: **empate técnico total** — as três convergem no mesmo pipeline (Canvas API + `data:` URL + `fflate` vendorizado + upload em lote via signed URL, replicando o padrão de `nf.upload_url`). Não há diferenciação real aqui porque as três copiaram a mesma pesquisa já validada.

O diferenciador real é "painel UNIFICADO":
- **A (3)**: entrega login único e topbar compartilhada, mas a própria proposta admite "Estrutura de pastas não muda" — continua sendo 8 pastas soltas na raiz (`/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`...) com uma cabeça em comum. É unificação de *chrome*, não de *IA*. Tecnicamente atende a leitura literal mais fraca do pedido, mas é a que menos parece "um admin só" na prática de navegação — cada clique ainda é uma troca de HTML completo entre origens de pasta diferentes.
- **C (4)**: reorganiza tudo sob `/admin/<modulo>/` — namespace de URL genuinely unificado, mais fiel ao "fundir num único admin" do que A, sem pagar o custo de reescrever toda a lógica de UI em módulos JS.
- **B (5)**: é a única que entrega unificação de verdade no sentido mais forte — 1 aplicação, 1 shell, navegação sem reload, estado compartilhado entre módulos. Atende o pedido com mais fidelidade literal, ao custo do maior esforço/risco (critérios 2 e 3).

---

## Furos concretos por proposta

**Proposta A**
- Reintroduz o problema que devia resolver: o fallback `ADMIN_PASSWORD ?? "eloidesign2026"` mantém a senha vazada no histórico do git **ativa e válida no dia 1** — quem já tem a senha antiga continua gerando token novo via `admin-auth` indefinidamente. A "sessão real" não eleva a segurança até a Fase 7 (que é opcional/futura).
- Sessão desliza com `UPDATE` a cada chamada autenticada — funciona, mas contradiz o discurso de "menor diff possível": é infraestrutura nova (tabela + write por request) para um problema que B resolve sem tabela nenhuma.
- Ignora a duplicação de `recomendar()`/dicionários de rótulo já mapeada pela própria pesquisa — zero tratamento.

**Proposta B**
- Sem ação de `logout`/revogação — usuário não tem como invalidar um token vazado sem trocar a senha global (desloga todas as abas, inclusive as legítimas).
- `eloi-admin` como gateway único é o maior risco de blast radius das três: um bug num action de `marca.*` pode derrubar `clientes.*`/`servicos.*` no mesmo deploy.
- Nenhum plano para as 8 URLs antigas de admin depois do corte (Fase 5) — bookmarks quebram silenciosamente, diferente de C que resolve isso com `vercel.json`.
- Subestima o esforço real: "sem build" é verdade architeturalmente, mas esconde que é a maior reescrita de código das três.

**Proposta C**
- Bcrypt + lockout + schema multi-usuário para 1 usuário confirmado é over-engineering claro — ninguém pediu, e é manutenção que Wilke carrega sozinho para sempre sem ganho real de segurança prático (o vetor de ataque que isso mitiga praticamente não existe aqui).
- `vercel.json` é a única peça de infra das três que tem escopo *todo o site*, não só `/admin/` — maior superfície de erro de configuração do que qualquer edge function.
- Função `marca` nova e isolada, inconsistente com o próprio padrão da proposta de estender funções existentes (`eloi-gestao`, `briefing-links`, `orcamentos` são todas estendidas in-place; só `marca` vira função nova sem justificativa).
- Move fisicamente todas as URLs de admin que Wilke já usa hoje — fricção de hábito real durante a transição, mesmo com redirect.

---

## Veredito

**A vence com folga** em esforço, risco de migração e fit com a filosofia (é a leitura mais "lazy" no bom sentido: reusa 100% do que já existe, entrega sessão real e módulo de marca sem reescrever nada que já funciona) — mas é a mais fraca nas 2 exigências centrais do briefing porque "unificado" nela significa só chrome compartilhado, não fusão de fato.

**C fica em segundo**: unifica IA de verdade (`/admin/<modulo>/`) sem pagar o preço de reescrever toda a lógica de UI como B, mas carrega bcrypt/lockout/multi-admin que ninguém pediu e introduz `vercel.json` como novo vetor de risco de infraestrutura de todo o site.

**B fica em terceiro**: é a que mais entrega o requisito literal de "painel único", mas é a mais cara e a mais arriscada de construir e de colocar em produção — gateway monolítico, sem logout, sem plano de bookmark — o tipo de proposta que parece elegante no papel e concentra o maior risco operacional no dia do corte final.

Se o critério de desempate for "o que Wilke consegue construir e colocar no ar sozinho com menor chance de quebrar o financeiro real", A é a resposta certa, com C como evolução natural (herda a estrutura de pastas unificada de C, mas com a auth simples de A/B, sem bcrypt/lockout) se algum dia quiser ir além do shell mínimo.


---

# Juiz 2 — ranking: Proposta A — Shell mínimo sobre o que já existe > Arquitetura B — Admin ELOI Design Studio como SPA única > Proposta C — Admin Unificado Multi-página com SSO Real


# Avaliação — 3 propostas de admin unificado ELOI Design Studio

Lente: Wilke sozinho, sem time, precisando abrir isso daqui 1 ano e ainda entender o que fez. Ceticismo declarado contra over-engineering.

## Notas por critério (1-5)

| Critério | A — Shell mínimo | B — SPA única | C — Multi-página SSO real |
|---|---|---|---|
| 1. Fit com filosofia do repo (estático, sem build, 1 dev) | **5** | **3** | **3** |
| 2. Esforço/risco de implementação | **5** | **2** | **1** |
| 3. Risco de migração pra produção real | **5** | **3** | **2** |
| 4. Manutenibilidade solo de longo prazo | **5** | **3** | **1** |
| 5. Atende os 2 requisitos literais do Wilke | **3** | **5** | **5** |
| **Total (0-25)** | **23** | **16** | **12** |

## Justificativas

### Critério 1 — Fit com a filosofia do repo
- **A (5)**: zero mudança de arquitetura. Continua sendo "8 index.html standalone + fetch cru", só ganha 2 arquivos compartilhados (CSS/JS) incluídos por `<script>/<link>`. É literalmente o padrão que já existe, só desduplicado.
- **B (3)**: troca "página = arquivo" por SPA com hash-router + sistema de módulos registrados. Não usa bundler (mérito), mas introduz uma camada de indireção (dispatch de rota, `AdminApp.registerModule`) que o repo nunca teve. É código novo de infraestrutura, não só de tela.
- **C (3)**: estrutura de pastas (`/admin/<modulo>/`) ainda é multi-página, mais fiel à convenção que B nesse eixo — mas o back-end de auth (bcrypt, lockout, tabela de sessão com hash e revogação) é um salto de sofisticação que não tem nenhum precedente no repo, que hoje é "compara string em texto claro". É a peça que menos parece "ELOI Design Studio" das três.

### Critério 2 — Esforço/risco de implementação
- **A (5)**: diff menor possível — 1 tabela nova, 1 função nova pequena, 2 linhas trocadas em cada função existente, CSS/SVG extraídos verbatim. Fases pequenas e independentes, cada uma revertível sozinha.
- **B (2)**: precisa reimplementar a lógica de negócio inteira de `eloi-gestao` e `briefing-links` dentro de um gateway novo (`eloi-admin`), mais dividir `orcamentos` em duas responsabilidades, mais construir router/módulos/HMAC do zero. É reescrita de superfície grande com risco real de drift de comportamento (bug sutil ao portar `clientes.upsert`/`nf.upload_url`, etc.).
- **C (1)**: soma tudo que B faz (várias functions tocadas) com uma camada extra: schema de auth com hashing de senha + política de lockout + tabela de sessão com revogação, MAIS reorganização de URLs de todas as páginas com redirects no `vercel.json`. É a proposta com mais peças móveis das três — mais SQL, mais funções, mais paths mudando.

### Critério 3 — Risco de migração pra produção real
- **A (5)**: fase 0 é 100% aditiva (nada existente muda de comportamento até o Wilke decidir trocar uma função por vez). Canário escolhido é a página de menor risco (`/aplicativos/`, que já descarta o payload). Financeiro (`eloi-gestao`) só é tocado depois de validar o padrão em algo sem dado sensível.
- **B (3)**: roda em paralelo com fallback, o que mitiga bem — mas o gateway novo replica lógica de `eloi_clientes`/`eloi_servicos`/upload de NF (dado financeiro real, 1 cliente já cadastrado) numa reescrita completa antes de trocar a porta de entrada. Mais superfície pra um bug de paridade escapar do QA manual de 1 pessoa.
- **C (2)**: além do mesmo risco de portar lógica, ainda soma migração de URL (bookmarks/atalhos do próprio Wilke quebram até os redirects 301 assentarem) e uma migration de auth com hashing de senha semeada — mais uma coisa que pode sair errada na primeira vez que roda contra o projeto real.

### Critério 4 — Manutenibilidade solo de longo prazo
- **A (5)**: modelo mental não muda — "abro o arquivo da tela que preciso, ele fala com a function de sempre". O único conceito novo é 1 helper de auth. Muito baixo custo de re-aprendizado daqui 1 ano.
- **B (3)**: ganha menos arquivos on the fim (bom), mas troca por mais indireção — router por hash, módulos que se auto-registram, token stateless cuja regra de invalidação (`chave = sha256(senha)`) é elegante só até o dia em que o Wilke esquecer por que trocar a senha derrubou todas as sessões. Sustentável, mas exige entender um mecanismo, não só ler um arquivo.
- **C (1)**: é aqui que o over-engineering pesa mais. `admin_users` com `failed_attempts`/`locked_until`, hashing bcrypt via pgcrypto, tabela de sessão com hash+revogação+refresh — tudo desenhado para um cenário multi-usuário com ameaça de força bruta que **não existe**: é 1 admin, o próprio dono da agência. Daqui 1 ano, se a conta "travar" (`locked_until`) ou uma sessão precisar ser revogada, o Wilke vai precisar entender/rodar SQL manual em mecanismo de segurança que ele mesmo não pediu. É exatamente o tipo de complexidade que ele vai pagar sozinho, sem benefício real proporcional — a proposta até reconhece isso na seção "YAGNI" mas constrói de qualquer forma.

### Critério 5 — Atende os 2 requisitos literais (painel unificado + marca 100% navegador)
- **A (3)**: o requisito de marca é atendido igual às outras (Canvas API + fflate, sem terminal). O requisito de unificação é onde A é mais fraco no texto: a própria proposta diz "nenhuma página muda de lugar" — o que entrega é login único + navegação/visual único sobre 8 URLs que continuam soltas, não uma fusão real de admin. Resolve boa parte da dor prática (parar de digitar senha 5x, 401 tratado igual em todo lugar), mas não é literalmente "fundir num único admin" como o Wilke pediu.
- **B (5)**: entrega unificação de verdade — 1 entry point, 1 shell, 1 router, todas as telas como módulos da mesma SPA. É a leitura mais literal do requisito 1. Marca também plenamente atendida.
- **C (5)**: também entrega fusão real, via namespace único `/admin/*` com redirects aposentando as URLs antigas — resultado final é tão unificado quanto B, só que multi-página em vez de SPA. Marca igualmente completa.

## Síntese pela lente do Wilke sozinho

As três convergem no pipeline de marca (Canvas API + fflate + bucket público) — não há diferença real de risco ali, então o desempate é todo sobre autenticação/arquitetura do admin.

- **C perde por over-engineering objetivo**: construir hashing de senha com política de lockout e tabela de sessão revogável para um usuário único é resolver uma ameaça (força bruta contra múltiplas contas) que não existe neste negócio. É mais SQL, mais funções, mais URLs migrando, e o item que mais provavelmente vira "aquele código que ninguém mexe porque dá medo" daqui a um ano.
- **B é a proposta tecnicamente mais alinhada ao pedido literal** ("virar 1 admin"), com uma solução de sessão (HMAC stateless) que é mais lazy que a de C — mas paga isso com a maior reescrita de lógica de negócio das três (gateway novo replicando `eloi-gestao`/`briefing-links`), que é onde mora o dado financeiro real do cliente já cadastrado.
- **A é o caminho que um agência-de-1-pessoa consegue de fato operar e evoluir**: menor diff, menor risco de produção, fases revertíveis, e o custo é "aceitar" que a fusão fica mais próxima de um SSO com casca visual comum do que de um app único — o que, na prática de uso diário (login 1x, navegar sem re-digitar senha, 401 tratado igual em qualquer tela), cobre a maior parte da dor que motivou o pedido, mesmo não sendo a leitura mais literal do texto "fundir num único admin".

Se o Wilke confirmar que quer a fusão *literal* de UI (não só login/nav comum), a recomendação prática seria pegar a Fase 0-3 de A como base de baixo risco e, só depois de estabilizada, avaliar se vale evoluir pro roteador de B — nunca partir direto pra C.


---

# Juiz 3 — ranking: Proposta A — Shell mínimo sobre o que já existe > Proposta C — Admin Unificado Multi-página com SSO Real > Arquitetura B — Admin ELOI Design Studio como SPA única

## Veredito rápido

Olhando só pela lente de continuidade de negócio (não quebrar o que um cliente real já usa durante a transição), a ordem é clara: **A é a mais segura e mais incremental, C fica no meio, B é a mais "big bang" e a única que mexe estruturalmente numa função que serve link público real (`orcamentos`)**.

O ponto decisivo que separa as três: **as 3 propõem exatamente a mesma migração de `entregas-marca` para bucket público** (mesmo risco nessa frente, herdado da pesquisa) e **as 3 preservam os 4 fluxos públicos por token/share_token sem editar `briefing-submit`** — aí não há diferença. A diferença real está em *como* cada uma toca a função `orcamentos` (que hoje serve tanto o admin quanto `/orcamento/?t=<token>` já em posse de clientes) e em *quão grande é o passo* antes de cada proposta ter algo funcional no ar.

---

## Notas por critério (1-5)

| Critério | Proposta A (shell mínimo) | Arquitetura B (SPA única) | Proposta C (multi-página + SSO real) |
|---|---|---|---|
| 1. Fit com filosofia do repo | **5** | 3 | 4 |
| 2. Esforço/risco de implementação | **5** | 2 | 3 |
| 3. Risco de migração pra produção real | **5** | 2 | 4 |
| 4. Manutenibilidade de longo prazo (1 pessoa) | 4 | 3 | 4 |
| 5. Atende os 2 requisitos de verdade | 3 | **5** | 4 |
| **Total** | **22** | 15 | 19 |

---

## Justificativa por critério

### 1. Fit com a filosofia do repo
- **A (5)**: zero mudança estrutural — mesmas pastas, mesmas functions, só troca 2 linhas de auth por function + injeta 2 arquivos de shell. É literalmente "o menor diff possível", o oposto de over-engineering.
- **B (3)**: introduz router de hash, sistema de módulos `modules/*.js`, e a primeira dependência client-side do site (`fflate` vendored). Ainda sem build step, mas é um padrão novo (SPA) num repo que hoje é "8 HTML standalone".
- **C (4)**: mantém multi-página (cada módulo seu `index.html`), mas troca "comparar string em texto claro" por um mecanismo de sessão real com `admin_users`/hash bcrypt/lockout — mais máquina do que o padrão atual do repo pede para 1 usuário único.

### 2. Esforço/risco de implementação
- **A (5)**: menor esforço absoluto — 1 function nova pequena, helper de 15 linhas, 2 arquivos de shell, diff de 2 linhas em 5 functions existentes.
- **B (2)**: maior esforço — SPA inteira (router, 7 módulos, gateway `eloi-admin` absorvendo 3 functions, HMAC stateless) precisa nascer funcionalmente completa antes de virar a porta de entrada.
- **C (3)**: esforço intermediário-alto — schema novo de auth (2 tabelas, bcrypt, lockout), reorganização de paths com redirects, mas cada módulo ainda é incremental/independente como em A.

### 3. Risco de migração pra produção real — o critério mais importante para esta tarefa
- **A (5)**: nunca toca estrutura de nenhuma function pública; `orcamentos` e `briefing-submit` não são editadas; a troca de senha por token tem **fallback = valor atual** (`ADMIN_PASSWORD ?? "eloidesign2026"` — zero mudança de comportamento no dia 1); rollout é canário explícito começando pela página de menor blast radius (`/aplicativos/`, que já descarta o payload de briefings). Totalmente revertível arquivo por arquivo.
- **B (2)**: **divide a função `orcamentos` em duas** — a função pública (`public_get`, servindo `/orcamento/?t=<share_token>` já enviado a clientes reais) e o gateway novo `eloi-admin` (que absorve list/create/update/delete/catalog_*). Isso é cirurgia estrutural numa function que um cliente pode acessar a qualquer momento, não só um swap de linha de auth — é o único dos três que faz isso. Mitiga parcialmente com fallback de páginas antigas no ar durante o QA e com teste em slug fake antes de tocar `georgia-andrade` real (Fase 4) — mas o corte final da Fase 5 (virar `/admin/index.html` a porta de entrada de verdade) ainda é um ponto único de "big bang" depois que tudo precisa estar pronto.
- **C (4)**: mantém `orcamentos` como **uma função só**, com o mesmo padrão seguro de A (swap de auth inline, `public_get` "inalterada" dentro da mesma function) — não faz o split de B. Move paths de admin (`/gestao/` → `/admin/servicos/` etc.) mas isso não afeta nenhum link já em posse de cliente, só bookmarks do próprio Wilke, e usa redirects nativos do Vercel. Perde pontos porque (a) o mecanismo de sessão é bem mais pesado que A/B (senha vira hash bcrypt, lockout de 10 tentativas/15min — mais superfície pra um bug travar o próprio Wilke fora do painel) e (b) **não tem uma fase dedicada de testar a migração de `entregas-marca` num slug fake antes de tocar o cliente real `georgia-andrade`**, diferente de B que explicita esse cuidado.

### 4. Manutenibilidade de longo prazo pra 1 pessoa
- **A (4)**: simples de entender, mas mantém 8 páginas com HTML/JS ainda parcialmente duplicado por página (só CSS/wordmark/auth saem para arquivo comum).
- **B (3)**: mais DRY de fato (1 gateway, 1 shell), mas router + módulos + HMAC stateless são mais peças pra 1 pessoa lembrar quando algo quebra às 3h.
- **C (4)**: módulos continuam simples de depurar isoladamente (cada um seu HTML), sessão em tabela é fácil de inspecionar via SQL direto — mas o mecanismo de auth em si (hash/salt/lockout) é mais código pra manter do que o de A.

### 5. Atende de verdade os 2 requisitos do Wilke
- **A (3)**: tecnicamente entrega "1 login, 1 visual, 1 sessão" mas **as pastas continuam soltas** (`/gestao/`, `/painel-briefings/`, `/painel-orcamentos/` continuam existindo como URLs separadas) — o pedido foi "fundir... num único admin", e A funde a casca, não a estrutura. Geração de marca 100% navegador: atendido igual às outras duas.
- **B (5)**: é a única que literalmente "funde" — 1 `admin/index.html`, 1 app, rotas por hash. Atende o requisito ao pé da letra. Marca 100% navegador: atendido.
- **C (4)**: fica no meio — 1 namespace `/admin/*`, 1 login, 1 nav compartilhada, mas ainda N arquivos `index.html` por módulo (mais "fundido" que A porque reorganiza sob 1 prefixo com redirects, menos "fundido" que B porque não é 1 app). Marca 100% navegador: atendido.

---

## Big bang vs incremental — o que realmente importa aqui

- **A é a mais incremental possível**: cada fase troca 1 coisa (1 tabela nova → 1 function nova não referenciada → 1 canário de baixo risco → rollout page-by-page). Nunca existe um momento em que "tudo precisa funcionar de uma vez". Se qualquer fase falhar, reverte só ela.
- **C é incremental na entrega mas fez um investimento estrutural maior de uma vez (Fase 0)**: cria 2 tabelas + mecanismo de sessão completo antes de qualquer módulo novo existir. Depois disso, o rollout por módulo é parecido com A/B (paralelo, com fallback). O ponto de risco concentrado é a Fase 0 (auth) e a ausência de um "slug de teste" documentado para a migração de `entregas-marca`.
- **B é a mais "big bang" das três**, apesar do discurso de fases: a Fase 2 exige a SPA já ter shell+auth+clientes+serviços funcionando para começar o QA; a Fase 5 ("troca da porta de entrada") é um corte único; e o split da função `orcamentos` é uma mudança estrutural (não incremental) na única function que serve um link público já mandado pra cliente.

## Ranking final

1. **Proposta A** — menor risco de quebrar algo que cliente real já usa, menor esforço, mais alinhada à filosofia do repo. Perde pontos só por entregar uma "unificação" mais cosmética que estrutural — mas para a lente pedida (continuidade de negócio), é a escolha mais segura.
2. **Proposta C** — atende melhor o espírito de "painel único" que A, sem tocar na função pública `orcamentos` de forma estrutural (mesmo padrão seguro de A ali), mas paga esse ganho com um mecanismo de auth desproporcional para 1 usuário único e sem uma fase explícita de teste seguro para a migração de `entregas-marca/georgia-andrade`.
3. **Arquitetura B** — a que melhor cumpre a letra do requisito "admin unificado", mas é a mais arriscada das três: divide a função `orcamentos` que atende clientes reais agora, exige o maior "big bang" final (troca da porta de entrada só funciona se a SPA inteira já estiver pronta), e é a que mais se afasta da filosofia "site estático simples, 1 dev".
