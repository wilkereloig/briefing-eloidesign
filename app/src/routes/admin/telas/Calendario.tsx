import { useMemo, useState } from 'react'
import { fmtBRL } from '../../../lib/dinheiro'
import { hojeISO, rotuloMes, useFinancas, useNomes } from '../../../lib/financas-store'
import { estaEmAberto, saldoAberto } from '../../../domain/financeiro'
import type { Transacao } from '../../../lib/tipos'
import { Icone, Indicador, Painel, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, ChipMovimento, Dinheiro, SeletorLente, SeletorMes } from '../../../ui/painel'
import { dataLonga } from '../../../ui/formato'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function Calendario() {
  const { transacoes, recorrencias, mes, contexto } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [diaAberto, setDiaAberto] = useState<string | null>(null)

  // Vencimentos do mês, indexados por dia. Recorrência ainda não materializada
  // não entra: quando vence, a edge cria a transação e ela aparece aqui.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Transacao[]>()
    for (const t of transacoes) {
      if (!t.data_vencimento || !t.data_vencimento.startsWith(mes)) continue
      if (contexto && t.contexto !== contexto) continue
      mapa.set(t.data_vencimento, [...(mapa.get(t.data_vencimento) ?? []), t])
    }
    return mapa
  }, [transacoes, mes, contexto])

  const celulas = useMemo(() => montarGrade(mes), [mes])

  const doMes = [...porDia.values()].flat()
  const aReceber = doMes.filter((t) => t.tipo === 'entrada' && estaEmAberto(t))
  const aPagar = doMes.filter((t) => t.tipo === 'saida' && estaEmAberto(t))
  const selecionadas = diaAberto ? porDia.get(diaAberto) ?? [] : []

  return (
    <div className="tela pilha">
      <Cabecalho secao="Agenda" titulo={rotuloMes(mes)}>
        <SeletorLente />
        <SeletorMes />
      </Cabecalho>

      <Carga linhas={4}>
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Compromissos no mês" valor={String(doMes.length)}
            nota={`${porDia.size} dias com vencimento`} />
          <Indicador rotulo="A receber no mês" valor={fmtBRL(aReceber.reduce((s, t) => s + saldoAberto(t), 0))}
            cor="acento" nota={`${aReceber.length} recebimentos`} />
          <Indicador rotulo="A pagar no mês" valor={fmtBRL(aPagar.reduce((s, t) => s + saldoAberto(t), 0))}
            nota={`${aPagar.length} pagamentos`} />
          <Indicador rotulo="Recorrências ativas"
            valor={String(recorrencias.filter((r) => !contexto || r.contexto === contexto).length)}
            nota="Lançadas automaticamente no vencimento" />
        </div>

        <Painel titulo="Calendário financeiro">
          <div className="cal-cabecalho" aria-hidden>
            {DIAS.map((d) => <span key={d} className="etiqueta-mini">{d}</span>)}
          </div>
          <div className="cal-grade" role="grid" aria-label={`Vencimentos de ${rotuloMes(mes)}`}>
            {celulas.map((iso, i) => {
              if (!iso) return <span key={`v${i}`} className="cal-celula cal-vazia" aria-hidden />
              const itens = porDia.get(iso) ?? []
              const dia = Number(iso.slice(8))
              const ehHoje = iso === hoje
              return (
                <button key={iso} type="button" role="gridcell"
                  className={`cal-celula${ehHoje ? ' cal-hoje' : ''}${diaAberto === iso ? ' cal-ativo' : ''}`}
                  onClick={() => setDiaAberto(diaAberto === iso ? null : iso)}
                  aria-label={`${dataLonga(iso)}: ${itens.length} ${itens.length === 1 ? 'compromisso' : 'compromissos'}`}>
                  <span className="cal-dia">{dia}</span>
                  {/* Estado por ícone + cor, nunca só cor */}
                  <span className="cal-pontos">
                    {itens.slice(0, 3).map((t) => (
                      <span key={t.id} className="cal-ponto" data-tipo={t.tipo}
                        data-aberto={estaEmAberto(t) ? 'true' : 'false'} />
                    ))}
                    {itens.length > 3 && <span className="cal-mais">+{itens.length - 3}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="linha" style={{ marginTop: 'var(--e-7)' }}>
            <span className="legenda-item"><span className="cal-ponto" data-tipo="entrada" />Recebimento</span>
            <span className="legenda-item"><span className="cal-ponto" data-tipo="saida" />Pagamento</span>
            <span className="legenda-item"><span className="cal-ponto" data-tipo="entrada" data-aberto="false" />Liquidado</span>
          </div>
        </Painel>

        <Painel titulo={diaAberto ? dataLonga(diaAberto) : 'Selecione um dia'}>
          {!diaAberto ? (
            <p className="t-sec">Toque num dia do calendário para ver os compromissos daquela data.</p>
          ) : selecionadas.length === 0 ? (
            <Vazio icone="ok" titulo="Nada neste dia"
              instrucao="Nenhum vencimento registrado para esta data." />
          ) : (
            <ul className="lista">
              {selecionadas.map((t) => (
                <li key={t.id} className="lista-item">
                  <span className="mov-icone" data-tipo={t.tipo} aria-hidden>
                    <Icone nome={t.tipo === 'entrada' ? 'avancar' : 'voltar'} tamanho={16} />
                  </span>
                  <span className="celula">
                    <span className="t-ui espremer">{t.descricao}</span>
                    <span className="t-legenda espremer">
                      {t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome ?? '' : ''}
                      {t.conta_id ? ` · ${nomes.conta.get(t.conta_id)?.nome ?? ''}` : ''}
                    </span>
                  </span>
                  <Dinheiro cents={estaEmAberto(t) ? saldoAberto(t) : t.valor_cents} className="t-valor" />
                  <ChipMovimento status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </Carga>
    </div>
  )
}

/** Grade do mês com os vazios do começo da semana. `null` = célula fora do mês. */
function montarGrade(mes: string): (string | null)[] {
  const [ano, m] = mes.split('-').map(Number)
  const primeiro = new Date(Date.UTC(ano, m - 1, 1))
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const vazios = primeiro.getUTCDay()
  return [
    ...Array.from({ length: vazios }, () => null),
    ...Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ]
}
