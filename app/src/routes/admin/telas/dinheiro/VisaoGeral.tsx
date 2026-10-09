import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { rotuloMes, useFinancas } from '../../../../lib/financas-store'
import { diasEntre, hojeISO } from '../../../../domain/datas'
import {
  cobertura, faturaAberta, faturasDoCartao, indiceFaturaAtual, movimentoEntreContextos, patrimonioLiquido,
  pendenciasDeRevisao, previsaoCaixa, resultadoPorCompetencia, resumoEmprestimo, saidasDaCobertura, saldoAberto,
  saldoConta, type Fatura, type SituacaoFatura,
} from '../../../../domain/financeiro'
import type { Conta, StatusMov, Transacao } from '../../../../lib/tipos'
import { fmtBRL } from '../../../../lib/dinheiro'
import { Icone, Indicador, Painel, Vazio } from '../../../../ui/componentes'
import { Carga, ChipMovimento, Dinheiro } from '../../../../ui/painel'
import { dataCurta } from '../../../../ui/formato'
import { ChipFatura } from './compartilhado'

const DIAS = 7

/** Linha da lista "Próximos 7 dias": lançamento solto ou fatura de cartão
 *  inteira (as compras do cartão não aparecem uma a uma). */
type Item =
  | { tipo: 'mov'; id: string; titulo: string; data: string; cents: number; status: StatusMov }
  | { tipo: 'fatura'; id: string; titulo: string; data: string; cents: number; situacao: SituacaoFatura }

export default function VisaoGeral() {
  const { contas, emprestimos, transacoes, categoriasTodas, mes, contexto } = useFinancas()
  const hoje = hojeISO()

  const ativas = useMemo(() => contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto)),
    [contas, contexto])
  const cartoes = ativas.filter((c) => c.tipo === 'cartao_credito')
  const contasCorrentes = ativas.filter((c) => c.tipo !== 'cartao_credito')

  // Saldo devedor dos empréstimos ativos da lente — entra no patrimônio.
  const emp = useMemo(() => {
    const ativos = emprestimos.filter((e) => e.ativo && (!contexto || e.contexto === contexto))
    return { qtd: ativos.length, cents: ativos.reduce((s, e) => s + resumoEmprestimo(e, transacoes).falta_cents, 0) }
  }, [emprestimos, transacoes, contexto])
  const pat = useMemo(() => patrimonioLiquido(contas, transacoes, contexto, emp.cents),
    [contas, transacoes, contexto, emp.cents])
  // Resultado pela competência e pela natureza da categoria (Etapa 6): compra no
  // cartão conta no mês da compra; parcela de dívida, juros e empréstimo
  // recebido aparecem à parte, não como lucro ou prejuízo do dia a dia.
  const r = useMemo(() => resultadoPorCompetencia(transacoes, categoriasTodas, contexto, mes.slice(0, 7)),
    [transacoes, categoriasTodas, contexto, mes])
  const entre = useMemo(() => movimentoEntreContextos(contas, transacoes, mes), [contas, transacoes, mes])
  const caixa = useMemo(() => [7, 30, 90].map((d) => ({ d, c: previsaoCaixa(contas, transacoes, hoje, d, contexto) })),
    [contas, transacoes, hoje, contexto])
  const revisar = useMemo(() => pendenciasDeRevisao(transacoes, categoriasTodas, contexto),
    [transacoes, categoriasTodas, contexto])
  const cob = useMemo(() => cobertura(contas, transacoes, hoje, DIAS, contexto),
    [contas, transacoes, hoje, contexto])
  const faturas = cartoes.reduce((s, c) => s + faturaAberta(c, transacoes), 0)

  const itens = useMemo<Item[]>(() => {
    const soltas = saidasDaCobertura(contas, transacoes, hoje, DIAS, contexto)
    const movs: Item[] = soltas.map((t) => ({
      tipo: 'mov', id: t.id, titulo: t.descricao, data: t.data_vencimento!, status: t.status,
      cents: -saldoAberto(t),
    }))
    const fats: Item[] = contas
      .filter((c) => c.ativa && c.tipo === 'cartao_credito' && (!contexto || c.contexto === contexto))
      .flatMap((c) => faturasDoCartao(c, transacoes, hoje)
        .filter((f) => f.falta_cents > 0 && diasEntre(hoje, f.vencimento) <= DIAS)
        .map((f): Item => ({
          tipo: 'fatura', id: `${c.id}:${f.vencimento}`, titulo: `Fatura ${c.nome}`,
          data: f.vencimento, cents: -f.falta_cents, situacao: f.situacao,
        })))
    return [...movs, ...fats].sort((a, b) => a.data.localeCompare(b.data))
  }, [contas, transacoes, hoje, contexto])

  const semConta = !contas.some((c) => c.ativa)

  return (
    <Carga linhas={5}>
      {semConta ? (
        <Vazio icone="caixa" titulo="Nenhuma conta cadastrada"
          instrucao="Sem conta o painel não tem onde somar saldo nem o que cobrir."
          acao={<Link className="btn btn-primario" to="/admin/dinheiro/contas?novo=1">Cadastrar conta</Link>} />
      ) : (
        <>
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Patrimônio líquido" valor={fmtBRL(pat.liquido_cents)}
              cor={pat.liquido_cents < 0 ? 'coral' : undefined} nota="contas − cartões − empréstimos" />
            <Indicador rotulo="Disponível nas contas" valor={fmtBRL(pat.contas_cents)}
              nota={`${contasCorrentes.length} ${contasCorrentes.length === 1 ? 'conta ativa' : 'contas ativas'}`} />
            <Indicador rotulo="Faturas a pagar" valor={fmtBRL(faturas)}
              nota={`${cartoes.length} ${cartoes.length === 1 ? 'cartão' : 'cartões'} · próxima fatura de cada`} />
            <Indicador rotulo="Empréstimos em aberto" valor={fmtBRL(emp.cents)}
              nota={`${emp.qtd} ${emp.qtd === 1 ? 'empréstimo ativo' : 'empréstimos ativos'}`} />
            <Indicador rotulo="Resultado do mês" valor={fmtBRL(r.resultado_cents)}
              cor={r.resultado_cents < 0 ? 'coral' : undefined} nota={`${rotuloMes(mes)} · dia a dia, pelo mês da compra`} />
          </div>

          <div className="grade-dupla">
            {/* Painel em tom de alerta quando falta dinheiro: o aviso é
                persistente (não toast) porque o problema continua ali. */}
            <Painel titulo={`Próximos ${DIAS} dias`} erro={cob.falta_cents > 0}>
              <p className="t-ui">
                A pagar <Dinheiro cents={cob.a_pagar_cents} /> · disponível <Dinheiro cents={cob.disponivel_cents} />
              </p>
              {cob.falta_cents > 0 && (
                <p className="t-msg linha" role="alert" style={{ gap: 'var(--espaco-02)', marginTop: 'var(--espaco-02)' }}>
                  <Icone nome="alerta" tamanho={16} />Faltam <Dinheiro cents={cob.falta_cents} /> para cobrir
                </p>
              )}
              {itens.length === 0
                ? <p className="t-sec" style={{ marginTop: 'var(--espaco-03)' }}>Nada vencido e nada vencendo nos próximos {DIAS} dias.</p>
                : <ul className="lista" style={{ marginTop: 'var(--espaco-03)' }}>
                  {itens.map((i) => (
                    <li key={i.id} className="lista-item">
                      <Icone nome={i.tipo === 'fatura' ? 'dinheiro' : 'caixa'} tamanho={18} />
                      <span className="celula">
                        <span className="t-ui espremer">{i.titulo}</span>
                        <span className="t-legenda">{i.data < hoje ? 'venceu' : 'vence'} {dataCurta(i.data)}</span>
                      </span>
                      <Dinheiro cents={i.cents} sinal className="t-valor" />
                      {i.tipo === 'fatura'
                        ? <ChipFatura situacao={i.situacao} />
                        : <ChipMovimento status={i.status} />}
                    </li>
                  ))}
                </ul>}
            </Painel>

            <div className="pilha">
              <Painel titulo="Contas">
                {contasCorrentes.length === 0
                  ? <p className="t-sec">Nenhuma conta neste contexto.</p>
                  : <ul className="lista">
                    {contasCorrentes.map((c) => (
                      <li key={c.id}>
                        <LinhaConta c={c} destino={`/admin/dinheiro/contas/${c.id}`}
                          legenda={c.instituicao ?? c.contexto}>
                          <Dinheiro cents={saldoConta(c, transacoes)} className="t-valor" />
                        </LinhaConta>
                      </li>
                    ))}
                  </ul>}
              </Painel>

              <Painel titulo="Cartões">
                {cartoes.length === 0
                  ? <p className="t-sec">Nenhum cartão neste contexto.</p>
                  : <ul className="lista">
                    {cartoes.map((c) => {
                      const f = faturaAtual(c, transacoes, hoje)
                      return (
                        <li key={c.id}>
                          <LinhaConta c={c} destino={`/admin/dinheiro/cartoes/${c.id}`}
                            legenda={f ? `vence ${dataCurta(f.vencimento)}` : 'sem fatura'}>
                            <Dinheiro cents={f?.falta_cents ?? 0} className="t-valor" />
                          </LinhaConta>
                        </li>
                      )
                    })}
                  </ul>}
              </Painel>
            </div>
          </div>

          <div className="grade-dupla">
            <Painel titulo={`Resultado de ${rotuloMes(mes)}`}
              acao={<Link className="t-legenda" to="/admin/dinheiro/gastos">Análise de gastos</Link>}>
              <ul className="lista">
                <LinhaValor rotulo="Receitas do dia a dia" cents={r.receita_cents} />
                <LinhaValor rotulo="Gastos do dia a dia" cents={-r.despesa_cents} />
                <LinhaValor rotulo="Resultado" cents={r.resultado_cents} forte />
              </ul>
              <p className="etiqueta-mini" style={{ marginTop: 'var(--espaco-04)' }}>Fora do resultado</p>
              <ul className="lista">
                <LinhaValor rotulo="Parcelas de dívida" cents={-r.divida_cents} />
                <LinhaValor rotulo="Juros, tarifas e rendimentos" cents={-r.financeiro_liquido_cents} />
                <LinhaValor rotulo="Empréstimos recebidos, aportes, retiradas" cents={r.patrimonial_entradas_cents - r.patrimonial_saidas_cents} />
                {r.ajustes_cents !== 0 && <LinhaValor rotulo="Ajustes de conferência" cents={r.ajustes_cents} />}
                {entre.qtd > 0 && (
                  <LinhaValor
                    rotulo={contexto === 'pessoal' ? 'Veio da empresa (líquido)' : contexto === 'empresa' ? 'Foi para o pessoal (líquido)' : 'Entre empresa e pessoal (neutro aqui)'}
                    cents={contexto === 'pessoal' ? entre.empresa_para_pessoal_cents - entre.pessoal_para_empresa_cents
                      : contexto === 'empresa' ? entre.pessoal_para_empresa_cents - entre.empresa_para_pessoal_cents : 0} />
                )}
              </ul>
              <p className="t-legenda" style={{ marginTop: 'var(--espaco-03)' }}>
                Pelo valor de cada lançamento no mês a que pertence, pago ou não
                {r.a_pagar_cents || r.a_receber_cents
                  ? ` · ainda a pagar ${fmtBRL(r.a_pagar_cents)}, a receber ${fmtBRL(r.a_receber_cents)}` : ''}.
              </p>
            </Painel>

            <div className="pilha">
              <Painel titulo="Caixa previsto">
                <ul className="lista">
                  {caixa.map(({ d, c }) => (
                    <LinhaValor key={d} rotulo={`Em ${d} dias`} cents={c.provavel}
                      legenda={`entre ${fmtBRL(c.conservador)} e ${fmtBRL(c.otimista)}`} />
                  ))}
                </ul>
                <p className="t-legenda" style={{ marginTop: 'var(--espaco-03)' }}>
                  Saldo de hoje + o que vence até lá. Faixa: quanto do “a receber” de fato entra.
                </p>
              </Painel>

              {revisar.total > 0 && (
                <Painel titulo="Precisa de revisão">
                  <ul className="lista">
                    {revisar.confirmar > 0 && (
                      <li><Link className="lista-item lista-link" to="/admin/dinheiro/lancamentos?busca=confirmar">
                        <span className="celula"><span className="t-ui">{revisar.confirmar} marcados “confirmar”</span>
                          <span className="t-legenda">origem ou categoria incerta</span></span>
                        <Icone nome="avancar" tamanho={16} />
                      </Link></li>
                    )}
                    {revisar.sem_categoria > 0 && (
                      <li><Link className="lista-item lista-link" to="/admin/dinheiro/lancamentos">
                        <span className="celula"><span className="t-ui">{revisar.sem_categoria} sem categoria</span>
                          <span className="t-legenda">ficam de fora das análises por categoria</span></span>
                        <Icone nome="avancar" tamanho={16} />
                      </Link></li>
                    )}
                    {revisar.natureza_pendente > 0 && (
                      <li><Link className="lista-item lista-link" to="/admin/dinheiro/planejamento?aba=categorias">
                        <span className="celula"><span className="t-ui">{revisar.natureza_pendente} categorias com natureza a confirmar</span>
                          <span className="t-legenda">decide se entra no resultado</span></span>
                        <Icone nome="avancar" tamanho={16} />
                      </Link></li>
                    )}
                  </ul>
                </Painel>
              )}
            </div>
          </div>
        </>
      )}
    </Carga>
  )
}

function faturaAtual(c: Conta, transacoes: Transacao[], hoje: string): Fatura | null {
  const fs = faturasDoCartao(c, transacoes, hoje)
  return fs[indiceFaturaAtual(fs, hoje)] ?? null
}

function LinhaValor({ rotulo, cents, legenda, forte }: { rotulo: string; cents: number; legenda?: string; forte?: boolean }) {
  return (
    <li className="lista-item">
      <span className="celula">
        <span className="t-ui">{forte ? <strong>{rotulo}</strong> : rotulo}</span>
        {legenda && <span className="t-legenda">{legenda}</span>}
      </span>
      <Dinheiro cents={cents} sinal={cents !== 0} className="t-valor" />
    </li>
  )
}

/** Linha clicável de conta/cartão: a linha inteira leva à página dela. */
function LinhaConta({ c, destino, legenda, children }:
  { c: Conta; destino: string; legenda: string; children: ReactNode }) {
  return (
    <Link to={destino} className="lista-item lista-link">
      <span className="marca-cor" aria-hidden style={{ background: c.cor || 'var(--roxo)' }} />
      <span className="celula">
        <span className="t-ui espremer">{c.nome}</span>
        <span className="t-legenda espremer">{legenda}</span>
      </span>
      {children}
      <Icone nome="avancar" tamanho={16} />
    </Link>
  )
}
