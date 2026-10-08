import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { financas } from '../../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes } from '../../../../lib/financas-store'
import {
  chequeEspecialUsado, diasDeAtraso, estaEmAberto, faturaAberta, faturasQuitadasPor, saldoAberto,
  type Fatura, type SituacaoFatura,
} from '../../../../domain/financeiro'
import { semNotaFiscal } from '../../../../domain/decisoes'
import type { Conta, Importacao, PagamentoCartao, ServicoRow, Transacao } from '../../../../lib/tipos'
import { Botao, Campo, Chip, Esqueleto, Folha, Icone, Painel } from '../../../../ui/componentes'
import type { EstadoChip } from '../../../../ui/tokens'
import { ChipMovimento, Dinheiro } from '../../../../ui/painel'
import { dataCurta, mesPorExtenso } from '../../../../ui/formato'
import { FolhaTransacao } from '../../FolhaTransacao'
import { FolhaExcluir, FolhaLiquidar, FolhaReagendar } from '../../folhas'

// Linha de lançamento e as folhas que as ações dela abrem. Compartilhado entre
// Lançamentos, Agenda e a página da conta — uma linha só, para as telas não
// divergirem em ação nem em rótulo.

/** Folha aberta a partir de uma `LinhaMov`. */
export type FolhaMov = { tipo: 'editar' | 'liquidar' | 'reagendar' | 'excluir'; t: Transacao }

/** Estorno em um passo: cancelar preserva a linha no histórico e zera o efeito
 *  em saldo e resultado. Reabrir devolve o status derivado do que já entrou. */
// oxlint-disable-next-line react/only-export-components -- ação pura ao lado da linha que a usa; perder o hot-reload deste arquivo não custa nada
export async function alternarCancelamento(
  t: Transacao, apos: (msg: string) => Promise<void>, erro: (e: unknown) => void,
) {
  const cancelando = t.status !== 'cancelado'
  try {
    await financas.cancelar(t.id, !cancelando)
    await apos(cancelando ? 'Lançamento cancelado' : 'Lançamento reaberto')
  } catch (e) { erro(e) }
}

const CHIP_FATURA: Record<SituacaoFatura, { chip: EstadoChip; label: string }> = {
  aberta: { chip: 'aberto', label: 'Aberta' },
  fechada: { chip: 'aguardando', label: 'Fechada' },
  paga: { chip: 'pago', label: 'Paga' },
  atrasada: { chip: 'atrasado', label: 'Atrasada' },
}

/** Situação de uma fatura de cartão — Visão geral, lista e página do cartão. */
export function ChipFatura({ situacao }: { situacao: SituacaoFatura }) {
  return <Chip estado={CHIP_FATURA[situacao].chip}>{CHIP_FATURA[situacao].label}</Chip>
}

/** "Cheque especial: R$ usado de R$ limite" — no card da lista e na página da conta. */
export function LegendaCheque({ saldo, limite }: { saldo: number; limite: number }) {
  return (
    <span className="t-legenda">
      Cheque especial: {fmtBRL(chequeEspecialUsado(saldo))} usado de {fmtBRL(limite)}
    </span>
  )
}

/** Busca livre das listas de lançamento. Filtra a lista, nunca os indicadores. */
export function CampoBusca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="busca">
      <Icone nome="pesquisa" tamanho={17} />
      <input className="campo-caixa" value={valor} onChange={(e) => aoMudar(e.target.value)}
        placeholder="Buscar por descrição, cliente ou fornecedor" aria-label="Buscar" />
      {valor && (
        <Botao variante="icone" onClick={() => aoMudar('')} aria-label="Limpar busca">
          <Icone nome="fechar" tamanho={14} />
        </Botao>
      )}
    </div>
  )
}

export function FolhasMov({ folha, aoFechar, aoSalvar }: {
  folha: FolhaMov
  aoFechar: () => void
  aoSalvar: (msg: string) => Promise<void> | void
}) {
  const { t } = folha
  if (folha.tipo === 'editar') return <FolhaTransacao inicial={t} aoFechar={aoFechar} aoSalvar={aoSalvar} />
  if (folha.tipo === 'liquidar') return <FolhaLiquidar transacao={t} aoFechar={aoFechar} aoSalvar={aoSalvar} />
  if (folha.tipo === 'reagendar') return <FolhaReagendar transacao={t} aoFechar={aoFechar} aoSalvar={aoSalvar} />
  return (
    <FolhaExcluir
      titulo={`Excluir "${t.descricao}"?`}
      consequencia={t.grupo_id
        ? 'Todas as parcelas deste parcelamento saem junto — uma parcela sozinha deixaria as outras órfãs.'
        : 'O lançamento sai do mês e deixa de contar no saldo e no resultado.'}
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        await financas.remover(t.grupo_id ? { grupo_id: t.grupo_id } : { id: t.id })
        await aoSalvar('Lançamento excluído')
      }} />
  )
}

/** Uma árvore só para toque e desktop: as colunas extras entram por CSS
 *  (.col-desktop) em vez de existir uma tabela e uma lista em paralelo. */
export function LinhaMov({
  t, nomes, hoje, modoCobranca, servico, entrando, aoEditar, aoCancelar, aoLiquidar, aoReagendar, aoRecorrencia, aoExcluir,
}: {
  t: Transacao
  nomes: ReturnType<typeof useNomes>
  hoje: string
  /** Serviço ligado ao lançamento: dá marca e situação da NF na linha. */
  servico?: ServicoRow
  /** Abas A receber / A pagar: o número que importa é quanto FALTA, e o atraso
   *  aparece. No extrato de movimentações vale o valor do lançamento. */
  modoCobranca?: boolean
  /** Só com conta em contexto (página da conta): true = a transferência chega
   *  NESTA conta (entrada); false = sai dela (negativo). Sem contexto
   *  (listas globais) fica `undefined` e a transferência não ganha sinal. */
  entrando?: boolean
  aoEditar: () => void
  aoCancelar: () => void
  aoLiquidar: () => void
  aoReagendar?: () => void
  /** Presente quando a linha nasceu de uma recorrência. */
  aoRecorrencia?: () => void
  aoExcluir: () => void
}) {
  const cancelado = t.status === 'cancelado'
  const atraso = modoCobranca && !cancelado ? diasDeAtraso(t, hoje) : 0
  const cliente = t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : null
  const conta = t.conta_id ? nomes.conta.get(t.conta_id)?.nome : null
  const categoria = t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : null
  const valor = modoCobranca ? saldoAberto(t) : t.valor_cents
  const parcial = !modoCobranca && t.recebido_cents > 0 && t.recebido_cents < t.valor_cents
  // Na fila de cobrança a linha responde "de quem, por quê e tem nota?" sem
  // abrir nada. Só entrada com serviço tem NF a mostrar.
  const emConta = t.tipo === 'transferencia' && entrando !== undefined
  const destino = t.conta_destino_id ? nomes.conta.get(t.conta_destino_id)?.nome : null
  const apoio = emConta
    ? entrando
      ? `Transferência de ${conta ?? 'outra conta'}`
      : `Transferência para ${destino ?? 'outra conta'}`
    : modoCobranca
    ? [
      cliente,
      servico?.sub_cliente,
      servico?.descricao,
      t.tipo === 'entrada' && servico ? (semNotaFiscal(servico) ? 'sem NF' : 'NF ok') : null,
      !servico ? categoria : null,
      conta,
    ].filter(Boolean).join(' · ')
    : [cliente, categoria, conta].filter(Boolean).join(' · ')

  return (
    <li className="lista-item" data-cancelado={cancelado ? 'true' : undefined}>
      <span className="mov-icone" data-tipo={t.tipo} aria-hidden>
        <Icone nome={t.tipo === 'entrada' ? 'avancar' : t.tipo === 'saida' ? 'voltar' : 'compartilhar'} tamanho={16} />
      </span>
      <span className="celula">
        <span className="t-ui espremer">{t.descricao}</span>
        <span className="t-legenda espremer">
          {apoio || 'Sem classificação'}
          {t.data_vencimento ? ` · ${dataCurta(t.data_vencimento)}` : ''}
          {atraso > 0 ? ` · ${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso` : ''}
          {parcial ? ` · faltam ${fmtBRL(saldoAberto(t))}` : ''}
          {modoCobranca && t.recebido_cents > 0
            ? ` · ${fmtBRL(t.recebido_cents)} de ${fmtBRL(t.valor_cents)} já ${t.tipo === 'entrada' ? 'recebido' : 'pago'}` : ''}
          {t.origem === 'importacao' ? ' · importado' : t.origem === 'ajuste' ? ' · ajuste de conferência' : ''}
        </span>
      </span>
      {t.parcela_de && <span className="col-desktop t-legenda">{t.parcela_num}/{t.parcela_de}</span>}
      <Dinheiro cents={t.tipo === 'saida' || (emConta && !entrando) ? -valor : valor} className="t-valor" />
      <ChipMovimento status={t.status} />
      {estaEmAberto(t) && t.tipo !== 'transferencia' && (
        <Botao variante="icone" onClick={aoLiquidar}
          aria-label={`Registrar ${t.tipo === 'entrada' ? 'recebimento' : 'pagamento'} de ${t.descricao}`}>
          <Icone nome="ok" tamanho={16} />
        </Botao>
      )}
      {aoReagendar && estaEmAberto(t) && (
        <Botao variante="icone" onClick={aoReagendar} aria-label={`Reagendar ${t.descricao}`}>
          <Icone nome="calendario" tamanho={16} />
        </Botao>
      )}
      {aoRecorrencia && (
        <Botao variante="icone" onClick={aoRecorrencia} aria-label={`Ver recorrência de ${t.descricao}`}>
          <Icone nome="iteracao" tamanho={16} />
        </Botao>
      )}
      <Botao variante="icone" onClick={aoEditar} aria-label={`Editar ${t.descricao}`}>
        <Icone nome="editar" tamanho={16} />
      </Botao>
      {/* Estorno antes da exclusão: cancelar mantém o rastro, excluir apaga. */}
      <Botao variante="icone" onClick={aoCancelar}
        aria-label={cancelado ? `Reabrir ${t.descricao}` : `Cancelar ${t.descricao}`}>
        <Icone nome={cancelado ? 'iteracao' : 'fechar'} tamanho={16} />
      </Botao>
      <Botao variante="icone" onClick={aoExcluir} aria-label={`Excluir ${t.descricao}`}>
        <Icone nome="excluir" tamanho={16} />
      </Botao>
    </li>
  )
}

/** Pagamento de fatura: o servidor cria a transferência conta → cartão (neutra
 *  no resultado, baixa o saldo da conta) e liquida as compras em aberto do
 *  cartão — é isso que zera a `faturaAberta`. Só a transferência deixava a
 *  fatura cheia para sempre. */
export function FolhaPagarFatura({ cartao, aoFechar, aoSalvar }: {
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
  // Mesmo envio repetido (clique duplo, retry) = um pagamento só no servidor.
  const [chave] = useState(() => crypto.randomUUID())
  const cents = centsDeBRL(valor)

  async function salvar() {
    if (!contaId) return setErro('Escolha a conta que paga a fatura')
    if (cents <= 0) return setErro('Informe um valor maior que zero')
    if (cents > fatura) return setErro(`A fatura aberta é ${fmtBRL(fatura)}`)
    setSalvando(true)
    try {
      const r = await financas.pagarFatura({ cartao_id: cartao.id, conta_id: contaId, valor_cents: cents, data, chave })
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

/** Lista carregada sob demanda (não vem no bootstrap): esqueleto, erro com
 *  "tentar de novo" e recarga quando `versao` muda (depois de uma ação). */
function useListaRemota<T>(buscar: () => Promise<T[]>, versao: number) {
  const [lista, setLista] = useState<T[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    setErro(null)
    try { setLista(await buscar()) } catch (e) { setErro((e as Error).message); setLista([]) }
  }, [buscar])
  useEffect(() => { void carregar() }, [carregar, versao])
  return { lista, erro, carregar }
}

function EstadoLista({ lista, erro, aoTentar, vazio, children }: {
  lista: unknown[] | null; erro: string | null; aoTentar: () => void; vazio: string; children: ReactNode
}) {
  if (lista === null) return <Esqueleto linhas={3} altura={44} />
  if (erro) return (
    <div className="pilha" style={{ gap: 'var(--espaco-03)' }}>
      <p className="t-msg linha" role="alert" style={{ gap: 'var(--espaco-02)' }}><Icone nome="erro" tamanho={16} />{erro}</p>
      <Botao compacto onClick={aoTentar} style={{ alignSelf: 'flex-start' }}>Tentar de novo</Botao>
    </div>
  )
  if (!lista.length) return <p className="t-sec">{vazio}</p>
  return <>{children}</>
}

/** Pagamentos feitos ao cartão e de quais faturas cada um tirou dinheiro. O
 *  rastreado (gravado com vínculo compra → pagamento) pode ser estornado: as
 *  compras voltam a dever e o dinheiro volta ao saldo da conta. */
export function PainelPagamentosCartao({ cartao, faturas, versao, aoSalvar }: {
  cartao: Conta
  faturas: Fatura[]
  versao: number
  aoSalvar: (msg: string) => Promise<void>
}) {
  const nomes = useNomes()
  const buscar = useCallback(() => financas.pagamentosDoCartao(cartao.id), [cartao.id])
  const { lista, erro, carregar } = useListaRemota<PagamentoCartao>(buscar, versao)
  const [alvo, setAlvo] = useState<PagamentoCartao | null>(null)

  return (
    <Painel titulo="Pagamentos ao cartão">
      <EstadoLista lista={lista} erro={erro} aoTentar={() => void carregar()} vazio="Nenhum pagamento registrado neste cartão.">
        <ul className="lista">
          {(lista ?? []).map((p) => {
            const estornado = p.status === 'cancelado'
            const q = faturasQuitadasPor(p, faturas)
            const quitou = q.porFatura.map((x) => `${mesPorExtenso(x.vencimento)} ${fmtBRL(x.cents)}`).join(', ')
            const situacao = estornado ? 'estornado'
              : !p.rastreado ? 'anterior ao rastreio — sem estorno automático'
              : quitou ? `quitou ${quitou}` : 'crédito sem compra abatida'
            const data = p.data_liquidacao ?? p.data_competencia
            return (
              <li key={p.id} className="lista-item" data-cancelado={estornado ? 'true' : undefined}>
                <span className="celula">
                  <span className="t-ui espremer">
                    {data ? dataCurta(data) : 'Sem data'} · {p.conta_id ? nomes.conta.get(p.conta_id)?.nome ?? 'conta' : 'conta'}
                  </span>
                  <span className="t-legenda espremer">{situacao}</span>
                </span>
                <Dinheiro cents={p.valor_cents} className="t-valor" />
                {p.rastreado && !estornado && (
                  <Botao compacto onClick={() => setAlvo(p)} aria-label={`Estornar pagamento de ${fmtBRL(p.valor_cents)}`}>
                    Estornar
                  </Botao>
                )}
              </li>
            )
          })}
        </ul>
      </EstadoLista>
      {alvo && (
        <FolhaExcluir acao="Estornar pagamento" pedirMotivo
          titulo={`Estornar o pagamento de ${fmtBRL(alvo.valor_cents)}?`}
          consequencia="As compras que ele quitou voltam a ficar em aberto na fatura e o valor volta ao saldo da conta de onde saiu. O pagamento continua no histórico como estornado — nada é apagado."
          aoFechar={() => setAlvo(null)}
          aoConfirmar={async (motivo) => {
            const r = await financas.estornarPagamentoFatura(alvo.id, motivo)
            await aoSalvar(`Pagamento estornado · ${r.compras_reabertas} ${r.compras_reabertas === 1 ? 'compra reaberta' : 'compras reabertas'}`)
          }} />
      )}
    </Painel>
  )
}

/** Arquivos de extrato importados nesta conta. Desfazer tira as linhas do lote
 *  (ficam na trilha) e libera a reimportação do arquivo certo. */
export function PainelImportacoes({ conta, versao, aoSalvar }: {
  conta: Conta
  versao: number
  aoSalvar: (msg: string) => Promise<void>
}) {
  const buscar = useCallback(() => financas.importacoes(conta.id), [conta.id])
  const { lista, erro, carregar } = useListaRemota<Importacao>(buscar, versao)
  const [alvo, setAlvo] = useState<Importacao | null>(null)

  return (
    <Painel titulo="Importações">
      <EstadoLista lista={lista} erro={erro} aoTentar={() => void carregar()}
        vazio="Nenhum extrato importado nesta conta pelo painel. Importações feitas antes desta versão do painel não aparecem aqui.">
        <ul className="lista">
          {(lista ?? []).map((l) => {
            const desfeita = !!l.revertida_em
            const apoio = desfeita
              ? `desfeita em ${dataCurta(l.revertida_em!.slice(0, 10))} · ${l.revertidas ?? 0} removidas`
              : `${l.importadas} ${l.importadas === 1 ? 'lançamento' : 'lançamentos'}${l.ignoradas ? ` · ${l.ignoradas} já existiam` : ''}`
            return (
              <li key={l.id} className="lista-item" data-cancelado={desfeita ? 'true' : undefined}>
                <span className="celula">
                  <span className="t-ui espremer">{l.arquivo || 'Arquivo sem nome'} · {dataCurta(l.criada_em.slice(0, 10))}</span>
                  <span className="t-legenda espremer">{l.formato.toUpperCase()} · {apoio}</span>
                </span>
                {!desfeita && l.importadas > 0 && (
                  <Botao compacto onClick={() => setAlvo(l)} aria-label={`Desfazer importação de ${l.arquivo ?? 'arquivo'}`}>
                    Desfazer
                  </Botao>
                )}
              </li>
            )
          })}
        </ul>
      </EstadoLista>
      {alvo && (
        <FolhaExcluir acao="Desfazer importação" pedirMotivo
          titulo={`Desfazer a importação de ${alvo.arquivo || 'este arquivo'}?`}
          consequencia={`Os ${alvo.importadas} lançamentos deste arquivo saem da conta, inclusive categorias que você já tenha mudado neles. Cada um fica guardado na trilha, e o arquivo certo pode ser importado de novo. Se algum já foi pago ou tem nota ou arquivo anexado, nada é desfeito.`}
          aoFechar={() => setAlvo(null)}
          aoConfirmar={async (motivo) => {
            const r = await financas.desfazerImportacao(alvo.id, motivo)
            await aoSalvar(`Importação desfeita · ${r.removidas} ${r.removidas === 1 ? 'lançamento removido' : 'lançamentos removidos'}`)
          }} />
      )}
    </Painel>
  )
}
