// `icone` é o id do sprite autoral (public/eloi-icons.svg) sem o prefixo
// `eloi-`. Os glifos quadrado/circulo/arco eram do direcionamento anterior.
export interface ItemNav {
  path: string
  label: string
  icone: string
  /** Aparece na barra inferior do mobile. Máximo 4 — a coluna do meio é Criar. */
  barra?: boolean
}

/** Navegação agrupada por TAREFA (Etapa 7): visão geral, financeiro, trabalho
 *  e clientes, documentos, configurações. Fonte única — trilho, barra inferior,
 *  menu "Mais" e trilha da barra do topo leem daqui. `barra` marca os 4 da
 *  barra inferior do celular (a coluna do meio é Criar). */
export interface GrupoNav { titulo: string | null; itens: ItemNav[] }

export const NAV_GRUPOS: GrupoNav[] = [
  { titulo: null, itens: [
    { path: '/admin', label: 'Hoje', icone: 'resultados', barra: true },
  ] },
  { titulo: 'Financeiro', itens: [
    { path: '/admin/dinheiro', label: 'Dinheiro', icone: 'dinheiro', barra: true },
    { path: '/admin/relatorios', label: 'Relatórios', icone: 'grafico' },
  ] },
  { titulo: 'Trabalho e clientes', itens: [
    { path: '/admin/projetos', label: 'Projetos', icone: 'projetos', barra: true },
    { path: '/admin/clientes', label: 'Clientes', icone: 'cliente', barra: true },
    { path: '/admin/orcamentos', label: 'Orçamentos', icone: 'documentos' },
    { path: '/admin/briefings', label: 'Briefings', icone: 'briefing' },
    { path: '/admin/entregas', label: 'Entregas', icone: 'entrega' },
    { path: '/admin/calendario', label: 'Calendário', icone: 'calendario' },
  ] },
  { titulo: 'Documentos', itens: [
    { path: '/admin/notas', label: 'Notas fiscais', icone: 'nota-fiscal' },
    { path: '/admin/arquivos', label: 'Arquivos', icone: 'documentos' },
  ] },
  { titulo: null, itens: [
    { path: '/admin/config', label: 'Configurações', icone: 'configuracoes' },
  ] },
]

export const NAV_ITENS: ItemNav[] = NAV_GRUPOS.flatMap((g) => g.itens)

/** Opções da folha "Criar", aberta pelo botão central da barra inferior. */
// Ações rápidas do botão central. `sinal` é a cor do ponto de sinal do ícone:
// Lima some sobre fundo Lima, então no quadrado da Receita ele vira Tinta.
export const CRIAR = [
  { chave: 'entrada', label: 'Receita', descricao: 'Dinheiro entrando',
    icone: 'pagamento', cor: 'var(--lima)', sinal: 'var(--tinta)' },
  { chave: 'saida', label: 'Despesa', descricao: 'Dinheiro saindo',
    icone: 'caixa', cor: 'var(--coral)', sinal: 'var(--lima)' },
  { chave: 'transferencia', label: 'Transferência', descricao: 'Entre contas, sem virar receita',
    icone: 'compartilhar', cor: 'var(--azul)', sinal: 'var(--lima)' },
  { chave: 'tarefa', label: 'Tarefa', descricao: 'Lembrete com prazo',
    icone: 'ok', cor: 'var(--roxo)', sinal: 'var(--lima)' },
] as const

export type ChaveCriar = (typeof CRIAR)[number]['chave']

/** Sub-páginas de Dinheiro. Barra própria dentro da área; a primária segue com 7. */
export const NAV_DINHEIRO: { path: string; label: string; fim?: boolean }[] = [
  { path: '/admin/dinheiro', label: 'Visão geral', fim: true },
  { path: '/admin/dinheiro/gastos', label: 'Análise de gastos' },
  { path: '/admin/dinheiro/contas', label: 'Contas' },
  { path: '/admin/dinheiro/cartoes', label: 'Cartões' },
  { path: '/admin/dinheiro/lancamentos', label: 'Lançamentos' },
  { path: '/admin/dinheiro/agenda', label: 'A pagar e receber' },
  { path: '/admin/dinheiro/emprestimos', label: 'Empréstimos' },
  { path: '/admin/dinheiro/planejamento', label: 'Planejamento' },
]
