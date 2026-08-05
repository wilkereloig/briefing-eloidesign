import type { ServicoRow, MovimentoRow, OrcamentoRow, Transacao, NotaFiscal } from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'
import { diasDeAtraso, estaEmAberto } from './financeiro'

export type Urgencia = 'normal' | 'atrasado'
export type AcaoDecisao = 'lancar_nf' | 'cobrar_pagamento' | 'conferir_recebimento'
  | 'cobrar_decisao' | 'pagar_conta' | 'emitir_nf'

export interface Decisao {
  id: string
  titulo: string
  detalhe: string
  clienteId: string | null
  valorCents: number | null
  acao: AcaoDecisao
  urgencia: Urgencia
}

const DIA_MS = 24 * 60 * 60 * 1000

export function decisoesDoDia(input: {
  servicos: ServicoRow[]
  movimentos: MovimentoRow[]
  orcamentos: OrcamentoRow[]
  /** Núcleo financeiro novo. Opcional: as chamadas antigas seguem válidas. */
  transacoes?: Transacao[]
  notas?: NotaFiscal[]
  agora?: number
}): Decisao[] {
  const agora = input.agora ?? Date.now()
  const decisoes: Decisao[] = []

  for (const s of input.servicos) {
    if (s.status_execucao !== 'concluida') continue
    if (!s.nf_numero) {
      decisoes.push({
        id: `nf:${s.id}`, titulo: s.descricao, detalhe: 'Concluído sem nota fiscal',
        clienteId: s.cliente_id, valorCents: s.valor_cents, acao: 'lancar_nf', urgencia: 'normal',
      })
    }
    if (!s.pago) {
      const venceu = s.data_competencia ? new Date(s.data_competencia).getTime() < agora : false
      decisoes.push({
        id: `pag:${s.id}`, titulo: s.descricao,
        detalhe: venceu ? 'Pagamento atrasado' : 'Aguardando pagamento',
        clienteId: s.cliente_id, valorCents: s.valor_cents, acao: 'cobrar_pagamento',
        urgencia: venceu ? 'atrasado' : 'normal',
      })
    }
  }

  for (const m of input.movimentos) {
    if (m.status !== 'previsto' || !m.data_movimento) continue
    if (new Date(m.data_movimento).getTime() < agora) {
      decisoes.push({
        id: `mov:${m.id}`, titulo: m.descricao, detalhe: 'Previsto não confirmado',
        clienteId: m.cliente_id, valorCents: m.valor_cents, acao: 'conferir_recebimento', urgencia: 'atrasado',
      })
    }
  }

  for (const o of input.orcamentos) {
    if (o.status !== 'enviado') continue
    // orcamentos não guarda "enviado_em" — updated_at aproxima "desde quando
    // está enviado" (única data que muda quando o status muda).
    const dias = (agora - new Date(o.updated_at).getTime()) / DIA_MS
    if (dias >= 5) {
      decisoes.push({
        id: `dec:${o.id}`, titulo: o.titulo, detalhe: `Enviado há ${Math.floor(dias)} dias sem resposta`,
        clienteId: o.cliente_id, valorCents: centsDeReais(o.valor_total), acao: 'cobrar_decisao',
        urgencia: dias >= 10 ? 'atrasado' : 'normal',
      })
    }
  }

  // Núcleo financeiro: o que venceu e continua em aberto vira fila de trabalho.
  const hoje = new Date(agora).toISOString().slice(0, 10)
  for (const t of input.transacoes ?? []) {
    if (t.tipo === 'transferencia' || !estaEmAberto(t)) continue
    const atraso = diasDeAtraso(t, hoje)
    if (atraso <= 0) continue
    const receber = t.tipo === 'entrada'
    decisoes.push({
      id: `tx:${t.id}`,
      titulo: t.descricao,
      detalhe: `${receber ? 'Recebimento' : 'Pagamento'} atrasado há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`,
      clienteId: t.cliente_id,
      valorCents: t.valor_cents - t.recebido_cents,
      acao: receber ? 'cobrar_pagamento' : 'pagar_conta',
      urgencia: 'atrasado',
    })
  }

  // Nota parada em "pronta" é dinheiro que já podia estar faturado.
  for (const nf of input.notas ?? []) {
    if (nf.status !== 'pronta') continue
    decisoes.push({
      id: `nf-pronta:${nf.id}`,
      titulo: nf.numero ? `NF ${nf.numero}` : 'Nota fiscal pronta',
      detalhe: 'Pronta para emissão',
      clienteId: nf.cliente_id,
      valorCents: nf.valor_cents,
      acao: 'emitir_nf',
      urgencia: 'normal',
    })
  }

  // Atrasado primeiro: a fila é de trabalho, não de histórico.
  return decisoes.sort((a, b) =>
    a.urgencia === b.urgencia ? 0 : a.urgencia === 'atrasado' ? -1 : 1)
}

export interface Prazo {
  id: string
  titulo: string
  clienteId: string | null
  dias: number // negativo = atrasado
}

export function prazos(input: { servicos: ServicoRow[]; agora?: number }): Prazo[] {
  const agora = input.agora ?? Date.now()
  return input.servicos
    .filter((s) => s.status_execucao !== 'concluida' && s.data_competencia)
    .map((s) => ({
      id: s.id,
      titulo: s.descricao,
      clienteId: s.cliente_id,
      dias: Math.round((new Date(s.data_competencia as string).getTime() - agora) / DIA_MS),
    }))
    .sort((a, b) => a.dias - b.dias)
}
