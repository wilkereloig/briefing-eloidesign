import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { financas } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes, useTransacoesDoMes } from '../../../lib/financas-store'
import {
  agruparPorPrazo, cicloFatura, diasDeAtraso, estaEmAberto, faturaAberta, limiteDisponivel,
  parceladoAberto, resultado, ROTULO_FAIXA, saldoConta, totalEmAberto,
} from '../../../domain/financeiro'
import { semNotaFiscal } from '../../../domain/decisoes'
import type { Conferencia, Conta, Recorrencia, Transacao } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Card, Etiqueta, Folha, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Carga, Dinheiro, Paginacao, SeletorMes } from '../../../ui/painel'
import { usePaginacao } from '../../../ui/paginacao'
import { custoAnual, custoMensal, dataCurta, rotuloConta, rotuloPeriodo } from '../../../ui/formato'
import { FolhaTransacao } from '../FolhaTransacao'
import { FolhaConta, FolhaRecorrencia } from '../folhas'
import { Onboarding } from '../Onboarding'
import { FolhaConferencia, FolhaImportar } from '../FolhasExtrato'
import { alternarCancelamento, FolhasMov, LinhaMov, type FolhaMov } from './dinheiro/compartilhado'

type Aba = 'movimentos' | 'receber' | 'pagar' | 'contas' | 'recorrencias'
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
 *  Contas virou página própria (dinheiro/Contas.tsx); /cartoes ainda cai
 *  aqui, na aba Contas, até a página própria dele existir. */
function abaDoPath(pathname: string): Aba {
  if (pathname.endsWith('/agenda')) return 'pagar'
  if (pathname.endsWith('/planejamento')) return 'recorrencias'
  if (pathname.endsWith('/cartoes')) return 'contas'
  return 'movimentos'
}

export default function DinheiroTela() {
  const est = useFinancas()
  const { contas, transacoes, recorrencias, servicos, conferencias, mes, contexto, recarregar } = est
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
    | { tipo: 'conta'; c?: Conta }
    | { tipo: 'fatura'; c: Conta }
    | { tipo: 'conferir'; c: Conta }
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
  const contasVisiveis = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
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

        {aba === 'contas' && (
          <Painel titulo="Contas e cartões"
            acao={<Botao compacto onClick={() => setFolha({ tipo: 'conta' })}>
              <Icone nome="adicionar" tamanho={14} />Nova conta
            </Botao>}>
            {contasVisiveis.length === 0 ? (
              <Vazio icone="caixa" titulo="Nenhuma conta cadastrada"
                instrucao="Sem conta o painel não tem onde somar saldo."
                acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'conta' })}>Cadastrar conta</Botao>} />
            ) : (
              <div className="grade-indicadores">
                {contasVisiveis.map((c) => (
                  <CartaoConta key={c.id} c={c} transacoes={transacoes} hoje={hoje}
                    conferencia={conferencias.find((x) => x.conta_id === c.id)}
                    aoEditar={() => setFolha({ tipo: 'conta', c })}
                    aoConferir={() => setFolha({ tipo: 'conferir', c })}
                    aoPagarFatura={() => setFolha({ tipo: 'fatura', c })} />
                ))}
              </div>
            )}
          </Painel>
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
      {folha?.tipo === 'conta' && <FolhaConta inicial={folha.c} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'fatura' && (
        <FolhaPagarFatura cartao={folha.c} aoFechar={fechar} aoSalvar={apos} />
      )}
      {folha?.tipo === 'recorrencia' && <FolhaRecorrencia inicial={folha.r} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'conferir' && <FolhaConferencia conta={folha.c} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'importar' && <FolhaImportar aoFechar={fechar} aoSalvar={apos} />}

      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

// ── partes ───────────────────────────────────────────────────────────────────

const porVencimento = (a: Transacao, b: Transacao) =>
  (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999')

function CartaoConta({ c, transacoes, hoje, conferencia, aoEditar, aoConferir, aoPagarFatura }: {
  c: Conta
  transacoes: Transacao[]
  hoje: string
  /** Última conferência desta conta, se houver. */
  conferencia?: Conferencia
  aoEditar: () => void
  aoConferir: () => void
  aoPagarFatura: () => void
}) {
  const ehCartao = c.tipo === 'cartao_credito'
  const fatura = ehCartao ? faturaAberta(c, transacoes) : 0
  const disponivel = ehCartao ? limiteDisponivel(c, transacoes) : null
  const ciclo = ehCartao ? cicloFatura(c, hoje) : null
  const parcelado = ehCartao ? parceladoAberto(c, transacoes) : null

  return (
    <Card className="conta-card">
      <span className="linha" style={{ justifyContent: 'space-between' }}>
        <Etiqueta mini>{rotuloConta(c.tipo)}</Etiqueta>
        <span className="linha" style={{ gap: 'var(--espaco-02)' }}>
          <span className="ponto-cor" style={{ background: c.cor || 'var(--roxo)' }} aria-hidden />
          <Botao variante="icone" onClick={aoEditar} aria-label={`Editar ${c.nome}`}>
            <Icone nome="editar" tamanho={16} />
          </Botao>
        </span>
      </span>
      <p className="t-card espremer" style={{ marginTop: 'var(--espaco-02)' }}>{c.nome}</p>
      <p className="t-valor-g dinheiro" style={{ marginTop: 'var(--espaco-03)' }}>
        {fmtBRL(ehCartao ? fatura : saldoConta(c, transacoes))}
      </p>
      <p className="t-legenda">
        {ehCartao
          ? disponivel == null
            ? 'Fatura aberta · limite não informado'
            : `Fatura aberta · ${fmtBRL(disponivel)} de ${fmtBRL(c.limite_cents ?? 0)} disponível`
          : `${c.contexto}${c.instituicao ? ` · ${c.instituicao}` : ''}`}
      </p>
      {ciclo && (
        <span className="conta-ciclo">
          <span><span className="etiqueta-mini">Fecha</span><span className="t-ui">{dataCurta(ciclo.fechamento)}</span></span>
          <span><span className="etiqueta-mini">Vence</span><span className="t-ui">{dataCurta(ciclo.vencimento)}</span></span>
          <span>
            <span className="etiqueta-mini">Parcelado</span>
            <span className="t-ui">{parcelado!.qtd ? `${parcelado!.qtd}× · ${fmtBRL(parcelado!.cents)}` : '—'}</span>
          </span>
        </span>
      )}
      {/* Pagar fatura é TRANSFERÊNCIA (conta → cartão), nunca despesa nova: a
          despesa já foi lançada em cada compra. Lançar de novo dobraria o gasto. */}
      {ehCartao && fatura > 0 && (
        <Botao compacto onClick={aoPagarFatura} style={{ marginTop: 'var(--espaco-04)' }}>
          Pagar fatura
        </Botao>
      )}
      {!ehCartao && (
        <span className="linha" style={{ marginTop: 'var(--espaco-04)', justifyContent: 'space-between' }}>
          <span className="t-legenda">
            {conferencia
              ? `Conferido ${dataCurta(conferencia.data)} · ${conferencia.diferenca_cents === 0 ? 'bateu' : `diferença ${fmtBRL(conferencia.diferenca_cents)}`}`
              : 'Nunca conferido'}
          </span>
          <Botao compacto onClick={aoConferir}>Conferir</Botao>
        </span>
      )}
    </Card>
  )
}

/** Pagamento de fatura: o servidor cria a transferência conta → cartão (neutra
 *  no resultado, baixa o saldo da conta) e liquida as compras em aberto do
 *  cartão — é isso que zera a `faturaAberta`. Só a transferência deixava a
 *  fatura cheia para sempre. */
function FolhaPagarFatura({ cartao, aoFechar, aoSalvar }: {
  cartao: Conta
  aoFechar: () => void
  aoSalvar: (msg: string, tipo?: 'ok' | 'erro') => void
}) {
  const { contas, transacoes } = useFinancas()
  const fatura = faturaAberta(cartao, transacoes)
  const origens = contas.filter((c) => c.ativa && c.tipo !== 'cartao_credito')
  const [contaId, setContaId] = useState(
    origens.find((c) => c.contexto === cartao.contexto)?.id ?? origens[0]?.id ?? '')
  const [valor, setValor] = useState(fmtBRL(fatura))
  const [data, setData] = useState(hojeISO())
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const cents = centsDeBRL(valor)

  async function salvar() {
    if (!contaId) return setErro('Escolha a conta que paga a fatura')
    if (cents <= 0) return setErro('Informe um valor maior que zero')
    if (cents > fatura) return setErro(`A fatura aberta é ${fmtBRL(fatura)}`)
    setSalvando(true)
    try {
      const r = await financas.pagarFatura({ cartao_id: cartao.id, conta_id: contaId, valor_cents: cents, data })
      const compras = `${r.liquidadas} ${r.liquidadas === 1 ? 'compra liquidada' : 'compras liquidadas'}`
      // Sobra = pagou mais do que havia em aberto no servidor. O dinheiro saiu
      // da conta; o excedente fica de crédito no cartão e merece conferência.
      if (r.sobra_cents > 0) aoSalvar(`Fatura paga · ${compras} · sobraram ${fmtBRL(r.sobra_cents)} sem compra para abater`, 'erro')
      else aoSalvar(`Fatura paga · ${compras}`)
      aoFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo="Pagar fatura" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Confirmar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <div>
          <p className="t-card">{cartao.nome}</p>
          <p className="t-sec">Fatura aberta: <span className="dinheiro">{fmtBRL(fatura)}</span></p>
        </div>

        <div className="campo">
          <label htmlFor="fat-conta">Pagar com</label>
          <select id="fat-conta" className="campo-caixa" value={contaId}
            onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {origens.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} · {c.contexto}</option>
            ))}
          </select>
        </div>

        <Campo rotulo="Valor" value={valor} inputMode="decimal" erro={erro}
          onChange={(e) => { setValor(e.target.value); setErro('') }} />

        <div className="campo">
          <label htmlFor="fat-data">Data</label>
          <input id="fat-data" type="date" className="campo-caixa" value={data}
            onChange={(e) => setData(e.target.value)} />
        </div>

        <p className="t-legenda">
          O pagamento entra como transferência e liquida as compras em aberto do cartão:
          sai do saldo da conta sem contar como despesa nova — a despesa já foi lançada em cada compra.
        </p>
      </div>
    </Folha>
  )
}
