import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { rotuloMes, useFinancas } from '../../../../lib/financas-store'
import { diasEntre, hojeISO } from '../../../../domain/datas'
import {
  cobertura, faturaAberta, faturasDoCartao, indiceFaturaAtual, patrimonioLiquido,
  resultado, resumoEmprestimo, saidasDaCobertura, saldoAberto, saldoConta,
  type Fatura, type SituacaoFatura,
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
  const { contas, emprestimos, transacoes, mes, contexto } = useFinancas()
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
  const r = useMemo(() => resultado(transacoes, contexto, mes), [transacoes, contexto, mes])
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
            <Indicador rotulo="Resultado do mês" valor={fmtBRL(r.lucro_cents)}
              cor={r.lucro_cents < 0 ? 'coral' : undefined} nota={rotuloMes(mes)} />
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
                  <Icone nome="alerta" tamanho={16} />Faltam {fmtBRL(cob.falta_cents)} para cobrir
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
        </>
      )}
    </Carga>
  )
}

function faturaAtual(c: Conta, transacoes: Transacao[], hoje: string): Fatura | null {
  const fs = faturasDoCartao(c, transacoes, hoje)
  return fs[indiceFaturaAtual(fs, hoje)] ?? null
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
