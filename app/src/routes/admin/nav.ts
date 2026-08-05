// `icone` é o id do sprite autoral (public/eloi-icons.svg) sem o prefixo
// `eloi-`. Os glifos quadrado/circulo/arco eram do direcionamento anterior.
export interface ItemNav {
  path: string
  label: string
  icone: string
  /** Aparece na barra inferior do mobile. Máximo 4 — a coluna do meio é Criar. */
  barra?: boolean
}

// Máximo 7 destinos na primária (COMPONENT_INVENTORY): acima disso, agrupa.
export const NAV_PRIMARIA: ItemNav[] = [
  { path: '/admin', label: 'Hoje', icone: 'resultados', barra: true },
  { path: '/admin/dinheiro', label: 'Dinheiro', icone: 'dinheiro', barra: true },
  { path: '/admin/projetos', label: 'Projetos', icone: 'projetos', barra: true },
  { path: '/admin/clientes', label: 'Clientes', icone: 'cliente', barra: true },
  { path: '/admin/notas', label: 'Notas fiscais', icone: 'nota-fiscal' },
  { path: '/admin/relatorios', label: 'Relatórios', icone: 'grafico' },
  { path: '/admin/calendario', label: 'Calendário', icone: 'calendario' },
]

export const NAV_FERRAMENTAS: ItemNav[] = [
  { path: '/admin/briefings', label: 'Briefings', icone: 'briefing' },
  { path: '/admin/entregas', label: 'Entregas', icone: 'entrega' },
  { path: '/admin/arquivos', label: 'Arquivos', icone: 'documentos' },
  { path: '/admin/config', label: 'Configurações', icone: 'configuracoes' },
]

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
] as const

export type ChaveCriar = (typeof CRIAR)[number]['chave']
