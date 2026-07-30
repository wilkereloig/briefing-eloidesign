import type { ServicoRow, MovimentoRow, OrcamentoRow } from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'

export type Urgencia = 'normal' | 'atrasado'
export type AcaoDecisao = 'lancar_nf' | 'cobrar_pagamento' | 'conferir_recebimento' | 'cobrar_decisao'

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

  return decisoes
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
