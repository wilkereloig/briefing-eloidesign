# Changelog — ELOI Studio

Só o que muda comportamento, dado ou interface do produto. Ordem: mais recente primeiro.

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
