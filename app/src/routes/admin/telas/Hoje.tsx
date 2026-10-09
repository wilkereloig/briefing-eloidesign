import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  hojeISO, deslocarMes, rotuloMes, useFinancas, useNomes, useTransacoesDoMes,
} from '../../../lib/financas-store'
import {
  resultado, saldoDisponivel, saldoConta, faturaAberta, vencidas, proximosVencimentos,
  saldoAberto, valorLiquidado,
} from '../../../domain/financeiro'
import { ACAO, decisoesDoDia, pendenciasDeServicos } from '../../../domain/decisoes'
import { Botao, Etiqueta, Icone, Indicador, Painel } from '../../../ui/componentes'
import { Onboarding } from '../Onboarding'
import { PainelTarefas } from '../Tarefas'
import { Cabecalho, Carga, ChipMovimento, Dinheiro, SeletorLente, SeletorMes } from '../../../ui/painel'
import { dataCurta, rotuloConta, variacao } from '../../../ui/formato'
import { fmtBRL } from '../../../lib/dinheiro'

const LIMITE_DECISOES = 8

export default function Hoje() {
  const est = useFinancas()
  const { contas, transacoes, notas, servicos, orcamentos, briefings, mes, contexto } = est
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
  // `contas` entra para a regra "nenhuma conta cadastrada" saber a diferença
  // entre "não há conta" e "ninguém informou" — as duas são [] sem isso.
  // `setup:contas` sai daqui: sem conta o <Onboarding> já está na tela dizendo isso.
  const decisoes = useMemo(() => decisoesDoDia({
    servicos, orcamentos, transacoes, notas, briefings, contas,
  }).filter((d) => d.id !== 'setup:contas'),
  [servicos, orcamentos, transacoes, notas, briefings, contas])
  // O cabeçalho conta a fila inteira; a lista mostra 8 e abre no lugar.
  const [verTodas, setVerTodas] = useState(false)
  const decisoesVisiveis = verTodas ? decisoes : decisoes.slice(0, LIMITE_DECISOES)
  const pend = useMemo(() => pendenciasDeServicos(servicos), [servicos])

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
        {/* Instalação vazia: a lista de passos substitui o dashboard de zeros. */}
        <Onboarding />

        {/* Serviço, NF, prazo e briefing não dependem de conta: ficam fora da
            trava de `semNada`. Quem usa só serviços também tem o que decidir. */}
        <div className="grade-indicadores">
          <Indicador rotulo="A receber de serviços" valor={fmtBRL(pend.a_receber_cents)} cor="acento"
            nota={pend.atrasado_qtd === 0
              ? `${pend.a_receber_qtd} em aberto · nada atrasado`
              : `${pend.atrasado_qtd} atrasado${pend.atrasado_qtd === 1 ? '' : 's'} · ${fmtBRL(pend.atrasado_cents)}`} />
          <Indicador rotulo="Concluído sem nota" valor={String(pend.sem_nf_qtd)}
            cor={pend.sem_nf_qtd > 0 ? 'coral' : undefined}
            nota={pend.sem_nf_qtd > 0 ? `${fmtBRL(pend.sem_nf_cents)} sem NF` : 'Tudo com nota'} />
          <Indicador rotulo="Notas pendentes"
            valor={String(notas.filter((n) => n.status === 'pendente' || n.status === 'pronta').length)}
            cor={notas.some((n) => n.status === 'pronta') ? 'coral' : undefined}
            nota="Sem PDF anexado" />
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
              {decisoesVisiveis.map((d) => (
                <li key={d.id} className="lista-item">
                  <span className="marca-cor" aria-hidden style={{
                    background: d.urgencia === 'atrasado' ? 'var(--coral)' : 'var(--azul)',
                  }} />
                  <span className="celula">
                    {/* Contexto antes do problema: "F2 · Vibra" responde
                        "de quem é isso?" sem abrir nada. */}
                    {(d.clienteId || d.marca) && (
                      <span className="etiqueta-mini espremer">
                        {[d.clienteId ? nomes.cliente.get(d.clienteId)?.nome : null, d.marca]
                          .filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <span className="t-ui espremer">{d.titulo}</span>
                    <span className="t-legenda espremer">{d.detalhe}</span>
                  </span>
                  {d.valorCents != null && <Dinheiro cents={d.valorCents} className="t-valor" />}
                  <Link className="btn btn-secundario btn-compacto" to={ACAO[d.acao].destino}>
                    {ACAO[d.acao].rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {decisoes.length > LIMITE_DECISOES && (
            <Botao compacto onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}
              style={{ marginTop: 'var(--espaco-03)' }}>
              {verTodas ? 'Mostrar menos' : `Ver todas (${decisoes.length})`}
            </Botao>
          )}
        </Painel>

        {/* Manual, separado do automático: tarefa é o que o dono decidiu
            fazer; "Precisa de você" é o que o sistema detectou. */}
        <PainelTarefas limite={6} aceitaUrlNovo />

        {semNada ? null : (
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
              {/* Caixa (recebido − pago). O resultado por competência e natureza
                  fica em Dinheiro › Visão geral — nomes diferentes de propósito. */}
              <Indicador rotulo="Sobra do mês" valor={fmtBRL(r.lucro_cents)}
                cor={r.lucro_cents < 0 ? 'coral' : undefined}
                nota={r.receita_cents > 0 ? `recebido − pago · ${(r.margem * 100).toFixed(0)}% do recebido` : 'Sem recebimento no mês'} />
            </div>

            <div className="grade-indicadores">
              {/* "Lançado": vem de transações, não de serviços — os dois
                  "a receber" convivem até o financeiro substituir o campo `pago`. */}
              <Indicador rotulo="Lançado a receber" valor={fmtBRL(r.a_receber_cents)} cor="acento"
                nota={textoAtraso(atrasadas.filter((t) => t.tipo === 'entrada').length, 'receber')} />
              <Indicador rotulo="A pagar" valor={fmtBRL(r.a_pagar_cents)}
                nota={textoAtraso(atrasadas.filter((t) => t.tipo === 'saida').length, 'pagar')} />
            </div>

            <div className="grade-dupla">
              <Painel titulo="Contas e cartões"
                acao={<Link to="/admin/dinheiro/contas" className="t-legenda">Gerenciar</Link>}>
                {contasVisiveis.length === 0
                  ? <p className="t-sec">Nenhuma conta neste contexto.</p>
                  : <ul className="lista">
                    {contasVisiveis.map((c) => (
                      <li key={c.id}>
                        <Link className="lista-item lista-link"
                          to={`/admin/dinheiro/${c.tipo === 'cartao_credito' ? 'cartoes' : 'contas'}/${c.id}`}>
                          <span className="marca-cor" aria-hidden style={{ background: c.cor || 'var(--roxo)' }} />
                          <span className="celula">
                            <span className="t-ui espremer">{c.nome}</span>
                            <span className="t-legenda">
                              {rotuloConta(c.tipo)} · {c.contexto}
                              {c.tipo === 'cartao_credito' ? ' · fatura aberta' : ''}
                            </span>
                          </span>
                          {/* Cartão mostra fatura, não saldo: a dívida é o número
                              que importa, e é o mesmo critério das páginas de Dinheiro. */}
                          <Dinheiro className="t-valor"
                            cents={c.tipo === 'cartao_credito'
                              ? faturaAberta(c, transacoes)
                              : saldoConta(c, transacoes)} />
                          <Icone nome="avancar" tamanho={16} />
                        </Link>
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
                        <Dinheiro cents={saldoAberto(t)} className="t-valor" />
                      </li>
                    ))}
                  </ul>}
              </Painel>
            </div>

            <Painel titulo="Últimas movimentações"
              acao={<Link to="/admin/dinheiro/lancamentos" className="t-legenda">Ver todas</Link>}>
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
