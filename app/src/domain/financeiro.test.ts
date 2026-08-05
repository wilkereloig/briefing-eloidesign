import { describe, it, expect } from 'vitest'
import {
  saldoConta, saldoDisponivel, resultado, vencidas, diasDeAtraso, proximosVencimentos,
  faturaAberta, limiteDisponivel, dividirParcelas, dataDaParcela, previsaoCaixa,
  agrupar, consumoOrcamento, saldoAberto, valorLiquidado, competenciaDe,
} from './financeiro'
import type { Conta, Transacao } from '../lib/tipos'

const conta = (p: Partial<Conta> & { id: string }): Conta => ({
  nome: 'c', tipo: 'corrente', contexto: 'empresa', instituicao: null, cor: null,
  saldo_inicial_cents: 0, limite_cents: null, dia_fechamento: null, dia_vencimento: null,
  ativa: true, created_at: '2026-01-01', ...p,
})

const tx = (p: Partial<Transacao> & { id: string; tipo: Transacao['tipo'] }): Transacao => ({
  contexto: 'empresa', status: 'realizado', descricao: 'x', valor_cents: 0, recebido_cents: 0,
  conta_id: null, conta_destino_id: null, categoria_id: null, cliente_id: null, servico_id: null,
  fornecedor: null, data_competencia: null, data_vencimento: null, data_liquidacao: null,
  forma_pagamento: null, grupo_id: null, parcela_num: null, parcela_de: null,
  recorrencia_id: null, observacoes: null, created_at: '2026-01-01', ...p,
})

describe('liquidação e saldo em aberto', () => {
  it('realizado sem recebido informado conta como liquidado integral', () => {
    const t = tx({ id: '1', tipo: 'entrada', valor_cents: 5000, status: 'realizado' })
    expect(valorLiquidado(t)).toBe(5000)
    // e nada fica em aberto: liquidado + aberto nunca pode passar do combinado,
    // senão o mesmo dinheiro aparece em "recebido" e em "a receber"
    expect(saldoAberto(t)).toBe(0)
  })

  it('liquidado + aberto sempre fecha no valor combinado', () => {
    for (const t of [
      tx({ id: '1', tipo: 'entrada', valor_cents: 5000, status: 'realizado' }),
      tx({ id: '2', tipo: 'entrada', valor_cents: 5000, recebido_cents: 2000, status: 'parcial' }),
      tx({ id: '3', tipo: 'saida', valor_cents: 5000, status: 'pendente' }),
    ]) {
      expect(valorLiquidado(t) + saldoAberto(t)).toBe(t.valor_cents)
    }
  })

  it('pagamento parcial separa liquidado de aberto', () => {
    const t = tx({ id: '1', tipo: 'entrada', valor_cents: 10000, recebido_cents: 4000, status: 'parcial' })
    expect(valorLiquidado(t)).toBe(4000)
    expect(saldoAberto(t)).toBe(6000)
  })

  it('cancelada não liquida nem fica em aberto', () => {
    const t = tx({ id: '1', tipo: 'entrada', valor_cents: 10000, recebido_cents: 4000, status: 'cancelado' })
    expect(valorLiquidado(t)).toBe(0)
    expect(saldoAberto(t)).toBe(0)
  })
})

// O rótulo do enum eloi_status_mov é 'cancelado' (masculino). O tipo dizia
// 'cancelada', então estaCancelada() nunca dava true e o estorno não estornava
// nada: continuava somando em saldo e em resultado.
describe('estorno (status cancelado)', () => {
  const cc = conta({ id: 'cc', saldo_inicial_cents: 0 })

  it('lançamento cancelado sai do saldo da conta', () => {
    const ts = [
      tx({ id: '1', tipo: 'entrada', conta_id: 'cc', valor_cents: 300_00 }),
      tx({ id: '2', tipo: 'entrada', conta_id: 'cc', valor_cents: 100_00, status: 'cancelado' }),
    ]
    expect(saldoConta(cc, ts)).toBe(300_00)
  })

  it('lançamento cancelado sai da receita e do a receber', () => {
    const ts = [
      tx({ id: '1', tipo: 'entrada', valor_cents: 300_00, data_competencia: '2026-08-10' }),
      tx({
        id: '2', tipo: 'entrada', valor_cents: 900_00, recebido_cents: 500_00,
        status: 'cancelado', data_competencia: '2026-08-11',
      }),
    ]
    const r = resultado(ts, 'empresa', '2026-08')
    expect(r.receita_cents).toBe(300_00)
    expect(r.a_receber_cents).toBe(0)
  })

  it('transferência cancelada não move saldo de nenhum dos dois lados', () => {
    const destino = conta({ id: 'poup', tipo: 'poupanca', saldo_inicial_cents: 0 })
    const ts = [tx({
      id: '1', tipo: 'transferencia', conta_id: 'cc', conta_destino_id: 'poup',
      valor_cents: 200_00, status: 'cancelado',
    })]
    expect(saldoConta(cc, ts)).toBe(0)
    expect(saldoConta(destino, ts)).toBe(0)
  })
})

describe('saldo de conta', () => {
  const cc = conta({ id: 'cc', saldo_inicial_cents: 100_00 })
  const poup = conta({ id: 'poup', tipo: 'poupanca' })

  it('soma entradas e subtrai saídas liquidadas', () => {
    const ts = [
      tx({ id: '1', tipo: 'entrada', conta_id: 'cc', valor_cents: 50_00 }),
      tx({ id: '2', tipo: 'saida', conta_id: 'cc', valor_cents: 20_00 }),
    ]
    expect(saldoConta(cc, ts)).toBe(130_00)
  })

  it('ignora o que ainda não liquidou', () => {
    const ts = [tx({ id: '1', tipo: 'entrada', conta_id: 'cc', valor_cents: 50_00, status: 'previsto' })]
    expect(saldoConta(cc, ts)).toBe(100_00)
  })

  it('transferência tira de uma conta e põe na outra, sem criar dinheiro', () => {
    const ts = [tx({
      id: '1', tipo: 'transferencia', conta_id: 'cc', conta_destino_id: 'poup', valor_cents: 40_00,
    })]
    expect(saldoConta(cc, ts)).toBe(60_00)
    expect(saldoConta(poup, ts)).toBe(40_00)
    // o total do patrimônio não muda com transferência
    expect(saldoDisponivel([cc, poup], ts)).toBe(100_00)
  })

  it('cartão de crédito não entra no saldo disponível — fatura é dívida', () => {
    const cartao = conta({ id: 'card', tipo: 'cartao_credito', limite_cents: 500_00, dia_fechamento: 20, dia_vencimento: 28 })
    const ts = [tx({ id: '1', tipo: 'saida', conta_id: 'card', valor_cents: 80_00, status: 'pendente' })]
    expect(saldoDisponivel([cc, cartao], ts)).toBe(100_00)
  })
})

describe('resultado por competência', () => {
  const ts = [
    tx({ id: '1', tipo: 'entrada', valor_cents: 1000_00, data_competencia: '2026-08-10' }),
    tx({ id: '2', tipo: 'saida', valor_cents: 300_00, data_competencia: '2026-08-15' }),
    tx({ id: '3', tipo: 'entrada', valor_cents: 900_00, data_competencia: '2026-07-01' }),
    // transferência gorda no mesmo mês: não pode aparecer em lugar nenhum
    tx({ id: '4', tipo: 'transferencia', conta_id: 'a', conta_destino_id: 'b', valor_cents: 5000_00, data_competencia: '2026-08-20' }),
  ]

  it('transferência não entra em receita nem despesa', () => {
    const r = resultado(ts, undefined, '2026-08')
    expect(r.receita_cents).toBe(1000_00)
    expect(r.despesa_cents).toBe(300_00)
    expect(r.lucro_cents).toBe(700_00)
  })

  it('margem é lucro sobre receita', () => {
    expect(resultado(ts, undefined, '2026-08').margem).toBeCloseTo(0.7)
  })

  it('margem é zero quando não há receita, sem dividir por zero', () => {
    const r = resultado([tx({ id: '1', tipo: 'saida', valor_cents: 100_00, data_competencia: '2026-08-01' })], undefined, '2026-08')
    expect(r.margem).toBe(0)
    expect(r.lucro_cents).toBe(-100_00)
  })

  it('separa pessoal de empresa', () => {
    const mix = [
      tx({ id: '1', tipo: 'entrada', contexto: 'empresa', valor_cents: 500_00, data_competencia: '2026-08-01' }),
      tx({ id: '2', tipo: 'entrada', contexto: 'pessoal', valor_cents: 100_00, data_competencia: '2026-08-01' }),
    ]
    expect(resultado(mix, 'empresa', '2026-08').receita_cents).toBe(500_00)
    expect(resultado(mix, 'pessoal', '2026-08').receita_cents).toBe(100_00)
  })

  it('a receber soma só o que falta entrar', () => {
    const r = resultado([
      tx({ id: '1', tipo: 'entrada', valor_cents: 1000_00, recebido_cents: 400_00, status: 'parcial', data_competencia: '2026-08-01' }),
    ], undefined, '2026-08')
    expect(r.receita_cents).toBe(400_00)
    expect(r.a_receber_cents).toBe(600_00)
  })

  it('competência cai pro vencimento quando não informada', () => {
    expect(competenciaDe(tx({ id: '1', tipo: 'entrada', data_vencimento: '2026-09-05' }))).toBe('2026-09')
  })
})

describe('vencimentos', () => {
  const ts = [
    tx({ id: 'atrasada', tipo: 'entrada', valor_cents: 100_00, status: 'pendente', data_vencimento: '2026-08-01' }),
    tx({ id: 'futura', tipo: 'entrada', valor_cents: 100_00, status: 'previsto', data_vencimento: '2026-08-20' }),
    tx({ id: 'paga', tipo: 'entrada', valor_cents: 100_00, status: 'realizado', data_vencimento: '2026-07-01' }),
  ]

  it('vencida é só o que está em aberto e passou da data', () => {
    expect(vencidas(ts, '2026-08-10').map((t) => t.id)).toEqual(['atrasada'])
  })

  it('conta dias de atraso e ignora o que já foi pago', () => {
    expect(diasDeAtraso(ts[0], '2026-08-10')).toBe(9)
    expect(diasDeAtraso(ts[2], '2026-08-10')).toBe(0)
  })

  it('próximos vencimentos respeitam a janela e vêm ordenados', () => {
    expect(proximosVencimentos(ts, '2026-08-10', 30).map((t) => t.id)).toEqual(['futura'])
    expect(proximosVencimentos(ts, '2026-08-10', 5)).toEqual([])
  })
})

describe('cartão de crédito', () => {
  const cartao = conta({ id: 'card', tipo: 'cartao_credito', limite_cents: 1000_00, dia_fechamento: 20, dia_vencimento: 28 })
  const ts = [
    tx({ id: '1', tipo: 'saida', conta_id: 'card', valor_cents: 300_00, status: 'pendente' }),
    tx({ id: '2', tipo: 'saida', conta_id: 'card', valor_cents: 200_00, status: 'pendente' }),
    tx({ id: '3', tipo: 'saida', conta_id: 'card', valor_cents: 150_00, status: 'realizado', recebido_cents: 150_00 }),
  ]

  it('fatura soma só o que ainda não foi pago', () => {
    expect(faturaAberta(cartao, ts)).toBe(500_00)
  })

  it('limite disponível desconta a fatura aberta', () => {
    expect(limiteDisponivel(cartao, ts)).toBe(500_00)
  })

  it('conta sem limite não finge ter um', () => {
    expect(limiteDisponivel(conta({ id: 'x' }), ts)).toBeNull()
  })

  it('pagar a fatura por transferência não vira despesa nova', () => {
    const comPagamento = [...ts, tx({
      id: 'pag', tipo: 'transferencia', conta_id: 'cc', conta_destino_id: 'card', valor_cents: 500_00,
    })]
    // a despesa continua sendo a das compras, não o dobro
    expect(resultado(comPagamento).despesa_cents).toBe(150_00)
  })
})

describe('parcelas', () => {
  it('não perde centavo: o resto vai na primeira', () => {
    expect(dividirParcelas(100_00, 3)).toEqual([3334, 3333, 3333])
    expect(dividirParcelas(100_00, 3).reduce((a, b) => a + b)).toBe(100_00)
  })

  it('divisão exata distribui igual', () => {
    expect(dividirParcelas(90_00, 3)).toEqual([3000, 3000, 3000])
  })

  it('parcela única devolve o valor inteiro', () => {
    expect(dividirParcelas(77_77, 1)).toEqual([7777])
  })

  it('recusa número de parcelas inválido', () => {
    expect(() => dividirParcelas(100, 0)).toThrow()
  })

  it('dia 31 não vaza pro mês seguinte', () => {
    expect(dataDaParcela('2026-01-31', 1)).toBe('2026-02-28')
    expect(dataDaParcela('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('avança um mês por parcela', () => {
    expect(dataDaParcela('2026-08-10', 0)).toBe('2026-08-10')
    expect(dataDaParcela('2026-08-10', 5)).toBe('2027-01-10')
  })
})

describe('previsão de caixa', () => {
  const cc = conta({ id: 'cc', saldo_inicial_cents: 1000_00 })
  const ts = [
    tx({ id: 'receber', tipo: 'entrada', valor_cents: 500_00, status: 'previsto', data_vencimento: '2026-08-20' }),
    tx({ id: 'atrasado', tipo: 'entrada', valor_cents: 400_00, status: 'vencido', data_vencimento: '2026-07-01' }),
    tx({ id: 'pagar', tipo: 'saida', valor_cents: 200_00, status: 'pendente', data_vencimento: '2026-08-25' }),
  ]

  it('cenários crescem do conservador ao otimista', () => {
    const c = previsaoCaixa([cc], ts, '2026-08-10', 90)
    expect(c.conservador).toBeLessThan(c.provavel)
    expect(c.provavel).toBeLessThan(c.otimista)
  })

  it('otimista conta tudo que está em aberto; despesa entra inteira nos três', () => {
    const c = previsaoCaixa([cc], ts, '2026-08-10', 90)
    expect(c.otimista).toBe(1000_00 + 500_00 + 400_00 - 200_00)
    expect(c.conservador).toBe(1000_00 + 350_00 - 200_00)
  })
})

describe('agregação', () => {
  const ts = [
    tx({ id: '1', tipo: 'entrada', cliente_id: 'a', valor_cents: 300_00 }),
    tx({ id: '2', tipo: 'entrada', cliente_id: 'b', valor_cents: 500_00 }),
    tx({ id: '3', tipo: 'entrada', cliente_id: 'a', valor_cents: 100_00 }),
    tx({ id: '4', tipo: 'saida', cliente_id: 'a', valor_cents: 900_00 }),
  ]

  it('agrupa por cliente do maior pro menor e não mistura tipo', () => {
    expect(agrupar(ts, (t) => t.cliente_id, 'entrada')).toEqual([
      { chave: 'b', total_cents: 500_00, qtd: 1 },
      { chave: 'a', total_cents: 400_00, qtd: 2 },
    ])
  })
})

describe('orçamento de gasto', () => {
  it('marca estouro e calcula percentual', () => {
    expect(consumoOrcamento(1000_00, 1200_00)).toEqual({
      usado_cents: 1200_00, restante_cents: -200_00, percentual: 1.2, estourou: true,
    })
  })

  it('alvo zero não divide por zero', () => {
    expect(consumoOrcamento(0, 100).percentual).toBe(0)
  })
})
