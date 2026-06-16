# ELOI Design Studio — Mapa do Site

Repositório único do **site completo** (GitHub: `wilkereloig/briefing-eloidesign`). HTML estático, sem build.

## Estrutura / rotas

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `index.html` | Página principal (landing) |
| `/briefing/` | `briefing/index.html` | Formulário de briefing (cliente preenche) |
| `/admin/` | `admin/index.html` | Sessão administrativa — hub "Painel ELOI" (Briefings · Orçamentos · Orçamento inteligente · Aplicativos) |
| `/painel/` | `painel/index.html` | Lista / relatório dos briefings recebidos |
| `/painel-orcamentos/` | `painel-orcamentos/index.html` | Gestão de orçamentos / propostas |
| `/orcamento-inteligente/` | `orcamento-inteligente/index.html` | Calculador de orçamento por catálogo de serviços (Supabase) + multiplicadores; gera orçamento no painel |
| `/aplicativos/` | `aplicativos/index.html` | Meus aplicativos (ex.: ELOI Financeiro) |
| `/orcamento-precampanha/` | `orcamento-precampanha/index.html` | Modelo de orçamento (proposta pré-campanha) |

## Marca / Logo
- Logo oficial = wordmark **"ELOI Design Studio"** (SVG inline, `viewBox 0 0 750.94 177.34`, **16 paths**, branco `#fff` via `.cls-1`).
- Mesmo SVG em todas as páginas. No orçamento, em `@media print` os paths viram roxo `#3C096C`.

## Acesso
- Área admin protegida por senha (sessionStorage `eloi_pw`).

## Notas
- Mapa gerado 2026-06-16. **Fonte única = este repo.** Cópias antigas em `.preview-eloi/` e `briefing-eloidesign/` (fora do repo) estão obsoletas — não editar.