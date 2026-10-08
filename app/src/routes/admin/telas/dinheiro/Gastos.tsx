import { useMemo, useState } from 'react'
import { fmtBRL } from '../../../../lib/dinheiro'
import { baixarCsv } from '../../../../lib/exportar'
import { deslocarMes, useFinancas, useNomes } from '../../../../lib/financas-store'
import {
  analiseGastos, CARTAO_SEM_DETALHE, compromissoMensal, reaisCsv, type GrupoGasto,
} from '../../../../domain/relatorios'
import { Botao, Icone, Indicador, Painel, Pilula, Vazio } from '../../../../ui/componentes'
import { Carga, Ranking } from '../../../../ui/painel'
import { fmtCompacto, rotuloMesCurto } from '../../../../ui/formato'

const PERIODOS = [3, 6, 12] as const

const ROTULO_GRUPO: Record<GrupoGasto, string> = {
  dia_a_dia: 'Dia a dia (casa, comida, transporte, assinaturas…)',
  divida: 'Dívidas (parcelas, boletos de cartão, rotativo)',
  juros: 'Juros, IOF e tarifas',
  cartao_sem_detalhe: 'Cartão — fatura sem detalhe',
}

/**
 * "Para onde está indo o dinheiro?" Pelo valor ORIGINAL no mês de competência
 * (pago ou não): compra no cartão conta no mês da compra. Pagar fatura é
 * transferência e não entra. Todo número sai de analiseGastos / compromissoMensal
 * (domain/relatorios.ts, testados) — a tela só mostra.
 */
export default function Gastos() {
  const { transacoes, categoriasTodas, recorrencias, emprestimos, mes, contexto } = useFinancas()
  const nomes = useNomes()
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(3)

  const meses = useMemo(
    () => Array.from({ length: periodo }, (_, i) => deslocarMes(mes, i - periodo + 1)), [mes, periodo])
  const g = useMemo(() => analiseGastos(transacoes, categoriasTodas, meses, contexto),
    [transacoes, categoriasTodas, meses, contexto])
  const comp = useMemo(() => compromissoMensal(recorrencias, emprestimos, transacoes, contexto),
    [recorrencias, emprestimos, transacoes, contexto])

  const nomeCategoria = (id: string | null) => id === CARTAO_SEM_DETALHE
    ? 'Cartão — fatura sem detalhe'
    : id ? nomes.categoria.get(id)?.nome ?? 'Categoria removida' : 'Sem categoria'
  const pct = (v: number, de: number) => (de ? `${Math.round((v / de) * 100)}%` : '—')
  const teto = Math.max(...g.porMes.map((m) => Math.max(m.saidas_cents, m.renda_cents)), 1)

  const exportar = () => baixarCsv(`gastos-${meses[0]}-a-${meses[meses.length - 1]}`,
    ['Categoria', ...meses, 'Total', 'Lançamentos'],
    g.porCategoria.map((c) => [nomeCategoria(c.categoria_id), ...c.porMes.map(reaisCsv), reaisCsv(c.total_cents), c.qtd]))

  return (
    <Carga linhas={5}>
      <div className="linha" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--espaco-03)' }}>
        <div className="linha" role="group" aria-label="Período" style={{ gap: 'var(--espaco-02)' }}>
          {PERIODOS.map((p) => (
            <Pilula key={p} ativa={periodo === p} onClick={() => setPeriodo(p)}>{p} meses</Pilula>
          ))}
        </div>
        <Botao compacto onClick={exportar}><Icone nome="baixar" tamanho={14} />CSV</Botao>
      </div>
      <p className="t-legenda">
        {rotuloMesCurto(meses[0])} a {rotuloMesCurto(meses[meses.length - 1])} · pelo mês da compra, pago ou não ·
        pagar fatura e transferências não contam como gasto.
      </p>

      <div className="grade-indicadores">
        <Indicador rotulo="Saiu no período" valor={fmtBRL(g.total_cents)}
          nota={`${fmtBRL(g.media_mensal_cents)} por mês`} />
        <Indicador rotulo="Renda no período" valor={fmtBRL(g.renda_cents)}
          nota={`${fmtBRL(g.renda_media_cents)} por mês · sem empréstimo nem dinheiro de outra conta`} />
        <Indicador rotulo="Pagando o passado" valor={fmtBRL(g.passado_cents)}
          cor={g.total_cents && g.passado_cents / g.total_cents >= 0.3 ? 'coral' : undefined}
          nota={`${pct(g.passado_cents, g.total_cents)} do que saiu · dívidas, juros e tarifas`} />
        <Indicador rotulo="Saídas × renda"
          valor={g.renda_cents ? `${(g.total_cents / g.renda_cents).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : '—'}
          cor={g.total_cents > g.renda_cents ? 'coral' : 'acento'}
          nota={g.total_cents > g.renda_cents
            ? `saiu ${fmtBRL(g.total_cents - g.renda_cents)} a mais do que entrou de renda`
            : 'a renda cobriu as saídas'} />
      </div>

      <Painel titulo="Renda × saídas por mês">
        <div className="grafico" role="img"
          aria-label={`Por mês: ${g.porMes.map((m) => `${rotuloMesCurto(m.mes)} renda ${fmtBRL(m.renda_cents)}, saídas ${fmtBRL(m.saidas_cents)}`).join('; ')}.`}>
          {g.porMes.map((m) => (
            <div key={m.mes} className="grafico-col">
              <span className="grafico-valor">{m.saidas_cents > 0 ? fmtCompacto(m.saidas_cents) : ''}</span>
              <div className="grafico-barras">
                <span className="barra barra-receita" style={{ height: `${(m.renda_cents / teto) * 100}%` }} />
                <span className="barra barra-despesa" style={{ height: `${(m.saidas_cents / teto) * 100}%` }} />
              </div>
              <span className="etiqueta-mini">{rotuloMesCurto(m.mes)}</span>
            </div>
          ))}
        </div>
        <div className="linha" style={{ marginTop: 'var(--espaco-04)' }}>
          <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--roxo)' }} />Renda</span>
          <span className="legenda-item"><span className="ponto-cor barra-despesa" />Saídas</span>
        </div>
      </Painel>

      <Painel titulo="Para onde vai">
        {g.total_cents === 0
          ? <Vazio icone="grafico" titulo="Nenhum gasto no período" instrucao="Troque o período ou a lente." />
          : <Ranking itens={(Object.keys(ROTULO_GRUPO) as GrupoGasto[])
            .filter((k) => g.porGrupo[k] > 0)
            .sort((a, b) => g.porGrupo[b] - g.porGrupo[a])
            .map((k) => ({ chave: ROTULO_GRUPO[k], total: g.porGrupo[k], qtd: g.qtdPorGrupo[k] }))} />}
        {g.porGrupo.cartao_sem_detalhe > 0 && (
          <p className="t-legenda">
            {fmtBRL(g.porGrupo.cartao_sem_detalhe)} são faturas lançadas só pelo total: o gasto existe, mas ainda
            não se sabe em quê. Lançar os itens do PDF da fatura distribui esse valor pelas categorias.
          </p>
        )}
      </Painel>

      <Painel titulo="Já comprometido todo mês"
        acao={<span className="t-legenda">antes de qualquer gasto do dia a dia</span>}>
        <div className="grade-indicadores">
          <Indicador rotulo="Total por mês" valor={fmtBRL(comp.total_cents)}
            cor={g.renda_media_cents && comp.total_cents > g.renda_media_cents ? 'coral' : undefined}
            nota={g.renda_media_cents ? `${pct(comp.total_cents, g.renda_media_cents)} da renda média` : 'sem renda no período'} />
          <Indicador rotulo="Contas fixas" valor={fmtBRL(comp.fixas_cents)} nota="recorrências ativas" />
          <Indicador rotulo="Parcelas de empréstimo" valor={fmtBRL(comp.dividas_cents)} nota="enquanto houver saldo devedor" />
        </div>
        {comp.itens.length > 0 && (
          <ul className="lista" style={{ marginTop: 'var(--espaco-04)' }}>
            {comp.itens.map((i) => (
              <li key={`${i.tipo}-${i.nome}`} className="lista-item">
                <span className="celula">
                  <span className="t-ui">{i.nome}</span>
                  <span className="t-legenda">{i.tipo === 'divida' ? 'parcela de empréstimo' : 'conta fixa'}</span>
                </span>
                <span className="dinheiro t-ui">{fmtBRL(i.valor_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo="Por categoria" acao={<span className="t-legenda">mês a mês</span>}>
        {g.porCategoria.length === 0
          ? <Vazio icone="grafico" titulo="Nenhum gasto no período" instrucao="Troque o período ou a lente." />
          : <div className="rolagem-x">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr><th>Categoria</th>
                  {meses.map((m) => <th key={m} className="col-valor">{rotuloMesCurto(m)}</th>)}
                  <th className="col-valor">Total</th><th className="col-valor">%</th></tr>
              </thead>
              <tbody>
                {g.porCategoria.map((c) => (
                  <tr key={c.categoria_id ?? 'sem'}>
                    <td className="t-ui" data-rotulo="">{nomeCategoria(c.categoria_id)}</td>
                    {c.porMes.map((v, i) => (
                      <td key={meses[i]} className="dinheiro" data-rotulo={rotuloMesCurto(meses[i])}>{v ? fmtBRL(v) : '—'}</td>
                    ))}
                    <td className="dinheiro" data-rotulo="Total">{fmtBRL(c.total_cents)}</td>
                    <td className="col-valor" data-rotulo="%">{pct(c.total_cents, g.total_cents)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="t-ui" data-rotulo=""><strong>Total</strong></td>
                  {g.porMes.map((m) => (
                    <td key={m.mes} className="dinheiro" data-rotulo={rotuloMesCurto(m.mes)}><strong>{fmtBRL(m.saidas_cents)}</strong></td>
                  ))}
                  <td className="dinheiro" data-rotulo="Total"><strong>{fmtBRL(g.total_cents)}</strong></td>
                  <td className="col-valor" data-rotulo="%">100%</td>
                </tr>
              </tbody>
            </table>
          </div>}
      </Painel>

      <Painel titulo="Onde mais se gasta no dia a dia"
        acao={<span className="t-legenda">sem dívidas, juros e faturas sem detalhe</span>}>
        {g.lugares.length === 0
          ? <Vazio icone="grafico" titulo="Nada no período" instrucao="Os lugares aparecem quando há gasto do dia a dia." />
          : <Ranking itens={g.lugares.map((l) => ({ chave: l.nome, total: l.total_cents, qtd: l.qtd }))} />}
      </Painel>
    </Carga>
  )
}
