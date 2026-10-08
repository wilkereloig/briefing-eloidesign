import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { financas } from '../../../../lib/api'
import { fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes } from '../../../../lib/financas-store'
import { estaEmAberto, extratoDaConta, saldoConta, type LinhaExtrato } from '../../../../domain/financeiro'
import type { Transacao } from '../../../../lib/tipos'
import { Aviso, Botao, Chip, Etiqueta, Icone, Painel, Pilula, Vazio } from '../../../../ui/componentes'
import { Carga, Dinheiro, Paginacao, SeletorMes } from '../../../../ui/painel'
import { usePaginacao } from '../../../../ui/paginacao'
import { dataCurta, rotuloConta } from '../../../../ui/formato'
import { FolhaTransacao } from '../../FolhaTransacao'
import { FolhaConta } from '../../folhas'
import { FolhaConferencia } from '../../FolhasExtrato'
import { alternarCancelamento, FolhasMov, LegendaCheque, LinhaMov, type FolhaMov } from './compartilhado'

type Aba = 'extrato' | 'agendado'

const porVencimento = (a: Transacao, b: Transacao) =>
  (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999')

/** Página de uma conta: saldo, cheque especial, conferência, extrato do mês
 *  com saldo após cada linha e o que ainda vai passar por ela. */
export default function ContaDetalhe() {
  const { id } = useParams()
  const { contas, transacoes, conferencias, mes, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const conta = contas.find((c) => c.id === id)

  const [aba, setAba] = useState<Aba>('extrato')
  const [folha, setFolha] = useState<
    | FolhaMov
    | { tipo: 'lancar'; inicial: Partial<Transacao> }
    | { tipo: 'conferir' }
    | { tipo: 'conta' }
    | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }
  const erro = (e: unknown) => setAviso({ texto: (e as Error).message, tipo: 'erro' })

  // O extrato vem inteiro do domínio (saldo acumulado desde o saldo inicial);
  // o mês só recorta o que aparece — o saldo após cada linha continua certo.
  const extrato = useMemo(() => (conta
    ? extratoDaConta(conta, transacoes).filter((l) => l.data.slice(0, 7) === mes.slice(0, 7))
    : []), [conta, transacoes, mes])
  const pag = usePaginacao(extrato, 'conta-extrato', 50)
  const agendado = useMemo(() => transacoes
    .filter((t) => (t.conta_id === id || t.conta_destino_id === id) && estaEmAberto(t)).sort(porVencimento), [transacoes, id])

  // Cartão tem página própria; link velho ou digitado cai no lugar certo.
  if (conta?.tipo === 'cartao_credito') return <Navigate to={`/admin/dinheiro/cartoes/${conta.id}`} replace />

  const saldo = conta ? saldoConta(conta, transacoes) : 0
  const conferencia = conferencias.find((x) => x.conta_id === id)

  // Arquivar = a mesma desativação de antes (Config): conta com histórico não
  // pode ser apagada (FK `on delete restrict`). nome/contexto vão porque a edge
  // exige os dois em contas.upsert.
  const alternarAtiva = async () => {
    if (!conta) return
    try {
      await financas.salvarConta({ id: conta.id, nome: conta.nome, contexto: conta.contexto, ativa: !conta.ativa })
      await apos(conta.ativa ? 'Conta arquivada' : 'Conta reativada')
    } catch (e) { erro(e) }
  }

  return (
    <Carga linhas={5}>
      {!conta ? (
        <Vazio icone="pesquisa" titulo="Conta não encontrada"
          instrucao="Ela pode ter sido removida, ou o link está errado."
          acao={<Link className="btn btn-primario" to="/admin/dinheiro/contas">Ver contas</Link>} />
      ) : (
        <div className="pilha" data-density="dense">
          {/* Sem "voltar" próprio: a pílula Contas da barra do Layout segue ativa
              aqui e já é o caminho de volta, com alvo de toque inteiro. */}
          <Painel>
            <span className="linha" style={{ justifyContent: 'space-between' }}>
              <Etiqueta mini>{rotuloConta(conta.tipo)} · {conta.contexto}</Etiqueta>
              {!conta.ativa && <Chip estado="rascunho">Arquivada</Chip>}
            </span>
            <h2 className="t-card" style={{ marginTop: 'var(--espaco-02)' }}>{conta.nome}</h2>
            {conta.instituicao && <p className="t-legenda">{conta.instituicao}</p>}
            <p style={{ marginTop: 'var(--espaco-03)' }}>
              <Dinheiro cents={saldo} className="t-valor-g" />
            </p>
            <div className="pilha" style={{ gap: 'var(--espaco-01)', marginTop: 'var(--espaco-02)' }}>
              {!!conta.limite_cents && <LegendaCheque saldo={saldo} limite={conta.limite_cents} />}
              <span className="t-legenda">
                {conferencia
                  ? `Conferido ${dataCurta(conferencia.data)} · ${conferencia.diferenca_cents === 0 ? 'bateu' : `diferença ${fmtBRL(conferencia.diferenca_cents)}`}`
                  : 'Nunca conferido'}
              </span>
            </div>
            <div className="linha" style={{ marginTop: 'var(--espaco-04)', flexWrap: 'wrap' }}>
              {/* Conta arquivada não recebe lançamento novo: reative antes. */}
              {conta.ativa && <>
                <Botao variante="primario"
                  onClick={() => setFolha({ tipo: 'lancar', inicial: { conta_id: conta.id, contexto: conta.contexto } })}>
                  <Icone nome="adicionar" tamanho={16} />Lançar
                </Botao>
                <Botao onClick={() => setFolha({
                  tipo: 'lancar', inicial: { tipo: 'transferencia', conta_id: conta.id, contexto: conta.contexto },
                })}>Transferir</Botao>
                <Botao onClick={() => setFolha({ tipo: 'conferir' })}>Conferir saldo</Botao>
              </>}
              <Botao onClick={() => setFolha({ tipo: 'conta' })}>Editar</Botao>
              <Botao onClick={() => void alternarAtiva()}>{conta.ativa ? 'Arquivar' : 'Reativar'}</Botao>
            </div>
          </Painel>

          <div className="abas" role="tablist" aria-label="Movimento da conta">
            <Pilula ativa={aba === 'extrato'} role="tab" aria-selected={aba === 'extrato'}
              onClick={() => setAba('extrato')}>Extrato</Pilula>
            <Pilula ativa={aba === 'agendado'} role="tab" aria-selected={aba === 'agendado'}
              onClick={() => setAba('agendado')}>Agendado ({agendado.length})</Pilula>
          </div>

          {aba === 'extrato' && (
            <>
              <SeletorMes />
              <Painel titulo={`${extrato.length} ${extrato.length === 1 ? 'movimento' : 'movimentos'}`}>
                {extrato.length === 0 ? (
                  <Vazio icone="dinheiro" titulo="Nada passou por esta conta neste mês"
                    instrucao="O extrato mostra o que já foi pago ou recebido. O que está em aberto fica em Agendado." />
                ) : (
                  <>
                    <ul className="lista">
                      {pag.visiveis.map((l) => <LinhaExtratoItem key={l.t.id} l={l} nomes={nomes} />)}
                    </ul>
                    <Paginacao {...pag} />
                  </>
                )}
              </Painel>
            </>
          )}

          {aba === 'agendado' && (
            <Painel titulo="Em aberto, por vencimento">
              {agendado.length === 0 ? (
                <Vazio icone="ok" titulo="Nada agendado" instrucao="Nenhum lançamento em aberto nesta conta." />
              ) : (
                <ul className="lista">
                  {agendado.map((t) => (
                    <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje} modoCobranca
                      entrando={t.tipo === 'transferencia' && t.conta_destino_id === id}
                      aoEditar={() => setFolha({ tipo: 'editar', t })}
                      aoCancelar={() => void alternarCancelamento(t, apos, erro)}
                      aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                      aoReagendar={() => setFolha({ tipo: 'reagendar', t })}
                      aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                  ))}
                </ul>
              )}
            </Painel>
          )}

          {folha && 't' in folha && <FolhasMov folha={folha} aoFechar={fechar} aoSalvar={apos} />}
          {folha?.tipo === 'lancar' && <FolhaTransacao inicial={folha.inicial} aoFechar={fechar} aoSalvar={apos} />}
          {folha?.tipo === 'conferir' && <FolhaConferencia conta={conta} aoFechar={fechar} aoSalvar={apos} />}
          {folha?.tipo === 'conta' && <FolhaConta inicial={conta} aoFechar={fechar} aoSalvar={apos} />}
        </div>
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </Carga>
  )
}

/** Linha do extrato: data, descrição, categoria (ou de/para, se transferência),
 *  valor com sinal e o saldo da conta logo depois dela. */
function LinhaExtratoItem({ l, nomes }: { l: LinhaExtrato; nomes: ReturnType<typeof useNomes> }) {
  const { t } = l
  const apoio = t.tipo === 'transferencia'
    ? l.valor_cents < 0
      ? `Transferência para ${nomes.conta.get(t.conta_destino_id ?? '')?.nome ?? 'outra conta'}`
      : `Transferência de ${nomes.conta.get(t.conta_id ?? '')?.nome ?? 'outra conta'}`
    : (t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : null) ?? 'Sem categoria'
  return (
    <li className="lista-item">
      <span className="celula">
        <span className="t-ui espremer">{t.descricao}</span>
        <span className="t-legenda espremer">{dataCurta(l.data)} · {apoio}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
        <Dinheiro cents={l.valor_cents} sinal className="t-valor" />
        <span className="t-legenda">saldo <Dinheiro cents={l.saldo_cents} /></span>
      </span>
    </li>
  )
}
