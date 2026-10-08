// Dinheiro é SEMPRE inteiro em cents (contrato do banco: valor_cents).
// Nada de float: parse manual de "1.234,56" — dígitos puros, sem parseFloat.
export function fmtBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
}

/**
 * Parser ÚNICO de valor digitado ou importado → cents com sinal, ou null se
 * não parece dinheiro. Padrão pt-BR: ',' é decimal e '.' é milhar —
 * "1.500" é mil e quinhentos, não R$ 1,50. Exceções que ainda são inequívocas:
 * um ponto só com 1–2 casas ("10.5", "1234.56") é decimal, e "1,234.56"
 * (vírgula antes do ponto) é o formato internacional. Aceita "R$", "(12,00)",
 * "12,00 D" (negativos) e "12,00 C". Sem float em nenhum passo.
 */
export function lerCents(v: string): number | null {
  let s = v.trim().replace(/R\$\s?/i, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (/\bD$/i.test(s)) { negativo = true; s = s.replace(/\s*D$/i, '') }
  if (/\bC$/i.test(s)) s = s.replace(/\s*C$/i, '')
  s = s.trim()
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  s = s.replace(/\s/g, '')
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null

  const virg = s.lastIndexOf(','), ponto = s.lastIndexOf('.')
  // Posição do separador decimal; -1 = número inteiro.
  let sep = -1
  if (virg > ponto) sep = virg
  else if (ponto > virg && (virg >= 0 || (s.indexOf('.') === ponto && s.length - ponto - 1 <= 2))) sep = ponto
  const inteiro = sep < 0 ? s : s.slice(0, sep)
  const dec = sep < 0 ? '' : s.slice(sep + 1)
  if (dec.length > 2 || /[.,]/.test(dec)) return null
  // Separador de milhar só em grupos de três: "1.5000" é erro de digitação.
  if (/[.,]/.test(inteiro) && !/^\d{1,3}([.,]\d{3})+$/.test(inteiro)) return null
  const cents = Number(inteiro.replace(/[.,]/g, '') || '0') * 100 + Number((dec + '00').slice(0, 2))
  if (!Number.isSafeInteger(cents)) return null
  return negativo ? -cents : cents
}

/** Campo de valor da tela: vazio ou ilegível vira 0 (a validação de "maior que
 *  zero" é de quem chama). Mesma regra de `lerCents`. */
export function centsDeBRL(s: string): number {
  return lerCents(s) ?? 0
}

// orcamentos.valor_total é o ÚNICO campo monetário do sistema em reais, não
// cents (ver docs/GLOSSARY.md). Mesma conta do trigger SQL trg_eloi_orcamento_aprovado
// (round(valor_total * 100)) — manter os dois em sincronia se um dia mudar.
export function centsDeReais(valorReais: number): number {
  return Math.round(valorReais * 100)
}
