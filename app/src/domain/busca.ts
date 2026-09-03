// Busca global do painel: uma caixa que alcança cliente, marca, projeto,
// proposta, nota e lançamento, mais os comandos de criar.
//
// Roda em memória, sobre o que o store já carregou. Não é índice, não é
// servidor: o volume real é de dezenas a centenas de linhas por tipo, e uma
// busca que exige rede não serve para o Ctrl+K — a resposta tem que aparecer
// enquanto se digita.
//
// Puro de propósito (sem React, sem fetch): a regra de ordenação é o que faz a
// caixa parecer inteligente ou burra, e regra sem teste apodrece.

export type TipoResultado =
  | 'cliente' | 'marca' | 'projeto' | 'proposta' | 'nota' | 'lancamento' | 'comando'

export interface Resultado {
  tipo: TipoResultado
  id: string
  titulo: string
  /** Linha de apoio: cliente, valor, data — o que desempata dois títulos iguais. */
  detalhe?: string
  /** Para onde ir. Comando usa `acao` no lugar. */
  destino?: string
  /** Peso da ordenação, calculado por `pontuar`. Maior primeiro. */
  peso: number
}

/** Sem acento e em minúsculas: quem digita "orcamento" tem que achar "Orçamento". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * 0 = não casa. Começo do texto vale mais que meio, e casar palavra inteira
 * vale mais que casar pedaço — "Vibra" tem que vir antes de "Convite Vibração"
 * quando se digita "vibra".
 */
export function pontuar(texto: string, termo: string): number {
  if (!termo) return 0
  const t = normalizar(texto)
  const q = normalizar(termo)
  if (!t || !q) return 0
  const i = t.indexOf(q)
  if (i < 0) return 0
  if (t === q) return 100
  if (i === 0) return 70
  // Início de palavra: o caractere anterior não é letra nem número.
  if (!/[\p{L}\p{N}]/u.test(t[i - 1])) return 50
  return 20
}

export interface FonteBusca {
  clientes: { id: string; nome: string; arquivado_em?: string | null }[]
  subClientes: { id: string; nome: string; cliente_id: string; ativo: boolean }[]
  servicos: {
    id: string; descricao: string; cliente_id: string
    valor_cents: number; sub_cliente: string | null
  }[]
  orcamentos: {
    id: string; titulo: string; cliente: string | null
    cliente_id: string | null; numero: number | null; status: string
  }[]
  notas: { id: string; numero: string | null; cliente_id: string | null; valor_cents: number }[]
  transacoes: { id: string; descricao: string; valor_cents: number; data_vencimento: string | null }[]
  /** Ações que a caixa também executa ("novo cliente", "lançar despesa"). */
  comandos: { id: string; titulo: string; detalhe?: string; destino?: string }[]
  /** id → nome, para a linha de apoio. */
  nomeCliente: (id: string | null | undefined) => string
  /** cents → texto, injetado para o domínio não conhecer formatação. */
  formatarValor: (cents: number) => string
}

const LIMITE_POR_TIPO = 5

/**
 * Resultados ordenados por relevância, no máximo `LIMITE_POR_TIPO` por tipo.
 * O corte por tipo é o que impede 40 lançamentos de empurrarem o cliente que
 * se procurava para fora da tela.
 */
export function buscar(fonte: FonteBusca, termo: string): Resultado[] {
  const q = termo.trim()
  if (q.length < 2) {
    // Com menos de duas letras, só comando: listar meio banco a cada tecla não
    // ajuda ninguém a decidir.
    return fonte.comandos
      .map((c) => ({ ...c, tipo: 'comando' as const, peso: 10 }))
      .slice(0, 8)
  }

  const achados: Resultado[] = []
  const junta = (
    tipo: TipoResultado,
    itens: { id: string; titulo: string; detalhe?: string; destino?: string; extra?: string }[],
  ) => {
    const casaram = itens
      .map((i) => ({
        ...i, tipo,
        peso: Math.max(pontuar(i.titulo, q), pontuar(i.extra ?? '', q) * 0.6),
      }))
      .filter((i) => i.peso > 0)
      .sort((a, b) => b.peso - a.peso || a.titulo.localeCompare(b.titulo))
      .slice(0, LIMITE_POR_TIPO)
    achados.push(...casaram)
  }

  junta('comando', fonte.comandos)

  junta('cliente', fonte.clientes.map((c) => ({
    id: c.id,
    titulo: c.nome,
    detalhe: c.arquivado_em ? 'Cliente arquivado' : 'Cliente',
    destino: `/admin/clientes/${c.id}`,
  })))

  junta('marca', fonte.subClientes.map((m) => ({
    id: m.id,
    titulo: m.nome,
    detalhe: `Marca de ${fonte.nomeCliente(m.cliente_id)}${m.ativo ? '' : ' · encerrada'}`,
    destino: `/admin/clientes/${m.cliente_id}`,
  })))

  junta('projeto', fonte.servicos.map((s) => ({
    id: s.id,
    titulo: s.descricao,
    detalhe: [fonte.nomeCliente(s.cliente_id), s.sub_cliente, fonte.formatarValor(s.valor_cents)]
      .filter(Boolean).join(' · '),
    destino: '/admin/projetos',
    extra: s.sub_cliente ?? '',
  })))

  junta('proposta', fonte.orcamentos.map((o) => ({
    id: o.id,
    titulo: o.numero ? `#${o.numero} ${o.titulo}` : o.titulo,
    detalhe: [o.cliente_id ? fonte.nomeCliente(o.cliente_id) : o.cliente, o.status]
      .filter(Boolean).join(' · '),
    destino: '/admin/orcamentos',
    extra: o.titulo,
  })))

  junta('nota', fonte.notas.map((n) => ({
    id: n.id,
    titulo: n.numero ? `NF ${n.numero}` : 'Nota sem número',
    detalhe: [fonte.nomeCliente(n.cliente_id), fonte.formatarValor(n.valor_cents)]
      .filter(Boolean).join(' · '),
    destino: '/admin/notas',
  })))

  junta('lancamento', fonte.transacoes.map((t) => ({
    id: t.id,
    titulo: t.descricao,
    detalhe: [fonte.formatarValor(t.valor_cents), t.data_vencimento].filter(Boolean).join(' · '),
    destino: '/admin/dinheiro',
  })))

  return achados.sort((a, b) => b.peso - a.peso)
}

export const ROTULO_TIPO: Record<TipoResultado, string> = {
  comando: 'Ações',
  cliente: 'Clientes',
  marca: 'Marcas',
  projeto: 'Projetos',
  proposta: 'Propostas',
  nota: 'Notas fiscais',
  lancamento: 'Lançamentos',
}

/** Ordem dos grupos na tela. Ação primeiro: quem digita "nova" quer fazer, não ler. */
export const ORDEM_TIPOS: TipoResultado[] = [
  'comando', 'cliente', 'marca', 'projeto', 'proposta', 'nota', 'lancamento',
]

/** Agrupa mantendo a ordem de `ORDEM_TIPOS` e descartando grupo vazio. */
export function agrupar(resultados: Resultado[]): { tipo: TipoResultado; itens: Resultado[] }[] {
  return ORDEM_TIPOS
    .map((tipo) => ({ tipo, itens: resultados.filter((r) => r.tipo === tipo) }))
    .filter((g) => g.itens.length > 0)
}
