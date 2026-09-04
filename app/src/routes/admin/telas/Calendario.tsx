import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { tarefas as tarefasApi } from '../../../lib/api'
import { fmtBRL } from '../../../lib/dinheiro'
import { hojeISO, rotuloMes, useFinancas, useNomes } from '../../../lib/financas-store'
import {
  FORMA_AGENDA, itensAgenda, ORDEM_AGENDA, porDia, type ItemAgenda, type TipoAgenda,
} from '../../../domain/agenda'
import type { Transacao } from '../../../lib/tipos'
import { Aviso, Botao, Icone, Indicador, Painel, Pilula, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro, SeletorLente, SeletorMes } from '../../../ui/painel'
import { dataLonga } from '../../../ui/formato'
import { FolhaLiquidar, FolhaTarefa } from '../folhas'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Uma grade, cinco fontes: vencimentos, recorrências previstas, tarefas e
// prazos de projeto. Cada tipo tem forma e rótulo — cor nunca informa sozinha.
export default function Calendario() {
  const { transacoes, recorrencias, tarefas, servicos, mes, contexto, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [tipos, setTipos] = useState<Set<TipoAgenda>>(new Set(ORDEM_AGENDA))
  const [folha, setFolha] = useState<{ tipo: 'liquidar'; t: Transacao } | { tipo: 'tarefa'; id: string } | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)

  const todos = useMemo(
    () => itensAgenda({ transacoes, tarefas, servicos, recorrencias }, mes, contexto),
    [transacoes, tarefas, servicos, recorrencias, mes, contexto])
  const itens = useMemo(() => todos.filter((i) => tipos.has(i.tipo)), [todos, tipos])
  const mapa = useMemo(() => porDia(itens), [itens])
  const celulas = useMemo(() => montarGrade(mes), [mes])

  const soma = (tipo: TipoAgenda) => todos.filter((i) => i.tipo === tipo && i.aberto)
    .reduce((s, i) => s + (i.cents ?? 0), 0)
  const conta = (tipo: TipoAgenda) => todos.filter((i) => i.tipo === tipo && i.aberto).length
  const selecionados = diaAberto ? mapa.get(diaAberto) ?? [] : []

  const alternarTipo = (t: TipoAgenda) => setTipos((s) => {
    const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n
  })
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }

  const concluirTarefa = async (i: ItemAgenda) => {
    if (!('tarefa' in i.ref)) return
    try {
      const t = i.ref.tarefa
      await tarefasApi.upsert({ ...t, status: t.status === 'concluida' ? 'aberta' : 'concluida' })
      await apos(t.status === 'concluida' ? 'Tarefa reaberta' : 'Tarefa concluída')
    } catch (e) { setAviso({ texto: (e as Error).message, tipo: 'erro' }) }
  }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Agenda" titulo={rotuloMes(mes)}>
        <SeletorLente />
        <SeletorMes />
      </Cabecalho>

      <Carga linhas={4}>
        <div className="grade-indicadores">
          <Indicador dominante rotulo="No mês" valor={String(todos.length)}
            nota={`${porDia(todos).size} dias com compromisso`} />
          <Indicador rotulo="A receber" valor={fmtBRL(soma('recebimento'))} cor="acento"
            nota={`${conta('recebimento')} em aberto`} />
          <Indicador rotulo="A pagar" valor={fmtBRL(soma('pagamento') + soma('recorrencia'))}
            nota={`${conta('pagamento')} lançados · ${conta('recorrencia')} previstos`} />
          <Indicador rotulo="Tarefas e entregas" valor={String(conta('tarefa') + conta('prazo'))}
            cor={todos.some((i) => (i.tipo === 'tarefa' || i.tipo === 'prazo') && i.aberto && i.data < hoje) ? 'coral' : undefined}
            nota={`${conta('prazo')} ${conta('prazo') === 1 ? 'entrega' : 'entregas'} de projeto`} />
        </div>

        {/* Filtro por tipo: a mesma legenda que explica a forma liga e desliga. */}
        <div className="linha" role="group" aria-label="Tipos na agenda">
          {ORDEM_AGENDA.map((t) => (
            <Pilula key={t} ativa={tipos.has(t)} onClick={() => alternarTipo(t)} aria-pressed={tipos.has(t)}>
              <span className="cal-ponto" data-tipo={t} aria-hidden />{FORMA_AGENDA[t].rotulo}
            </Pilula>
          ))}
        </div>

        <Painel titulo="Calendário">
          <div className="cal-cabecalho" aria-hidden>
            {DIAS.map((d) => <span key={d} className="etiqueta-mini">{d}</span>)}
          </div>
          <div className="cal-grade" role="grid" aria-label={`Agenda de ${rotuloMes(mes)}`}>
            {celulas.map((iso, i) => {
              if (!iso) return <span key={`v${i}`} className="cal-celula cal-vazia" aria-hidden />
              const doDia = mapa.get(iso) ?? []
              const ehHoje = iso === hoje
              const atrasado = iso < hoje && doDia.some((x) => x.aberto)
              return (
                <button key={iso} type="button" role="gridcell"
                  className={`cal-celula${ehHoje ? ' cal-hoje' : ''}${diaAberto === iso ? ' cal-ativo' : ''}`}
                  data-atrasado={atrasado ? 'true' : undefined}
                  onClick={() => setDiaAberto(diaAberto === iso ? null : iso)}
                  aria-label={`${dataLonga(iso)}: ${doDia.length} ${doDia.length === 1 ? 'compromisso' : 'compromissos'}${atrasado ? ', com pendência' : ''}`}>
                  <span className="cal-dia">{Number(iso.slice(8))}</span>
                  <span className="cal-pontos">
                    {doDia.slice(0, 4).map((x) => (
                      <span key={x.id} className="cal-ponto" data-tipo={x.tipo}
                        data-aberto={x.aberto ? 'true' : 'false'} />
                    ))}
                    {doDia.length > 4 && <span className="cal-mais">+{doDia.length - 4}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="t-legenda" style={{ marginTop: 'var(--e-5)' }}>
            Contorno = já liquidado ou concluído. Dia com pendência vencida fica marcado.
          </p>
        </Painel>

        <Painel titulo={diaAberto ? dataLonga(diaAberto) : 'Selecione um dia'}>
          {!diaAberto ? (
            <p className="t-sec">Toque num dia para ver o que vence, o que entregar e o que fazer.</p>
          ) : selecionados.length === 0 ? (
            <Vazio icone="ok" titulo="Nada neste dia" instrucao="Nenhum compromisso nesta data com os tipos ligados." />
          ) : (
            <ul className="lista">
              {selecionados.map((i) => (
                <li key={i.id} className="lista-item" data-cancelado={i.aberto ? undefined : 'true'}>
                  <span className="cal-ponto cal-ponto-g" data-tipo={i.tipo} data-aberto={i.aberto ? 'true' : 'false'} aria-hidden />
                  <span className="celula">
                    <span className="t-ui espremer">{i.titulo}</span>
                    <span className="t-legenda espremer">
                      {[FORMA_AGENDA[i.tipo].rotulo, i.detalhe, apoio(i, nomes)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {i.cents != null && <Dinheiro cents={i.cents} className="t-valor" />}
                  {acao(i, {
                    liquidar: (t) => setFolha({ tipo: 'liquidar', t }),
                    concluir: () => void concluirTarefa(i),
                    editarTarefa: (id) => setFolha({ tipo: 'tarefa', id }),
                  })}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </Carga>

      {folha?.tipo === 'liquidar' && (
        <FolhaLiquidar transacao={folha.t} aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {folha?.tipo === 'tarefa' && (
        <FolhaTarefa inicial={tarefas.find((t) => t.id === folha.id)}
          aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

function apoio(i: ItemAgenda, nomes: ReturnType<typeof useNomes>): string | null {
  if ('transacao' in i.ref) {
    const t = i.ref.transacao
    return [t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : null, t.conta_id ? nomes.conta.get(t.conta_id)?.nome : null]
      .filter(Boolean).join(' · ') || null
  }
  if ('tarefa' in i.ref) return i.ref.tarefa.cliente_id ? nomes.cliente.get(i.ref.tarefa.cliente_id)?.nome ?? null : null
  if ('servico' in i.ref) return nomes.cliente.get(i.ref.servico.cliente_id)?.nome ?? null
  return null
}

/** A ação certa para cada tipo: liquidar, concluir, abrir projeto ou recorrência. */
function acao(i: ItemAgenda, h: {
  liquidar: (t: Transacao) => void
  concluir: () => void
  editarTarefa: (id: string) => void
}) {
  if ('transacao' in i.ref) {
    return i.aberto
      ? <Botao compacto onClick={() => h.liquidar((i.ref as { transacao: Transacao }).transacao)}>
        {i.tipo === 'recebimento' ? 'Receber' : 'Pagar'}
      </Botao>
      : <Link className="btn btn-secundario btn-compacto" to="/admin/dinheiro">Ver</Link>
  }
  if ('tarefa' in i.ref) {
    return (
      <>
        <Botao compacto onClick={h.concluir}>{i.aberto ? 'Concluir' : 'Reabrir'}</Botao>
        <Botao variante="icone" aria-label={`Editar ${i.titulo}`} onClick={() => h.editarTarefa((i.ref as { tarefa: { id: string } }).tarefa.id)}>
          <Icone nome="editar" tamanho={16} />
        </Botao>
      </>
    )
  }
  if ('servico' in i.ref) return <Link className="btn btn-secundario btn-compacto" to="/admin/projetos">Ver projeto</Link>
  return <Link className="btn btn-secundario btn-compacto" to="/admin/dinheiro">Ver recorrência</Link>
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
