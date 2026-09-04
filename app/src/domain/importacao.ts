// Importação de extrato CSV: ler, adivinhar colunas, interpretar, e apontar o
// que provavelmente já existe. Nada aqui grava — a tela mostra o resultado e
// só depois de confirmar a edge insere (transacoes.importar).
//
// XLSX fica de fora de propósito: ler planilha binária exige biblioteca nova
// e todo banco exporta CSV. Se um dia doer, é aqui que entra.
import type { Transacao } from '../lib/tipos'

export interface Tabela { cabecalho: string[]; linhas: string[][] }

/** Delimitador é o que mais aparece na primeira linha — extrato brasileiro
 *  costuma vir com `;` porque a vírgula é o decimal. */
export function lerCsv(texto: string): Tabela {
  const limpo = texto.replace(/^﻿/, '')
  const brutas = limpo.split(/\r?\n/).filter((l) => l.trim())
  if (!brutas.length) return { cabecalho: [], linhas: [] }
  const primeira = brutas[0]
  const sep = [';', ',', '\t'].map((s) => [s, (primeira.match(new RegExp(`\\${s}`, 'g')) ?? []).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0]
  const linhas = brutas.map((l) => dividir(l, sep))
  // Cabeçalho: primeira linha sem nenhuma célula que pareça data ou valor.
  const temCabecalho = !linhas[0].some((c) => lerData(c) || lerValor(c) != null)
  const cabecalho = temCabecalho ? linhas[0].map((c, i) => c.trim() || `Coluna ${i + 1}`) : linhas[0].map((_, i) => `Coluna ${i + 1}`)
  return { cabecalho, linhas: temCabecalho ? linhas.slice(1) : linhas }
}

function dividir(linha: string, sep: string): string[] {
  const out: string[] = []
  let atual = '', aspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas
    } else if (ch === sep && !aspas) { out.push(atual); atual = '' } else atual += ch
  }
  out.push(atual)
  return out.map((c) => c.trim())
}

/** 'AAAA-MM-DD' ou null. Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd. */
export function lerData(v: string): string | null {
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valida(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    return valida(ano, m[2].padStart(2, '0'), m[1].padStart(2, '0'))
  }
  return null
}
const valida = (a: string, m: string, d: string) =>
  +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 ? `${a}-${m}-${d}` : null

/** Cents com sinal, ou null se não parece dinheiro. "1.234,56" e "1234.56"
 *  são o mesmo número; "(12,00)" e "12,00 D" são negativos. */
export function lerValor(v: string): number | null {
  let s = v.trim().replace(/R\$\s?/i, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (/\bD$/i.test(s)) { negativo = true; s = s.replace(/\s*D$/i, '') }
  if (/\bC$/i.test(s)) s = s.replace(/\s*C$/i, '')
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null
  s = s.replace(/\s/g, '')
  const virg = s.lastIndexOf(','), ponto = s.lastIndexOf('.')
  let inteiro: string, dec: string
  if (virg > ponto) { inteiro = s.slice(0, virg).replace(/\./g, ''); dec = s.slice(virg + 1) }
  else if (ponto > virg) {
    const depois = s.slice(ponto + 1)
    // "1.234" com um ponto só e três dígitos é milhar; "12.5" é decimal.
    if (depois.length === 3 && (s.match(/\./g) ?? []).length >= 1 && virg === -1 && !/\.\d{3}\./.test(s)) {
      inteiro = s.replace(/\./g, ''); dec = ''
    } else { inteiro = s.slice(0, ponto).replace(/[.,]/g, ''); dec = depois }
  } else { inteiro = s; dec = '' }
  if (dec.length > 2) return null
  const cents = Number(inteiro || '0') * 100 + Number((dec + '00').slice(0, 2))
  if (!Number.isFinite(cents)) return null
  return negativo ? -cents : cents
}

export interface Mapa { data: number; descricao: number; valor: number }

/** Adivinha as colunas pela maioria das células. Data e valor pela forma;
 *  descrição é a coluna de texto mais longa que sobrou. */
export function detectarColunas(t: Tabela): Mapa {
  const n = t.cabecalho.length
  const amostra = t.linhas.slice(0, 50)
  const pontos = (f: (c: string) => boolean) => Array.from({ length: n }, (_, i) =>
    amostra.filter((l) => l[i] != null && f(l[i])).length)
  const melhor = (arr: number[], excluir: number[] = []) =>
    arr.reduce((b, v, i) => (excluir.includes(i) ? b : v > arr[b] || excluir.includes(b) ? i : b), 0)
  const data = melhor(pontos((c) => !!lerData(c)))
  // Valor: parece número e NÃO parece data (evita "2026" de uma coluna de ano).
  const valor = melhor(pontos((c) => lerValor(c) != null && !lerData(c)), [data])
  const tamanho = Array.from({ length: n }, (_, i) =>
    amostra.reduce((s, l) => s + (l[i]?.length ?? 0), 0))
  const descricao = melhor(tamanho, [data, valor])
  return { data, descricao, valor }
}

export interface LinhaLida {
  indice: number
  data: string | null
  descricao: string
  valor_cents: number | null
  /** Vazio quando data ou valor faltam — a linha não pode ser importada. */
  chave: string
  problema?: string
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim()

/** Chave estável da linha: reimportar o mesmo extrato encontra a mesma chave. */
export const chaveImportacao = (data: string, valor_cents: number, descricao: string) =>
  `${data}|${valor_cents}|${normalizar(descricao)}`

export function interpretar(t: Tabela, mapa: Mapa, inverterSinal = false): LinhaLida[] {
  return t.linhas.map((l, i) => {
    const data = lerData(l[mapa.data] ?? '')
    let valor = lerValor(l[mapa.valor] ?? '')
    if (valor != null && inverterSinal) valor = -valor
    const descricao = (l[mapa.descricao] ?? '').trim() || 'Sem descrição'
    const problema = !data ? 'data inválida' : valor == null ? 'valor inválido' : valor === 0 ? 'valor zero' : undefined
    return {
      indice: i, data, descricao, valor_cents: valor,
      chave: data && valor ? chaveImportacao(data, valor, descricao) : '',
      problema,
    }
  })
}

export type Situacao = 'nova' | 'duplicada' | 'provavel' | 'invalida'

/**
 * `duplicada` = mesma chave já importada nesta conta (certeza).
 * `provavel` = mesma data e valor na mesma conta, descrição diferente —
 * lançado à mão antes do extrato chegar. Fica desmarcada, mas o dono decide.
 */
export function classificar(
  linhas: LinhaLida[], existentes: Pick<Transacao, 'conta_id' | 'importacao_chave' | 'data_liquidacao' | 'data_vencimento' | 'valor_cents' | 'tipo' | 'status'>[],
  contaId: string,
): Situacao[] {
  const daConta = existentes.filter((t) => t.conta_id === contaId && t.status !== 'cancelado')
  const chaves = new Set(daConta.map((t) => t.importacao_chave).filter(Boolean))
  const porDataValor = new Set(daConta.map((t) =>
    `${t.data_liquidacao ?? t.data_vencimento}|${t.tipo === 'saida' ? -t.valor_cents : t.valor_cents}`))
  const vistas = new Set<string>()
  return linhas.map((l) => {
    if (l.problema || !l.chave) return 'invalida'
    // Repetida dentro do próprio arquivo também é duplicada.
    if (chaves.has(l.chave) || vistas.has(l.chave)) return 'duplicada'
    vistas.add(l.chave)
    if (porDataValor.has(`${l.data}|${l.valor_cents}`)) return 'provavel'
    return 'nova'
  })
}
