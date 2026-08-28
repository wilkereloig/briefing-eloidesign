// Dinheiro é SEMPRE inteiro em cents (contrato do banco: valor_cents).
// Nada de float: parse manual de "1.234,56" — split na vírgula, dígitos puros.
export function fmtBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
}

export function centsDeBRL(s: string): number {
  const negativo = /^\s*-/.test(s)
  const limpo = s.replace(/[^\d,.]/g, '')
  if (!limpo) return 0
  let valor: number
  if (limpo.includes(',')) {
    // Vírgula presente: é o decimal (padrão BR); ponto antes dela é milhar.
    const [intParte, decParte = ''] = limpo.replace(/\./g, '').split(',')
    const dec = (decParte + '00').slice(0, 2)
    valor = parseInt(intParte.replace(/\D/g, '') || '0', 10) * 100 + parseInt(dec, 10)
  } else {
    // Sem vírgula: ponto (se houver) é decimal — "1234.56" não é R$ 123.456,00.
    const partes = limpo.split('.')
    const decParte = partes.length > 1 ? partes.pop()! : ''
    const dec = (decParte + '00').slice(0, 2)
    valor = parseInt(partes.join('') || '0', 10) * 100 + parseInt(dec, 10)
  }
  return negativo ? -valor : valor
}

// orcamentos.valor_total é o ÚNICO campo monetário do sistema em reais, não
// cents (ver docs/GLOSSARY.md). Mesma conta do trigger SQL trg_eloi_orcamento_aprovado
// (round(valor_total * 100)) — manter os dois em sincronia se um dia mudar.
export function centsDeReais(valorReais: number): number {
  return Math.round(valorReais * 100)
}
