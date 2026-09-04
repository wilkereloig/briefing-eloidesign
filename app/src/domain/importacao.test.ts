import { describe, it, expect } from 'vitest'
import {
  chaveImportacao, classificar, detectarColunas, interpretar, lerCsv, lerData, lerValor,
} from './importacao'

describe('lerValor', () => {
  it('formatos brasileiros e internacionais dão o mesmo cents', () => {
    expect(lerValor('1.234,56')).toBe(123456)
    expect(lerValor('1234.56')).toBe(123456)
    expect(lerValor('1234,5')).toBe(123450)
    expect(lerValor('R$ 12,00')).toBe(1200)
    expect(lerValor('1.234')).toBe(123400)
    expect(lerValor('12.5')).toBe(1250)
  })
  it('sinal: menos, parênteses e sufixo D', () => {
    expect(lerValor('-12,00')).toBe(-1200)
    expect(lerValor('(12,00)')).toBe(-1200)
    expect(lerValor('12,00 D')).toBe(-1200)
    expect(lerValor('12,00 C')).toBe(1200)
  })
  it('texto não é valor', () => {
    expect(lerValor('Pix recebido')).toBeNull()
    expect(lerValor('')).toBeNull()
    expect(lerValor('12,345')).toBeNull()
  })
})

describe('lerData', () => {
  it('aceita as formas comuns', () => {
    expect(lerData('03/09/2026')).toBe('2026-09-03')
    expect(lerData('3/9/26')).toBe('2026-09-03')
    expect(lerData('2026-09-03')).toBe('2026-09-03')
    expect(lerData('2026-09-03T10:00:00')).toBe('2026-09-03')
    expect(lerData('03-09-2026')).toBe('2026-09-03')
  })
  it('recusa o que não é data', () => {
    expect(lerData('45/13/2026')).toBeNull()
    expect(lerData('Pix')).toBeNull()
  })
})

const CSV = `Data;Descrição;Valor
03/09/2026;Pix recebido F2;1.500,00
04/09/2026;"Café; padaria";-12,50
05/09/2026;Assinatura Adobe;-89,90`

describe('lerCsv + detectarColunas + interpretar', () => {
  it('lê ponto e vírgula com aspas e detecta o cabeçalho', () => {
    const t = lerCsv(CSV)
    expect(t.cabecalho).toEqual(['Data', 'Descrição', 'Valor'])
    expect(t.linhas).toHaveLength(3)
    expect(t.linhas[1][1]).toBe('Café; padaria')
  })

  it('sem cabeçalho, nomeia as colunas e não perde a primeira linha', () => {
    const t = lerCsv('03/09/2026,Pix,10.00\n04/09/2026,Uber,-5.00')
    expect(t.cabecalho).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3'])
    expect(t.linhas).toHaveLength(2)
  })

  it('acha data, valor e descrição em qualquer ordem', () => {
    const t = lerCsv('Valor,Descrição,Data\n10.00,Pix,03/09/2026\n-5.00,Uber,04/09/2026')
    expect(detectarColunas(t)).toEqual({ data: 2, descricao: 1, valor: 0 })
  })

  it('interpreta com sinal e marca linha inválida', () => {
    const t = lerCsv(CSV + '\nsem data;Coisa;10,00')
    const linhas = interpretar(t, detectarColunas(t))
    expect(linhas[0]).toMatchObject({ data: '2026-09-03', valor_cents: 150000, descricao: 'Pix recebido F2' })
    expect(linhas[1].valor_cents).toBe(-1250)
    expect(linhas[3].problema).toBe('data inválida')
    expect(linhas[3].chave).toBe('')
  })

  it('inverter sinal troca entrada por saída', () => {
    const t = lerCsv(CSV)
    expect(interpretar(t, detectarColunas(t), true)[0].valor_cents).toBe(-150000)
  })
})

describe('classificar', () => {
  const t = lerCsv(CSV + '\n03/09/2026;Pix recebido F2;1.500,00')
  const linhas = interpretar(t, detectarColunas(t))

  it('mesma chave já importada = duplicada; mesma data e valor = provável', () => {
    const r = classificar(linhas, [
      { conta_id: 'c', importacao_chave: chaveImportacao('2026-09-03', 150000, 'Pix recebido F2'),
        data_liquidacao: '2026-09-03', data_vencimento: null, valor_cents: 150000, tipo: 'entrada', status: 'realizado' },
      { conta_id: 'c', importacao_chave: null,
        data_liquidacao: '2026-09-04', data_vencimento: null, valor_cents: 1250, tipo: 'saida', status: 'pendente' },
    ], 'c')
    expect(r).toEqual(['duplicada', 'provavel', 'nova', 'duplicada'])
  })

  it('outra conta não interfere', () => {
    const r = classificar(linhas, [
      { conta_id: 'outra', importacao_chave: linhas[0].chave,
        data_liquidacao: '2026-09-03', data_vencimento: null, valor_cents: 150000, tipo: 'entrada', status: 'realizado' },
    ], 'c')
    expect(r[0]).toBe('nova')
  })

  it('repetida dentro do próprio arquivo é duplicada', () => {
    expect(classificar(linhas, [], 'c')[3]).toBe('duplicada')
  })
})
