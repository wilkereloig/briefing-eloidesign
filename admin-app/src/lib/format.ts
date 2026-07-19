export function formatCents(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}
