# ELOI Design Studio — painel interno

Vocabulário do domínio de gestão (clientes, projetos, dinheiro) usado no painel admin (`app/`, `/admin/*`). Não cobre os formulários de briefing client-facing nem o portal do cliente — só a leitura/gestão interna do Wilke.

## Language

**Cliente**:
Pessoa ou empresa que contrata a ELOI. Dono de Projetos, do acesso ao Portal e, opcionalmente, de Sub-clientes. Tabela `eloi_clientes`.

**Sub-cliente**:
Rótulo de agrupamento visual (marca/produto) dentro de UM Cliente — ex: VIBRA/ASUS/MRV dentro do cliente "F2 EXPERIENCE". Só soma/agrupa visualmente; nunca tem portal, senha ou orçamento próprios. Campo `eloi_servicos.sub_cliente` (texto livre).
_Avoid_: "cliente-filho" (não existe hoje — viraria `parent_id` em `eloi_clientes` se um dia for real; decisão adiada).

**Projeto**:
Unidade de trabalho de um Cliente, do orçamento à cobrança. **Não é uma tabela** — é a leitura combinada de 1 `orcamentos` + (quando existir) o `eloi_servicos` ligado a ele por `orcamento_id` (no máx. 1:1, garantido por índice único parcial). Um Projeto sem `orcamento_id` (serviço criado à mão) também é um Projeto — só nasce direto na Etapa que seu estado indicar, sem passar por "Orçamento".
_Avoid_: "Orçamento" e "Serviço" como conceitos isolados na UI do painel novo — são as duas metades de um Projeto, não telas separadas.

**Etapa** (do Projeto):
Onde um Projeto está no ciclo `Orçamento → Aprovado → Execução → Entregue → Pago`. Calculada, não é uma coluna única:
- **Orçamento** — `orcamentos.status` em `rascunho`/`enviado`, sem `eloi_servicos` vinculado.
- **Aprovado** — `eloi_servicos.status_execucao = 'aguardando_inicio'`.
- **Execução** — `status_execucao = 'em_execucao'`.
- **Entregue** — `status_execucao = 'concluida'` e `pago = false`.
- **Pago** — `status_execucao = 'concluida'` e `pago = true`.
- Orçamento `recusado` fica **fora** do board de Projetos (não é uma Etapa; é um fim de linha).

**Decisão** (tela Hoje, bloco "Precisa de você"):
Item que aguarda uma ação do Wilke — não é uma entidade persistida, é calculada a partir de Projetos/Dinheiro (orçamento enviado há tempo, serviço concluído sem NF, movimento previsto vencido). Ver regra proposta no design-spec do sub-projeto 2.

**Dinheiro**:
Sempre inteiro em cents em `eloi_servicos.valor_cents` e `eloi_movimentos_financeiros.valor_cents`. **Exceção:** `orcamentos.valor_total` é `numeric` em reais (não cents) — único campo monetário do sistema que não segue a convenção; precisa de conversão explícita ao exibir/comparar com os demais.

**Caixa**:
Um lugar onde dinheiro fica (conta bancária, carteira, cartão). Tabela `eloi_caixas`; saldo = inicial + entradas realizadas − saídas realizadas.

**Movimento**:
Uma entrada ou saída de dinheiro em um Caixa, com status `previsto`/`realizado`/`cancelado`. Tabela `eloi_movimentos_financeiros`.

**Convite** (Briefings):
Um link com token (`briefing_links`) que dá acesso a um dos 4 formulários de briefing. Tem estado `pendente`/`respondido`. Formulário respondido sem token vira registro "legado" (sem Cliente vinculado).
