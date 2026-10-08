import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes } from '../../../../lib/financas-store'
import {
  agrupar, cicloFatura, dividaDoCartao, faturasDoCartao, indiceFaturaAtual, limiteDisponivel,
  parceladoAberto, type Fatura,
} from '../../../../domain/financeiro'
import type { Transacao } from '../../../../lib/tipos'
import { Aviso, Botao, Chip, Etiqueta, Icone, Indicador, Painel, Progresso, Vazio } from '../../../../ui/componentes'
import { Carga, ChipMovimento, Dinheiro, Paginacao } from '../../../../ui/painel'
import { usePaginacao } from '../../../../ui/paginacao'
import { dataCurta, diaMes, mesPorExtenso, rotuloConta } from '../../../../ui/formato'
import { FolhaConta } from '../../folhas'
import { ChipFatura, FolhaPagarFatura } from './compartilhado'

const SEM_CATEGORIA = 'sem-categoria'

const porCompraDesc = (a: Transacao, b: Transacao) =>
  (b.data_competencia ?? '').localeCompare(a.data_competencia ?? '')

/** Página de um cartão: uma fatura por vez (← →), o que entrou nela por
 *  categoria e compra a compra, e ao lado o limite e as faturas seguintes. */
export default function CartaoDetalhe() {
  const { id } = useParams()
  const { contas, transacoes, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const cartao = contas.find((c) => c.id === id)

  const faturas = useMemo(() => (cartao ? faturasDoCartao(cartao, transacoes, hoje) : []),
    [cartao, transacoes, hoje])
  // null = "a fatura atual": recalcula quando os dados chegam ou mudam (após
  // pagar, a atual passa a ser a próxima). Escolher com ← → fixa o índice.
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const indice = Math.min(escolhido ?? indiceFaturaAtual(faturas, hoje), faturas.length - 1)
  const f: Fatura | undefined = faturas[indice]

  const categorias = useMemo(() => (f
    ? agrupar(f.linhas, (t) => t.categoria_id ?? SEM_CATEGORIA, 'saida', (t) => t.valor_cents)
    : []), [f])
  const compras = useMemo(() => (f ? [...f.linhas].sort(porCompraDesc) : []), [f])
  const pag = usePaginacao(compras, 'cartao-compras', 50)

  const [folha, setFolha] = useState<'pagar' | 'editar' | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (texto: string, tipo?: 'ok' | 'erro') => { setAviso({ texto, tipo }); await recarregar() }

  // Conta que não é cartão tem extrato, não fatura.
  if (cartao && cartao.tipo !== 'cartao_credito') return <Navigate to={`/admin/dinheiro/contas/${cartao.id}`} replace />

  const ciclo = cartao ? cicloFatura(cartao, hoje) : null
  const divida = cartao ? dividaDoCartao(cartao, transacoes) : 0
  const disponivel = cartao ? limiteDisponivel(cartao, transacoes) : null
  const parcelado = cartao ? parceladoAberto(cartao, transacoes) : { qtd: 0, cents: 0 }
  const proximas = faturas.slice(indice + 1).filter((x) => x.falta_cents > 0)
  // O servidor quita da fatura mais antiga para a mais nova: pagar olhando uma
  // fatura posterior abate antes a que vence primeiro.
  const primeiraAberta = faturas.find((x) => x.falta_cents > 0)

  return (
    <Carga linhas={5}>
      {!cartao ? (
        <Vazio icone="pesquisa" titulo="Cartão não encontrado"
          instrucao="Ele pode ter sido removido, ou o link está errado."
          acao={<Link className="btn btn-primario" to="/admin/dinheiro/cartoes">Ver cartões</Link>} />
      ) : (
        <div className="pilha" data-density="dense">
          <Painel>
            <span className="linha" style={{ justifyContent: 'space-between' }}>
              <Etiqueta mini>{rotuloConta(cartao.tipo)} · {cartao.contexto}</Etiqueta>
              {!cartao.ativa && <Chip estado="rascunho">Arquivado</Chip>}
            </span>
            <h2 className="t-card" style={{ marginTop: 'var(--espaco-02)' }}>{cartao.nome}</h2>
            {cartao.instituicao && <p className="t-legenda">{cartao.instituicao}</p>}
            <div className="linha" style={{ marginTop: 'var(--espaco-04)' }}>
              <Botao onClick={() => setFolha('editar')}>Editar cartão</Botao>
            </div>
          </Painel>

          {!f ? (
            <Vazio icone="pagamento" titulo="Nenhuma compra neste cartão"
              instrucao="Lance uma compra no cartão e a fatura aparece aqui, mês a mês." />
          ) : (
            <Painel>
              <div className="linha" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Botao variante="icone" aria-label="Fatura anterior" disabled={indice <= 0}
                  onClick={() => setEscolhido(indice - 1)}>
                  <Icone nome="voltar" tamanho={18} />
                </Botao>
                <span className="celula" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <h3 className="t-card">{rotuloFatura(f, hoje)}</h3>
                  <ChipFatura situacao={f.situacao} />
                </span>
                <Botao variante="icone" aria-label="Próxima fatura" disabled={indice >= faturas.length - 1}
                  onClick={() => setEscolhido(indice + 1)}>
                  <Icone nome="avancar" tamanho={18} />
                </Botao>
              </div>

              <div className="grade-indicadores" style={{ marginTop: 'var(--espaco-04)' }}>
                <Indicador rotulo="Total" valor={fmtBRL(f.total_cents)}
                  nota={`${f.linhas.length} ${f.linhas.length === 1 ? 'lançamento' : 'lançamentos'}`} />
                <Indicador rotulo="Pago" valor={fmtBRL(f.pago_cents)} />
                <Indicador dominante rotulo="Falta" valor={fmtBRL(f.falta_cents)}
                  nota={f.fechamento ? `fecha ${diaMes(f.fechamento)}` : undefined} />
              </div>

              {f.falta_cents > 0 && (
                <div className="linha" style={{ marginTop: 'var(--espaco-04)' }}>
                  {/* Pagar fatura é TRANSFERÊNCIA (conta → cartão), nunca despesa
                      nova: a despesa já foi lançada em cada compra. */}
                  <Botao variante="primario" onClick={() => setFolha('pagar')}>
                    <Icone nome="pagamento" tamanho={16} />Pagar fatura
                  </Botao>
                  {primeiraAberta && primeiraAberta.vencimento !== f.vencimento && (
                    <span className="t-legenda">
                      O pagamento abate primeiro a fatura que vence {diaMes(primeiraAberta.vencimento)}.
                    </span>
                  )}
                </div>
              )}
            </Painel>
          )}

          <div className="grade-dupla">
            <div className="pilha">
              {f && (
                <Painel titulo="Por categoria">
                  {categorias.length === 0 ? (
                    <p className="t-sec">Só estornos nesta fatura.</p>
                  ) : (
                    <ul className="lista">
                      {categorias.map((c) => (
                        <li key={c.chave} className="lista-item">
                          <span className="celula">
                            <span className="t-ui espremer">
                              {c.chave === SEM_CATEGORIA ? 'Sem categoria' : nomes.categoria.get(c.chave)?.nome ?? 'Categoria removida'}
                            </span>
                            <span className="t-legenda">{c.qtd} {c.qtd === 1 ? 'compra' : 'compras'}</span>
                          </span>
                          <Dinheiro cents={c.total_cents} className="t-valor" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Painel>
              )}

              {f && (
                <Painel titulo={`Compras (${compras.length})`}>
                  <ul className="lista">
                    {pag.visiveis.map((t) => <LinhaCompra key={t.id} t={t} nomes={nomes} />)}
                  </ul>
                  <Paginacao {...pag} />
                </Painel>
              )}
            </div>

            <div className="pilha">
              <Painel titulo="Limite">
                {cartao.limite_cents && disponivel != null ? (
                  <>
                    <Progresso pct={(divida / cartao.limite_cents) * 100} rotulo="Limite usado" />
                    <ul className="lista" style={{ marginTop: 'var(--espaco-03)' }}>
                      <LinhaValor rotulo="Limite" cents={cartao.limite_cents} />
                      <LinhaValor rotulo="Usado" cents={divida} />
                      <LinhaValor rotulo="Disponível" cents={disponivel} />
                    </ul>
                  </>
                ) : (
                  <p className="t-sec">Limite não informado. Em uso: {fmtBRL(divida)}.</p>
                )}
                <span className="conta-ciclo">
                  <span><span className="etiqueta-mini">Fecha</span>
                    <span className="t-ui">{ciclo ? dataCurta(ciclo.fechamento) : '—'}</span></span>
                  <span><span className="etiqueta-mini">Vence</span>
                    <span className="t-ui">{ciclo ? dataCurta(ciclo.vencimento) : '—'}</span></span>
                  <span><span className="etiqueta-mini">Parcelado</span>
                    <span className="t-ui">{parcelado.qtd ? `${parcelado.qtd}× · ${fmtBRL(parcelado.cents)}` : '—'}</span></span>
                </span>
              </Painel>

              <Painel titulo="Próximas faturas">
                {proximas.length === 0 ? (
                  <p className="t-sec">Nada lançado para as faturas seguintes.</p>
                ) : (
                  <ul className="lista">
                    {proximas.map((x) => (
                      <li key={x.vencimento} className="lista-item">
                        <span className="celula">
                          <span className="t-ui espremer">{rotuloFatura(x, hoje)}</span>
                          <span className="t-legenda">{x.linhas.length} {x.linhas.length === 1 ? 'lançamento' : 'lançamentos'}</span>
                        </span>
                        <Dinheiro cents={x.falta_cents} className="t-valor" />
                      </li>
                    ))}
                  </ul>
                )}
              </Painel>
            </div>
          </div>

          {folha === 'pagar' && <FolhaPagarFatura cartao={cartao} aoFechar={fechar} aoSalvar={apos} />}
          {folha === 'editar' && <FolhaConta inicial={cartao} aoFechar={fechar} aoSalvar={apos} />}
        </div>
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </Carga>
  )
}

/** "Fatura de outubro · vence 09/10"; o ano entra só quando não é o corrente. */
function rotuloFatura(f: Fatura, hoje: string) {
  const ano = f.vencimento.slice(0, 4) === hoje.slice(0, 4) ? '' : ` de ${f.vencimento.slice(0, 4)}`
  return `Fatura de ${mesPorExtenso(f.vencimento)}${ano} · vence ${diaMes(f.vencimento)}`
}

function LinhaValor({ rotulo, cents }: { rotulo: string; cents: number }) {
  return (
    <li className="lista-item">
      <span className="celula"><span className="t-ui">{rotulo}</span></span>
      <Dinheiro cents={cents} className="t-valor" />
    </li>
  )
}

/** Compra na fatura: estorno (entrada no cartão) abate o total, por isso sai
 *  negativo — em cor de recebido, não de erro. */
function LinhaCompra({ t, nomes }: { t: Transacao; nomes: ReturnType<typeof useNomes> }) {
  const estorno = t.tipo === 'entrada'
  const categoria = t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : null
  const apoio = [
    t.data_competencia ? dataCurta(t.data_competencia) : null,
    estorno ? 'estorno' : categoria ?? 'Sem categoria',
    t.parcela_de ? `${t.parcela_num}/${t.parcela_de}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <li className="lista-item">
      <span className="celula">
        <span className="t-ui espremer">{t.descricao}</span>
        <span className="t-legenda espremer">{apoio}</span>
      </span>
      <Dinheiro cents={estorno ? -t.valor_cents : t.valor_cents} natureza={estorno ? 'recebido' : undefined}
        className="t-valor" />
      <ChipMovimento status={t.status} />
    </li>
  )
}
