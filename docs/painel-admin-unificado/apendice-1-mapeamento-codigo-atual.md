## Correção crítica ao "AVISO IMPORTANTE" — leia antes de planejar

O `list_tables` (schema `public`, projeto `nlamznxoocmygfvnqcns`) mostra que **as 4 tabelas apontadas como "vazias/inexistentes" já existem em produção**, com RLS ativo e schema batendo exatamente com o código das edge functions:

| Tabela | Existe? | Linhas | RLS |
|---|---|---|---|
| `briefing_links` | ✅ sim | 0 | on |
| `orcamentos` | ✅ sim | 0 | on |
| `briefings` | ✅ sim | 0 | on |
| `ecommerce_briefings` | ✅ sim | 0 | on |
| `catalogo_servicos` (não citada no aviso) | ✅ sim | 0 | on |
| `eloi_clientes` | ✅ sim | **1** | on |
| `eloi_servicos` | ✅ sim | 0 | on |

Ou seja: só a parte "vazias" procede — nenhuma está inexistente, nenhuma precisa de `apply_migration` de recriação de schema. Não sei se o projeto foi restaurado/repopulado entre o momento do aviso e agora, mas **não recrie essas tabelas** — o plano de unificação pode partir do schema real abaixo sem risco de sobrescrever nada.

Também vale notar: o mesmo projeto Supabase hospeda ~15 tabelas de um produto totalmente diferente (ELOI Financeiro — `workspaces`, `clients`, `services`, `transactions`, `categories`, `cards`, `recurrences`, `budgets`, `shared_expenses/participants/charges`, `invites`, `workspace_members`, `monthly_goals`, `push_subscriptions`, `app_secrets`). **`clients` e `services` (Financeiro) são nomes perigosamente parecidos com `eloi_clientes`/`eloi_servicos` (site)** — qualquer SQL/migration futura do admin unificado precisa apontar explicitamente para as tabelas `eloi_*`, nunca para essas.

## Achado transversal mais importante: as 5 "senhas separadas" já são 1 senha só

Toda edge function relevante ao admin hardcoda **a mesma string literal** `PASSWORD = "eloidesign2026"`, cada uma na sua própria constante:

- `briefing-links/index.ts`
- `orcamentos/index.ts`
- `get-briefings/index.ts`
- `get-ecommerce-briefings/index.ts`
- `eloi-gestao/index.ts`

(`briefing-submit` é a única sem senha — corretamente pública, protegida por token, é o endpoint que o *cliente* usa pra enviar a resposta do briefing.)

E toda página admin lê/grava a **mesma chave** `sessionStorage['eloi_pw']`, no mesmo origin. Resultado prático: hoje, se o Wilke loga em `/gestao/` e depois clica em "← Admin" → `/painel-orcamentos/`, o auto-login (`if(saved){...entrar()}`) já succede silenciosamente, sem novo prompt — porque é a mesma senha comparada em 5 lugares diferentes. **A "sessão unificada" já existe de fato, só não está desenhada como tal** (é 1 segredo copiado 5x em vez de 1 fonte única). Isso baixa bastante o risco de unificar login — o trabalho é sobretudo consolidar em 1 função de auth e 1 UI shell, não inventar um mecanismo novo.

## Inventário por página

### `/admin/` — hub (238 linhas, sem edge function própria)
- Gate: `sessionStorage.eloi_pw`. `entrar()` (linha 164-170) **não tem função própria** — valida a senha chamando `briefing-links` `{action:'list'}`; depois (`loadOrcs()`, 171-175) chama `orcamentos` `{action:'list'}` de novo, só pra montar o dashboard (funil, métricas, atividade recente) client-side juntando as duas respostas.
- Só linka pra `/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/orcamento-inteligente/`, `/aplicativos/`. `/painel/` e `/painel-ecommerce/` (legados) não têm card aqui, mas continuam publicamente roteáveis com o mesmo gate.

### `/gestao/` — clientes + serviços + financeiro (464 linhas) — edge fn `eloi-gestao`
- Gate: `sessionStorage.eloi_pw`. `entrar()` chama `dashboard.stats`; **único painel com wrapper `api()` (linha 243-251) que auto-limpa a sessão e recarrega em qualquer 401**, não só no login — padrão mais robusto do conjunto.
- Actions expostas: `clientes.list`, `clientes.upsert`, `clientes.delete` (bloqueia se cliente tem serviços), `servicos.list` (filtros cliente_id/status_execucao/pago/mes), `servicos.upsert`, `servicos.delete`, `nf.upload_url` (signed upload no bucket privado `eloi-notas`), `nf.view_url` (signed read, expira em 120s), `dashboard.stats`.
- Tabelas: `eloi_clientes`, `eloi_servicos` (as únicas com `.sql` local, em `db/eloi-gestao.sql`).
- O modal de cliente (linhas 212-235, 406-409) já tem os campos `marca_slug`/`marca_publicada` e um botão "🔗 link marca" que copia `/entregas-marca/<slug>/` — é a **única** superfície de UI hoje que liga `eloi_clientes` à pasta de entregas de marca.

### `/painel-briefings/` — briefings via token (354 linhas) — edge fn `briefing-links`
- Gate: `sessionStorage.eloi_pw`; `carregar()` (227-233) só faz `.catch()` genérico, não distingue 401 de erro de rede, e chamadas subsequentes (`gerar()`) não tratam 401 de forma alguma.
- Actions: `create` (insere cliente/tipo, retorna token), `delete` (por token), default `list`.
- Gera links para 4 tipos de formulário (`briefing`, `briefing-ecommerce`, `briefing-solarium`, `briefing-guia-viver-bem`) via mapa `TIPO_PATH`.
- Tabela: `briefing_links` (respostas chegam via `briefing-submit`, função pública separada, que faz `update` por `token`).
- ~90 linhas de dicionários de rótulos (VE/LE/SE para e-commerce, VV/LV/SV para identidade visual) e a função `recomendar()` (scoring de "migrar vs manter plataforma", linhas 299-316) estão **duplicadas quase byte a byte** em `/painel-ecommerce/`.

### `/painel/` — legado, sem card no hub (435 linhas) — edge fn `get-briefings`
- Gate: `sessionStorage.eloi_pw`; `login()` posta `{password}` **sem `action`** — a função ignora qualquer `action` e sempre faz `select * from briefings`.
- Tabela: `briefings` (colunas fixas q1-q18 + `raw` jsonb + `numero` identity) — schema diferente do `briefing_links.raw` usado pelo fluxo novo.
- Tem funcionalidades que não existem em nenhum outro painel: mapa de nome de cor por hex (`COLOR_NAMES`, ~30 entradas), gerador de "Pendências e pontos a confirmar", gerador de brief em texto livre pra IA, botão imprimir/PDF.

### `/painel-ecommerce/` — legado, sem card no hub (305+ linhas) — edge fn `get-ecommerce-briefings`
- Mesmo padrão do `/painel/`: posta `{password}` sem `action`.
- Tabela: `ecommerce_briefings` (nome/email/whatsapp/empresa/raw jsonb/numero) — schema legado, sem token.
- Duplica ~120 linhas de mapas de rótulos + `recomendar()` de `/painel-briefings/`.

### `/painel-orcamentos/` — orçamentos/propostas (350 linhas) — edge fn `orcamentos`
- Gate: `sessionStorage.eloi_pw`; helper `call()` (181-185) **não** limpa a sessão em 401 fora do login — diferente do padrão de `/gestao/`.
- Actions usadas aqui: `list`, `create`, `update`, `delete`. A mesma função também serve `public_get` (página pública `/orcamento/?t=`) e `catalog_*` (usado só por `/orcamento-inteligente/`) — **1 edge function serve 3 UIs diferentes**.
- Tabela: `orcamentos` (`share_token` uuid, `numero` int com sequence, `itens` jsonb, `valor_total` numeric).
- `linkPublico()` (245-252) gera o link público de 2 formas diferentes dependendo se o orçamento tem um `link` manual preenchido (`<link>/cliente/`) ou não (`/orcamento/?t=<share_token>`) — esquema de link inconsistente por registro.

### `/orcamento-inteligente/` — calculadora por catálogo (447+ linhas) — **mesma edge fn `orcamentos`**
- Confirmado por grep: `FN = .../orcamentos` (linha 203) — não é função própria.
- Actions usadas: `catalog_list`, `catalog_save`, `catalog_delete`, e `create` (linha 361, ao clicar "Gerar orçamento" grava direto em `orcamentos`).
- Tabela: `catalogo_servicos` — **existe mas está com 0 linhas em produção hoje**, ou seja essa calculadora está funcionalmente vazia (sem serviço pra escolher) até alguém popular o catálogo pela própria UI.

### `/aplicativos/` — launcher (127 linhas) — edge fn `get-briefings` (reaproveitada só como checador de senha)
- Gate: `sessionStorage.eloi_pw`; posta `{password}` pra `get-briefings` e **descarta completamente** o payload de briefings retornado — usa a função só pra validar a senha.
- Só linka pro app externo `eloi-financeiro.vercel.app` (deploy e provavelmente banco separados — as tabelas `services`/`clients`/`workspaces` no mesmo projeto Supabase quase certamente pertencem a esse app, não ao site).

## Padrões reutilizáveis encontrados (candidatos a shell compartilhado)

- **CSS idêntico copiado em ~8 arquivos**: paleta de cores (`--c950`…`--c100`), background "aurora" com blobs animados, tipografia Typekit `carbona-variable`, botões `.btn`/`.btn-ghost`, toast — mesmo bloco de ~20-40 linhas de CSS em `admin`, `gestao`, `painel-briefings`, `painel`, `painel-ecommerce`, `painel-orcamentos`, `orcamento-inteligente`, `aplicativos`.
- **SVG do wordmark "ELOI Design Studio" (176 linhas de `<path>`) inline e idêntico** em `admin`, `gestao` (2x no mesmo arquivo — login + topbar), `painel-briefings`, `painel`, `painel-ecommerce`, `aplicativos`. **Inconsistência**: `painel-orcamentos` e `orcamento-inteligente` **não** têm o logo, só texto + link "← Admin".
- **Padrão de fetch com senha em `sessionStorage.eloi_pw`** repetido em todas as 8 páginas, mas implementado 4 formas ligeiramente diferentes (wrapper `api()`/`call()` vs fetch solto; alguns limpam sessão em 401 subsequente, outros só no login; alguns mandam `action`, dois não mandam nada).
- **`recomendar()` (scoring de migração de plataforma e-commerce) e seus dicionários de rótulos**: duplicados entre `painel-briefings` e `painel-ecommerce`.
- **Padrão de upload assinado** (`nf.upload_url` → PUT direto no signed URL → grava só o `path`) em `eloi-gestao`, mencionado no contexto como referência a reaproveitar se o admin unificado ganhar upload de SVGs mestre para `entregas-marca`.

## Inconsistências de padrão entre páginas

1. **Contrato de `action`**: `eloi-gestao` usa namespacing por ponto (`clientes.list`, `nf.upload_url`); `orcamentos`/`briefing-links` usam verbos soltos (`list`,`create`,`delete`...); `get-briefings`/`get-ecommerce-briefings` **não têm** campo `action` — ignoram o que vier.
2. **Tratamento de 401**: só `gestao` desloga automaticamente em qualquer chamada; as demais só checam no login, deixando a sessão "presa" em erro genérico se a senha expirar/mudar no meio do uso.
3. **Presença do logo/topbar**: 6 páginas têm o wordmark inline, 2 não têm.
4. **Duas edge functions (`get-briefings`, `get-ecommerce-briefings`) existem só para servir páginas sem card no hub** — candidatas a aposentar junto com `/painel/` e `/painel-ecommerce/` se as 0 linhas nas tabelas legadas (`briefings`, `ecommerce_briefings`) forem confirmadas como realmente vazias/sem histórico a preservar.
5. **`orcamentos` e `orcamento-inteligente` competem pela mesma edge function** sem separação de concern — qualquer mudança na função de orçamentos tem blast radius sobre 3 telas (painel-orcamentos, orcamento-inteligente, `/orcamento/?t=` público) simultaneamente.

## Riscos objetivos de migrar tudo para um admin único

1. **Segredo de produção duplicado 5x**: qualquer unificação de login toca 5 edge functions já ativas com dados reais (`eloi_clientes` já tem 1 cliente real, bucket `eloi-notas` já tem PDF de nota fiscal real). Erro de deploy em qualquer uma quebra o financeiro do Wilke, não só uma tela de teste.
2. **Sem dump/backup local dos dados**: só existe `db/eloi-gestao.sql` (schema, não dados) no repo. Qualquer migração de schema em `eloi_clientes`/`eloi_servicos` mexe em dado de produção sem rollback visível a partir do repositório.
3. **Links públicos já entregues a clientes reais**: `painel-orcamentos` e `painel-briefings` têm botões "Copiar link"/"WhatsApp" cujo propósito explícito é mandar `/orcamento/?t=<share_token>` e `/briefing*/?t=<token>` pra clientes. Mudar semântica de `share_token`/`token` nas tabelas `orcamentos`/`briefing_links` durante a unificação pode quebrar link já em posse de cliente, mesmo as páginas públicas não fazendo parte do escopo da fusão.
4. **Modelo de dado fragmentado em 3 formatos de briefing**: `briefings` (colunas fixas q1-q18), `ecommerce_briefings.raw` (jsonb solto) e `briefing_links.raw` (jsonb, schema por `tipo`). Unificar a tela sem unificar o dado significa manter os 3 formatos de leitura ao mesmo tempo — ou aproveitar que as tabelas legadas estão com 0 linhas hoje pra simplesmente aposentá-las (mas confirme com o Wilke antes, pode ter havido reset recente do banco e não histórico real perdido).
5. **`catalogo_servicos` vazio em produção**: a aba "Orçamento inteligente" do admin unificado nasce funcionalmente quebrada (sem serviço pra escolher) até alguém popular o catálogo pela própria UI — vale sinalizar como pré-requisito de lançamento, não bug do admin novo.
6. **Coesão acidental via `sessionStorage` compartilhado**: hoje todas as páginas já compartilham sessão de fato (mesma chave, mesma senha). Um refactor de login que troque por chaves por-página seria uma **regressão** em vez de melhoria — a unificação deve preservar/formalizar esse comportamento, não reinventá-lo.
7. **Ausência total de sessão real**: não há JWT, expiração, rotação de segredo — é comparação de string em texto claro no corpo da request, hoje. Se "login único" para o Wilke implicitamente também significa "sessão de verdade", isso é escopo maior que só fundir páginas — vale alinhar expectativa antes de estimar.
8. **Zona de colisão de nomes no mesmo projeto Supabase**: tabelas `clients`/`services`/`workspaces` (app ELOI Financeiro) convivem com `eloi_clientes`/`eloi_servicos` (este site). Qualquer geração de SQL/migração para o admin unificado precisa allowlist explícita de tabelas `eloi_*` + as 5 específicas do site (`briefing_links`, `orcamentos`, `briefings`, `ecommerce_briefings`, `catalogo_servicos`), nunca `list_tables`/wildcard cego.
9. **Geração de variações de marca no navegador (requisito 2) é um projeto à parte, não um puxadinho do admin**: hoje é um script Node local (`entregas-marca/_tools/gerar-variacoes.mjs`, 82 linhas, usa `sharp` pra rasterizar SVG→PNG) rodado manualmente por config JSON por cliente. Mover isso pro navegador (ou pra uma edge function) troca a stack de "arquivo estático gerado offline" pra "processamento sob demanda" — Deno edge runtime não tem `sharp` de graça, e rasterização SVG→PNG no browser exige canvas/OffscreenCanvas com suas próprias limitações (fontes, filtros). Recomendo tratar como frente separada da fusão do admin, não estimar junto.
10. **`/painel/` e `/painel-ecommerce/` seguem publicamente roteáveis** mesmo sem card no hub, com o mesmo gate de senha compartilhado — decisão pendente: redirecionar pro painel unificado, manter como leitura histórica, ou desativar — mas isso só depois de confirmar que as 0 linhas atuais realmente não escondem perda de histórico (ver item 4).

## Arquivos lidos (paths absolutos)

- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\SITEMAP.md`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\admin\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\gestao\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel-briefings\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel-ecommerce\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\painel-orcamentos\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\orcamento-inteligente\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\aplicativos\index.html`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\db\eloi-gestao.sql`
- `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\entregas-marca\_tools\config-georgia-andrade.json` (referência de contexto)

Nenhum arquivo foi escrito ou editado — leitura e MCP read-only (`list_tables`, `list_edge_functions`, `get_edge_function`) apenas, conforme instruído.
