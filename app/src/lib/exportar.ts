import { montarCsv } from '../domain/relatorios'

/** Baixa um CSV no navegador. O conteúdo vem de `montarCsv` (testado); aqui
 *  é só o gesto de download. */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]) {
  const blob = new Blob([montarCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
