// Tarefas manuais: o que o dono anotou para não esquecer. Pendência
// automática (serviço sem NF, conta vencida) é outra coisa e mora em
// decisoes.ts — misturar as duas faria a lista de tarefas mentir sobre o
// que foi decidido fazer.
import type { TarefaRow } from '../lib/tipos'

export const STATUS_TAREFA: TarefaRow['status'][] = ['aberta', 'em_andamento', 'concluida', 'cancelada']
export const ROTULO_STATUS_TAREFA: Record<TarefaRow['status'], string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
}
export const ROTULO_PRIORIDADE: Record<TarefaRow['prioridade'], string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta',
}

export const estaAberta = (t: TarefaRow) => t.status === 'aberta' || t.status === 'em_andamento'
export const estaAtrasada = (t: TarefaRow, hoje: string) => estaAberta(t) && !!t.prazo && t.prazo < hoje

const PESO_PRIORIDADE = { alta: 0, normal: 1, baixa: 2 } as const

/**
 * Abertas, do que urge para o que espera: atrasada → com prazo (mais próximo
 * primeiro) → sem prazo; empate por prioridade. Concluída e cancelada ficam
 * fora — a lista é de trabalho, não de histórico.
 */
export function tarefasAbertas(tarefas: TarefaRow[], hoje: string): TarefaRow[] {
  return tarefas.filter(estaAberta).sort((a, b) => {
    const atrA = estaAtrasada(a, hoje) ? 0 : 1, atrB = estaAtrasada(b, hoje) ? 0 : 1
    if (atrA !== atrB) return atrA - atrB
    const pa = a.prazo ?? '9999', pb = b.prazo ?? '9999'
    if (pa !== pb) return pa.localeCompare(pb)
    return PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
  })
}

/** Concluídas nos últimos `dias`, mais recente primeiro — para a ficha do cliente. */
export function concluidasRecentes(tarefas: TarefaRow[], hoje: string, dias = 30): TarefaRow[] {
  const limite = new Date(Date.parse(hoje) - dias * 86_400_000).toISOString().slice(0, 10)
  return tarefas
    .filter((t) => t.status === 'concluida' && (t.concluida_em ?? '').slice(0, 10) >= limite)
    .sort((a, b) => (b.concluida_em ?? '').localeCompare(a.concluida_em ?? ''))
}
