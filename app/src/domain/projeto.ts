import type { OrcamentoRow, OrcamentoStatus, ServicoRow } from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'

// Etapa é CALCULADA, não uma coluna (ver docs/GLOSSARY.md "Etapa"). Ordem do
// funil: orcamento -> aprovado -> execucao -> entregue -> pago.
export type Etapa = 'orcamento' | 'aprovado' | 'execucao' | 'entregue' | 'pago'

export interface Projeto {
  id: string
  clienteId: string | null
  titulo: string
  etapa: Etapa
  valorCents: number
  orcamento: OrcamentoRow | null
  servico: ServicoRow | null
}

type ServicoParaEtapa = Pick<ServicoRow, 'status_execucao' | 'pago'>

export function etapaDoProjeto(
  orcamentoStatus: OrcamentoStatus | null,
  servico: ServicoParaEtapa | null,
): Etapa | null {
  if (servico) {
    if (servico.status_execucao === 'aguardando_inicio') return 'aprovado'
    if (servico.status_execucao === 'em_execucao') return 'execucao'
    return servico.pago ? 'pago' : 'entregue'
  }
  // Sem servico vinculado: se o orcamento ja foi aprovado, o trigger
  // trg_eloi_orcamento_aprovado deveria ter criado um — cai aqui só no caso
  // defensivo de o vinculo ainda não ter propagado.
  if (orcamentoStatus === 'aprovado') return 'aprovado'
  if (orcamentoStatus === 'rascunho' || orcamentoStatus === 'enviado') return 'orcamento'
  return null // recusado, ou nem orcamento nem servico
}

export function juntarProjetos(orcamentos: OrcamentoRow[], servicos: ServicoRow[]): Projeto[] {
  const servicoPorOrcamento = new Map(
    servicos.filter((s) => s.orcamento_id).map((s) => [s.orcamento_id as string, s]),
  )
  const projetos: Projeto[] = []

  for (const o of orcamentos) {
    const servico = servicoPorOrcamento.get(o.id) ?? null
    const etapa = etapaDoProjeto(o.status, servico)
    if (!etapa) continue
    projetos.push({
      id: `orc:${o.id}`,
      clienteId: o.cliente_id,
      titulo: o.titulo,
      etapa,
      valorCents: servico ? servico.valor_cents : centsDeReais(o.valor_total),
      orcamento: o,
      servico,
    })
  }

  for (const s of servicos) {
    if (s.orcamento_id) continue // já considerado no laço acima
    const etapa = etapaDoProjeto(null, s)
    if (!etapa) continue
    projetos.push({
      id: `srv:${s.id}`,
      clienteId: s.cliente_id,
      titulo: s.descricao,
      etapa,
      valorCents: s.valor_cents,
      orcamento: null,
      servico: s,
    })
  }

  return projetos
}
