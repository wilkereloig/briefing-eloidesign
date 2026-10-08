import type {
  ServicoRow, OrcamentoRow, Transacao, NotaFiscal, BriefingLinkRow, Conta,
} from '../lib/tipos'
import { centsDeReais } from '../lib/dinheiro'
import { estaEmAberto, saldoAberto } from './financeiro'
import { diasEntre, hojeISO } from './datas'

export type Urgencia = 'normal' | 'atrasado'
export type AcaoDecisao = 'lancar_nf' | 'cobrar_pagamento' | 'conferir_recebimento'
  | 'cobrar_decisao' | 'pagar_conta' | 'emitir_nf'
  | 'aprovar_valor' | 'ler_briefing' | 'configurar_conta' | 'ver_projeto'

/** O que o botão da fila diz e para onde leva. Uma fila que só descreve o
 *  problema devolve o trabalho de descobrir onde resolvê-lo. */
export const ACAO: Record<AcaoDecisao, { rotulo: string; destino: string }> = {
  lancar_nf: { rotulo: 'Registrar nota', destino: '/admin/notas?novo=1' },
  emitir_nf: { rotulo: 'Ver nota', destino: '/admin/notas' },
  cobrar_pagamento: { rotulo: 'Ver cobrança', destino: '/admin/dinheiro/agenda' },
  pagar_conta: { rotulo: 'Ver conta', destino: '/admin/dinheiro/agenda' },
  conferir_recebimento: { rotulo: 'Conferir', destino: '/admin/dinheiro/agenda' },
  cobrar_decisao: { rotulo: 'Ver proposta', destino: '/admin/orcamentos' },
  aprovar_valor: { rotulo: 'Aprovar valor', destino: '/admin/projetos' },
  ler_briefing: { rotulo: 'Ler resposta', destino: '/admin/briefings' },
  configurar_conta: { rotulo: 'Cadastrar conta', destino: '/admin/config' },
  ver_projeto: { rotulo: 'Ver projeto', destino: '/admin/projetos' },
}

export interface Decisao {
  id: string
  titulo: string
  detalhe: string
  clienteId: string | null
  /** Marca atendida, quando houver — "F2 Experience · Vibra" diz mais que "F2". */
  marca?: string | null
  valorCents: number | null
  acao: AcaoDecisao
  urgencia: Urgencia
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Conta a pagar/receber entra na fila este número de dias antes de vencer. */
export const AVISO_DIAS = 3

function textoVencimento(verbo: 'Pagamento' | 'Recebimento', dias: number): string {
  if (dias < 0) return `${verbo} atrasado há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`
  if (dias === 0) return 'Vence hoje'
  if (dias === 1) return 'Vence amanhã'
  return `Vence em ${dias} dias`
}

/** Vencimento do pagamento; sem ele, a competência (regra antiga). */
function vencimentoServico(s: Pick<ServicoRow, 'data_vencimento' | 'data_competencia'>): string | null {
  return s.data_vencimento ?? s.data_competencia
}

/** Sem vencimento nem competência, não há atraso. Vence no fim do dia. */
function servicoVencido(s: Pick<ServicoRow, 'data_vencimento' | 'data_competencia'>, agora: number): boolean {
  const v = vencimentoServico(s)
  return v ? v < hojeISO(agora) : false
}

/** Critério único de "sem nota": o vínculo real é `nota_fiscal_id` (1 nota :
 *  N serviços, D-22). `nf_numero` é texto legado e pode existir sem nota. */
export const semNotaFiscal = (s: Pick<ServicoRow, 'nota_fiscal_id'>) => !s.nota_fiscal_id

export interface PendenciasServicos {
  a_receber_cents: number; a_receber_qtd: number
  atrasado_cents: number; atrasado_qtd: number
  sem_nf_cents: number; sem_nf_qtd: number
}

/**
 * O que os serviços concluídos ainda devem: pagamento e nota fiscal. É o
 * "a receber" de quem trabalha só com serviços, sem lançamentos no
 * financeiro. Mesmo critério da fila `decisoesDoDia`.
 */
export function pendenciasDeServicos(servicos: ServicoRow[], agora = Date.now()): PendenciasServicos {
  const concluidos = servicos.filter((s) => s.status_execucao === 'concluida')
  const aReceber = concluidos.filter((s) => !s.pago)
  const atrasados = aReceber.filter((s) => servicoVencido(s, agora))
  const semNf = concluidos.filter(semNotaFiscal)
  const soma = (l: ServicoRow[]) => l.reduce((t, s) => t + s.valor_cents, 0)
  return {
    a_receber_cents: soma(aReceber), a_receber_qtd: aReceber.length,
    atrasado_cents: soma(atrasados), atrasado_qtd: atrasados.length,
    sem_nf_cents: soma(semNf), sem_nf_qtd: semNf.length,
  }
}

export function decisoesDoDia(input: {
  servicos: ServicoRow[]
  orcamentos: OrcamentoRow[]
  /** Núcleo financeiro novo. Opcional: as chamadas antigas seguem válidas. */
  transacoes?: Transacao[]
  notas?: NotaFiscal[]
  briefings?: BriefingLinkRow[]
  contas?: Conta[]
  agora?: number
}): Decisao[] {
  const agora = input.agora ?? Date.now()
  const decisoes: Decisao[] = []

  for (const s of input.servicos) {
    if (s.status_execucao !== 'concluida') continue
    if (semNotaFiscal(s)) {
      decisoes.push({
        id: `nf:${s.id}`, titulo: s.descricao, detalhe: 'Concluído sem nota fiscal',
        clienteId: s.cliente_id, marca: s.sub_cliente, valorCents: s.valor_cents,
        acao: 'lancar_nf', urgencia: 'normal',
      })
    }
    if (!s.pago) {
      const venceu = servicoVencido(s, agora)
      const v = vencimentoServico(s)
      const quando = v ? ` · vence ${v.slice(8, 10)}/${v.slice(5, 7)}` : ''
      decisoes.push({
        id: `pag:${s.id}`, titulo: s.descricao,
        detalhe: (venceu ? 'Pagamento atrasado' : 'Aguardando pagamento') + quando,
        clienteId: s.cliente_id, marca: s.sub_cliente, valorCents: s.valor_cents,
        acao: 'cobrar_pagamento', urgencia: venceu ? 'atrasado' : 'normal',
      })
    }
  }

  // Prazo de entrega passou e o serviço não foi concluído. Só existe se
  // alguém combinou prazo — serviço sem prazo não fica "atrasado" por chute.
  const hoje = hojeISO(agora)
  for (const s of input.servicos) {
    if (s.status_execucao === 'concluida' || !s.prazo || s.prazo >= hoje) continue
    const dias = diasEntre(s.prazo, hoje)
    decisoes.push({
      id: `prazo:${s.id}`, titulo: s.descricao,
      detalhe: `Entrega combinada para ${s.prazo.slice(8, 10)}/${s.prazo.slice(5, 7)} · ${dias} ${dias === 1 ? 'dia' : 'dias'} de atraso`,
      clienteId: s.cliente_id, marca: s.sub_cliente, valorCents: s.valor_cents,
      acao: 'ver_projeto', urgencia: 'atrasado',
    })
  }

  // Valor sugerido pelo cliente trava o serviço: enquanto ninguém decide, o
  // valor oficial continua o antigo (ou zero) e todo total sai errado.
  for (const s of input.servicos) {
    if (s.valor_sugerido_cents == null) continue
    decisoes.push({
      id: `sug:${s.id}`,
      titulo: s.descricao,
      detalhe: s.valor_sugerido_observacao
        ? `Cliente sugeriu um valor: "${s.valor_sugerido_observacao}"`
        : 'Cliente sugeriu um valor',
      clienteId: s.cliente_id, marca: s.sub_cliente,
      valorCents: s.valor_sugerido_cents,
      acao: 'aprovar_valor', urgencia: 'normal',
    })
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

  // Núcleo financeiro: o que venceu, ou vence em até AVISO_DIAS, e continua em
  // aberto vira fila de trabalho. Compra no cartão não se paga uma a uma:
  // agrupa por cartão + vencimento e vira uma linha só — a fatura.
  const cartoes = new Map((input.contas ?? [])
    .filter((c) => c.tipo === 'cartao_credito').map((c) => [c.id, c]))
  const faturas = new Map<string, { nome: string; venc: string; cents: number }>()
  for (const t of input.transacoes ?? []) {
    if (t.tipo === 'transferencia' || !estaEmAberto(t) || !t.data_vencimento) continue
    const dias = diasEntre(hoje, t.data_vencimento)
    if (dias > AVISO_DIAS) continue
    const cartao = t.conta_id ? cartoes.get(t.conta_id) : undefined
    if (cartao) {
      const chave = `${cartao.id}|${t.data_vencimento}`
      const f = faturas.get(chave) ?? { nome: cartao.nome, venc: t.data_vencimento, cents: 0 }
      f.cents += t.tipo === 'saida' ? saldoAberto(t) : -saldoAberto(t) // estorno abate
      faturas.set(chave, f)
      continue
    }
    const receber = t.tipo === 'entrada'
    decisoes.push({
      id: `tx:${t.id}`,
      titulo: t.descricao,
      detalhe: textoVencimento(receber ? 'Recebimento' : 'Pagamento', dias),
      clienteId: t.cliente_id,
      valorCents: saldoAberto(t),
      acao: receber ? 'cobrar_pagamento' : 'pagar_conta',
      urgencia: dias < 0 ? 'atrasado' : 'normal',
    })
  }
  for (const [chave, f] of faturas) {
    if (f.cents <= 0) continue
    const dias = diasEntre(hoje, f.venc)
    decisoes.push({
      id: `fatura:${chave}`,
      titulo: `Fatura ${f.nome}`,
      detalhe: textoVencimento('Pagamento', dias),
      clienteId: null,
      valorCents: f.cents,
      acao: 'pagar_conta',
      urgencia: dias < 0 ? 'atrasado' : 'normal',
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

  // Briefing respondido e ainda solto: ninguém abriu para transformar em
  // proposta. "Sem cliente vinculado" é o proxy de "não foi revisado" — é o
  // primeiro passo que alguém dá ao ler a resposta.
  for (const b of input.briefings ?? []) {
    if (b.status !== 'respondido' || b.revogado_em || b.cliente_id) continue
    const dias = b.responded_at
      ? Math.floor((agora - new Date(b.responded_at).getTime()) / DIA_MS) : 0
    decisoes.push({
      id: `bri:${b.id}`,
      titulo: b.cliente || b.nome || 'Briefing respondido',
      detalhe: dias > 0 ? `Respondido há ${dias} ${dias === 1 ? 'dia' : 'dias'}` : 'Respondido, não revisado',
      clienteId: null, valorCents: null,
      acao: 'ler_briefing', urgencia: dias >= 3 ? 'atrasado' : 'normal',
    })
  }

  // Sem conta cadastrada, saldo, previsão e relatório mostram zero — e zero
  // parece resultado, não configuração faltando. Uma linha só: repetir por
  // conta ausente não faz sentido quando não existe nenhuma.
  if (input.contas && input.contas.length === 0) {
    decisoes.push({
      id: 'setup:contas',
      titulo: 'Nenhuma conta cadastrada',
      detalhe: 'Sem conta, saldo e previsão mostram zero',
      clienteId: null, valorCents: null,
      acao: 'configurar_conta', urgencia: 'atrasado',
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
  const hoje = hojeISO(input.agora ?? Date.now())
  // Prazo combinado; competência é "a que mês pertence", não "quando entrega".
  // Conta em dias de calendário de Brasília: prazo de hoje é 0, não -1 às 22h.
  return input.servicos
    .filter((s) => s.status_execucao !== 'concluida' && s.prazo)
    .map((s) => ({
      id: s.id,
      titulo: s.descricao,
      clienteId: s.cliente_id,
      dias: diasEntre(hoje, s.prazo as string),
    }))
    .sort((a, b) => a.dias - b.dias)
}
