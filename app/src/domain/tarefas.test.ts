import { describe, it, expect } from 'vitest'
import { concluidasRecentes, estaAtrasada, tarefasAbertas } from './tarefas'
import type { TarefaRow } from '../lib/tipos'

const t = (p: Partial<TarefaRow> & { id: string }): TarefaRow => ({
  titulo: 'x', prazo: null, status: 'aberta', prioridade: 'normal',
  cliente_id: null, sub_cliente_id: null, servico_id: null, observacoes: null,
  concluida_em: null, created_at: '2026-09-01', updated_at: '2026-09-01', ...p,
})
const hoje = '2026-09-10'

describe('tarefas', () => {
  it('atrasada = aberta com prazo passado; concluída nunca atrasa', () => {
    expect(estaAtrasada(t({ id: 'a', prazo: '2026-09-01' }), hoje)).toBe(true)
    expect(estaAtrasada(t({ id: 'b', prazo: '2026-09-01', status: 'concluida' }), hoje)).toBe(false)
    expect(estaAtrasada(t({ id: 'c' }), hoje)).toBe(false)
  })

  it('ordena: atrasadas, depois por prazo, sem prazo por último, prioridade desempata', () => {
    const lista = tarefasAbertas([
      t({ id: 'sem', prioridade: 'alta' }),
      t({ id: 'amanha', prazo: '2026-09-11' }),
      t({ id: 'atrasada', prazo: '2026-09-05', prioridade: 'baixa' }),
      t({ id: 'hoje-alta', prazo: '2026-09-10', prioridade: 'alta' }),
      t({ id: 'hoje-normal', prazo: '2026-09-10' }),
      t({ id: 'feita', prazo: '2026-09-01', status: 'concluida' }),
      t({ id: 'cancelada', status: 'cancelada' }),
    ], hoje)
    expect(lista.map((x) => x.id)).toEqual(['atrasada', 'hoje-alta', 'hoje-normal', 'amanha', 'sem'])
  })

  it('concluídas recentes respeitam a janela', () => {
    const r = concluidasRecentes([
      t({ id: 'nova', status: 'concluida', concluida_em: '2026-09-09T10:00:00Z' }),
      t({ id: 'velha', status: 'concluida', concluida_em: '2026-07-01T10:00:00Z' }),
      t({ id: 'aberta' }),
    ], hoje)
    expect(r.map((x) => x.id)).toEqual(['nova'])
  })
})
