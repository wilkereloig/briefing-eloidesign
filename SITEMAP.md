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
| `/admin/` | `admin/index.html` | Sessão administrativa — hub "Painel ELOI" (Gestão · Briefings · Orçamentos · Orçamento inteligente · Entregas de Marca · Aplicativos) |
| `/gestao/` | `gestao/index.html` | **Painel de Gestão** — clientes, serviços prestados (valor, NF, PDF, status execução/pagamento), dashboard financeiro (faturado, a receber, em execução, concluído sem NF, ranking por cliente). Tabelas isoladas `eloi_clientes`/`eloi_servicos` via edge `eloi-gestao` (senha admin); PDFs no bucket privado `eloi-notas` (signed URLs). Tabela agrupada por cliente com chip colorido. |
| `/painel-briefings/` | `painel-briefings/index.html` | **Painel unificado de Briefings.** Gera link por cliente (token) p/ qualquer form (visual/e-commerce/Solarium), lista convites (pendente/respondido), mostra respostas + recomendação. Lê via edge `briefing-links`; respostas chegam via edge `briefing-submit` na tabela `briefing_links`. |
| `/painel/` | `painel/index.html` | (legado, sem card) Lista dos briefings de identidade visual gravados direto na tabela `briefings` (forms abertos sem token) |
| `/painel-ecommerce/` | `painel-ecommerce/index.html` | (legado, sem card) Lista dos briefings e-commerce gravados direto na tabela `ecommerce_briefings` (forms sem token) |
| `/painel-orcamentos/` | `painel-orcamentos/index.html` | Gestão de orçamentos / propostas |
| `/orcamento-inteligente/` | `orcamento-inteligente/index.html` | Calculador de orçamento por catálogo de serviços (Supabase) + multiplicadores; gera orçamento no painel |
| `/aplicativos/` | `aplicativos/index.html` | Meus aplicativos (ex.: ELOI Financeiro) |
| `/orcamento-precampanha/` | `orcamento-precampanha/index.html` | Modelo de orçamento (proposta pré-campanha) |
| `/orcamento/?t=<token>` | `orcamento/index.html` | **Público / view-only** — cliente visualiza 1 orçamento via token secreto (`share_token`). Sem login, sem links pro admin. Lê via edge `public_get` (só cliente/título/itens/total/data). Botão "Copiar link"/WhatsApp no painel-orcamentos gera o link. |
| `/entregas-marca/<slug>/` | `entregas-marca/<slug>/index.html` | **(legado, obsoleto)** página pública sem login da identidade visual — substituída pela aba Marca do `/portal/` (fase 4, senha por cliente). Fica no ar por enquanto, sem novo card/link; não usar pra clientes novos. |
| `/portal/` | `portal/index.html` | **Portal do Cliente** — login por senha própria (prefixo+segredo, PBKDF2), sessão `portal_sessions`. Abas: Marca (logo/paleta/variações via bucket privado `eloi-entregas`, signed URLs), Arquivos (arquivo do projeto/apresentação/fonte, mesmo bucket), Notas Fiscais, Orçamentos (view-only, link pra `/orcamento/?t=`), Briefing (view-only). Lê via edge `portal-cliente`. Senha gerada em `/gestao/` (botão "🔐 Gerar senha do portal", aba Clientes). |
| `/marca/` | `marca/index.html` | Ferramenta admin (senha admin) pra gerar variações de logo no navegador — upload de SVG mestre + paleta, rasteriza client-side. Botão "Baixar .zip" depende de `assets/vendor/fflate.min.js` (não vendorizado ainda — TODO conhecido). Geração real de produção ainda é feita pelo script `entregas-marca/_tools/gerar-variacoes.mjs` (Node, roda local). |

## Marca / Logo
- Logo oficial = wordmark **"ELOI Design Studio"** (SVG inline, `viewBox 0 0 750.94 177.34`, **16 paths**, branco `#fff` via `.cls-1`).
- Mesmo SVG em todas as páginas. No orçamento, em `@media print` os paths viram roxo `#3C096C`.
- Entregas de marca (SVG/PNG por variação×cor, zip): geradas por `entregas-marca/_tools/gerar-variacoes.mjs` e publicadas no bucket privado `eloi-entregas` (`<cliente_id>/marca/...`) via `node gerar-variacoes.mjs config.json --upload --cliente-id=<uuid>` (exige `SUPABASE_SERVICE_ROLE_KEY` local). Cliente vê/baixa autenticado em `/portal/` (aba Marca) — não é mais público.

## Acesso
- Área admin: token via edge `admin-auth` + `localStorage` (`eloi_admin_token`), tabela `admin_sessions` (12h, sliding). Secret `ADMIN_PASSWORD` no projeto Supabase.
- Área cliente (`/portal/`): senha própria por cliente (`portal_senha_hash`, PBKDF2), tabela `portal_sessions`.

## Notas
- Mapa gerado 2026-06-16. **Fonte única = este repo.** Cópias antigas em `.preview-eloi/` e `briefing-eloidesign/` (fora do repo) estão obsoletas — não editar.