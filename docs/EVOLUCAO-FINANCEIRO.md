# Evolução do sistema ELOI — financeiro, gestão e visual

Plano de 10 etapas (briefing do dono, 2026-10-09). Branch de trabalho:
`evolucao/financeiro-integrado`. **Nada daqui está em produção** até autorização
escrita: nem migração, nem edge, nem `app/dist`.

Produto principal: **Studio** (este repositório). Confirmado pelo inventário
(`docs/INVENTARIO-2026-10.md` §2): é a única aplicação com lançamentos; o app
Financeiro separado está vazio.

## Estado por etapa

| Etapa | Estado | Entrega nesta branch |
|---|---|---|
| 1. Inventário e proteção | ✅ (com limitação) | `INVENTARIO-2026-10.md`; schema de homologação idêntico ao de produção; baseline privado; **backup de dados não feito** — sem credencial (ver inventário §7) |
| 2. Confiabilidade | ✅ código + testes · ⏳ publicação | RPCs atômicas, idempotência, unicidade de recorrência, completude, saldo no servidor, travas de conta, guarda de ambiente |
| 3. Obrigações × liquidações × resultados | ✅ núcleo · ⏳ telas | `eloi_liquidacoes`, natureza das categorias, 3 perspectivas no banco, `resultadoPorCompetencia` no domínio, relatório de diferenças |
| 4. Revisão de dados e consolidação | ⏳ | mapa feito (inventário §6): não há dado a migrar do app Financeiro; fila de exceções abaixo |
| 5. Contas, cartões, dívidas, conciliação | ⏳ parcial | saldo inicial com data e arquivamento preservando saldo; bloqueios de fatura; resto pendente |
| 6. Gestão integrada | ⏳ | — |
| 7. Novo visual | ⏳ | — |
| 8. Acesso e automação | ⏳ parcial | rotina diária (pg_cron), limpeza no logout, auditoria |
| 9. Site e portal | ⏳ | política de INSERT anônimo em `briefings` documentada |
| 10. Homologação e publicação | ⏳ parcial | testes de banco em Postgres local; reversão testada |

## Contratos de cálculo

Cada perspectiva responde **uma** pergunta. Elas não se somam entre si.

| Perspectiva | Pergunta | Regra | Onde |
|---|---|---|---|
| **Caixa realizado** | Quanto dinheiro andou, e quando? | Soma das **liquidações** pela data de cada uma. Transferência entre contas do mesmo contexto não aparece; entre contextos aparece como `entre_contextos` dos dois lados (zero no consolidado). Legado acumulado é marcado (`aproximado_cents`) | `eloi_caixa_realizado` |
| **Resultado por competência** | O mês deu lucro? | **Valor original** de entradas/saídas não canceladas no mês de competência (cai no vencimento), separado por **natureza**: só `operacional` é resultado. Dívida, juros, patrimonial e ajuste aparecem à parte. Compra no cartão = despesa no mês da compra; pagar a fatura não é despesa | `eloi_resultado_competencia` · `resultadoPorCompetencia` |
| **Obrigações em aberto** | O que falta pagar/receber? | `valor − recebido` das linhas em aberto, por prazo (atrasado, 7 dias, 30 dias, depois, sem vencimento) | `eloi_obrigacoes_abertas` |
| **Previsão de caixa** | Como fica o caixa em 7/30/90 dias? | Hoje: `previsaoCaixa` (domínio) por vencimento, com cenários. Pendente: data esperada separada do vencimento e recorrências projetadas | domínio |
| **Patrimônio** | Quanto tenho menos quanto devo? | Saldo das contas (crédito/cheque especial **não** é dinheiro próprio) − dívida dos cartões − saldo devedor dos empréstimos. Conta arquivada com saldo/dívida entra | `patrimonioLiquido` |
| *Legado* | — | `resultadoLiquidadoPorCompetencia` (antigo `resultado`): soma o **já pago** das transações do mês de competência. Mantido até as telas migrarem | domínio |

**Saldo oficial por conta:** `eloi_saldos_contas` (banco, histórico inteiro, inclui
arquivadas). A tela recalcula com `saldoConta` e, se divergir, mostra aviso em
`falhas.saldos`. Teste de paridade: `app/src/lib/financas-store.test.ts` usa a mesma
massa de `database/homologacao/testes/00-semente-legado.sql`.

### Natureza das categorias

`operacional` · `financeira` (juros, tarifas, IOF, rendimentos) · `divida` (parcela
de empréstimo, rotativo, parcelamento de fatura — o extrato não separa principal de
juros) · `patrimonial` (empréstimo recebido, aporte, retirada, pró-labore,
distribuição). A migração classifica **só** as 6 categorias-padrão cujo nome declara
a natureza; as demais ficam `operacional` (como sempre foram tratadas) e entram na
fila `eloi_revisao_natureza` para o dono confirmar.

## Liquidações

- `eloi_transacoes` continua sendo a **obrigação** (valor, competência, vencimento,
  contexto, categoria, vínculos). IDs não mudam.
- `eloi_liquidacoes` guarda **cada** pagamento/recebimento: valor, data, conta, forma,
  origem, chave de idempotência, autor, reversão.
- `recebido_cents`, `data_liquidacao` e `status` viram projeção, mantida pelas RPCs e,
  para caminhos antigos, pelo trigger de espelho. **Invariante testada:**
  soma(liquidações) = `recebido_cents`.
- Histórico legado: uma liquidação `legado_acumulado` com o valor acumulado na data
  da última liquidação. **Pagamentos intermediários que o banco não guardou não são
  reconstruídos.** Na base real: 214 transações nessa condição, todas com data de
  liquidação, nenhuma "realizada sem recebido" e nenhuma "realizada incompleta".
- Uma obrigação pode ser liquidada em datas e contas diferentes (a conta fica na
  liquidação; a obrigação não muda de conta). Cartão de crédito não é conta de
  liquidação: pagar algo com o cartão é uma compra no cartão.

## Diferenças entre o critério antigo e os novos (dados reais)

Calculadas só com leitura; os valores ficam no baseline privado. Causas, em ordem
de impacto:

1. **O mês corrente parece sem despesa no critério antigo**, porque ele só soma o que
   já foi pago. Em outubro, a despesa operacional por competência é dezenas de vezes
   maior que a do critério antigo.
2. **Empréstimo recebido entrava como receita** (agosto e outubro, pessoal).
3. **Parcelas de dívida, rotativo e parcelamento de fatura entravam como despesa
   operacional.** No pessoal, isso pesa mais que todo o gasto operacional em vários meses.
4. Rendimentos de centavos saem da receita operacional (vão para `financeira`).
5. Empresa: receitas idênticas nos dois critérios; uma despesa difere pelo que não foi pago.

## Exceções para o dono decidir (sem dado pessoal aqui; detalhe no baseline privado)

1. ~~Natureza das categorias~~ — **confirmada pelo dono em 2026-10-09** (dia a dia:
   Alimentação, Moradia, Saúde, Transporte, Lazer, Assinaturas, Viagens, Cuidados
   pessoais, Compras, Projetos, Rateio da casa). "Outros" e "Outras entradas" misturam
   naturezas: revisão lançamento a lançamento, feita com o dono fora do repositório.
2. Linhas de cartão "saldo não pago da fatura anterior" e "parcelamento de faturas"
   podem **duplicar** compras de faturas anteriores, se essas compras também estiverem
   lançadas. Conferir com os PDFs.
3. Duas faturas resumidas ("… — parcial") convivem com compras detalhadas; trocar pelos
   itens quando o PDF chegar.
4. Lançamentos com "confirmar" em observações (≈ duas dezenas): PIX de origem incerta,
   ajuste de centavo, entradas de contas não cadastradas.
5. Serviços marcados como pagos **não têm** transação vinculada, e as entradas da
   empresa não apontam serviço. Não somar os dois; na Etapa 4, propor vínculos por
   candidatos (valor + data + cliente) para confirmação.
6. Conta fixa paga com cartão: hoje bloqueada na folha de baixa. A forma correta é
   lançá-la na conta do cartão.
7. A transferência de entrada da empresa em conta pessoal aparece em 9 lançamentos
   cujo contexto difere do da conta: definir a natureza (pró-labore, distribuição ou reembolso).
8. ~~Edges e cron do app Financeiro~~ — **desligados em 2026-10-09** a pedido do dono
   (reversível; ver inventário §6).
9. A edge legada `eloi-financeiro` continua ativa.
10. Entregas de cliente servidas publicamente pelo `outputDirectory: "."` — dono decidiu
    manter (2026-10-09).
11. Backup restaurável: adiado pelo dono (2026-10-09). Continua pré-requisito para
    aplicar as migrações em produção.

## Publicação — ordem, verificação e reversão

**Pré-requisito: backup restaurável** (procedimento no inventário §7). Sem ele, não aplicar.

1. **Migrações**, nesta ordem (todas aditivas, testadas em homologação):
   `2026-07-15-servicos-sub-cliente-legado.sql` (no-op), `2026-10-09-reconcilia-schema-producao.sql`
   (no-op), `2026-10-09-liquidacoes-e-operacoes-atomicas.sql`,
   `2026-10-09-natureza-e-perspectivas.sql`, `2026-10-09-rotina-diaria-cron.sql`.
   Antes, rodar no banco real: duplicidade de `(recorrencia_id, data_competencia)` = 0
   (era 0 em 2026-10-09).
2. **Verificar:** invariante soma(liquidações) = `recebido_cents` para todas as linhas;
   `eloi_saldos_contas()` = saldos do baseline; checksums das tabelas antigas iguais,
   exceto `eloi_transacoes` (coluna `ocorrencia`) e `eloi_categorias` (natureza).
3. **Edge** `eloi-financas` (MCP `deploy_edge_function`, conferir com `get_edge_function`,
   smoke 401, registrar em `DEPLOYS.json`).
4. **`app/dist`** (merge na `master`). O front novo é compatível com a edge antiga
   (`completo`, `saldos`, `erros` são opcionais), mas a **edge nova exige as migrações**.

**Reversão** (testada): `app/dist` anterior → edge anterior →
`database/homologacao/reverter-2026-10-09.sql` → reaplicar `2026-10-08-pagar-fatura.sql`.
Preserva transações e projeções; perde o detalhe por pagamento e a trilha (exportar antes).

## Homologação

- `database/homologacao/recriar.sh` recria o schema em Postgres local; `fingerprint.sql`
  compara com produção.
- `database/homologacao/testar.sh` semeia dados **sintéticos** no formato legado, aplica a
  migração de liquidações (testa o backfill) e roda 53 afirmações + 2 cenários de
  concorrência (baixas simultâneas, três gerações de recorrência simultâneas).
- O painel em `localhost` ou em preview da Vercel **não grava em produção**: escrita
  bloqueada no cliente, a menos que `VITE_FUNCTIONS_URL` aponte para outro backend
  ou `VITE_PERMITIR_ESCRITA_PRODUCAO=1`.

## Limitações registradas

- Sem backup de dados nesta sessão. Nenhuma transformação foi feita no banco real.
- As telas ainda mostram o critério legado de resultado. Trocar é Etapa 6/7, junto do
  novo visual, para não mudar o número na frente do dono sem a explicação na tela.
- O estorno de pagamento de fatura não existe. Por enquanto, apagar e cancelar estão bloqueados.
- Importação/conciliação (CSV/OFX com FITID, lote, reversão) é a Etapa 5.
- `deno lint` acusa estilo preexistente (`any`, imports inline); não faz parte do `verify`.
