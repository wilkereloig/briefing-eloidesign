import { useSyncExternalStore } from 'react'
import { corBarraNavegador } from '../ui/tokens'

// Preferências de exibição deste navegador: tema e "ocultar valores". Não são
// dado do estúdio (não saem no logout) e não vão ao servidor. O index.html
// aplica as mesmas chaves antes do primeiro desenho, para a tela não piscar
// no tema errado — mudou o nome da chave aqui, muda lá.

export type Tema = 'sistema' | 'claro' | 'escuro'
export interface Preferencias { tema: Tema; ocultarValores: boolean }

export const CHAVE_TEMA = 'eloi_tema'
export const CHAVE_OCULTAR = 'eloi_ocultar_valores'
const TEMAS: Tema[] = ['sistema', 'claro', 'escuro']

function ler(armazem: Pick<Storage, 'getItem'> | undefined): Preferencias {
  try {
    const t = armazem?.getItem(CHAVE_TEMA) as Tema | null
    return { tema: t && TEMAS.includes(t) ? t : 'sistema', ocultarValores: armazem?.getItem(CHAVE_OCULTAR) === '1' }
  } catch {
    return { tema: 'sistema', ocultarValores: false }
  }
}

/** Escreve os atributos que o CSS lê: `data-tema` só quando o tema é fixado
 *  (sem ele vale `prefers-color-scheme`) e `data-ocultar-valores`. */
export function aplicar(p: Preferencias, raiz: HTMLElement, sistemaEscuro: boolean) {
  if (p.tema === 'sistema') raiz.removeAttribute('data-tema')
  else raiz.setAttribute('data-tema', p.tema)
  if (p.ocultarValores) raiz.setAttribute('data-ocultar-valores', '')
  else raiz.removeAttribute('data-ocultar-valores')
  const efetivo = p.tema === 'sistema' ? (sistemaEscuro ? 'escuro' : 'claro') : p.tema
  raiz.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', corBarraNavegador[efetivo])
}

const ouvintes = new Set<() => void>()
const armazem = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
let atual: Preferencias = ler(armazem())
const sistemaEscuro = () => typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches

export function definirPreferencias(mudanca: Partial<Preferencias>) {
  atual = { ...atual, ...mudanca }
  try {
    localStorage.setItem(CHAVE_TEMA, atual.tema)
    localStorage.setItem(CHAVE_OCULTAR, atual.ocultarValores ? '1' : '0')
  } catch { /* modo privado: vale só nesta aba */ }
  if (typeof document !== 'undefined') aplicar(atual, document.documentElement, sistemaEscuro())
  ouvintes.forEach((f) => f())
}

export function usePreferencias(): Preferencias {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f) },
    () => atual,
  )
}

// Tema "sistema": a cor da barra do navegador acompanha a troca do sistema.
if (typeof matchMedia !== 'undefined' && typeof document !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) =>
    aplicar(atual, document.documentElement, e.matches))
}

export const _teste = { ler }
