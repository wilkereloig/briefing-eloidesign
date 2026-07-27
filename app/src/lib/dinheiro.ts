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
