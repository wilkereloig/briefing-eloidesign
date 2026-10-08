import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { financas } from '../../../lib/api'
import { fmtBRL } from '../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes, useTransacoesDoMes } from '../../../lib/financas-store'
import {
  agruparPorPrazo, diasDeAtraso, estaEmAberto, resultado, ROTULO_FAIXA, totalEmAberto,
} from '../../../domain/financeiro'
import { semNotaFiscal } from '../../../domain/decisoes'
import type { Recorrencia, Transacao } from '../../../lib/tipos'
import {
  Aviso, Botao, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Carga, Dinheiro, Paginacao, SeletorMes } from '../../../ui/painel'
import { usePaginacao } from '../../../ui/paginacao'
import { custoAnual, custoMensal, dataCurta, rotuloPeriodo } from '../../../ui/formato'
import { FolhaTransacao } from '../FolhaTransacao'
import { FolhaRecorrencia } from '../folhas'
import { Onboarding } from '../Onboarding'
import { FolhaImportar } from '../FolhasExtrato'
import { alternarCancelamento, FolhasMov, LinhaMov, type FolhaMov } from './dinheiro/compartilhado'

type Aba = 'movimentos' | 'receber' | 'pagar' | 'recorrencias'
/** Recortes da fila de cobrança. São perguntas, não status: "o que está sem
 *  nota?" e "quem pagou só uma parte?" não existem como coluna. */
type Recorte = 'todos' | 'vencidos' | 'sem_nf' | 'parciais' | 'recorrentes'
const RECORTES: Record<'receber' | 'pagar', { chave: Recorte; label: string }[]> = {
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

const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'movimentos', label: 'Movimentações' },
  { chave: 'receber', label: 'A receber' },
  { chave: 'pagar', label: 'A pagar' },
  { chave: 'recorrencias', label: 'Recorrências' },
]

/** Aba inicial pela sub-página em que a tela está montada (router.tsx).
 *  Contas e cartões viraram páginas próprias (dinheiro/Contas, Cartoes). */
function abaDoPath(pathname: string): Aba {
  if (pathname.endsWith('/agenda')) return 'pagar'
  if (pathname.endsWith('/planejamento')) return 'recorrencias'
  return 'movimentos'
}

export default function DinheiroTela() {
  const est = useFinancas()
  const { transacoes, recorrencias, servicos, mes, contexto, recarregar } = est
  const servicoPorId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos])
  const doMes = useTransacoesDoMes()
  const nomes = useNomes()
  const hoje = hojeISO()

  const { pathname } = useLocation()
  const [aba, setAba] = useState<Aba>(() => abaDoPath(pathname))
  const [busca, setBusca] = useState('')
  const [recorte, setRecorte] = useState<Recorte>('todos')
  const [folha, setFolha] = useState<
    | { tipo: 'nova' }
    | FolhaMov
    | { tipo: 'importar' }
    | { tipo: 'recorrencia'; r?: Recorrencia }
    | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)

  const fechar = () => setFolha(null)
  const apos = async (msg: string, tipo?: 'ok' | 'erro') => { setAviso({ texto: msg, tipo }); await recarregar() }
  const erro = (e: unknown) => setAviso({ texto: (e as Error).message, tipo: 'erro' })

  const mudarRecorrencia = async (r: Recorrencia, estado: 'pausar' | 'retomar' | 'encerrar') => {
    try {
      await financas.estadoRecorrencia(r.id, estado)
      await apos(estado === 'pausar' ? 'Recorrência pausada'
        : estado === 'retomar' ? 'Recorrência retomada' : 'Recorrência encerrada')
    } catch (e) { erro(e) }
  }

  const filtrar = useMemo(() => (lista: Transacao[]) => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((t) =>
      t.descricao.toLowerCase().includes(q) ||
      (t.fornecedor ?? '').toLowerCase().includes(q) ||
      (t.cliente_id ? !!nomes.cliente.get(t.cliente_id)?.nome.toLowerCase().includes(q) : false))
  }, [busca, nomes])

  const movimentos = useMemo(() => filtrar([...doMes].sort((a, b) =>
    (b.data_vencimento || b.created_at).localeCompare(a.data_vencimento || a.created_at))),
    [doMes, filtrar])

  // Receber e pagar ignoram o mês em foco de propósito: uma conta vencida em
  // junho continua sendo trabalho de hoje.
  const emAberto = useMemo(() => transacoes.filter((t) =>
    t.tipo !== 'transferencia' && estaEmAberto(t) && (!contexto || t.contexto === contexto)),
    [transacoes, contexto])
  const receberTudo = useMemo(
    () => emAberto.filter((t) => t.tipo === 'entrada').sort(porVencimento), [emAberto])
  const pagarTudo = useMemo(
    () => emAberto.filter((t) => t.tipo === 'saida').sort(porVencimento), [emAberto])
  // A busca filtra a lista, não os indicadores: o total a receber não muda
  // enquanto se digita.
  const aReceber = useMemo(() => filtrar(receberTudo), [receberTudo, filtrar])
  const aPagar = useMemo(() => filtrar(pagarTudo), [pagarTudo, filtrar])

  // Recorte aplicado sobre a lista da aba, depois agrupado por prazo.
  const listaAtual = aba === 'receber' ? aReceber : aPagar
  const recortada = useMemo(() => listaAtual.filter((t) => {
    if (recorte === 'vencidos') return diasDeAtraso(t, hoje) > 0
    if (recorte === 'parciais') return t.recebido_cents > 0
    if (recorte === 'recorrentes') return !!t.recorrencia_id
    if (recorte === 'sem_nf') {
      const sv = t.servico_id ? servicoPorId.get(t.servico_id) : null
      return !sv || semNotaFiscal(sv)
    }
    return true
  }), [listaAtual, recorte, hoje, servicoPorId])
  const grupos = useMemo(() => agruparPorPrazo(recortada, hoje), [recortada, hoje])

  const pagMov = usePaginacao(movimentos, 'dinheiro-movimentos')
  const r = useMemo(() => resultado(transacoes, contexto, mes), [transacoes, contexto, mes])
  const recVisiveis = recorrencias.filter((x) => !contexto || x.contexto === contexto)
  // Pausada não gera cobrança: não é custo do mês enquanto estiver parada.
  const recAtivas = recVisiveis.filter((x) => !x.pausada_em)

  return (
    <div className="tela pilha" data-density="dense">
      {/* Título e lente vêm do Layout de Dinheiro; aqui só o que é desta tela. */}
      <div className="linha">
        <SeletorMes />
        <Botao onClick={() => setFolha({ tipo: 'importar' })} className="col-desktop">
          Importar extrato
        </Botao>
        <Botao variante="primario" onClick={() => setFolha({ tipo: 'nova' })}>
          <Icone nome="adicionar" tamanho={16} />Lançar
        </Botao>
      </div>

      <Carga linhas={6}>
        <Onboarding />
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Resultado do mês" valor={fmtBRL(r.lucro_cents)}
            nota={`${fmtBRL(r.receita_cents)} recebido · ${fmtBRL(r.despesa_cents)} gasto`} />
          <Indicador rotulo="A receber" valor={fmtBRL(totalEmAberto(receberTudo))} cor="acento"
            nota={`${receberTudo.length} em aberto`} />
          <Indicador rotulo="A pagar" valor={fmtBRL(totalEmAberto(pagarTudo))}
            nota={`${pagarTudo.length} em aberto`} />
          <Indicador rotulo="Custo recorrente"
            valor={fmtBRL(recAtivas.reduce((s, x) =>
              s + (x.tipo === 'saida' ? custoMensal(x.valor_cents, x.periodicidade) : 0), 0))}
            nota={`${recAtivas.length} ativas · por mês`} />
        </div>

        <div className="abas" role="tablist" aria-label="Seções do financeiro">
          {ABAS.map((a) => (
            <Pilula key={a.chave} ativa={aba === a.chave} role="tab" aria-selected={aba === a.chave}
              onClick={() => { setAba(a.chave); setRecorte('todos') }}>{a.label}</Pilula>
          ))}
        </div>

        {(aba === 'movimentos' || aba === 'receber' || aba === 'pagar') && (
          <div className="busca">
            <Icone nome="pesquisa" tamanho={17} />
            <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição, cliente ou fornecedor" aria-label="Buscar" />
            {busca && (
              <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                <Icone nome="fechar" tamanho={14} />
              </Botao>
            )}
          </div>
        )}

        {aba === 'movimentos' && (
          <Painel titulo={`${movimentos.length} ${movimentos.length === 1 ? 'movimentação' : 'movimentações'}`}>
            {movimentos.length === 0 ? (
              <Vazio icone="dinheiro" titulo="Nenhuma movimentação neste mês"
                instrucao={busca ? 'Nenhum resultado para essa busca.' : 'Lance a primeira receita ou despesa do mês.'}
                acao={busca
                  ? <Botao onClick={() => setBusca('')}>Limpar busca</Botao>
                  : <Botao variante="primario" onClick={() => setFolha({ tipo: 'nova' })}>Lançar</Botao>} />
            ) : (
              <>
                <ul className="lista">
                  {pagMov.visiveis.map((t) => (
                    <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje}
                      aoEditar={() => setFolha({ tipo: 'editar', t })}
                      aoCancelar={() => void alternarCancelamento(t, apos, erro)}
                      aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                      aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                  ))}
                </ul>
                <Paginacao {...pagMov} />
              </>
            )}
          </Painel>
        )}

        {(aba === 'receber' || aba === 'pagar') && (
          <>
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
                      aoRecorrencia={t.recorrencia_id ? () => setAba('recorrencias') : undefined}
                      aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                  ))}
                </ul>
              </Painel>
            ))}
          </>
        )}

        {aba === 'recorrencias' && (
          <Painel titulo="Assinaturas e recorrências"
            acao={<Botao compacto onClick={() => setFolha({ tipo: 'recorrencia' })}>
              <Icone nome="adicionar" tamanho={14} />Nova
            </Botao>}>
            {/* Editar muda só o molde: o que já foi gerado é obrigação real e
                fica como está — ver recorrencias.upsert na edge. */}
            {recVisiveis.length === 0 ? (
              <Vazio icone="cronograma" titulo="Nenhuma recorrência ativa"
                instrucao="Cadastre assinaturas e contas fixas para o painel lançar sozinho todo mês."
                acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'recorrencia' })}>Cadastrar</Botao>} />
            ) : (
              <ul className="lista">
                {recVisiveis.map((x) => (
                  <li key={x.id} className="lista-item" data-cancelado={x.pausada_em ? 'true' : undefined}>
                    <span className="marca-cor" aria-hidden
                      style={{ background: x.tipo === 'entrada' ? 'var(--acento)' : 'var(--coral)' }} />
                    <span className="celula">
                      <span className="t-ui espremer">{x.nome}</span>
                      <span className="t-legenda espremer">
                        {[
                          rotuloPeriodo(x.periodicidade),
                          x.categoria_id ? nomes.categoria.get(x.categoria_id)?.nome : null,
                          x.conta_id ? nomes.conta.get(x.conta_id)?.nome : null,
                          x.contexto,
                        ].filter(Boolean).join(' · ')}
                        {x.pausada_em
                          ? ' · pausada'
                          : x.proxima_cobranca ? ` · próxima em ${dataCurta(x.proxima_cobranca)}` : ''}
                        {` · desde ${dataCurta(x.inicio)}`}{x.fim ? ` até ${dataCurta(x.fim)}` : ''}
                      </span>
                    </span>
                    <span className="col-desktop t-legenda">
                      {fmtBRL(custoAnual(x.valor_cents, x.periodicidade))}/ano
                    </span>
                    <Dinheiro cents={x.valor_cents} className="t-valor" />
                    {/* Pausar suspende a geração sem apagar o que já virou
                        obrigação; encerrar tira do painel e mantém o histórico. */}
                    <Botao variante="icone"
                      aria-label={x.pausada_em ? `Retomar ${x.nome}` : `Pausar ${x.nome}`}
                      onClick={() => void mudarRecorrencia(x, x.pausada_em ? 'retomar' : 'pausar')}>
                      <Icone nome={x.pausada_em ? 'iteracao' : 'pendente'} tamanho={16} />
                    </Botao>
                    <Botao variante="icone" aria-label={`Editar ${x.nome}`}
                      onClick={() => setFolha({ tipo: 'recorrencia', r: x })}>
                      <Icone nome="editar" tamanho={16} />
                    </Botao>
                    <Botao variante="icone" aria-label={`Encerrar ${x.nome}`}
                      onClick={() => void mudarRecorrencia(x, 'encerrar')}>
                      <Icone nome="excluir" tamanho={16} />
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        )}
      </Carga>

      {folha?.tipo === 'nova' && <FolhaTransacao aoFechar={fechar} aoSalvar={apos} />}
      {folha && 't' in folha && <FolhasMov folha={folha} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'recorrencia' && <FolhaRecorrencia inicial={folha.r} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'importar' && <FolhaImportar aoFechar={fechar} aoSalvar={apos} />}

      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

// ── partes ───────────────────────────────────────────────────────────────────

const porVencimento = (a: Transacao, b: Transacao) =>
  (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999')
