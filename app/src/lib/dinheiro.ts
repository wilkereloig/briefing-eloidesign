// Dinheiro é SEMPRE inteiro em cents (contrato do banco: valor_cents).
// Nada de float: parse manual de "1.234,56" — split na vírgula, dígitos puros.
export function fmtBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
}

export function centsDeBRL(s: string): number {
  const limpo = s.replace(/[^\d,]/g, '')
  if (!limpo) return 0
  const [intParte, decParte = ''] = limpo.split(',')
  const dec = (decParte + '00').slice(0, 2)
  return parseInt(intParte.replace(/\D/g, '') || '0', 10) * 100 + parseInt(dec, 10)
}

// orcamentos.valor_total é o ÚNICO campo monetário do sistema em reais, não
// cents (ver docs/GLOSSARY.md). Mesma conta do trigger SQL trg_eloi_orcamento_aprovado
// (round(valor_total * 100)) — manter os dois em sincronia se um dia mudar.
export function centsDeReais(valorReais: number): number {
  return Math.round(valorReais * 100)
}
