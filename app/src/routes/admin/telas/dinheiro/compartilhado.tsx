import { financas } from '../../../../lib/api'
import { fmtBRL } from '../../../../lib/dinheiro'
import type { useNomes } from '../../../../lib/financas-store'
import { chequeEspecialUsado, diasDeAtraso, estaEmAberto, saldoAberto } from '../../../../domain/financeiro'
import { semNotaFiscal } from '../../../../domain/decisoes'
import type { ServicoRow, Transacao } from '../../../../lib/tipos'
import { Botao, Icone } from '../../../../ui/componentes'
import { ChipMovimento, Dinheiro } from '../../../../ui/painel'
import { dataCurta } from '../../../../ui/formato'
import { FolhaTransacao } from '../../FolhaTransacao'
import { FolhaExcluir, FolhaLiquidar, FolhaReagendar } from '../../folhas'

// Linha de lançamento e as folhas que as ações dela abrem. Compartilhado entre
// a tela antiga de Dinheiro (lançamentos/agenda) e a página da conta — uma
// linha só, para as duas não divergirem em ação nem em rótulo.

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

/** "Cheque especial: R$ usado de R$ limite" — no card da lista e na página da conta. */
export function LegendaCheque({ saldo, limite }: { saldo: number; limite: number }) {
  return (
    <span className="t-legenda">
      Cheque especial: {fmtBRL(chequeEspecialUsado(saldo))} usado de {fmtBRL(limite)}
    </span>
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
  t, nomes, hoje, modoCobranca, servico, aoEditar, aoCancelar, aoLiquidar, aoReagendar, aoRecorrencia, aoExcluir,
}: {
  t: Transacao
  nomes: ReturnType<typeof useNomes>
  hoje: string
  /** Serviço ligado ao lançamento: dá marca e situação da NF na linha. */
  servico?: ServicoRow
  /** Abas A receber / A pagar: o número que importa é quanto FALTA, e o atraso
   *  aparece. No extrato de movimentações vale o valor do lançamento. */
  modoCobranca?: boolean
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
  const apoio = modoCobranca
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
      <Dinheiro cents={t.tipo === 'saida' ? -valor : valor} className="t-valor" />
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
