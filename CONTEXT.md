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
Sempre inteiro em cents (`valor_cents`, `recebido_cents`, `alvo_cents`, `limite_cents`…). **Exceção:** `orcamentos.valor_total` é `numeric` em reais — único campo monetário do sistema fora da convenção; precisa de `centsDeReais()` ao exibir ou comparar.
Todo cálculo vive em `app/src/domain/financeiro.ts` (saldo, resultado, vencidos, fatura, parcelas, previsão, agregações). **Tela não recalcula dinheiro.** Duas telas com contas próprias é como um sistema passa a mostrar dois valores para a mesma coisa.

**Contexto**:
`pessoal` ou `empresa`. Toda Conta, Categoria, Transação, Recorrência e Meta declara o seu. É o que mantém as finanças do Wilke separadas das do ELOI Studio dentro das mesmas tabelas. A interface chama isso de **lente** e oferece uma terceira posição, "Tudo", que soma os dois.
_Avoid_: tabelas paralelas por contexto — dariam dois lugares para calcular saldo consolidado.

**Conta**:
Um lugar onde dinheiro fica: conta bancária, carteira, dinheiro, investimento, reserva ou **cartão de crédito**. Tabela `eloi_contas`. Saldo = inicial + entradas liquidadas − saídas liquidadas ± transferências. Cartão de crédito **não entra no saldo disponível** — sua fatura é dívida, não caixa; e cartão sem `dia_fechamento`/`dia_vencimento` é barrado por constraint, porque sem ciclo não existe fatura.
_Avoid_: "Caixa" para o conceito novo. `eloi_caixas` é a tabela do painel legado `/gestao`, vazia e congelada.

**Transação**:
Qualquer movimento de dinheiro. Tabela `eloi_transacoes` — receita, despesa, transferência, parcela e compra no cartão são todas linhas dela; o que muda é `tipo`/`contexto`/vínculo, não a estrutura.
- `valor_cents` é o combinado; `recebido_cents` é o que efetivamente andou. **Pagamento parcial é normal, não exceção.**
- `data_competencia` = a que mês o valor pertence · `data_vencimento` = quando é devido · `data_liquidacao` = quando o dinheiro andou. **Resultado usa competência; saldo usa liquidação.**
- Status (`previsto`/`pendente`/`parcial`/`realizado`/`vencido`/`cancelada`) é **derivado do valor no servidor**, nunca escolhido pela tela.

**Transferência**:
Movimento entre duas Contas: **uma linha só**, com `conta_id` (origem) e `conta_destino_id`. Move saldo e é **neutra no resultado — nunca conta como receita nem como despesa.** É a forma de lançar pró-labore, distribuição de lucro, aporte pessoal na empresa, reembolso e pagamento de fatura de cartão.
_Avoid_: duas linhas espelhadas (uma saída + uma entrada). É assim que um sistema financeiro passa a inflar faturamento.

**Parcelamento**:
Parcelas são Transações irmãs ligadas por `grupo_id`, cada uma com seu vencimento — não existe tabela de parcelas, porque cada parcela é uma obrigação real com data própria. Quem divide o valor é o servidor, e o resto da divisão vai inteiro na primeira parcela (100,00 em 3 = 33,34 + 33,33 + 33,33). Excluir remove o grupo inteiro: uma parcela sozinha deixaria "3/12" órfã.

**Recorrência**:
Molde que gera Transações (`eloi_recorrencias`). Materializada ao abrir o painel, de forma **idempotente por vencimento** — abrir dez vezes no mesmo dia não lança a assinatura dez vezes. Pausar ou encerrar não apaga o que já foi gerado.

**Meta / Orçamento de gasto**:
Mesma tabela (`eloi_metas`), discriminada por `especie`. `orcamento` compara gasto da categoria com um limite no período; `meta` acumula em direção a um alvo. Desativar preserva o histórico do que foi planejado.

**Nota fiscal**:
`eloi_notas_fiscais`, ligada a Cliente, Serviço e Transação. Nota com status `emitida`/`enviada` **exige número** — validado no servidor. Serviço concluído sem nota vira Decisão.

**Movimento** (legado):
Entrada/saída em `eloi_movimentos_financeiros`, do painel `/gestao`. Tabela vazia e congelada; substituída por Transação.

**Convite** (Briefings):
Um link com token (`briefing_links`) que dá acesso a um dos 4 formulários de briefing. Tem estado `pendente`/`respondido`. Formulário respondido sem token vira registro "legado" (sem Cliente vinculado).
