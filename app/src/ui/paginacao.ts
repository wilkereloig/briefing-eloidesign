// Paginação de lista longa. Hook separado do painel.tsx só pelo fast refresh:
// arquivo de componente não pode exportar função que não é componente.
import { useEffect, useState } from 'react'

export const TAMANHOS = [25, 50, 100] as const
type Tamanho = (typeof TAMANHOS)[number]

/** Página atual de uma lista longa. Volta pra primeira página quando a lista
 *  muda de tamanho (filtro, busca, mês) — senão a pessoa fica numa página que
 *  não existe mais. Tamanho persiste por lista (§9 Tabelas: escolha do usuário). */
export function usePaginacao<T>(itens: T[], chave: string, padrao = 25) {
  const guardado = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(`pag:${chave}`)) : 0
  const [porPagina, setPorPaginaEstado] = useState(TAMANHOS.includes(guardado as Tamanho) ? guardado : padrao)
  const [pagina, setPagina] = useState(1)
  const total = itens.length
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  useEffect(() => { setPagina(1) }, [total, porPagina])
  const atual = Math.min(pagina, paginas)
  const setPorPagina = (n: number) => {
    setPorPaginaEstado(n)
    try { localStorage.setItem(`pag:${chave}`, String(n)) } catch { /* modo privado */ }
  }
  return {
    visiveis: itens.slice((atual - 1) * porPagina, atual * porPagina),
    pagina: atual, paginas, porPagina, total, setPagina, setPorPagina,
  }
}

