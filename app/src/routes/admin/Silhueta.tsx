import type { CSSProperties } from 'react'
import type { ItemNav } from './nav'

export function Silhueta({ forma, cor, tamanho = 14 }: { forma: ItemNav['glifo']; cor: string; tamanho?: number }) {
  const base: CSSProperties = { width: tamanho, height: tamanho, flexShrink: 0, display: 'inline-block' }
  if (forma === 'quadrado') return <span aria-hidden style={{ ...base, background: cor }} />
  if (forma === 'circulo') return <span aria-hidden style={{ ...base, background: cor, borderRadius: '50%' }} />
  if (forma === 'arco') return <span aria-hidden style={{ ...base, background: cor, borderRadius: '0 0 100% 0' }} />
  return <span aria-hidden style={{ ...base, background: 'transparent', border: `2px solid ${cor}`, boxSizing: 'border-box' }} />
}
