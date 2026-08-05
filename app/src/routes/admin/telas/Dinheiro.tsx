import { useMemo, useState } from 'react'
import { financas } from '../../../lib/api'
import { fmtBRL } from '../../../lib/dinheiro'
import { hojeISO, rotuloMes, useFinancas, useNomes, useTransacoesDoMes } from '../../../lib/financas-store'
import {
  diasDeAtraso, estaEmAberto, faturaAberta, limiteDisponivel, resultado,
  saldoConta, saldoAberto,
} from '../../../domain/financeiro'
import type { Conta, Recorrencia, Transacao } from '../../../lib/tipos'
import { Aviso, Botao, Card, Etiqueta, Icone, Indicador, Painel, Pilula, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, ChipMovimento, Dinheiro, SeletorLente, SeletorMes } from '../../../ui/painel'
import { custoAnual, custoMensal, dataCurta, rotuloConta, rotuloPeriodo } from '../../../ui/formato'
import { FolhaTransacao } from '../FolhaTransacao'
import { FolhaConta, FolhaExcluir, FolhaLiquidar, FolhaRecorrencia } from '../folhas'

type Aba = 'movimentos' | 'receber' | 'pagar' | 'contas' | 'recorrencias'
const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'movimentos', label: 'Movimentações' },
  { chave: 'receber', label: 'A receber' },
  { chave: 'pagar', label: 'A pagar' },
  { chave: 'contas', label: 'Contas' },
  { chave: 'recorrencias', label: 'Recorrências' },
]

export default function DinheiroTela() {
  const est = useFinancas()
  const { contas, transacoes, recorrencias, mes, contexto, recarregar } = est
  const doMes = useTransacoesDoMes()
  const nomes = useNomes()
  const hoje = hojeISO()

  const [aba, setAba] = useState<Aba>('movimentos')
  const [busca, setBusca] = useState('')
  const [folha, setFolha] = useState<
    | { tipo: 'nova' }
    | { tipo: 'liquidar'; t: Transacao }
    | { tipo: 'excluir'; t: Transacao }
    | { tipo: 'conta'; c?: Conta }
    | { tipo: 'recorrencia'; r?: Recorrencia }
    | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const fechar = () => setFolha(null)
  const apos = async (msg: string) => { setAviso(msg); await recarregar() }

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
  const aReceber = useMemo(
    () => filtrar(emAberto.filter((t) => t.tipo === 'entrada').sort(porVencimento)), [emAberto, filtrar])
  const aPagar = useMemo(
    () => filtrar(emAberto.filter((t) => t.tipo === 'saida').sort(porVencimento)), [emAberto, filtrar])

  const r = useMemo(() => resultado(transacoes, contexto, mes), [transacoes, contexto, mes])
  const contasVisiveis = contas.filter((c) => c.ativa && (!contexto || c.contexto === contexto))
  const recVisiveis = recorrencias.filter((x) => !contexto || x.contexto === contexto)
  const listaAtual = aba === 'receber' ? aReceber : aPagar

  return (
    <div className="tela pilha">
      <Cabecalho secao="Financeiro" titulo={rotuloMes(mes)}>
        <SeletorLente />
        <SeletorMes />
        <Botao variante="primario" onClick={() => setFolha({ tipo: 'nova' })}>
          <Icone nome="adicionar" tamanho={16} />Lançar
        </Botao>
      </Cabecalho>

      <Carga linhas={6}>
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Resultado do mês" valor={fmtBRL(r.lucro_cents)}
            nota={`${fmtBRL(r.receita_cents)} recebido · ${fmtBRL(r.despesa_cents)} gasto`} />
          <Indicador rotulo="A receber" valor={fmtBRL(somaAberto(aReceber))} cor="acento"
            nota={`${aReceber.length} em aberto`} />
          <Indicador rotulo="A pagar" valor={fmtBRL(somaAberto(aPagar))}
            nota={`${aPagar.length} em aberto`} />
          <Indicador rotulo="Custo recorrente"
            valor={fmtBRL(recVisiveis.reduce((s, x) =>
              s + (x.tipo === 'saida' ? custoMensal(x.valor_cents, x.periodicidade) : 0), 0))}
            nota={`${recVisiveis.length} ativas · por mês`} />
        </div>

        <div className="abas" role="tablist" aria-label="Seções do financeiro">
          {ABAS.map((a) => (
            <Pilula key={a.chave} ativa={aba === a.chave} role="tab" aria-selected={aba === a.chave}
              onClick={() => setAba(a.chave)}>{a.label}</Pilula>
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
              <ul className="lista">
                {movimentos.map((t) => (
                  <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje}
                    aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                    aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                ))}
              </ul>
            )}
          </Painel>
        )}

        {(aba === 'receber' || aba === 'pagar') && (
          <Painel titulo={aba === 'receber' ? 'Contas a receber' : 'Contas a pagar'}
            acao={<Dinheiro cents={somaAberto(listaAtual)} className="t-valor" />}>
            {listaAtual.length === 0 ? (
              <Vazio icone="ok" titulo={aba === 'receber' ? 'Nada a receber' : 'Nada a pagar'}
                instrucao="Nenhuma conta em aberto neste contexto." />
            ) : (
              <ul className="lista">
                {listaAtual.map((t) => (
                  <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje} modoCobranca
                    aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                    aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                ))}
              </ul>
            )}
          </Painel>
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
                  <CartaoConta key={c.id} c={c} transacoes={transacoes}
                    aoEditar={() => setFolha({ tipo: 'conta', c })} />
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
            {recVisiveis.length === 0 ? (
              <Vazio icone="cronograma" titulo="Nenhuma recorrência ativa"
                instrucao="Cadastre assinaturas e contas fixas para o painel lançar sozinho todo mês."
                acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'recorrencia' })}>Cadastrar</Botao>} />
            ) : (
              <ul className="lista">
                {recVisiveis.map((x) => (
                  <li key={x.id} className="lista-item">
                    <span className="marca-cor" aria-hidden
                      style={{ background: x.tipo === 'entrada' ? 'var(--acento)' : 'var(--coral)' }} />
                    <span className="celula">
                      <span className="t-ui espremer">{x.nome}</span>
                      <span className="t-legenda espremer">
                        {rotuloPeriodo(x.periodicidade)} · {x.contexto}
                        {x.proxima_cobranca ? ` · próxima em ${dataCurta(x.proxima_cobranca)}` : ''}
                      </span>
                    </span>
                    <span className="col-desktop t-legenda">
                      {fmtBRL(custoAnual(x.valor_cents, x.periodicidade))}/ano
                    </span>
                    <Dinheiro cents={x.valor_cents} className="t-valor" />
                    <Botao variante="icone" aria-label={`Editar ${x.nome}`}
                      onClick={() => setFolha({ tipo: 'recorrencia', r: x })}>
                      <Icone nome="editar" tamanho={16} />
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        )}
      </Carga>

      {folha?.tipo === 'nova' && <FolhaTransacao aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'liquidar' && <FolhaLiquidar transacao={folha.t} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'conta' && <FolhaConta inicial={folha.c} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'recorrencia' && <FolhaRecorrencia inicial={folha.r} aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'excluir' && (
        <FolhaExcluir
          titulo={`Excluir "${folha.t.descricao}"?`}
          consequencia={folha.t.grupo_id
            ? 'Todas as parcelas deste parcelamento saem junto — uma parcela sozinha deixaria as outras órfãs.'
            : 'O lançamento sai do mês e deixa de contar no saldo e no resultado.'}
          aoFechar={fechar}
          aoConfirmar={async () => {
            await financas.remover(folha.t.grupo_id ? { grupo_id: folha.t.grupo_id } : { id: folha.t.id })
            await apos('Lançamento excluído')
          }} />
      )}

      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

// ── partes ───────────────────────────────────────────────────────────────────

const porVencimento = (a: Transacao, b: Transacao) =>
  (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999')

const somaAberto = (ts: Transacao[]) => ts.reduce((s, t) => s + saldoAberto(t), 0)

/** Uma árvore só para toque e desktop: as colunas extras entram por CSS
 *  (.col-desktop) em vez de existir uma tabela e uma lista em paralelo. */
function LinhaMov({ t, nomes, hoje, modoCobranca, aoLiquidar, aoExcluir }: {
  t: Transacao
  nomes: ReturnType<typeof useNomes>
  hoje: string
  /** Abas A receber / A pagar: o número que importa é quanto FALTA, e o atraso
   *  aparece. No extrato de movimentações vale o valor do lançamento. */
  modoCobranca?: boolean
  aoLiquidar: () => void
  aoExcluir: () => void
}) {
  const atraso = modoCobranca ? diasDeAtraso(t, hoje) : 0
  const cliente = t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : null
  const conta = t.conta_id ? nomes.conta.get(t.conta_id)?.nome : null
  const categoria = t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : null
  const valor = modoCobranca ? saldoAberto(t) : t.valor_cents
  const parcial = !modoCobranca && t.recebido_cents > 0 && t.recebido_cents < t.valor_cents

  return (
    <li className="lista-item">
      <span className="mov-icone" data-tipo={t.tipo} aria-hidden>
        <Icone nome={t.tipo === 'entrada' ? 'avancar' : t.tipo === 'saida' ? 'voltar' : 'compartilhar'} tamanho={16} />
      </span>
      <span className="celula">
        <span className="t-ui espremer">{t.descricao}</span>
        <span className="t-legenda espremer">
          {[cliente, categoria, conta].filter(Boolean).join(' · ') || 'Sem classificação'}
          {t.data_vencimento ? ` · ${dataCurta(t.data_vencimento)}` : ''}
          {atraso > 0 ? ` · ${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso` : ''}
          {parcial ? ` · faltam ${fmtBRL(saldoAberto(t))}` : ''}
        </span>
      </span>
      {t.parcela_de && <span className="col-desktop t-legenda">{t.parcela_num}/{t.parcela_de}</span>}
      <Dinheiro cents={t.tipo === 'saida' ? -valor : valor} className="t-valor" />
      <ChipMovimento status={t.status} />
      {estaEmAberto(t) && t.tipo !== 'transferencia' && (
        <Botao variante="icone" onClick={aoLiquidar}
          aria-label={`Registrar ${t.tipo === 'entrada' ? 'recebimento' : 'pagamento'} de ${t.descricao}`}>
          <Icone nome="ok" tamanho={16} />
        </Botao>
      )}
      <Botao variante="icone" onClick={aoExcluir} aria-label={`Excluir ${t.descricao}`}>
        <Icone nome="excluir" tamanho={16} />
      </Botao>
    </li>
  )
}

function CartaoConta({ c, transacoes, aoEditar }: {
  c: Conta
  transacoes: Transacao[]
  aoEditar: () => void
}) {
  const ehCartao = c.tipo === 'cartao_credito'
  const fatura = ehCartao ? faturaAberta(c, transacoes) : 0
  const disponivel = ehCartao ? limiteDisponivel(c, transacoes) : null

  return (
    <Card hover onClick={aoEditar} className="conta-card">
      <span className="linha" style={{ justifyContent: 'space-between' }}>
        <Etiqueta mini>{rotuloConta(c.tipo)}</Etiqueta>
        <span className="ponto-cor" style={{ background: c.cor || 'var(--roxo)' }} aria-hidden />
      </span>
      <p className="t-card espremer" style={{ marginTop: 'var(--e-3)' }}>{c.nome}</p>
      <p className="t-valor-g dinheiro" style={{ marginTop: 'var(--e-5)' }}>
        {fmtBRL(ehCartao ? fatura : saldoConta(c, transacoes))}
      </p>
      <p className="t-legenda">
        {ehCartao
          ? `Fatura aberta · ${fmtBRL(disponivel ?? 0)} de limite disponível`
          : `${c.contexto}${c.instituicao ? ` · ${c.instituicao}` : ''}`}
      </p>
    </Card>
  )
}
