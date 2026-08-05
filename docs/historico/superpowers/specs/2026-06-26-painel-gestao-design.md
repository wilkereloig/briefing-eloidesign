# Painel de Gestão ELOI — Fase 1 (Clientes + Serviços + Dashboard)

**Data:** 2026-06-26
**Projeto:** ELOI Design Studio — site `briefing-eloidesign-repo`
**Produção:** https://briefing-eloidesign.vercel.app
**Status:** Design aprovado, pronto para plano de implementação

---

## Contexto e objetivo

Hoje o Wilke controla os serviços prestados numa **planilha** (cliente → serviço → valor → data de pagamento → nº da nota fiscal → pago? → status → observações). Em paralelo, o site ELOI já tem painéis soltos e desconectados: `painel-briefings`, `painel-orcamentos`, `painel-ecommerce`, `orcamento-inteligente`.

A meta de longo prazo é um **painel inteligente único** dentro do próprio site — vitrine pública + CRM/gestão interna — onde tudo (clientes, briefings, orçamentos, serviços/financeiro) se conecta em torno da entidade **Cliente**.

Esta Fase 1 entrega o **coração financeiro/operacional**: substituir a planilha por um painel real, com dashboard, dentro do site. É o módulo de maior dor imediata e o mais concreto (a planilha já é a especificação dos dados).

### Decisões que moldaram este design
- **Vive no site** (`briefing-eloidesign-repo`), não no app ELOI Financeiro. O app (`eloi-financeiro.vercel.app`, repo `app-financeiro/`) **não será tocado**.
- **Tabelas novas isoladas** (prefixo `eloi_`), separadas das tabelas `clients`/`services` que pertencem ao app ELOI Financeiro — sem colisão de dados.
- **PDF da nota** guardado no Supabase Storage (bucket privado), abre clicando no serviço.
- Mesmo padrão de segurança do resto do `/admin`: senha em `sessionStorage` + edge function anônima validando a senha.

---

## Arquitetura

HTML estático, sem build (padrão do repo). Nova página `/gestao/` no site, conversando com **uma** edge function nova (`eloi-gestao`) que usa a service-role key no servidor e valida a senha em toda chamada. Deploy por `git push origin master` → Vercel auto-deploy.

```
/gestao/ (HTML+JS, senha)  ──►  edge eloi-gestao (anon, service-role, checa senha)  ──►  Postgres (eloi_clientes, eloi_servicos)
                                                                                    └──►  Storage bucket privado eloi-notas (PDFs de NF)
```

`/gestao/` é a casa futura do painel inteligente inteiro. A Fase 1 preenche as abas **Dashboard**, **Serviços** e **Clientes**.

---

## Modelo de dados (tabelas novas, banco `nlamznxoocmygfvnqcns`)

### `eloi_clientes`
| campo | tipo | notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `nome` | text | ex: ASUS, PLANO&PLANO, VIBRA, F2 EXPERIENCE |
| `cor` | text | hex do chip colorido (ex: `#1565C0`) |
| `contato` | text null | opcional (responsável / whatsapp / email) |
| `created_at` | timestamptz | `now()` |

### `eloi_servicos` (cada linha da planilha)
| campo | tipo | coluna da planilha |
|---|---|---|
| `id` | uuid PK | — |
| `cliente_id` | uuid FK → `eloi_clientes.id` | CLIENTE |
| `descricao` | text | SERVIÇO |
| `valor_cents` | bigint | R$ (armazenado em centavos; exibido formatado) |
| `status_execucao` | text check (`em_execucao`,`concluida`) default `em_execucao` | Status |
| `pago` | boolean default false | PG (✓) |
| `data_pagamento` | date null | DATA PG |
| `nf_numero` | text null | NF-S |
| `nf_arquivo_url` | text null | caminho do PDF no Storage |
| `observacoes` | text null | OBS |
| `created_at` | timestamptz `now()` | — |

RLS habilitado; acesso só via edge `eloi-gestao` (service-role). Sem políticas para `anon`/`authenticated` direto.

---

## Storage — PDF da nota fiscal

- Bucket **privado** `eloi-notas`.
- **Upload:** a tela pede à edge um *signed upload URL*; o navegador faz PUT do arquivo; o caminho retornado é salvo em `eloi_servicos.nf_arquivo_url`. (Arquivos pequenos; alternativa de fallback = enviar base64 à edge que sobe com service-role.)
- **Visualizar:** clicar no serviço → edge gera *signed URL* temporário (ex: 60 s) → abre o PDF. Privado porque nota fiscal é dado sensível.

---

## Edge function `eloi-gestao` (anônima, `verify_jwt: false`)

Roteador por campo `action`. **Valida a senha** (mesmo segredo do resto do admin, em `app_secrets`/env) no início de toda chamada; 401 se errada. Usa service-role key.

| action | faz |
|---|---|
| `clientes.list` | lista clientes (com contagem/somatório de serviços, opcional) |
| `clientes.upsert` | cria/edita cliente (nome, cor, contato) |
| `clientes.delete` | remove cliente (bloqueia se tiver serviços, ou cascata explícita) |
| `servicos.list` | lista serviços com filtros (cliente, status, pago, mês) |
| `servicos.upsert` | cria/edita serviço |
| `servicos.delete` | remove serviço |
| `nf.upload_url` | retorna signed upload URL pro bucket |
| `nf.view_url` | retorna signed URL temporário pra ver o PDF |
| `dashboard.stats` | agrega métricas (ver abaixo) |

Segue o padrão das edges já existentes (`orcamentos`, `briefing-links`, `get-briefings`).

---

## Tela `/gestao/`

Visual roxo ELOI (mesmas variáveis `--c950..--c100`, fonte `carbona-variable`, logo wordmark SVG, aurora blobs). Senha via `sessionStorage('eloi_pw')`, validada pela edge.

- **Topo:** logo · título "Gestão" · link "← Admin" · "Sair".
- **Dashboard (cards):**
  - **Faturado no mês** (soma `pago` no mês corrente)
  - **A receber** (soma `pago = false`)
  - **Em execução** (qtd de `status_execucao = em_execucao`)
  - **Concluído sem NF** (qtd `concluida` e `nf_numero` vazio — "precisa emitir nota")
  - **Ranking por cliente** (faturamento por cliente)
- **Aba Serviços:** tabela **agrupada por cliente, com chip colorido** (espelha a planilha). Filtros: cliente · status · pago/não pago · mês. Botão "+ Serviço" abre modal (cliente, descrição, valor, status, pago, data pagamento, nº NF, upload PDF, OBS). Clicar na linha → editar; clicar no NF → abre o PDF (signed URL).
- **Aba Clientes:** lista + adicionar/editar cliente e a cor do chip.

---

## Carga inicial dos dados

A planilha atual (ASUS, PLANO&PLANO, VIBRA, F2 EXPERIENCE, etc.) entra como carga inicial.
**Caminho recomendado:** Wilke exporta a planilha em **CSV** → inserção em lote em `eloi_clientes` + `eloi_servicos` (script único / SQL). O print cobre só parte das linhas.

---

## Integração com o admin

- Adicionar card "Gestão" no hub `/admin/index.html` apontando para `/gestao/`.
- Documentar a rota `/gestao/` no `SITEMAP.md`.

---

## Fora de escopo da Fase 1 (Fases futuras)

- **Pagamento parcial** formalizado (valor pago vs total). Na Fase 1, "pago parcial" fica no campo `observacoes`; `pago` é booleano.
- **NF como entidade própria** (uma nota cobrindo vários serviços, um PDF por nota). Na Fase 1, `nf_numero` repete por serviço (simples).
- **Conectar Cliente ↔ orçamentos ↔ briefings** (CRM completo). A entidade `eloi_clientes` já nasce como o futuro elo, mas a ligação fica para a Fase 2.
- **Catálogo de serviços / preços**, projetos como entidade, relatórios avançados.

---

## Segurança

- Acesso único por senha (modelo já usado no site). Usuário único (Wilke). Aceitável para o escopo.
- Bucket de notas **privado**; PDFs servidos só via signed URL após validação de senha.
- Edge usa service-role apenas no servidor; o navegador nunca vê a chave.

---

## Critérios de sucesso (Fase 1)

1. Wilke acessa `/gestao/` com a senha do admin.
2. Cadastra clientes com cor e serviços com todos os campos da planilha.
3. Sobe o PDF da nota num serviço e reabre clicando nele.
4. Vê a tabela agrupada por cliente com chips coloridos e filtra por status/pago/mês.
5. Dashboard mostra faturado, a receber, em execução e concluído-sem-NF corretos.
6. Dados atuais da planilha carregados.
7. App ELOI Financeiro intocado; nada quebrado nos painéis existentes.
