// Cálculo da proposta. Portado de `assets/eloi-admin/orcamento.js` sem mudar
// uma conta: a ordem (base → complexidade → urgência → desconto), o
// arredondamento item a item antes da soma e o clamp do desconto ficam
// exatamente como estavam. Reescrever a regra mudaria valor de proposta já
// enviada; mover não muda.
//
// Enquanto `/painel-orcamentos` existir, os dois arquivos convivem e precisam
// concordar — `orcamento.test.ts` repete os casos de `orcamento.test.js`.
// Condição de saída do arquivo antigo: o painel estático sair do ar.

export interface ItemOrcamento {
  nome: string
  /** REAIS, não cents — é a exceção herdada de `orcamentos.valor_total`. */
  valor: number
}

export type Complexidade = 'simples' | 'media' | 'alta'
export type Urgencia = 'normal' | 'expressa'

export const COMPLEXIDADES: { key: Complexidade; label: string; m: number }[] = [
  { key: 'simples', label: 'Simples', m: 1.0 },
  { key: 'media', label: 'Média', m: 1.4 },
  { key: 'alta', label: 'Alta', m: 1.8 },
]

export const URGENCIAS: { key: Urgencia; label: string; m: number }[] = [
  { key: 'normal', label: 'Normal', m: 1.0 },
  { key: 'expressa', label: 'Expressa (curto)', m: 1.3 },
]

/** Duas casas. Dinheiro em reais aqui, não em cents (herança do `valor_total`). */
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100

/** Chave desconhecida cai no primeiro da lista — o neutro. */
function multiplicadorDe<T extends { key: string; m: number; label: string }>(
  lista: T[], key: unknown,
): T {
  return lista.find((x) => x.key === key) ?? lista[0]
}

export interface Ajuste { nome: string; valor: number }
export interface Calculo { base: number; ajustes: Ajuste[]; total: number }

export interface EntradaCalculo {
  itens?: ItemOrcamento[] | null
  complexidade?: string | null
  urgencia?: string | null
  desconto_pct?: number | null
}

/**
 * Base é a soma dos itens (cada um arredondado antes de somar). Multiplicador
 * neutro não vira linha de ajuste. Os ajustes são **exibição**: nunca entram
 * em `itens`, senão o próximo cálculo os multiplicaria de novo.
 */
export function calcular(o: EntradaCalculo = {}): Calculo {
  const itens = Array.isArray(o.itens) ? o.itens : []
  const c = multiplicadorDe(COMPLEXIDADES, o.complexidade)
  const u = multiplicadorDe(URGENCIAS, o.urgencia)
  const d = Math.min(100, Math.max(0, Number(o.desconto_pct) || 0))

  const base = r2(itens.reduce((a, it) => a + r2(it && it.valor), 0))
  const afterC = base * c.m
  const afterU = afterC * u.m
  const afterD = afterU * (1 - d / 100)

  const ajustes: Ajuste[] = []
  if (c.m !== 1) ajustes.push({ nome: `Complexidade ${c.label} (×${c.m})`, valor: r2(afterC - base) })
  if (u.m !== 1) ajustes.push({ nome: `Urgência ${u.label} (×${u.m})`, valor: r2(afterU - afterC) })
  if (d > 0) ajustes.push({ nome: `Desconto ${d}%`, valor: r2(afterD - afterU) })

  return { base, ajustes, total: r2(afterD) }
}

/** Dias que uma proposta enviada vale antes de contar como vencida. É o que a
 *  página do cliente já promete em texto ("válida por 15 dias"). */
export const VALIDADE_DIAS = 15

/**
 * Expirado é **derivado**, não é status gravado: proposta enviada há mais de
 * `VALIDADE_DIAS` sem resposta. Guardar `expirado` no banco exigiria alguém
 * (cron, trigger) para virar a chave na data certa — e um estado que só muda
 * porque o tempo passou não precisa ser gravado para ser verdade.
 *
 * `updated_at` é o proxy de "quando foi enviado" — mesma escolha de
 * `domain/decisoes.ts`; não existe coluna `enviado_em`.
 */
export function estaExpirado(
  o: { status: string; updated_at: string }, agora = Date.now(),
): boolean {
  if (o.status !== 'enviado') return false
  const enviado = new Date(o.updated_at).getTime()
  return Number.isFinite(enviado) && agora - enviado > VALIDADE_DIAS * 86_400_000
}
