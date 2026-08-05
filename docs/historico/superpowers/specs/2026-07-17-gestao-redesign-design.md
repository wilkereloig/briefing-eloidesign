# Redesign da área de Gestão — visão financeira/operacional mensal

**Data:** 2026-07-17
**Arquivo alvo:** `gestao/index.html` (maior parte) · `edge-functions/eloi-gestao.ts` (mínimo) · 1 migration Supabase
**Escopo intocado:** rotas, auth (`eloi_pw`/admin_sessions), portais, orçamentos, entregas, senhas de portal.

## Objetivo

Transformar a área de Gestão numa visão financeira e operacional clara por mês, sem
reconstruir o sistema nem apagar dados. Entender rápido: o que foi faturado, o que foi
recebido, o que falta receber, o que falta emitir NF, e quais marcas pesam mais no período.

## Decisões (aprovadas)

1. **Modelo de data:** adicionar coluna `data_competencia date` (nullable). Separa
   *Faturado* (competência = emissão da NF) de *Recebido* (pagamento). Backfill das 37
   notas com a data de emissão real; os 12 serviços sem NF ficam `data_competencia = null`.
2. **12 provisórios:** são trabalho em andamento ainda sem NF — **manter**. Formam o
   conjunto "A faturar / NF pendente". Sem competência → fora dos totais mensais de faturado.
3. **Ranking mensal:** por **marca** (`sub_cliente`), não por cliente. Bucket =
   `sub_cliente || cliente.nome` (serviço sem marca cai no nome do cliente, ex: Georgia Andrade).
4. **Contagens "Em execução" e "NF pendente":** **gerais** (independem do mês selecionado).
5. **Card "Orçamento aprovado sem serviço":** **manter** (já existe em `dashboard.stats`).

## Arquitetura — Abordagem C (cliente calcula)

`servicos.list` já retorna `select *` de todos os serviços. O frontend busca a lista
completa **uma vez** e calcula mês/cards/ranking/agrupamento em JS puro. Troca de aba
mensal = instantânea, sem rede. Volume < 100 linhas → trivial.

Backend muda o mínimo:
- **Migration:** `alter table eloi_servicos add column data_competencia date;` + `update`
  de backfill das 37 notas (por `nf_numero`) com as datas de emissão.
- **`eloi-gestao.ts` › `servicos.upsert`:** aceitar e gravar `data_competencia`
  (`row.data_competencia = s.data_competencia || null`). `servicos.list` já devolve a coluna.
- `dashboard.stats` **não precisa mudar** para as novas métricas (calculadas no cliente);
  o card "Orçamento aprovado sem serviço" continua vindo dele (uma chamada só).

## Estado da página

Objeto único `PERIODO = { ano, mes }` (`mes` = 1..12 ou `null` = Todos). Governa: cards,
ranking, lista de serviços, aba clientes. Inicial: mês atual se houver dados nele, senão "Todos".

Helpers de mês: um serviço pertence ao mês por `data_competencia` (fatiar `YYYY-MM`).

## Seções

### 1. Navegação mensal (topo, acima dos cards)
- Abas `Jan…Dez` + `Todos`. Seletor de **ano** ao lado (só anos presentes nos dados; hoje 2026 — se um ano só, o seletor pode ficar oculto/estático).
- Aba ativa em roxo, resto apagado. Mobile: faixa `overflow-x:auto`, fade sutil nas pontas.

### 2. Cards financeiros (semântica correta — Faturado ≠ Recebido)
| Card | Cálculo | Cor |
|---|---|---|
| Faturado no mês | Σ `valor_cents` com `data_competencia` no período | roxo neutro |
| Recebido no mês | Σ `valor_cents` com `pago=true` E `data_pagamento` no período | verde suave (`--good`) |
| A receber | Σ `valor_cents` com `pago=false` E `data_competencia` no período | âmbar suave |
| Em execução | contagem `status_execucao='em_execucao'` **geral** | roxo |
| A faturar / NF pendente | contagem sem `nf_numero` **geral** + Σ `valor_cents` desses | lilás quente |
| Orçamento aprovado sem serviço | vem de `dashboard.stats` (inalterado) | âmbar |

- "Todos": faturado/recebido/a-receber somam todos os períodos.
- Card clicável aplica o filtro correspondente na lista (faturado→limpa; recebido→pago;
  a receber→pendente; NF pendente→filtro nota=pendente). Implementação simples: setar filtro + rolar até a lista.

### 3. Relatório mensal por marca
Substitui "Faturamento por cliente". Ranking desc por faturado do período. Cada linha:
**marca · faturado · recebido · a receber · nº serviços · barra** (largura = % do maior
faturado). Cor da barra = cor do cliente dono da marca. Sem excesso de cor.

### 4. Aba Serviços
- Lista filtrada pelo período (por competência). Serviços sem competência entram num bloco
  fixo **"A faturar (sem NF)"** (visível em qualquer mês, fora do total mensal).
- Agrupamento **Cliente › Marca › cartões** (refina o `.grupo/.subgrp` atual).
- Cartão consistente: descrição · valor · badge status (Em execução/Concluída/Aguardando) ·
  badge pagamento (Pago/A receber) · badge NF (NF emitida / **NF pendente**) · data pgto ·
  nº+data NF quando houver.
- Selo **"NF pendente"**: lilás quente (`~#C77DFF`/`--warn`), borda fininha. Sem vermelho agressivo.
- Filtros renomeados/reordenados: **Cliente · Status do serviço · Pagamento · Nota fiscal
  (emitida/pendente) · Busca por serviço**. Remover o filtro "Mês (pgto)" (o mês vem das abas).

### 5. Aba Clientes
Cada cliente com mini-resumo **do período**: faturado · recebido · pendente · em execução ·
concluídos · NF pendente. Abrir cliente → serviços do período agrupados por marca.
Ações atuais preservadas (senha portal, arquivos, link marca, editar/excluir).

### 6. Visual (evolução, não ruptura)
Mantém aurora + roxo noturno (`--c950…--c100`). Menos bordas/caixas: fundo `rgba` sutil,
borda 1px só onde organiza. Mais respiro (gaps maiores). Hierarquia: rótulo pequeno
maiúsculo + valor grande. Badges pequenos e consistentes. Gradiente roxo bem sutil só nos
cards de topo. Sem aparência gamer/saturada.

### 7. Responsivo
Abas com scroll-x; cards em grid 2-col no mobile; filtros recolhíveis (`<details>`);
cartões de serviço em leitura vertical limpa; ações principais sempre acessíveis.

## Fora de escopo (YAGNI)
- Pagamento parcial real (só Pago/A receber; "parcial" fica em observações).
- Editar `data_competencia` em massa pela UI (backfill via migration; campo novo no modal de serviço para ajustes pontuais).
- Multi-ano além do que os dados exigirem.

## Critérios de aceite
- Faturado, Recebido e A receber visivelmente distintos e corretos por mês.
- Abas mensais filtram cards + ranking + lista de forma coerente.
- Serviços sem NF destacados como "NF pendente / a faturar".
- Ranking por marca legível, priorizando maior faturado.
- Desktop e mobile revisados no preview.
- Nenhum dado existente destruído; rotas/auth/funções preservadas.
