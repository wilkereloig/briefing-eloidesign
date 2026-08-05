import { describe, expect, it } from 'vitest'
// `?raw` do Vite, não `node:fs`: o tsconfig do app não carrega os tipos de Node
// de propósito (é código de navegador), e um import de módulo resolve caminho
// para fora da raiz sem depender de `server.fs.allow`.
import tokensCss from './tokens.css?raw'
import tokensTs from './tokens.ts?raw'
import handoffCss from '../../../eloi-handoff/design-tokens/variables.css?raw'
import handoffTs from '../../../eloi-handoff/design-tokens/tokens.ts?raw'

// O sistema visual tem duas cópias por um motivo real: `app/src/ui/` roda no
// painel e `eloi-handoff/design-tokens/` é o pacote entregue a quem consome o
// KV fora do app. Duas cópias sem trava divergem — foi o que aconteceu: três
// tokens de margem existiam só de um lado. Estes testes travam a sincronia.

/** Corpo do arquivo sem o cabeçalho de comentário nem o @import de fontes.
 *  Os cabeçalhos DEVEM diferir (um diz quem é fonte, o outro quem é espelho)
 *  e só o espelho carrega as fontes por @import — o app usa <link>. */
function corpo(css: string) {
  return css
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    .replace(/^@import[^;]+;\s*/m, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

describe('tokens do sistema visual', () => {
  it('variables.css do handoff espelha tokens.css do app', () => {
    expect(corpo(handoffCss)).toBe(corpo(tokensCss))
  })

  it('tokens.ts do handoff espelha tokens.ts do app', () => {
    expect(handoffTs.replace(/\r\n/g, '\n')).toBe(tokensTs.replace(/\r\n/g, '\n'))
  })
})
