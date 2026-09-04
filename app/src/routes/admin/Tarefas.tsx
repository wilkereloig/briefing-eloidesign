import { useMemo, useState } from 'react'
import { tarefas as tarefasApi } from '../../lib/api'
import { hojeISO, useFinancas, useNomes } from '../../lib/financas-store'
import { useAbrirNovo } from '../../lib/abrir-novo'
import { concluidasRecentes, estaAtrasada, tarefasAbertas } from '../../domain/tarefas'
import type { TarefaRow } from '../../lib/tipos'
import { Aviso, Botao, Icone, Painel } from '../../ui/componentes'
import { dataCurta } from '../../ui/formato'
import { FolhaExcluir, FolhaTarefa } from './folhas'

// Um painel de tarefas para Hoje e para a ficha do cliente: a mesma lista,
// o mesmo botão de concluir. Duas implementações divergiriam na primeira
// mudança de regra de ordenação.
export function PainelTarefas({ clienteId, servicoId, limite, aceitaUrlNovo }: {
  /** Só tarefas deste cliente (ficha). Sem ele, todas (Hoje). */
  clienteId?: string
  servicoId?: string
  limite?: number
  /** Hoje aceita `?novo=1` da busca/comando "Nova tarefa". */
  aceitaUrlNovo?: boolean
}) {
  const { tarefas, servicos, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [folha, setFolha] = useState<{ tipo: 'nova' } | { tipo: 'editar'; t: TarefaRow } | { tipo: 'excluir'; t: TarefaRow } | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [verFeitas, setVerFeitas] = useState(false)

  useAbrirNovo(() => { if (aceitaUrlNovo) setFolha({ tipo: 'nova' }) })

  const minhas = useMemo(() => tarefas.filter((t) =>
    (!clienteId || t.cliente_id === clienteId) && (!servicoId || t.servico_id === servicoId)),
    [tarefas, clienteId, servicoId])
  const abertas = useMemo(() => tarefasAbertas(minhas, hoje), [minhas, hoje])
  const feitas = useMemo(() => concluidasRecentes(minhas, hoje), [minhas, hoje])
  const visiveis = limite ? abertas.slice(0, limite) : abertas
  const servicoPorId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos])

  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }

  // Concluir/reabrir é um clique: o status vai inteiro, o servidor cuida de
  // concluida_em. Falha vira aviso — nunca some em silêncio.
  const alternar = async (t: TarefaRow) => {
    setOcupada(t.id)
    try {
      const feita = t.status === 'concluida'
      await tarefasApi.upsert({ ...t, status: feita ? 'aberta' : 'concluida' })
      await apos(feita ? 'Tarefa reaberta' : 'Tarefa concluída')
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    } finally {
      setOcupada(null)
    }
  }

  const linha = (t: TarefaRow) => {
    const atrasada = estaAtrasada(t, hoje)
    const feita = t.status === 'concluida'
    const apoio = [
      !clienteId && t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : null,
      t.sub_cliente_id ? nomes.subCliente.get(t.sub_cliente_id)?.nome : null,
      t.servico_id ? servicoPorId.get(t.servico_id)?.descricao : null,
      t.prazo ? (atrasada ? `venceu ${dataCurta(t.prazo)}` : t.prazo === hoje ? 'hoje' : dataCurta(t.prazo)) : null,
      t.status === 'em_andamento' ? 'em andamento' : null,
      feita && t.concluida_em ? `feita ${dataCurta(t.concluida_em.slice(0, 10))}` : null,
    ].filter(Boolean).join(' · ')
    return (
      <li key={t.id} className="lista-item" data-prioridade={t.prioridade === 'alta' && !feita ? 'alta' : undefined}
        data-atrasada={atrasada ? 'true' : undefined} data-cancelado={feita ? 'true' : undefined}>
        <button type="button" className="tarefa-check" data-feita={feita ? 'true' : undefined}
          aria-label={feita ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
          disabled={ocupada === t.id} onClick={() => void alternar(t)}>
          {feita && <Icone nome="ok" tamanho={16} />}
        </button>
        <span className="celula">
          <span className="t-ui espremer">{t.titulo}</span>
          {apoio && <span className="t-legenda espremer">{apoio}</span>}
        </span>
        <Botao variante="icone" aria-label={`Editar ${t.titulo}`} onClick={() => setFolha({ tipo: 'editar', t })}>
          <Icone nome="editar" tamanho={16} />
        </Botao>
        <Botao variante="icone" aria-label={`Excluir ${t.titulo}`} onClick={() => setFolha({ tipo: 'excluir', t })}>
          <Icone nome="excluir" tamanho={16} />
        </Botao>
      </li>
    )
  }

  return (
    <>
      <Painel titulo="Tarefas"
        acao={<span className="linha" style={{ gap: 'var(--e-3)' }}>
          {feitas.length > 0 && (
            <button type="button" className="t-legenda btn-texto" onClick={() => setVerFeitas((v) => !v)}>
              {verFeitas ? 'Esconder feitas' : `${feitas.length} feitas`}
            </button>
          )}
          <Botao compacto onClick={() => setFolha({ tipo: 'nova' })}>
            <Icone nome="adicionar" tamanho={14} />Nova
          </Botao>
        </span>}>
        {abertas.length === 0 && !verFeitas ? (
          <p className="t-sec">
            {clienteId ? 'Nenhuma tarefa para este cliente.' : 'Nenhuma tarefa aberta. O que o sistema detecta sozinho está em "Precisa de você".'}
          </p>
        ) : (
          <ul className="lista">
            {visiveis.map(linha)}
            {verFeitas && feitas.map(linha)}
          </ul>
        )}
        {limite && abertas.length > limite && (
          <p className="t-legenda" style={{ marginTop: 'var(--e-4)' }}>
            Mais {abertas.length - limite} abertas — as próximas aparecem conforme estas fecham.
          </p>
        )}
      </Painel>

      {folha?.tipo === 'nova' && (
        <FolhaTarefa clienteInicial={clienteId} servicoInicial={servicoId}
          aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {folha?.tipo === 'editar' && (
        <FolhaTarefa inicial={folha.t} aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {folha?.tipo === 'excluir' && (
        <FolhaExcluir titulo={`Excluir "${folha.t.titulo}"?`}
          consequencia="Some de vez. Para manter o registro sem fazer, marque como cancelada na edição."
          aoFechar={() => setFolha(null)}
          aoConfirmar={async () => { await tarefasApi.remover(folha.t.id); await apos('Tarefa excluída') }} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </>
  )
}
