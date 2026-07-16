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
| `/admin/` | `admin/index.html` | Sessão administrativa — hub "Painel ELOI" (Gestão · Briefings · Orçamentos · Orçamento inteligente · Aplicativos) |
| `/gestao/` | `gestao/index.html` | **Painel de Gestão** — clientes, serviços prestados (valor, NF, PDF, status execução/pagamento), dashboard financeiro (faturado, a receber, em execução, concluído sem NF, ranking por cliente). Tabelas isoladas `eloi_clientes`/`eloi_servicos` via edge `eloi-gestao` (senha admin); PDFs no bucket privado `eloi-notas` (signed URLs). Tabela agrupada por cliente com chip colorido. |
| `/painel-briefings/` | `painel-briefings/index.html` | **Painel unificado de Briefings.** Gera link por cliente (token) p/ qualquer form (visual/e-commerce/Solarium), lista convites (pendente/respondido), mostra respostas + recomendação. Lê via edge `briefing-links`; respostas chegam via edge `briefing-submit` na tabela `briefing_links`. |
| `/painel/` | `painel/index.html` | (legado, sem card) Lista dos briefings de identidade visual gravados direto na tabela `briefings` (forms abertos sem token) |
| `/painel-ecommerce/` | `painel-ecommerce/index.html` | (legado, sem card) Lista dos briefings e-commerce gravados direto na tabela `ecommerce_briefings` (forms sem token) |
| `/painel-orcamentos/` | `painel-orcamentos/index.html` | Gestão de orçamentos / propostas |
| `/orcamento-inteligente/` | `orcamento-inteligente/index.html` | Calculador de orçamento por catálogo de serviços (Supabase) + multiplicadores; gera orçamento no painel |
| `/aplicativos/` | `aplicativos/index.html` | Meus aplicativos (ex.: ELOI Financeiro) |
| `/orcamento-precampanha/` | `orcamento-precampanha/index.html` | Modelo de orçamento (proposta pré-campanha) |
| `/orcamento/?t=<token>` | `orcamento/index.html` | **Público / view-only** — cliente visualiza 1 orçamento via token secreto (`share_token`). Sem login, sem links pro admin. Lê via edge `public_get` (só cliente/título/itens/total/data). Botão "Copiar link"/WhatsApp no painel-orcamentos gera o link. |
| `/entregas-marca/<slug>/` | `entregas-marca/<slug>/index.html` | **Público, sem login** — página de download da identidade visual de um cliente (SVG+PNG, todas as variações × todas as cores da paleta oficial, + zip "baixar tudo"). Página é um wrapper fino que carrega `../_shared/entrega.{css,js}` e renderiza a partir de `manifest.json` (gerado por `entregas-marca/_tools/gerar-variacoes.mjs` a partir dos SVGs mestre `fill:currentColor` + config JSON por cliente). Sem tabela própria: `eloi_clientes.marca_slug`/`marca_publicada` (via `eloi-gestao`, aba Clientes → botão "🔗 link marca") aponta pra pasta. Não é sensível (arquivos de marca já aprovados) — não usa token secreto como o orçamento. |

## Marca / Logo
- Logo oficial = wordmark **"ELOI Design Studio"** (SVG inline, `viewBox 0 0 750.94 177.34`, **16 paths**, branco `#fff` via `.cls-1`).
- Mesmo SVG em todas as páginas. No orçamento, em `@media print` os paths viram roxo `#3C096C`.

## Acesso
- Área admin protegida por senha (sessionStorage `eloi_pw`).

## Notas
- Mapa gerado 2026-06-16. **Fonte única = este repo.** Cópias antigas em `.preview-eloi/` e `briefing-eloidesign/` (fora do repo) estão obsoletas — não editar.