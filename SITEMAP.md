# ELOI Design Studio — Mapa do Site

Repositório único do **site completo** (GitHub: `wilkereloig/briefing-eloidesign`). HTML estático, sem build.

## Estrutura / rotas

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `index.html` | Página principal (landing) |
| `/briefing/` | `briefing/index.html` | Formulário de briefing de identidade visual (cliente preenche) |
| `/briefing-ecommerce/` | `briefing-ecommerce/index.html` | Formulário de briefing de e-commerce GENÉRICO — 5 etapas (contato, negócio, loja atual, integrações, visual/verba). Base reutilizável. Grava em `ecommerce_briefings` + email Formspree (`_subject` "[E-COMMERCE]"). |
| `/briefing-solarium/` | `briefing-solarium/index.html` | Briefing DIRECIONADO p/ cliente Solarium Cosméticos — pré-preenchido com análise do site; foco em posicionamento B2B, decisão de plataforma e gaps de operação. Mesma tabela/painel (campos `ec_*`). |
| `/briefing-guia-viver-bem/` | `briefing-guia-viver-bem/index.html` | Briefing DIRECIONADO p/ cliente Guia Viver Bem (reestruturação do portal de saúde RN) — wizard 9 etapas, identidade própria de saúde (não a marca ELOI). Token → edge `briefing-submit` (`{token, raw}`) na `briefing_links` + email Formspree (`xpqeraow`, `_subject` "[REESTRUTURAÇÃO]"). Tipo registrado no painel-briefings. |
| `/admin` e `/admin/*` | `app/dist/` (rewrite no `vercel.json`) | **Gestão ELOI — o produto** (2026-08-05). Vite+React 19+TS em `app/`, dist COMMITADO (Vercel não builda). Sistema visual do KV aplicado (tokens, ícones autorais, trilho→barra inferior). Sessão compartilhada com os legados (mesmo `eloi_admin_token`). Rotas abaixo. O hub estático antigo (`admin/index.html`) foi aposentado — no Vercel, arquivo estático ganha de rewrite, então PRECISOU sair do repo. |
| `/admin` | `telas/Hoje.tsx` | **Visão geral** — saldo consolidado/empresa/pessoal, resultado do mês vs. anterior, a receber/a pagar, notas pendentes, fila "Precisa de você", contas e cartões, próximos 30 dias, últimas movimentações. Alterna a lente (Tudo · Empresa · Pessoal) e o mês. |
| `/admin/dinheiro` | `telas/Dinheiro.tsx` | **Financeiro** em 5 abas: Movimentações (extrato do mês), A receber, A pagar (ambas ignoram o mês — dívida vencida é trabalho de hoje), Contas (saldo por conta, fatura e limite do cartão) e Recorrências (custo mensal e anual). Lançar receita/despesa/transferência, parcelar, liquidar total ou parcial, excluir. |
| `/admin/projetos` | `telas/Projetos.tsx` | Funil por etapa calculada (orçamento → aprovado → execução → entregue → pago), agrupado por cliente, com sub-cliente em etiqueta e marca de NF. |
| `/admin/clientes` · `/admin/clientes/:id` | `telas/Clientes.tsx` · `ClienteFicha.tsx` | Carteira com faturado/a receber/serviços por cliente; ficha consolida cadastro, projetos, histórico financeiro e notas. |
| `/admin/notas` | `telas/Notas.tsx` | Notas fiscais com status (pendente→pronta→emitida→enviada), imposto estimado e alerta de **serviço concluído sem nota**. |
| `/admin/relatorios` | `telas/Relatorios.tsx` | Resultado de 12 meses (gráfico em CSS puro), ranking por cliente e por categoria, previsão de caixa em 3 cenários, metas e orçamentos de gasto. |
| `/admin/calendario` | `telas/Calendario.tsx` | Grade mensal de vencimentos; ponto por tipo (entrada/saída) e contorno quando liquidado — estado nunca só por cor. |
| `/admin/arquivos` | `telas/Arquivos.tsx` | Acervo com upload real (URL assinada → bucket `eloi-notas`), filtro por categoria e leitura das entregas de marca. |
| `/admin/config` | `telas/Config.tsx` | Contas e cartões por contexto, categorias e as regras de dado do sistema. |
| `/gestao/` | `gestao/index.html` | **Painel de Gestão** — clientes, serviços prestados (valor, NF, PDF, status execução/pagamento), dashboard financeiro (faturado, a receber, em execução, concluído sem NF, ranking por cliente). Tabelas isoladas `eloi_clientes`/`eloi_servicos` via edge `eloi-gestao` (senha admin); PDFs no bucket privado `eloi-notas` (signed URLs). Tabela agrupada por cliente com chip colorido. Serviço tem campo opcional `sub_cliente` (marca/sub-cliente, ex: VIBRA/ASUS/MRV dentro de F2 EXPERIENCE) — só agrupamento visual + subtotal dentro do card do cliente, não é cliente próprio (sem portal/senha). |
| `/painel-briefings/` | `painel-briefings/index.html` | **Painel unificado de Briefings.** Gera link por cliente (token) p/ qualquer form (visual/e-commerce/Solarium), lista convites (pendente/respondido), mostra respostas + recomendação. Lê via edge `briefing-links`; respostas chegam via edge `briefing-submit` na tabela `briefing_links`. |
| `/painel/` | `painel/index.html` | (legado, sem card) Lista dos briefings de identidade visual gravados direto na tabela `briefings` (forms abertos sem token) |
| `/painel-ecommerce/` | `painel-ecommerce/index.html` | (legado, sem card) Lista dos briefings e-commerce gravados direto na tabela `ecommerce_briefings` (forms sem token) |
| `/painel-orcamentos/` | `painel-orcamentos/index.html` | Gestão de orçamentos: lista, CRUD, link/WhatsApp pro cliente, "criar serviço". Form único com catálogo opcional (botão "+ Do catálogo") e seção "Ajustes" (complexidade/urgência/desconto, colunas em `orcamentos`, recalculam sempre). |
| `/orcamento-inteligente/` | `orcamento-inteligente/index.html` | **Aposentado** — redirect pra `/painel-orcamentos/`. O calculador (catálogo + multiplicadores) virou parte do painel. Arquivo mantido porque o link pode ter sido compartilhado. |
| `/orcamento-precampanha/` | `orcamento-precampanha/index.html` | Modelo de orçamento (proposta pré-campanha) |
| `/orcamento/?t=<token>` | `orcamento/index.html` | **Público / view-only** — cliente visualiza 1 orçamento via token secreto (`share_token`). Sem login, sem links pro admin. Lê via edge `public_get` (só cliente/título/itens/total/data). Botão "Copiar link"/WhatsApp no painel-orcamentos gera o link. |
| `/entregas-marca/<slug>/` | `entregas-marca/<slug>/index.html` | **Página principal de entrega de marca** — é o link que o cliente recebe (WhatsApp). Protegida por `_shared/gate.js` (sessão do portal; sem sessão → `/portal/?next=`). A aba Marca do `/portal/` é só um card que aponta pra cá (2026-07-27). A subpasta `apresentacao/` também carrega o gate. |
| `/portal/` | `portal/index.html` | **Portal do Cliente** — login por senha própria (prefixo+segredo, PBKDF2), sessão `portal_sessions`. Abas: Marca (logo/paleta/variações via bucket privado `eloi-entregas`, signed URLs), Arquivos (arquivo do projeto/apresentação/fonte, mesmo bucket), Notas Fiscais, Orçamentos (view-only, link pra `/orcamento/?t=`), Briefing (view-only). Lê via edge `portal-cliente`. Senha gerada em `/gestao/` (botão "🔐 Gerar senha do portal", aba Clientes). |
| `/marca/` | `marca/index.html` | Ferramenta admin (senha admin) pra gerar variações de logo no navegador — upload de SVG mestre + paleta, rasteriza client-side. Botão "Baixar .zip" depende de `assets/vendor/fflate.min.js` (não vendorizado ainda — TODO conhecido). Geração real de produção ainda é feita pelo script `entregas-marca/_tools/gerar-variacoes.mjs` (Node, roda local). |

## Painel unificado (2026-07 — em validação)
- `/admin-app/` — **aplicação administrativa única** (React+Vite+TS em `admin-app/`, build → `admin-app/dist`). Rotas: `/`, `/clientes`, `/clientes/:id` (perfil com abas Resumo/Orçamentos/Serviços/Financeiro/Briefings/Entregas), `/orcamentos`, `/servicos`, `/financeiro`, `/briefings`, `/entregas`. Consome as mesmas edge functions dos painéis legados (token `eloi_admin_token`). Páginas legadas continuam funcionando — migração progressiva.
- **Orçamento aprovado → serviço é AUTOMÁTICO no banco** (trigger `trg_eloi_orcamento_aprovado`, idempotente via índice único em `orcamento_id`; guard `trg_eloi_orcamento_guard` bloqueia enviar/aprovar sem `cliente_id`). `servicos.from_orcamento` virou ferramenta de reparação (só aprovados). Orçamento aprovado com serviço fica travado p/ título/valor/cliente (edite o serviço na Gestão).
- **Financeiro**: tabelas `eloi_caixas` + `eloi_movimentos_financeiros` (cents; entrada/saida; previsto/realizado/cancelado), edge `eloi-financeiro` (caixas.*, movimentos.*, financeiro.stats). Saldo = inicial + entradas realizadas − saídas realizadas; previsto fora do saldo.
- **Materiais**: tabela `eloi_materiais` (metadados de entregas, rascunho/publicado/arquivado); admin via `eloi-gestao` (materiais.upsert/delete), cliente só vê publicado via `portal-cliente` (materiais.list).
- `clientes.detail` (edge `eloi-gestao`): perfil completo do cliente num payload (orçamentos, serviços, briefings, movimentos, materiais, resumo financeiro, estado do portal). Só admin.

## Marca / Logo
- Logo oficial = wordmark **"ELOI Design Studio"** (SVG inline, `viewBox 0 0 750.94 177.34`, **16 paths**, branco `#fff` via `.cls-1`).
- Mesmo SVG em todas as páginas. No orçamento, em `@media print` os paths viram roxo `#3C096C`.
- Entregas de marca (SVG/PNG por variação×cor, zip): geradas por `entregas-marca/_tools/gerar-variacoes.mjs` e publicadas no bucket privado `eloi-entregas` (`<cliente_id>/marca/...`) via `node gerar-variacoes.mjs config.json --upload --cliente-id=<uuid>` (exige `SUPABASE_SERVICE_ROLE_KEY` local). Cliente vê/baixa autenticado em `/portal/` (aba Marca) — não é mais público.

## Navegação admin (P1)
- **Sidebar compartilhado** (`assets/eloi-admin/nav.js`): injetado por 1 `<script>` em todas as páginas admin (`/admin`, `/gestao`, `/painel-briefings`, `/painel-orcamentos`, `/marca`). Auth-aware (só monta logado), item ativo pela URL, drawer no mobile. Nav primária: Painel · Gestão · Briefings · Orçamentos · Portal do Cliente (→ Gestão›Clientes até o P4). "Entregas de Marca" (`/marca/`) fica em "Ferramentas". `/aplicativos/` foi removido (rota + card).
- **`assets/eloi-admin/periodo.js`**: helper de período/formatação compartilhado (semântica competência/pagamento). Home consome; Gestão ainda tem cópia inline (migração = follow-up).

## Acesso
- Área admin: token via edge `admin-auth` + `localStorage` (`eloi_admin_token`), tabela `admin_sessions` (12h, sliding). Secret `ADMIN_PASSWORD` no projeto Supabase.
- Área cliente (`/portal/`): senha própria por cliente (`portal_senha_hash`, PBKDF2), tabela `portal_sessions`.

## Notas
- Mapa gerado 2026-06-16. **Fonte única = este repo.** Cópias antigas em `.preview-eloi/` e `briefing-eloidesign/` (fora do repo) estão obsoletas — não editar.
- `CONTEXT.md` (raiz) tem o vocabulário de domínio (Cliente/Projeto/Etapa/Decisão/etc.) usado pela lógica de negócio do painel admin.