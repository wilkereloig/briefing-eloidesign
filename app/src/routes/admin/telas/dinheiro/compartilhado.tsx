import { useState } from 'react'
import { financas } from '../../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, type useNomes } from '../../../../lib/financas-store'
import {
  chequeEspecialUsado, diasDeAtraso, estaEmAberto, faturaAberta, saldoAberto, type SituacaoFatura,
} from '../../../../domain/financeiro'
import { semNotaFiscal } from '../../../../domain/decisoes'
import type { Conta, ServicoRow, Transacao } from '../../../../lib/tipos'
import { Botao, Campo, Chip, Folha, Icone } from '../../../../ui/componentes'
import type { EstadoChip } from '../../../../ui/tokens'
import { ChipMovimento, Dinheiro } from '../../../../ui/painel'
import { dataCurta } from '../../../../ui/formato'
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
