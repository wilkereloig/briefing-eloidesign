# Changelog — ELOI Studio

Só o que muda comportamento, dado ou interface do produto. Ordem: mais recente primeiro.

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
