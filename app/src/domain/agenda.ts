// Agenda integrada: tudo que tem data no mês, de todas as fontes, numa
// lista só. Cada item diz de onde veio (tipo) e para onde ir (destino).
// Recorrência ainda não materializada entra como previsão — quando vence,
// a edge cria a transação e o item vira "pagamento" de verdade.
import type { Recorrencia, ServicoRow, TarefaRow, Transacao } from '../lib/tipos'
import { estaEmAberto, saldoAberto } from './financeiro'
import { estaAberta } from './tarefas'

export type TipoAgenda = 'recebimento' | 'pagamento' | 'tarefa' | 'prazo' | 'recorrencia'

export interface ItemAgenda {
  id: string
  tipo: TipoAgenda
  /** 'AAAA-MM-DD' */
  data: string
  titulo: string
  detalhe?: string
  cents?: number
  /** Ainda por fazer/pagar. Liquidado ou concluído fica com contorno. */
  aberto: boolean
  /** Referência para a tela agir: a transação, a tarefa ou o serviço. */
  ref: { transacao: Transacao } | { tarefa: TarefaRow } | { servico: ServicoRow } | { recorrencia: Recorrencia }
}

/** Forma + rótulo por tipo: nunca só cor. */
export const FORMA_AGENDA: Record<TipoAgenda, { rotulo: string; forma: 'circulo' | 'quadrado' | 'losango' | 'traco' }> = {
  recebimento: { rotulo: 'Recebimento', forma: 'circulo' },
  pagamento: { rotulo: 'Pagamento', forma: 'circulo' },
  tarefa: { rotulo: 'Tarefa', forma: 'quadrado' },
  prazo: { rotulo: 'Entrega de projeto', forma: 'losango' },
  recorrencia: { rotulo: 'Recorrência prevista', forma: 'traco' },
}

export const ORDEM_AGENDA: TipoAgenda[] = ['prazo', 'tarefa', 'recebimento', 'pagamento', 'recorrencia']

export function itensAgenda(
  f: { transacoes: Transacao[]; tarefas: TarefaRow[]; servicos: ServicoRow[]; recorrencias: Recorrencia[] },
  mes: string,
  contexto?: 'pessoal' | 'empresa',
): ItemAgenda[] {
  const noMes = (d: string | null | undefined): d is string => !!d && d.startsWith(mes)
  const itens: ItemAgenda[] = []

  const jaMaterializada = new Set(f.transacoes.filter((t) => t.recorrencia_id)
    .map((t) => `${t.recorrencia_id}|${t.data_vencimento}`))

  for (const t of f.transacoes) {
    if (t.tipo === 'transferencia' || t.status === 'cancelado' || !noMes(t.data_vencimento)) continue
    if (contexto && t.contexto !== contexto) continue
    itens.push({
      id: `tx:${t.id}`, tipo: t.tipo === 'entrada' ? 'recebimento' : 'pagamento',
      data: t.data_vencimento, titulo: t.descricao,
      cents: estaEmAberto(t) ? saldoAberto(t) : t.valor_cents,
      aberto: estaEmAberto(t), ref: { transacao: t },
    })
  }

  for (const r of f.recorrencias) {
    if (r.pausada_em || r.encerrada_em || !noMes(r.proxima_cobranca)) continue
    if (contexto && r.contexto !== contexto) continue
    if (jaMaterializada.has(`${r.id}|${r.proxima_cobranca}`)) continue
    itens.push({
      id: `rec:${r.id}`, tipo: 'recorrencia', data: r.proxima_cobranca, titulo: r.nome,
      detalhe: r.tipo === 'entrada' ? 'entrada prevista' : 'saída prevista',
      cents: r.valor_cents, aberto: true, ref: { recorrencia: r },
    })
  }

  // Tarefas e prazos são do estúdio; a lente pessoal/empresa não se aplica.
  for (const t of f.tarefas) {
    if (!noMes(t.prazo) || t.status === 'cancelada') continue
    itens.push({
      id: `tar:${t.id}`, tipo: 'tarefa', data: t.prazo, titulo: t.titulo,
      detalhe: t.prioridade === 'alta' ? 'prioridade alta' : undefined,
      aberto: estaAberta(t), ref: { tarefa: t },
    })
  }

  for (const s of f.servicos) {
    if (!noMes(s.prazo)) continue
    itens.push({
      id: `srv:${s.id}`, tipo: 'prazo', data: s.prazo, titulo: s.descricao,
      detalhe: s.sub_cliente ?? undefined, cents: s.valor_cents,
      aberto: s.status_execucao !== 'concluida', ref: { servico: s },
    })
  }

  return itens.sort((a, b) => a.data.localeCompare(b.data)
    || ORDEM_AGENDA.indexOf(a.tipo) - ORDEM_AGENDA.indexOf(b.tipo)
    || a.titulo.localeCompare(b.titulo))
}

/** Indexa por dia para a grade. */
export function porDia(itens: ItemAgenda[]): Map<string, ItemAgenda[]> {
  const m = new Map<string, ItemAgenda[]>()
  for (const i of itens) m.set(i.data, [...(m.get(i.data) ?? []), i])
  return m
}
