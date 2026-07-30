export interface ItemNav {
  path: string
  label: string
  glifo: 'quadrado' | 'circulo' | 'arco' | 'contorno'
}

export const NAV_PRIMARIA: ItemNav[] = [
  { path: '/admin', label: 'Hoje', glifo: 'quadrado' },
  { path: '/admin/projetos', label: 'Projetos', glifo: 'arco' },
  { path: '/admin/clientes', label: 'Clientes', glifo: 'circulo' },
  { path: '/admin/dinheiro', label: 'Dinheiro', glifo: 'circulo' },
  { path: '/admin/briefings', label: 'Briefings', glifo: 'quadrado' },
]

export const NAV_FERRAMENTAS: ItemNav[] = [
  { path: '/admin/entregas', label: 'Entregas', glifo: 'contorno' },
]
