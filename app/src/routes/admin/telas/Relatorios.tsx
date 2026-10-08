import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtBRL } from '../../../lib/dinheiro'
import { baixarCsv } from '../../../lib/exportar'
import { deslocarMes, hojeISO, useFinancas, useNomes } from '../../../lib/financas-store'
import {
  agrupar, estaEmAberto, previsaoCaixa, saldoAberto, serieResultado,
  ticketMedio, valorLiquidado,
} from '../../../domain/financeiro'
import {
  aging, analiseGastos, aplicarFiltro, CARTAO_SEM_DETALHE, porCliente, reaisCsv, resumoFiscal, resumoProjetos, type Filtro,
} from '../../../domain/relatorios'
import { juntarProjetos } from '../../../domain/projeto'
import { semNotaFiscal } from '../../../domain/decisoes'
import {
  Botao, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro, SeletorLente } from '../../../ui/painel'

type Aba = 'gastos' | 'resultado' | 'clientes' | 'projetos' | 'recebiveis' | 'fiscal' | 'categorias' | 'previsao'
const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'gastos', label: 'Gastos' },
  { chave: 'resultado', label: 'Resultado' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'projetos', label: 'Projetos' },
  { chave: 'recebiveis', label: 'Recebíveis' },
  { chave: 'fiscal', label: 'Fiscal' },
  { chave: 'categorias', label: 'Por categoria' },
  { chave: 'previsao', label: 'Previsão' },
]

const ROTULO_ETAPA = {
  orcamento: 'Em proposta', aprovado: 'Aprovado', execucao: 'Em execução', entregue: 'Entregue', pago: 'Pago',
} as const

export default function Relatorios() {
  const {
    contas, transacoes, servicos, orcamentos, notas, clientes, subClientes, mes, contexto, categoriasTodas,
  } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [aba, setAba] = useState<Aba>('gastos')
  // Um filtro para todas as abas: período por competência, cliente, marca.
  // A lente pessoal/empresa continua no cabeçalho, como nas outras telas.
  const [filtro, setFiltro] = useState<Filtro>({})
  const [porMarca, setPorMarca] = useState(false)
  const temFiltro = !!(filtro.de || filtro.ate || filtro.clienteId || filtro.subClienteId)

  const servicoMapa = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos])
  // Base de todas as abas: lente + filtro. O gráfico de 12 meses ignora o
  // período (ele É o período) mas respeita cliente e marca.
  const base = useMemo(() => aplicarFiltro(
    transacoes.filter((t) => !contexto || t.contexto === contexto), filtro, servicoMapa),
    [transacoes, contexto, filtro, servicoMapa])
  const baseSemPeriodo = useMemo(() => aplicarFiltro(
    transacoes.filter((t) => !contexto || t.contexto === contexto),
    { clienteId: filtro.clienteId, subClienteId: filtro.subClienteId }, servicoMapa),
    [transacoes, contexto, filtro.clienteId, filtro.subClienteId, servicoMapa])
  const servicosFiltrados = useMemo(() => servicos.filter((s) =>
    (!filtro.clienteId || s.cliente_id === filtro.clienteId)
    && (!filtro.subClienteId || s.sub_cliente_id === filtro.subClienteId)),
    [servicos, filtro.clienteId, filtro.subClienteId])

  const linhasCliente = useMemo(() => porCliente(base, servicosFiltrados, porMarca), [base, servicosFiltrados, porMarca])
  const projetos = useMemo(() => resumoProjetos(
    juntarProjetos(orcamentos.filter((o) => !filtro.clienteId || o.cliente_id === filtro.clienteId), servicosFiltrados), hoje),
    [orcamentos, servicosFiltrados, filtro.clienteId, hoje])
  const recebiveis = useMemo(() => aging(base, hoje), [base, hoje])
  const fiscal = useMemo(() => resumoFiscal(notas, filtro), [notas, filtro])

  const nomeChave = (k: string) => porMarca
    ? nomes.subCliente.get(k)?.nome ?? 'Marca removida'
    : nomes.cliente.get(k)?.nome ?? 'Cliente removido'

  // Exportação: o que a aba mostra, em CSV com ; e vírgula decimal.
  const exportar = () => {
    const sufixo = filtro.de || filtro.ate ? `-${filtro.de ?? 'inicio'}-a-${filtro.ate ?? 'hoje'}` : `-${mes}`
    if (aba === 'clientes') {
      baixarCsv(`${porMarca ? 'marcas' : 'clientes'}${sufixo}`,
        [porMarca ? 'Marca' : 'Cliente', 'Recebido', 'A receber', 'Projetos', 'Ticket médio'],
        linhasCliente.map((l) => [nomeChave(l.chave), reaisCsv(l.recebido_cents), reaisCsv(l.a_receber_cents), l.projetos, reaisCsv(l.ticket_cents)]))
    } else if (aba === 'recebiveis') {
      const abertas = base.filter((t) => t.tipo === 'entrada' && estaEmAberto(t))
      baixarCsv(`recebiveis${sufixo}`,
        ['Vencimento', 'Descrição', 'Cliente', 'Combinado', 'Recebido', 'Restante', 'Status'],
        abertas.map((t) => [t.data_vencimento, t.descricao, t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : '',
          reaisCsv(t.valor_cents), reaisCsv(t.recebido_cents), reaisCsv(saldoAberto(t)), t.status]))
    } else if (aba === 'gastos') {
      baixarCsv(`gastos${sufixo}`, ['Categoria', ...gastos.meses, 'Total', 'Lançamentos'],
        gastos.porCategoria.map((c) => [nomeCategoriaGasto(c.categoria_id), ...c.porMes.map(reaisCsv), reaisCsv(c.total_cents), c.qtd]))
    } else if (aba === 'categorias') {
      baixarCsv(`despesas-por-categoria${sufixo}`, ['Categoria', 'Total', 'Lançamentos'],
        porCategoria.map((f) => [nomes.categoria.get(f.chave)?.nome ?? 'Sem categoria', reaisCsv(f.total_cents), f.qtd]))
    } else if (aba === 'fiscal') {
      baixarCsv(`notas${sufixo}`, ['Número', 'Cliente', 'Status', 'Valor', 'Imposto', 'Emitida em', 'Competência'],
        notas.filter((n) => !filtro.clienteId || n.cliente_id === filtro.clienteId)
          .map((n) => [n.numero, n.cliente_id ? nomes.cliente.get(n.cliente_id)?.nome : '', n.status, reaisCsv(n.valor_cents), reaisCsv(n.imposto_cents), n.emitida_em, n.competencia]))
    } else {
      // Resultado, projetos e previsão: exporta os lançamentos do recorte.
      baixarCsv(`lancamentos${sufixo}`,
        ['Competência', 'Vencimento', 'Liquidação', 'Tipo', 'Descrição', 'Cliente', 'Categoria', 'Conta', 'Combinado', 'Liquidado', 'Status', 'Origem'],
        base.filter((t) => t.tipo !== 'transferencia').map((t) => [
          t.data_competencia, t.data_vencimento, t.data_liquidacao, t.tipo, t.descricao,
          t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : '', t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : '',
          t.conta_id ? nomes.conta.get(t.conta_id)?.nome : '', reaisCsv(t.valor_cents), reaisCsv(valorLiquidado(t)), t.status, t.origem,
        ]))
    }
  }

  // Doze meses terminando no mês em foco. O store tem o histórico inteiro,
  // então nenhuma coluna aparece truncada por falta de dado carregado.
  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => deslocarMes(mes, i - 11)), [mes])

  const { serie, total: totalAno } = useMemo(
    () => serieResultado(baseSemPeriodo, meses, contexto), [meses, baseSemPeriodo, contexto])

  const teto = Math.max(...serie.map((s) => Math.max(s.receita_cents, s.despesa_cents)), 1)

  const porCategoria = useMemo(() => agrupar(base, (t) => t.categoria_id, 'saida'), [base])

  // Gastos: os meses do período filtrado, ou os 3 últimos até o mês em foco.
  // Usa a lista com cliente/marca mas SEM o corte de datas — o corte é `mesesGastos`.
  const mesesGastos = useMemo(() => {
    if (!filtro.de && !filtro.ate) return [deslocarMes(mes, -2), deslocarMes(mes, -1), mes]
    const ini = (filtro.de ?? filtro.ate!).slice(0, 7), fim = (filtro.ate ?? filtro.de!).slice(0, 7)
    const out: string[] = []
    for (let m = ini; m <= fim && out.length < 24; m = deslocarMes(m, 1)) out.push(m)
    return out
  }, [filtro.de, filtro.ate, mes])
  const gastos = useMemo(() => analiseGastos(baseSemPeriodo, categoriasTodas, mesesGastos, contexto),
    [baseSemPeriodo, categoriasTodas, mesesGastos, contexto])
  const nomeCategoriaGasto = (id: string | null) => id === CARTAO_SEM_DETALHE
    ? 'Cartão — fatura sem detalhe'
    : id ? nomes.categoria.get(id)?.nome ?? 'Categoria removida' : 'Sem categoria'

  const cenarios = useMemo(
    () => previsaoCaixa(contas, transacoes, hoje, 90, contexto), [contas, transacoes, hoje, contexto])

  return (
    <div className="tela pilha" data-density="dense">
      <Cabecalho secao="Análise" titulo="Relatórios">
        <SeletorLente />
        <Botao onClick={exportar} className="nao-imprime">
          <Icone nome="baixar" tamanho={16} />CSV
        </Botao>
        <Botao onClick={() => window.print()} className="col-desktop nao-imprime">Imprimir</Botao>
      </Cabecalho>

      <Carga linhas={5}>
        <div className="grade-filtros nao-imprime" role="group" aria-label="Filtros">
          <div className="campo">
            <label htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" className="campo-caixa" value={filtro.de ?? ''}
              onChange={(e) => setFiltro({ ...filtro, de: e.target.value || undefined })} />
          </div>
          <div className="campo">
            <label htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" className="campo-caixa" value={filtro.ate ?? ''}
              onChange={(e) => setFiltro({ ...filtro, ate: e.target.value || undefined })} />
          </div>
          <div className="campo">
            <label htmlFor="rel-cliente">Cliente</label>
            <select id="rel-cliente" className="campo-caixa" value={filtro.clienteId ?? ''}
              onChange={(e) => setFiltro({ ...filtro, clienteId: e.target.value || undefined, subClienteId: undefined })}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {filtro.clienteId && subClientes.some((m) => m.cliente_id === filtro.clienteId) && (
            <div className="campo">
              <label htmlFor="rel-marca">Marca</label>
              <select id="rel-marca" className="campo-caixa" value={filtro.subClienteId ?? ''}
                onChange={(e) => setFiltro({ ...filtro, subClienteId: e.target.value || undefined })}>
                <option value="">Todas</option>
                {subClientes.filter((m) => m.cliente_id === filtro.clienteId).map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {temFiltro && (
          <p className="t-legenda">
            Recorte ativo: {[
              filtro.de || filtro.ate ? `${filtro.de ?? 'início'} → ${filtro.ate ?? 'hoje'}` : null,
              filtro.clienteId ? nomes.cliente.get(filtro.clienteId)?.nome : null,
              filtro.subClienteId ? nomes.subCliente.get(filtro.subClienteId)?.nome : null,
            ].filter(Boolean).join(' · ')}.{' '}
            <button type="button" className="btn-texto t-legenda" onClick={() => setFiltro({})}>Limpar</button>
          </p>
        )}

        <div className="abas" role="tablist" aria-label="Relatórios">
          {ABAS.map((a) => (
            <Pilula key={a.chave} ativa={aba === a.chave} role="tab" aria-selected={aba === a.chave}
              onClick={() => setAba(a.chave)}>{a.label}</Pilula>
          ))}
        </div>
        {/* A aba de metas saiu daqui em 2026-10-08: planejar é Dinheiro. */}
        <p className="t-legenda nao-imprime">
          Metas e orçamentos estão em{' '}
          <Link to="/admin/dinheiro/planejamento?aba=metas">Dinheiro › Planejamento</Link>.
        </p>

        {aba === 'gastos' && (
          <>
            <div className="grade-indicadores">
              <Indicador rotulo={`Saiu em ${gastos.meses.length} ${gastos.meses.length === 1 ? 'mês' : 'meses'}`}
                valor={fmtBRL(gastos.total_cents)} nota={`${fmtBRL(gastos.media_mensal_cents)} por mês, pago ou não`} />
              <Indicador rotulo="Renda no período" valor={fmtBRL(gastos.renda_cents)}
                nota={`${fmtBRL(gastos.renda_media_cents)} por mês · sem empréstimo nem dinheiro de outra conta`} />
              <Indicador rotulo="Pagando o passado" valor={fmtBRL(gastos.passado_cents)}
                cor={gastos.total_cents && gastos.passado_cents / gastos.total_cents >= 0.3 ? 'coral' : undefined}
                nota={gastos.total_cents
                  ? `${Math.round((gastos.passado_cents / gastos.total_cents) * 100)}% do que saiu · dívidas, juros e tarifas`
                  : 'dívidas, juros e tarifas'} />
              <Indicador rotulo="Saídas × renda" valor={gastos.renda_cents
                  ? `${(gastos.total_cents / gastos.renda_cents).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : '—'}
                cor={gastos.total_cents > gastos.renda_cents ? 'coral' : 'acento'}
                nota={gastos.total_cents > gastos.renda_cents
                  ? `saiu ${fmtBRL(gastos.total_cents - gastos.renda_cents)} a mais do que entrou de renda`
                  : 'a renda cobriu as saídas'} />
            </div>
            {gastos.porGrupo.cartao_sem_detalhe > 0 && (
              <p className="t-legenda">
                {fmtBRL(gastos.porGrupo.cartao_sem_detalhe)} são faturas lançadas só pelo total: o gasto existe, mas
                ainda não se sabe em quê. Lançar os itens do PDF da fatura completa as categorias.
              </p>
            )}

            <Painel titulo="Por categoria" acao={<span className="t-legenda">pelo mês da compra/competência</span>}>
              {gastos.porCategoria.length === 0
                ? <Vazio icone="grafico" titulo="Nenhum gasto no período" instrucao="Ajuste o período ou a lente." />
                : <div className="rolagem-x">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr><th>Categoria</th>
                        {gastos.meses.map((m) => <th key={m} className="col-valor">{rotuloMesCurto(m)}</th>)}
                        <th className="col-valor">Total</th><th className="col-valor">%</th></tr>
                    </thead>
                    <tbody>
                      {gastos.porCategoria.map((c) => (
                        <tr key={c.categoria_id ?? 'sem'}>
                          <td className="t-ui" data-rotulo="">{nomeCategoriaGasto(c.categoria_id)}</td>
                          {c.porMes.map((v, i) => (
                            <td key={gastos.meses[i]} className="dinheiro" data-rotulo={rotuloMesCurto(gastos.meses[i])}>
                              {v ? fmtBRL(v) : '—'}</td>
                          ))}
                          <td className="dinheiro" data-rotulo="Total">{fmtBRL(c.total_cents)}</td>
                          <td className="col-valor" data-rotulo="%">
                            {gastos.total_cents ? `${Math.round((c.total_cents / gastos.total_cents) * 100)}%` : '—'}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="t-ui" data-rotulo=""><strong>Total</strong></td>
                        {gastos.porMes.map((m) => (
                          <td key={m.mes} className="dinheiro" data-rotulo={rotuloMesCurto(m.mes)}><strong>{fmtBRL(m.saidas_cents)}</strong></td>
                        ))}
                        <td className="dinheiro" data-rotulo="Total"><strong>{fmtBRL(gastos.total_cents)}</strong></td>
                        <td className="col-valor" data-rotulo="%">100%</td>
                      </tr>
                      <tr>
                        <td className="t-sec" data-rotulo="">Renda do mês</td>
                        {gastos.porMes.map((m) => (
                          <td key={m.mes} className="dinheiro t-sec" data-rotulo={rotuloMesCurto(m.mes)}>{fmtBRL(m.renda_cents)}</td>
                        ))}
                        <td className="dinheiro t-sec" data-rotulo="Total">{fmtBRL(gastos.renda_cents)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>}
            </Painel>

            <Painel titulo="Onde mais se gasta no dia a dia"
              acao={<span className="t-legenda">sem dívidas, juros e faturas sem detalhe</span>}>
              {gastos.lugares.length === 0
                ? <Vazio icone="grafico" titulo="Nada no período" instrucao="Os lugares aparecem quando há gasto do dia a dia." />
                : <Ranking itens={gastos.lugares.map((l) => ({ chave: l.nome, total: l.total_cents, qtd: l.qtd }))} />}
            </Painel>
          </>
        )}

        {aba === 'resultado' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Receita em 12 meses" valor={fmtBRL(totalAno.receita_cents)}
                nota="Só o que foi efetivamente recebido" />
              <Indicador rotulo="Despesa em 12 meses" valor={fmtBRL(totalAno.despesa_cents)} nota="Liquidado" />
              <Indicador rotulo="Resultado" valor={fmtBRL(totalAno.lucro_cents)}
                cor={totalAno.lucro_cents < 0 ? 'coral' : 'acento'}
                nota={totalAno.receita_cents > 0
                  ? `Margem de ${(totalAno.margem * 100).toFixed(0)}%`
                  : 'Sem receita no período'} />
              <Indicador rotulo="Ticket médio"
                valor={fmtBRL(ticketMedio(base))}
                nota="Por recebimento liquidado" />
            </div>

            <Painel titulo="Receita e despesa por mês"
              acao={<span className="t-legenda">Últimos 12 meses</span>}>
              {/* Gráfico em CSS puro: nenhuma dependência nova só para desenhar
                  12 barras. Sem eixo Y e sem grade, como manda o KV. */}
              <div className="grafico" role="img"
                aria-label={`Receita e despesa mês a mês. Total recebido ${fmtBRL(totalAno.receita_cents)}, total gasto ${fmtBRL(totalAno.despesa_cents)}.`}>
                {serie.map((s) => (
                  <div key={s.mes} className="grafico-col">
                    <span className="grafico-valor">
                      {s.receita_cents > 0 ? fmtCompacto(s.receita_cents) : ''}
                    </span>
                    <div className="grafico-barras">
                      <span className="barra barra-receita"
                        style={{ height: `${(s.receita_cents / teto) * 100}%` }} />
                      <span className="barra barra-despesa"
                        style={{ height: `${(s.despesa_cents / teto) * 100}%` }} />
                    </div>
                    <span className="etiqueta-mini">{s.mes.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="linha" style={{ marginTop: 'var(--espaco-04)' }}>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--roxo)' }} />Recebido</span>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--coral)' }} />Gasto</span>
              </div>
            </Painel>
          </>
        )}

        {aba === 'clientes' && (
          <Painel titulo={porMarca ? 'Por marca' : 'Por cliente'}
            acao={<span className="linha" style={{ gap: 'var(--espaco-02)' }}>
              <Pilula ativa={!porMarca} onClick={() => setPorMarca(false)}>Cliente</Pilula>
              <Pilula ativa={porMarca} onClick={() => setPorMarca(true)}>Marca</Pilula>
            </span>}>
            {linhasCliente.length === 0
              ? <Vazio icone="cliente" titulo={temFiltro ? 'Nada neste recorte' : 'Nenhuma receita por cliente'}
                instrucao={temFiltro ? 'Ajuste o período ou o cliente.' : 'Vincule os recebimentos a clientes para ver o ranking.'} />
              : <div className="rolagem-x">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr><th>{porMarca ? 'Marca' : 'Cliente'}</th><th className="col-valor">Recebido</th>
                      <th className="col-valor">A receber</th><th className="col-valor">Projetos</th><th className="col-valor">Ticket</th></tr>
                  </thead>
                  <tbody>
                    {linhasCliente.map((l) => (
                      <tr key={l.chave}>
                        <td className="t-ui" data-rotulo="">{nomeChave(l.chave)}</td>
                        <td className="dinheiro" data-rotulo="Recebido">{fmtBRL(l.recebido_cents)}</td>
                        <td className="dinheiro" data-rotulo="A receber">{l.a_receber_cents ? fmtBRL(l.a_receber_cents) : '—'}</td>
                        <td className="col-valor" data-rotulo="Projetos">{l.projetos}</td>
                        <td className="dinheiro" data-rotulo="Ticket">{l.ticket_cents ? fmtBRL(l.ticket_cents) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </Painel>
        )}

        {aba === 'projetos' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Em execução" valor={fmtBRL(projetos.em_execucao_cents)}
                nota="Aprovado + em andamento" />
              <Indicador rotulo="Entregues" valor={String(projetos.entregues)} nota="Entregue ou pago" />
              <Indicador rotulo="Atrasados" valor={String(projetos.atrasados)}
                cor={projetos.atrasados ? 'coral' : undefined} nota="Prazo combinado passou" />
              <Indicador rotulo="Em proposta"
                valor={String(projetos.porEtapa.find((e) => e.etapa === 'orcamento')?.qtd ?? 0)}
                nota="Pode virar trabalho" />
            </div>
            <Painel titulo="Projetos por etapa">
              <ul className="lista">
                {projetos.porEtapa.map((e) => (
                  <li key={e.etapa} className="lista-item">
                    <span className="celula">
                      <span className="t-ui">{ROTULO_ETAPA[e.etapa]}</span>
                      <span className="t-legenda">{e.qtd} {e.qtd === 1 ? 'projeto' : 'projetos'}</span>
                    </span>
                    <Dinheiro cents={e.cents} className="t-valor" />
                  </li>
                ))}
              </ul>
            </Painel>
          </>
        )}

        {aba === 'recebiveis' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Vencido" valor={fmtBRL(recebiveis.vencido_cents)}
                cor={recebiveis.vencido_cents ? 'coral' : undefined}
                nota={`${recebiveis.faixas.reduce((s, f) => s + f.qtd, 0)} em atraso`} />
              {recebiveis.proximos.map((p) => (
                <Indicador key={p.dias} rotulo={`Próximos ${p.dias} dias`} valor={fmtBRL(p.cents)}
                  nota={`${p.qtd} a vencer`} />
              ))}
            </div>
            <Painel titulo="Atraso por faixa">
              <ul className="lista">
                {recebiveis.faixas.map((f) => (
                  <li key={f.faixa} className="lista-item">
                    <span className="celula">
                      <span className="t-ui">{f.faixa} dias</span>
                      <span className="t-legenda">{f.qtd} {f.qtd === 1 ? 'lançamento' : 'lançamentos'}</span>
                    </span>
                    <Dinheiro cents={f.cents} className="t-valor" />
                  </li>
                ))}
              </ul>
              <p className="t-legenda" style={{ marginTop: 'var(--espaco-03)' }}>
                Quanto mais velho o atraso, menor a chance de entrar — a previsão de caixa usa essa lógica.
              </p>
            </Painel>
          </>
        )}

        {aba === 'fiscal' && (
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Emitido" valor={fmtBRL(fiscal.emitido_cents)}
              nota={`${fiscal.emitidas} ${fiscal.emitidas === 1 ? 'nota' : 'notas'}`} />
            <Indicador rotulo="Imposto estimado" valor={fmtBRL(fiscal.imposto_cents)}
              nota="Soma do informado em cada nota" />
            <Indicador rotulo="Pendentes" valor={String(fiscal.pendentes)}
              cor={fiscal.pendentes ? 'coral' : undefined} nota={fmtBRL(fiscal.pendente_cents)} />
            <Indicador rotulo="Serviços sem nota"
              valor={String(servicosFiltrados.filter((sv) => sv.status_execucao === 'concluida' && semNotaFiscal(sv)).length)}
              nota="Concluídos sem NF vinculada" />
          </div>
        )}

        {aba === 'categorias' && (
          <Painel titulo="Despesas por categoria"
            acao={<span className="t-legenda">{porCategoria.length} categorias</span>}>
            {porCategoria.length === 0
              ? <Vazio icone="grafico" titulo="Nenhuma despesa categorizada"
                instrucao="Classifique as despesas para descobrir onde o dinheiro concentra." />
              : <Ranking itens={porCategoria.map((f) => ({
                chave: nomes.categoria.get(f.chave)?.nome ?? 'Sem categoria',
                total: f.total_cents, qtd: f.qtd,
              }))} />}
          </Painel>
        )}

        {aba === 'previsao' && (
          <>
            <div className="grade-indicadores">
              <Indicador rotulo="Conservador" valor={fmtBRL(cenarios.conservador)}
                cor={cenarios.conservador < 0 ? 'coral' : undefined}
                nota="70% do que vence em dia; nada do atrasado" />
              <Indicador dominante rotulo="Provável" valor={fmtBRL(cenarios.provavel)}
                nota="Tudo em dia + metade do atrasado" />
              <Indicador rotulo="Otimista" valor={fmtBRL(cenarios.otimista)} cor="acento"
                nota="Todo o valor em aberto entra" />
              <Indicador rotulo="Horizonte" valor="90 dias"
                nota="Despesa prevista entra inteira nos três" />
            </div>
            <Painel titulo="Como ler">
              <p className="t-corpo">
                Os três cenários partem do saldo de hoje e somam o que está em aberto com vencimento
                nos próximos 90 dias. A diferença entre eles é só a confiança no recebimento:
                conta vencida tem menos chance de entrar do que conta a vencer. Despesa prevista é
                descontada por inteiro nos três — obrigação não escolhe cenário.
              </p>
              <p className="t-sec" style={{ marginTop: 'var(--espaco-03)' }}>
                Valores projetados nunca se misturam com realizado: o que já foi liquidado está no saldo.
              </p>
            </Painel>
          </>
        )}
      </Carga>
    </div>
  )
}

// ── partes ───────────────────────────────────────────────────────────────────

function Ranking({ itens }: { itens: { chave: string; total: number; qtd: number }[] }) {
  const teto = Math.max(...itens.map((i) => i.total), 1)
  return (
    <ul className="lista">
      {itens.map((i) => (
        <li key={i.chave} className="lista-item meta-item">
          <span className="celula">
            <span className="linha" style={{ justifyContent: 'space-between' }}>
              <span className="t-ui espremer">{i.chave}</span>
              {/* percentual nunca sem o valor absoluto ao lado */}
              <span className="t-legenda">
                <Dinheiro cents={i.total} /> · {((i.total / teto) * 100).toFixed(0)}%
              </span>
            </span>
            <span className="barra-ranking" aria-hidden>
              <span style={{ width: `${(i.total / teto) * 100}%` }} />
            </span>
            <span className="t-legenda">{i.qtd} {i.qtd === 1 ? 'lançamento' : 'lançamentos'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}


// ── formatação de apresentação ───────────────────────────────────────────────

/** 'AAAA-MM' → 'set/26'. */
function rotuloMesCurto(mes: string): string {
  return new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1))
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('. de ', '/').replace('.', '')
}

/** Valor curto para o topo da coluna do gráfico: 12,4 mil. */
function fmtCompacto(cents: number): string {
  const reais = cents / 100
  if (reais >= 1000) return `${(reais / 1000).toFixed(reais >= 10000 ? 0 : 1)} mil`
  return reais.toFixed(0)
}
