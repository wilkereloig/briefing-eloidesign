# Relatório de Limpeza — 2026-08-05

Auditoria completa, renomeação para **ELOI Studio** e reorganização da estrutura.
O motivo de cada decisão está em [DECISIONS.md](DECISIONS.md).

Ponto de restauração: tag git `pre-auditoria-eloi-studio` (commit `23c2857`).

---

## Antes → depois

```
ANTES                              DEPOIS
─────────────────────────────      ─────────────────────────────
CONTEXT.md                         docs/GLOSSARY.md
SITEMAP.md                         docs/ROUTE_MAP.md
db/                                database/migrations/
docs/superpowers/                  docs/historico/superpowers/
docs/painel-admin-unificado/       docs/historico/painel-admin-unificado/
docs/2026-07-27-diagnostico…       docs/historico/2026-07-27-diagnostico…
admin-app/                         (removido — redirect 301 para /admin)
assets/fonts/                      (removido)
—                                  README.md
—                                  CLAUDE.md
—                                  package.json  (scripts na raiz)
—                                  .env.example
—                                  deno.json
—                                  docs/PROJECT_MAP.md e mais 7 mapas
```

## Arquivos removidos (25)

### `admin-app/` — 22 arquivos
SPA React 18 substituída por `app/` (React 19). **Prova de que estava morta:**
as únicas referências no repositório eram os próprios rewrites do `vercel.json`;
nenhum HTML, JS, CSS, manifest ou script apontava para ela. Nunca foi enviada a
ninguém de fora. Duplicava `api.ts` e `types/domain.ts` com bugs de campo que já
tinham sido corrigidos no `app/`.

`vercel.json` agora **redireciona** `/admin-app*` → `/admin` com 301, em vez de
404 — link antigo continua funcionando.

### `assets/eloi-admin/periodo.js`
Zero consumidores. Perdeu o único (`admin/index.html`, o hub estático) quando ele
saiu do repositório. Verificado no navegador depois da remoção: `/gestao/` carrega
`admin.css`, `auth.js`, `nav.js`, `pagenav.js` e `wordmark.svg` — nunca pediu o `periodo.js`.

### `assets/fonts/Juturu-VariableVF.woff`
Zero referências em todo o repositório: nenhum `@font-face`, `<link>`, `url()`,
`font-family` ou manifest. As fontes em uso são Archivo e Manrope, por Google Fonts.

**Recuperáveis pelo git** se aparecer algum uso dinâmico não previsto.

## Arquivos movidos / renomeados

| De | Para | Motivo |
|---|---|---|
| `SITEMAP.md` | `docs/ROUTE_MAP.md` | Documentação na raiz por acidente histórico |
| `CONTEXT.md` | `docs/GLOSSARY.md` | Idem; o nome novo diz o que é |
| `db/` | `database/migrations/` | Nome de duas letras não diz se é schema, seed ou consulta |
| `docs/superpowers/` | `docs/historico/superpowers/` | Registro, não documentação viva |
| `docs/painel-admin-unificado/` | `docs/historico/…` | Idem |
| `docs/2026-07-27-diagnostico-reorganizacao.md` | `docs/historico/…` | Idem |

Referências atualizadas: 4 comentários em código-fonte (`projeto.ts`,
`dinheiro.ts`, `tipos.ts`, `Projetos.tsx`, `financeiro.ts`, `FolhaTransacao.tsx`),
`app/README.md`, `docs/adr/0001`, `eloi-handoff/README.md`,
`eloi-handoff/prompts/CLAUDE_CODE_CONTEXT.md`, `docs/ROUTE_MAP.md` e o cabeçalho
de 6 migrações SQL.

Documentos históricos **não** foram reescritos: um registro corrigido para
combinar com o presente deixa de ser registro. `docs/historico/README.md` avisa
que os caminhos ali são os da época.

## Consolidado

### Tokens do sistema visual
`app/src/ui/tokens.css` e `eloi-handoff/design-tokens/variables.css` **os dois se
declaravam "fonte única"** — e já tinham divergido: `--margem`, `--gap-grade` e
`--padding-card` existiam só no lado do app.

- Valores sincronizados.
- Cabeçalhos corrigidos: um diz que é a fonte, o outro que é espelho.
- **Trava nova:** `app/src/ui/tokens.test.ts` compara os dois arquivos (CSS e TS)
  e falha se divergirem.

As duas cópias continuam existindo de propósito — `eloi-handoff/` é um pacote
entregável que precisa funcionar sozinho fora do app. Ver DECISIONS D-06.

### Scripts
Antes: só `app/package.json`, sem `typecheck`. Agora `package.json` na raiz
padroniza tudo (`dev`, `build`, `lint`, `typecheck`, `test`, `edges:check`,
`edges:test`, `edges:deploy`, `verify`), delegando ao `app/`.

## Correções feitas durante a auditoria

| Achado | Correção |
|---|---|
| **`deno check` quebrado** — `jsr:@supabase/supabase-js@2` passou a puxar `npm:@supabase/realtime-js` como tipo, e o CI roda esse comando | `deno.json` com `nodeModulesDir: "auto"`. **Nenhum arquivo de edge function foi tocado**, para não criar divergência entre repo e produção |
| **Lint linta o `dist/`** — 1091 avisos vindos do build commitado escondiam qualquer aviso real | `ignorePatterns: ["dist/**"]` no `.oxlintrc.json` |
| **25 avisos crônicos de `react/only-export-components`** em arquivos que sempre vão misturar (router, store, contexto de acesso) — lint que sempre reclama para de ser sinal | Regra desligada só nesses 3 arquivos, via `overrides`. **Saída do lint agora é zero** |
| **Hex solto em `.tsx`** — `'#7D2AE8'` duas vezes em `folhas.tsx`, contra a regra do próprio sistema | Passou a usar `corCliente[0]` de `ui/tokens.ts` |
| **`<Marca complemento>`** com união `'Design' \| 'Studio'` e nenhum chamador passando o valor — parâmetro morto que convidava a marca a sair escrita de dois jeitos | Prop removida; o componente escreve "ELOI Studio" |
| `ROUTE_MAP` dizia `viewBox 0 0 750.94 177.34` e `.cls-1` branco no wordmark | O arquivo real é `0 0 540.45 348` com `--logo-1`/`--logo-2`. Corrigido |
| `.gitignore` sem `node_modules/` nem `.env` | Ambos adicionados, com comentário por seção |
| `admin-app/node_modules` (70 MB) sobrando no disco após o `git rm` | Removido |

## Renomeação para ELOI Studio

Aplicado em 30 arquivos: títulos das 15 páginas, `manifest.json`,
`app/public/manifest.webmanifest`, `app/index.html`, `package.json`,
componente `<Marca />`, `alt`/`aria-label` de logo, rodapés, template de entrega
de marca, guias do handoff e toda a documentação.

**Não renomeado, de propósito:** tabelas `eloi_*`, edge functions, buckets,
domínio, repositório GitHub, variáveis de ambiente e a pasta local. São
identificadores externos — renomear exige migração coordenada e não traz clareza.

**Não renomeado por integridade:** `entregas-marca/georgia-andrade/` credita
"ELOI Design". É entrega já feita, com PDF e .zip que o código não edita; mudar
só o HTML dessincronizaria a página do material que o cliente baixou.

**Limitação real:** o wordmark desenhado (`assets/eloi-admin/wordmark.svg`) ainda
letra "ELOI Design Studio". São curvas de SVG, não texto — re-letrar é trabalho de
design. Todo o texto ao redor já diz "ELOI Studio".

## Documentação criada

`README.md` · `CLAUDE.md` · `.env.example` · `docs/PROJECT_MAP.md` ·
`docs/ARCHITECTURE.md` · `docs/FEATURE_MAP.md` · `docs/DATA_MODEL.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/FILE_INVENTORY.md` · `docs/DECISIONS.md` ·
`docs/DEVELOPMENT_GUIDE.md` · `docs/CLEANUP_REPORT.md` (este) ·
`docs/historico/README.md`

Atualizados: `docs/ROUTE_MAP.md`, `docs/GLOSSARY.md`, `CHANGELOG.md`,
`app/README.md` e o `CLAUDE.md` da pasta-mãe `ELOI SITES/` (que apontava para
arquivos que mudaram de lugar e agora aponta para a documentação do repositório
em vez de duplicá-la).

## Mantido de propósito

| Item | Por quê | Condição para sair |
|---|---|---|
| `edge-functions/eloi-financeiro.ts` | **Continua deployada no Supabase (v2).** Apagar o fonte deixaria produção com função sem código versionado | Retirar do Supabase primeiro |
| Tabelas `eloi_caixas`, `eloi_movimentos_financeiros` | Alvo da função acima | Depois de removê-la |
| `/gestao/` | **Único lugar** que gera senha do portal | `/admin` cobrir isso |
| `/painel-orcamentos/` | **Único lugar** que cria e edita proposta | `/admin/projetos` cobrir isso |
| `/painel-briefings/` | Único lugar que gera convite de briefing | `/admin/briefings` cobrir isso |
| `/painel/`, `/painel-ecommerce/` | Leem os briefings antigos sem token | Migrar a leitura |
| `/orcamento-inteligente/` | Redirect; o link pode ter sido compartilhado | Nunca — custa 1 arquivo |
| `orcamento-precampanha/` e `/cliente/` | Duas páginas com ~30 linhas de diferença. São propostas já enviadas a cliente | Unificar exigiria mudar URL de link já compartilhado |
| `docs/historico/` | Explica o porquê de meia dúzia de decisões | Nunca |
| `app/src/` por camada | Estrutura clara, testes assumem, nenhum arquivo órfão | Quando houver um 2º produto dentro de `app/` |
| `entregas-marca/georgia-andrade/` | Entrega feita, com PDF e .zip inalteráveis | Nunca |

## Validação executada

| Verificação | Resultado |
|---|---|
| `npm run lint` | **Zero avisos** (era 1091) |
| `npm run typecheck` | Limpo |
| `npm test` | **76 testes, 7 arquivos — todos passam** (era 74) |
| `npm run build` | `✓ built in 168ms`, `dist/` recommitado |
| `npm run edges:check` | 10 funções verificadas — **passa** (estava quebrado) |
| `npm run edges:test` | 9 testes, 0 falhas |
| Painel em build de produção | Console **completamente limpo** |
| 12 rotas a 375 px | **Zero** rolagem horizontal, **zero** alvo de toque < 44 px |
| Rota inexistente | Renderiza "não encontrada" dentro do shell |
| Edge `eloi-financas` `bootstrap` | 200, payload íntegro |
| `/` e `/gestao/` estáticos | Console limpo, todos os assets 200, marca renomeada |
| `periodo.js` após remoção | Nenhuma requisição — confirmado morto |

## O `package.json` na raiz quebrou o deploy (e o conserto)

O primeiro push desta auditoria **falhou nos dois projetos Vercel**. Causa: criar
`package.json` na raiz fez a Vercel detectar projeto Node e tentar
`npm install && npm run build`. A raiz não declara dependência nenhuma e o build
mora em `app/`, então o comando quebrou.

Conserto: `vercel.json` passou a declarar explicitamente o que sempre foi verdade
neste repositório — `framework: null`, sem `installCommand`, sem `buildCommand`,
`outputDirectory: "."`. Antes isso vinha por detecção automática; agora está
escrito, e um arquivo novo na raiz não muda mais o comportamento do deploy.

Verificado depois do conserto: status de deploy `success` nos dois projetos.

## Verificado em produção

| Verificação | Resultado |
|---|---|
| `/admin` | Título e assinatura "ELOI Studio"; painel monta com a sessão |
| Nenhum "ELOI Design" no DOM | Confirmado em `/admin` e em `/` |
| `/admin-app/clientes` | Redireciona para `/admin` (200 no destino) |
| `manifest.webmanifest` | `name: "ELOI Studio"`, `scope: "/admin"` |
| `/` (landing) | Título e `alt` do logo renomeados, assets 200 |
| Console e rede | Limpos — o único 403 foi o desafio de bot da Vercel, disparado pela minha própria sondagem por `curl`, e some na requisição seguinte |

## Não verificado

- **Login com a senha real** — não a tenho. O formulário e o tratamento de erro
  foram exercitados; a checagem da senha em si, não.
