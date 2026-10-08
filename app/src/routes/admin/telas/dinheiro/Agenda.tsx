import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes } from '../../../../lib/financas-store'
import {
  agruparPorPrazo, diasDeAtraso, estaEmAberto, filtrarLancamentos, ROTULO_FAIXA, totalEmAberto,
} from '../../../../domain/financeiro'
import { semNotaFiscal } from '../../../../domain/decisoes'
import type { Transacao } from '../../../../lib/tipos'
import { Aviso, Botao, Indicador, Painel, Pilula, Vazio } from '../../../../ui/componentes'
import { Carga, Dinheiro } from '../../../../ui/painel'
import { alternarCancelamento, CampoBusca, FolhasMov, LinhaMov, type FolhaMov } from './compartilhado'

type Aba = 'receber' | 'pagar'
/** Recortes da fila de cobrança. São perguntas, não status: "o que está sem
 *  nota?" e "quem pagou só uma parte?" não existem como coluna. */
type Recorte = 'todos' | 'vencidos' | 'sem_nf' | 'parciais' | 'recorrentes'
const RECORTES: Record<Aba, { chave: Recorte; label: string }[]> = {
  receber: [
    { chave: 'todos', label: 'Tudo' },
    { chave: 'vencidos', label: 'Vencidos' },
    { chave: 'sem_nf', label: 'Sem NF' },
    { chave: 'parciais', label: 'Parciais' },
  ],
  pagar: [
    { chave: 'todos', label: 'Tudo' },
    { chave: 'vencidos', label: 'Vencidos' },
    { chave: 'recorrentes', label: 'Recorrentes' },
    { chave: 'parciais', label: 'Parciais' },
  ],
}

const porVencimento = (a: Transacao, b: Transacao) =>
  (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999')

/** A pagar e a receber, agrupado por prazo. A aba mora na URL (`?aba=receber`)
 *  para a fila de decisões e a busca abrirem direto no lado certo. */
export default function Agenda() {
  const { transacoes, servicos, contexto, recarregar } = useFinancas()
  const servicoPorId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos])
  const nomes = useNomes()
  const hoje = hojeISO()
  const navigate = useNavigate()

  const [params, setParams] = useSearchParams()
  const aba: Aba = params.get('aba') === 'receber' ? 'receber' : 'pagar'
  const [busca, setBusca] = useState('')
  const [recorte, setRecorte] = useState<Recorte>('todos')
  const [folha, setFolha] = useState<FolhaMov | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }
  const erro = (e: unknown) => setAviso({ texto: (e as Error).message, tipo: 'erro' })

  // Ignora o mês em foco de propósito: uma conta vencida em junho continua
  // sendo trabalho de hoje.
  const emAberto = useMemo(() => transacoes.filter((t) =>
    t.tipo !== 'transferencia' && estaEmAberto(t) && (!contexto || t.contexto === contexto)),
    [transacoes, contexto])
  const receberTudo = useMemo(
    () => emAberto.filter((t) => t.tipo === 'entrada').sort(porVencimento), [emAberto])
  const pagarTudo = useMemo(
    () => emAberto.filter((t) => t.tipo === 'saida').sort(porVencimento), [emAberto])

  // A busca filtra a lista, não os indicadores: o total a receber não muda
  // enquanto se digita. O recorte vem depois, e então o agrupamento por prazo.
  const listaAtual = aba === 'receber' ? receberTudo : pagarTudo
  const recortada = useMemo(() => filtrarLancamentos(listaAtual, { busca }, (id) => nomes.cliente.get(id)?.nome)
    .filter((t) => {
      if (recorte === 'vencidos') return diasDeAtraso(t, hoje) > 0
      if (recorte === 'parciais') return t.recebido_cents > 0
      if (recorte === 'recorrentes') return !!t.recorrencia_id
      if (recorte === 'sem_nf') {
        const sv = t.servico_id ? servicoPorId.get(t.servico_id) : null
        return !sv || semNotaFiscal(sv)
      }
      return true
    }), [listaAtual, busca, nomes, recorte, hoje, servicoPorId])
  const grupos = useMemo(() => agruparPorPrazo(recortada, hoje), [recortada, hoje])

  const trocarAba = (a: Aba) => { setParams({ aba: a }, { replace: true }); setRecorte('todos') }

  return (
    <div className="pilha" data-density="dense">
      <Carga linhas={6}>
        <div className="grade-indicadores">
          <Indicador rotulo="A receber" valor={fmtBRL(totalEmAberto(receberTudo))} cor="acento"
            nota={`${receberTudo.length} em aberto`} />
          <Indicador rotulo="A pagar" valor={fmtBRL(totalEmAberto(pagarTudo))}
            nota={`${pagarTudo.length} em aberto`} />
        </div>

        <div className="abas" role="tablist" aria-label="Lado da agenda">
          <Pilula ativa={aba === 'receber'} role="tab" aria-selected={aba === 'receber'}
            onClick={() => trocarAba('receber')}>A receber</Pilula>
          <Pilula ativa={aba === 'pagar'} role="tab" aria-selected={aba === 'pagar'}
            onClick={() => trocarAba('pagar')}>A pagar</Pilula>
        </div>

        <CampoBusca valor={busca} aoMudar={setBusca} />

        <div className="linha" role="group" aria-label="Recorte da fila">
          {RECORTES[aba].map((rc) => (
            <Pilula key={rc.chave} ativa={recorte === rc.chave}
              onClick={() => setRecorte(rc.chave)}>{rc.label}</Pilula>
          ))}
        </div>

        {listaAtual.length === 0 ? (
          <Vazio icone="ok" titulo={aba === 'receber' ? 'Nada a receber' : 'Nada a pagar'}
            instrucao="Nenhuma conta em aberto neste contexto." />
        ) : recortada.length === 0 ? (
          <Vazio icone="pesquisa" titulo="Nada neste recorte"
            instrucao={busca ? 'Nenhum resultado para essa busca.' : 'Nenhum lançamento em aberto com esse recorte.'}
            acao={<Botao onClick={() => { setRecorte('todos'); setBusca('') }}>Ver tudo</Botao>} />
        ) : grupos.map((g) => (
          /* Um painel por faixa de prazo: "vencidos" e "depois" na mesma
             lista fazem o dono ler tudo para achar o que urge. */
          <Painel key={g.faixa} titulo={ROTULO_FAIXA[g.faixa]}
            acao={<span className="linha" style={{ gap: 'var(--espaco-02)' }}>
              <span className="t-legenda">{g.itens.length}</span>
              <Dinheiro cents={g.total_cents} className="t-valor" />
            </span>}>
            <ul className="lista">
              {g.itens.map((t) => (
                <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje} modoCobranca
                  servico={t.servico_id ? servicoPorId.get(t.servico_id) : undefined}
                  aoEditar={() => setFolha({ tipo: 'editar', t })}
                  aoCancelar={() => void alternarCancelamento(t, apos, erro)}
                  aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                  aoReagendar={() => setFolha({ tipo: 'reagendar', t })}
                  aoRecorrencia={t.recorrencia_id ? () => navigate('/admin/dinheiro/planejamento') : undefined}
                  aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
              ))}
            </ul>
          </Painel>
        ))}
      </Carga>

      {folha && <FolhasMov folha={folha} aoFechar={fechar} aoSalvar={apos} />}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
