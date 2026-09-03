// Linha do tempo do cliente: os eventos de negócio, não cada clique.
//
// Derivada do que já existe (datas nas próprias linhas), não gravada. Uma
// tabela de eventos precisaria ser escrita por alguém em todo caminho de
// código que muda alguma coisa — e o primeiro caminho esquecido cria um
// histórico que mente. Aqui, se a data existe, o evento existe.
//
// O preço: só dá para mostrar o que tem data. "Orçamento enviado" usa
// `updated_at` (não há `enviado_em`), então editar uma proposta enviada move
// o evento. É impreciso e está escrito no rótulo — melhor que inventar.

export type TipoEvento =
  | 'briefing_enviado' | 'briefing_respondido'
  | 'proposta_criada' | 'proposta_enviada' | 'proposta_aprovada' | 'proposta_recusada'
  | 'projeto_criado' | 'projeto_entregue' | 'projeto_pago'
  | 'nota_emitida' | 'entrega_publicada'

export interface Evento {
  id: string
  tipo: TipoEvento
  /** 'AAAA-MM-DD'. Ordenável como texto — é ISO. */
  data: string
  titulo: string
  detalhe?: string
}

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  briefing_enviado: 'Briefing enviado',
  briefing_respondido: 'Briefing respondido',
  proposta_criada: 'Proposta criada',
  proposta_enviada: 'Proposta enviada',
  proposta_aprovada: 'Proposta aprovada',
  proposta_recusada: 'Proposta recusada',
  projeto_criado: 'Projeto criado',
  projeto_entregue: 'Projeto entregue',
  projeto_pago: 'Pagamento recebido',
  nota_emitida: 'Nota emitida',
  entrega_publicada: 'Entrega publicada',
}

const dia = (v: string | null | undefined) => (v ? v.slice(0, 10) : null)

export interface FonteTimeline {
  servicos: {
    id: string; descricao: string; created_at: string; status_execucao: string
    pago: boolean; data_pagamento: string | null; sub_cliente: string | null
  }[]
  orcamentos: {
    id: string; titulo: string; status: string; created_at: string; updated_at: string
    numero: number | null
  }[]
  notas: { id: string; numero: string | null; emitida_em: string | null; competencia: string | null }[]
  briefings: {
    id: string; cliente: string | null; tipo: string; status: string
    created_at: string; responded_at: string | null
  }[]
  materiais: { id: string; titulo: string; published_at?: string | null }[]
}

/** Mais recente primeiro. Evento sem data é descartado — data indefinida numa
 *  linha do tempo é pior que ausência. */
export function timeline(f: FonteTimeline): Evento[] {
  const eventos: Evento[] = []
  const push = (e: Evento | null) => { if (e && e.data) eventos.push(e) }

  for (const b of f.briefings) {
    push({
      id: `bri-env:${b.id}`, tipo: 'briefing_enviado', data: dia(b.created_at)!,
      titulo: b.cliente || 'Convite de briefing',
    })
    if (b.status === 'respondido' && b.responded_at) {
      push({
        id: `bri-resp:${b.id}`, tipo: 'briefing_respondido', data: dia(b.responded_at)!,
        titulo: b.cliente || 'Briefing',
      })
    }
  }

  for (const o of f.orcamentos) {
    const nome = o.numero ? `#${o.numero} ${o.titulo}` : o.titulo
    push({ id: `orc-cri:${o.id}`, tipo: 'proposta_criada', data: dia(o.created_at)!, titulo: nome })
    // created_at e updated_at iguais = nada aconteceu depois de criar; repetir
    // a mesma data com outro rótulo só polui.
    if (dia(o.updated_at) === dia(o.created_at)) continue
    const tipo = o.status === 'aprovado' ? 'proposta_aprovada'
      : o.status === 'recusado' ? 'proposta_recusada'
        : o.status === 'enviado' ? 'proposta_enviada' : null
    if (tipo) {
      push({
        id: `orc-${tipo}:${o.id}`, tipo, data: dia(o.updated_at)!, titulo: nome,
        detalhe: tipo === 'proposta_enviada' ? 'data aproximada' : undefined,
      })
    }
  }

  for (const s of f.servicos) {
    push({
      id: `srv-cri:${s.id}`, tipo: 'projeto_criado', data: dia(s.created_at)!,
      titulo: s.descricao, detalhe: s.sub_cliente ?? undefined,
    })
    if (s.pago && s.data_pagamento) {
      push({
        id: `srv-pago:${s.id}`, tipo: 'projeto_pago', data: dia(s.data_pagamento)!,
        titulo: s.descricao, detalhe: s.sub_cliente ?? undefined,
      })
    }
  }

  for (const n of f.notas) {
    const quando = dia(n.emitida_em) ?? dia(n.competencia)
    if (!quando) continue
    push({
      id: `nf:${n.id}`, tipo: 'nota_emitida', data: quando,
      titulo: n.numero ? `NF ${n.numero}` : 'Nota fiscal',
    })
  }

  for (const m of f.materiais) {
    const quando = dia(m.published_at)
    if (!quando) continue
    push({ id: `mat:${m.id}`, tipo: 'entrega_publicada', data: quando, titulo: m.titulo })
  }

  return eventos.sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id))
}
