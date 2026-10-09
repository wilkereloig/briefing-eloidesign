import { describe, expect, it } from 'vitest'
import { _teste, aplicar, CHAVE_OCULTAR, CHAVE_TEMA } from './preferencias'

const armazem = (dados: Record<string, string>) => ({ getItem: (k: string) => dados[k] ?? null })

describe('preferências de exibição', () => {
  it('lê tema e ocultar; valor desconhecido ou armazenamento bloqueado = padrão', () => {
    expect(_teste.ler(armazem({ [CHAVE_TEMA]: 'claro', [CHAVE_OCULTAR]: '1' }))).toEqual({ tema: 'claro', ocultarValores: true })
    expect(_teste.ler(armazem({ [CHAVE_TEMA]: 'roxo' }))).toEqual({ tema: 'sistema', ocultarValores: false })
    expect(_teste.ler({ getItem: () => { throw new Error('bloqueado') } })).toEqual({ tema: 'sistema', ocultarValores: false })
    expect(_teste.ler(undefined)).toEqual({ tema: 'sistema', ocultarValores: false })
  })

  it('tema fixo vira data-tema; sistema remove o atributo; barra do navegador acompanha', () => {
    const attrs = new Map<string, string>()
    let cor = ''
    const raiz = {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      ownerDocument: { querySelector: () => ({ setAttribute: (_: string, v: string) => { cor = v } }) },
    } as unknown as HTMLElement
    aplicar({ tema: 'claro', ocultarValores: true }, raiz, true)
    expect(attrs.get('data-tema')).toBe('claro')
    expect(attrs.has('data-ocultar-valores')).toBe(true)
    expect(cor).toBe('#FAF8FC')
    aplicar({ tema: 'sistema', ocultarValores: false }, raiz, true)
    expect(attrs.has('data-tema')).toBe(false)
    expect(attrs.has('data-ocultar-valores')).toBe(false)
    expect(cor).toBe('#08011A')
  })
})
