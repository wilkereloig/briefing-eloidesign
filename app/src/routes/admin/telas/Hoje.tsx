import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  hojeISO, deslocarMes, rotuloMes, useFinancas, useNomes, useTransacoesDoMes,
} from '../../../lib/financas-store'
import {
  resultado, saldoDisponivel, saldoConta, faturaAberta, vencidas, proximosVencimentos,
  valorLiquidado,
} from '../../../domain/financeiro'
import { decisoesDoDia } from '../../../domain/decisoes'
import { Etiqueta, Icone, Indicador, Painel, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, ChipMovimento, Dinheiro, SeletorLente, SeletorMes } from '../../../ui/painel'
import { dataCurta, rotuloConta, variacao } from '../../../ui/formato'
import { fmtBRL } from '../../../lib/dinheiro'

export default function Hoje() {
  const est = useFinancas()
  const { contas, transacoes, notas, servicos, orcamentos, mes, contexto } = est
  const doMes = useTransacoesDoMes()
  const nomes = useNomes()
  const hoje = hojeISO()

  const r = useMemo(() => resultado(transacoes, contexto, mes), [transacoes, contexto, mes])
  const anterior = useMemo(
    () => resultado(transacoes, contexto, deslocarMes(mes, -1)), [transacoes, contexto, mes])
  const saldo = useMemo(
    () => saldoDisponivel(contas, transacoes, contexto), [contas, transacoes, contexto])
  const atrasadas = useMemo(() => vencidas(transacoes, hoje, contexto), [transacoes, hoje, contexto])
  const proximas = useMemo(
    () => proximosVencimentos(transacoes, hoje, 30).filter((t) => !contexto || t.contexto === contexto),
    [transacoes, hoje, contexto])

  // Orçamentos entram de verdade: passar [] aqui matava a decisão "proposta
  // enviada há N dias sem resposta", que é a única do funil comercial.
  const decisoes = useMemo(() => decisoesDoDia({
    servicos, orcamentos, transacoes, notas,
  }).slice(0, 8), [servicos, orcamentos, transacoes, notas])

  const ultimas = useMemo(() => [...doMes]
    .filter((t) => valorLiquidado(t) > 0)
    .sort((a, b) => (b.data_liquidacao || b.created_at).localeCompare(a.data_liquidacao || a.created_at))
    .slice(0, 6), [doMes])

  const contasVisiveis = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
  const semNada = !est.carregando && !contas.length && !transacoes.length

  return (
    <div className="tela pilha">
      <Cabecalho secao="Visão geral" titulo={rotuloMes(mes)}>
        <SeletorLente />
        <SeletorMes />
      </Cabecalho>

      <Carga linhas={5}>
        {semNada ? (
          <Vazio
            icone="caixa"
            titulo="Nenhuma conta cadastrada ainda"
            instrucao="Cadastre suas contas e cartões para o painel começar a somar saldo, receita e despesa."
            acao={<Link className="btn btn-primario" to="/admin/config">Cadastrar conta</Link>}
          />
        ) : (
          <>
            <div className="grade-indicadores">
              <Indicador dominante
                rotulo={contexto ? `Saldo ${contexto}` : 'Saldo consolidado'}
                valor={fmtBRL(saldo)}
                nota={`${contasVisiveis.filter((c) => c.tipo !== 'cartao_credito').length} contas ativas`} />
              <Indicador rotulo="Recebido no mês" valor={fmtBRL(r.receita_cents)} cor="acento"
                nota={variacao(r.receita_cents, anterior.receita_cents)} />
              <Indicador rotulo="Gasto no mês" valor={fmtBRL(r.despesa_cents)}
                nota={variacao(r.despesa_cents, anterior.despesa_cents)} />
              <Indicador rotulo="Resultado do mês" valor={fmtBRL(r.lucro_cents)}
                cor={r.lucro_cents < 0 ? 'coral' : undefined}
                nota={r.receita_cents > 0 ? `Margem de ${(r.margem * 100).toFixed(0)}%` : 'Sem receita no mês'} />
            </div>

            <div className="grade-indicadores">
              <Indicador rotulo="A receber" valor={fmtBRL(r.a_receber_cents)} cor="acento"
                nota={textoAtraso(atrasadas.filter((t) => t.tipo === 'entrada').length, 'receber')} />
              <Indicador rotulo="A pagar" valor={fmtBRL(r.a_pagar_cents)}
                nota={textoAtraso(atrasadas.filter((t) => t.tipo === 'saida').length, 'pagar')} />
              <Indicador rotulo="Notas pendentes"
                valor={String(notas.filter((n) => n.status === 'pendente' || n.status === 'pronta').length)}
                cor={notas.some((n) => n.status === 'pronta') ? 'coral' : undefined}
                nota="Aguardando emissão" />
              <Indicador rotulo="Em execução"
                valor={String(servicos.filter((s) => s.status_execucao === 'em_execucao').length)}
                nota={`${servicos.filter((s) => s.status_execucao === 'aguardando_inicio').length} na fila`} />
            </div>

            <Painel titulo="Precisa de você"
              acao={<span className="t-legenda">{decisoes.length} {decisoes.length === 1 ? 'item' : 'itens'}</span>}>
              {decisoes.length === 0 ? (
                <p className="t-sec">Nada atrasado e nada pendente de decisão. O mês está em dia.</p>
              ) : (
                <ul className="lista">
                  {decisoes.map((d) => (
                    <li key={d.id} className="lista-item">
                      <span className="marca-cor" aria-hidden style={{
                        background: d.urgencia === 'atrasado' ? 'var(--coral)' : 'var(--azul)',
                      }} />
                      <span className="celula">
                        <span className="t-ui espremer">{d.titulo}</span>
                        <span className="t-legenda espremer">
                          {d.detalhe}
                          {d.clienteId && nomes.cliente.get(d.clienteId)
                            ? ` · ${nomes.cliente.get(d.clienteId)!.nome}` : ''}
                        </span>
                      </span>
                      {d.valorCents != null && <Dinheiro cents={d.valorCents} className="t-valor" />}
                    </li>
                  ))}
                </ul>
              )}
            </Painel>

            <div className="grade-dupla">
              <Painel titulo="Contas e cartões"
                acao={<Link to="/admin/config" className="t-legenda">Gerenciar</Link>}>
                {contasVisiveis.length === 0
                  ? <p className="t-sec">Nenhuma conta neste contexto.</p>
                  : <ul className="lista">
                    {contasVisiveis.map((c) => (
                      <li key={c.id} className="lista-item">
                        <span className="marca-cor" aria-hidden style={{ background: c.cor || 'var(--roxo)' }} />
                        <span className="celula">
                          <span className="t-ui espremer">{c.nome}</span>
                          <span className="t-legenda">
                            {rotuloConta(c.tipo)} · {c.contexto}
                            {c.tipo === 'cartao_credito' ? ' · fatura aberta' : ''}
                          </span>
                        </span>
                        {/* Cartão mostra fatura, não saldo: a dívida é o número
                            que importa, e é o mesmo critério de Dinheiro e Config. */}
                        <Dinheiro className="t-valor"
                          cents={c.tipo === 'cartao_credito'
                            ? faturaAberta(c, transacoes)
                            : saldoConta(c, transacoes)} />
                      </li>
                    ))}
                  </ul>}
              </Painel>

              <Painel titulo="Próximos 30 dias">
                {proximas.length === 0
                  ? <p className="t-sec">Nenhum vencimento nos próximos 30 dias.</p>
                  : <ul className="lista">
                    {proximas.slice(0, 6).map((t) => (
                      <li key={t.id} className="lista-item">
                        <Icone nome={t.tipo === 'entrada' ? 'pagamento' : 'caixa'} tamanho={18} />
                        <span className="celula">
                          <span className="t-ui espremer">{t.descricao}</span>
                          <span className="t-legenda">vence em {dataCurta(t.data_vencimento!)}</span>
                        </span>
                        <Dinheiro cents={t.valor_cents - t.recebido_cents} className="t-valor" />
                      </li>
                    ))}
                  </ul>}
              </Painel>
            </div>

            <Painel titulo="Últimas movimentações"
              acao={<Link to="/admin/dinheiro" className="t-legenda">Ver todas</Link>}>
              {ultimas.length === 0
                ? <p className="t-sec">Nenhuma movimentação liquidada neste mês.</p>
                : <ul className="lista">
                  {ultimas.map((t) => (
                    <li key={t.id} className="lista-item">
                      <span className="mov-icone" data-tipo={t.tipo} aria-hidden>
                        <Icone nome={t.tipo === 'entrada' ? 'avancar' : t.tipo === 'saida' ? 'voltar' : 'compartilhar'} tamanho={16} />
                      </span>
                      <span className="celula">
                        <span className="t-ui espremer">{t.descricao}</span>
                        <span className="t-legenda espremer">
                          {t.conta_id ? nomes.conta.get(t.conta_id)?.nome ?? '' : ''}
                          {t.data_liquidacao ? ` · ${dataCurta(t.data_liquidacao)}` : ''}
                        </span>
                      </span>
                      <Dinheiro cents={t.tipo === 'saida' ? -valorLiquidado(t) : valorLiquidado(t)}
                        sinal={t.tipo !== 'transferencia'} className="t-valor" />
                      <ChipMovimento status={t.status} />
                    </li>
                  ))}
                </ul>}
            </Painel>

            <p className="t-legenda">
              <Etiqueta mini>Nota</Etiqueta>{' '}
              Transferências entre contas não entram em recebido nem em gasto — só movem saldo.
            </p>
          </>
        )}
      </Carga>
    </div>
  )
}

function textoAtraso(qtd: number, verbo: 'receber' | 'pagar'): string {
  if (qtd === 0) return `Nada atrasado a ${verbo}`
  return `${qtd} ${qtd === 1 ? 'conta vencida' : 'contas vencidas'}`
}
