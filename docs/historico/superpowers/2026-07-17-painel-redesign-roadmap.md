# Roadmap — Redesign do Painel ELOI (visão administrativa completa)

**Origem:** brainstorming `/design-system` (2026-07-17). Pedido grande demais para 1 spec →
decomposto em 4 sub-projetos. Cada um segue o ciclo brainstorming → spec → writing-plans →
subagent-driven-development. **Fazer um por vez, em sessão limpa** (controle de custo/contexto).

## Estado atual (o que já existe)

- **Gestão (`gestao/index.html`)** — recém-redesenhada: navegação mensal (abas Jan–Dez + Todos +
  ano), cards Faturado/Recebido/A receber (semântica separada), Em execução, NF pendente;
  ranking por marca com cor determinística; lista Cliente›Marca com bloco "A faturar (sem NF)",
  badge NF pendente lilás; aba Clientes com resumo do período. Abre no mês atual.
  - Spec: `docs/superpowers/specs/2026-07-17-gestao-redesign-design.md`
  - Plano: `docs/superpowers/plans/2026-07-17-gestao-redesign.md`
- **Modelo `eloi_servicos`:** id, cliente_id, sub_cliente (marca, texto), descricao, valor_cents,
  status_execucao (aguardando_inicio/em_execucao/concluida), pago (bool), data_pagamento,
  **data_competencia** (novo — mês da NF), nf_numero, nf_arquivo_url, observacoes, orcamento_id, created_at.
- **`eloi_clientes`:** nome, cor, contato, marca_slug, marca_publicada, portal_senha_* (portal por senha).
- **Home atual (`admin/index.html`):** login + hub com funil briefings→orçamentos→aprovados,
  métricas, financeiro (via `eloi-gestao dashboard.stats`), atividade recente, 6 cards de nav.
- **Edge functions:** `eloi-gestao` (clientes/serviços/nf/entregas/dashboard), `orcamentos`,
  `briefing-links`, `briefing-submit`, `portal-cliente`, `get-briefings`, etc.
- **Entregas atuais:** storage bucket `eloi-entregas` por cliente, categorias flat
  (arquivo/apresentacao/fonte). Portal cliente = `/portal/` por senha (prefix-secret, hash PBKDF2).
- Supabase project_id `nlamznxoocmygfvnqcns`. F2 cliente id `b6f964c8-a93e-4093-8924-f170f198e736`.

## Sub-projetos (ordem recomendada)

### P1 — Home/Painel + navegação (começar por aqui)
Nova `admin/index.html` como visão administrativa (não página de atalhos):
- Header: saudação, nav mensal (Jan–Dez + Todos) + ano, ações rápidas +Serviço/+Orçamento/+Cliente.
- Linha financeira: Faturado / Recebido / A receber / **Estimativa de receita** (orçamentos aprovados
  ainda sem serviço — NÃO somar com recebido). Variação vs mês anterior quando houver dado. Clique→Gestão.
- Resumo operacional (alertas): em execução, entregas próximas, NF pendentes, pagamentos pendentes,
  orçamentos aguardando, briefings pendentes/recentes.
- "Sua atenção" (pendências priorizadas): tipo · cliente · projeto · data · status · link direto.
- Atividade recente + próximos prazos.
- Clientes em destaque (faturado/recebido/pendente/serviços em execução, top do período).
- Nav: remover **Aplicativos** (e rota `/aplicativos/`); renomear **Entregas de Marca → Portal do
  Cliente** (aponta pra P4 quando existir). Navegação persistente (topo/lateral) em vez de cards gigantes.
- Reusar lógica de período/cálculo da Gestão (mesma semântica competência/pagamento).
- Dados: quase tudo já existe. "Estimativa" = orçamentos status aprovado sem serviço vinculado.

### P2 — Gestão: abas Financeiro/Notas + campos de serviço
- Abas internas: Visão geral · Serviços · Clientes · Financeiro · Notas fiscais.
- Por serviço: valor total, **valor recebido**, **valor pendente** (pagamento parcial),
  **data prevista de entrega**, status serviço/pagamento/NF, data pgto, nº/data NF.
- **Modelo novo:** `valor_recebido_cents` (ou tabela de pagamentos) + `data_entrega_prevista`.
- Filtros: cliente, período, status serviço, status pagamento, status NF, busca.

### P3 — Perfil de Cliente
- Página por cliente agregando: contato, serviços (ativos+histórico), orçamentos, briefings,
  financeiro, notas, materiais/entregas, acesso ao portal.
- **Pré-requisito:** ligar `orcamentos` e briefings a `cliente_id` (hoje cliente é texto livre) —
  migração + backfill + ajuste dos forms/edge functions.

### P4 — Portal do Cliente / Entregas 2.0 (o maior)
- Materiais genéricos (não só logo): por projeto/serviço/categoria/data/tipo/versão/status
  (rascunho/publicado/arquivado). Categorias: logo/identidade, arquivos finais, apresentações,
  social, vídeos, documentos, links externos, aprovações, outros.
- Por material: título, descrição, prévia, download, link externo, data publicação, versão, status.
- **Modelo novo:** tabela `eloi_materiais` (cliente_id, projeto, categoria, versao, status, titulo,
  descricao, arquivo_path/url_externa, publicado_em...) substituindo/estendendo os buckets flat.
- Admin: publicar/arquivar/versionar por cliente. Portal cliente: UX limpa, só download, isolado por cliente.
- Fluxo: abrir perfil → criar/ativar portal → senha segura + reset → publicar materiais → cliente vê só os dele.

## Direção visual (todos os sub-projetos)
Noturno roxo (`--c950…--c100`, aurora), maduro/limpo: menos bordas/caixas, mais respiro, cards só
onde ajudam, hierarquia forte pra valores/pendências/ações, badges pequenos consistentes, ícones
discretos, sem gamer/neon/emoji-como-elemento. Mobile específico: nav mensal scroll-x, cards legíveis,
filtros recolhíveis, ações acessíveis, portal confortável no celular.

## Regras de dados (todos)
Sem dados fictícios em produção; totais dos registros reais; números coerentes; "faturado" ≠ "recebido"
≠ "estimativa" (não somar); estados vazios bem desenhados; campo novo estruturado de forma consistente
quando o dado ainda não existe. Preservar dados/rotas/funções existentes.

## Como retomar (sessão nova)
1. `/superpowers:brainstorming` com foco em **P1** (colar a seção P1 acima como base).
2. Seguir spec → `/superpowers:writing-plans` → `/superpowers:subagent-driven-development`.
3. Repetir por sub-projeto. Preview: `gestao`/`admin` servidos pela mesma porta (launch.json 5186).
