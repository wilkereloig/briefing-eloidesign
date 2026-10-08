import { describe, it, expect } from 'vitest'
import {
  saldoConta, saldoDisponivel, resultado, vencidas, diasDeAtraso, proximosVencimentos,
  faturaAberta, limiteDisponivel, dividirParcelas, dataDaParcela, previsaoCaixa,
  agrupar, consumoOrcamento, saldoAberto, valorLiquidado, competenciaDe,
  agruparPorPrazo, faixaDePrazo, cicloFatura, parceladoAberto, saldoContaEm,
  totalEmAberto, serieResultado, ticketMedio, periodoDaMeta, consumoDaMeta,
  faturasDoCartao, indiceFaturaAtual, extratoDaConta, cobertura, saidasDaCobertura, patrimonioLiquido,
  chequeEspecialUsado, filtrarLancamentos,
} from './financeiro'
import type { Conta, Meta, Transacao } from '../lib/tipos'

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
  recorrencia_id: null, observacoes: null, origem: 'manual', importacao_chave: null,
  created_at: '2026-01-01', ...p,
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

  it('estorno em aberto abate a fatura, sem ficar negativa', () => {
    const estorno = tx({ id: 'e', tipo: 'entrada', conta_id: 'card', valor_cents: 120_00, status: 'pendente' })
    expect(faturaAberta(cartao, [...ts, estorno])).toBe(380_00)
    const grande = tx({ id: 'g', tipo: 'entrada', conta_id: 'card', valor_cents: 900_00, status: 'pendente' })
    expect(faturaAberta(cartao, [...ts, grande])).toBe(0)
  })

  it('limite disponível desconta a fatura aberta', () => {
    expect(limiteDisponivel(cartao, ts)).toBe(500_00)
  })

  it('fatura é só o próximo vencimento; parcela futura ocupa limite mas não entra', () => {
    const v = [
      tx({ id: 'out', tipo: 'saida', conta_id: 'card', valor_cents: 400_00, status: 'parcial', recebido_cents: 100_00, data_vencimento: '2026-10-09' }),
      tx({ id: 'nov', tipo: 'saida', conta_id: 'card', valor_cents: 250_00, status: 'pendente', data_vencimento: '2026-11-09' }),
      tx({ id: 'paga', tipo: 'saida', conta_id: 'card', valor_cents: 90_00, status: 'realizado', recebido_cents: 90_00, data_vencimento: '2026-09-09' }),
    ]
    expect(faturaAberta(cartao, v)).toBe(300_00)
    expect(limiteDisponivel(cartao, v)).toBe(1000_00 - 550_00)
    // quitada a de outubro, a de novembro vira a fatura
    expect(faturaAberta(cartao, v.slice(1))).toBe(250_00)
  })

  it('estorno é abatido primeiro (como a edge): sobra de outubro reduz novembro', () => {
    const v = [
      tx({ id: 'out', tipo: 'saida', conta_id: 'card', valor_cents: 100_00, status: 'pendente', data_vencimento: '2026-10-09' }),
      tx({ id: 'est', tipo: 'entrada', conta_id: 'card', valor_cents: 150_00, status: 'pendente', data_vencimento: '2026-10-09' }),
      tx({ id: 'nov', tipo: 'saida', conta_id: 'card', valor_cents: 250_00, status: 'pendente', data_vencimento: '2026-11-09' }),
    ]
    // edge: disponível 150, quita out (100) e sobram 50 para nov → falta 200
    expect(faturaAberta(cartao, v)).toBe(200_00)
  })

  it('estorno de outro mês também abate a primeira fatura em aberto', () => {
    const v = [
      tx({ id: 'out', tipo: 'saida', conta_id: 'card', valor_cents: 100_00, status: 'pendente', data_vencimento: '2026-10-09' }),
      tx({ id: 'est', tipo: 'entrada', conta_id: 'card', valor_cents: 30_00, status: 'pendente', data_vencimento: '2026-12-09' }),
    ]
    expect(faturaAberta(cartao, v)).toBe(70_00)
  })

  it('fatura aberta concorda com faturasDoCartao quando a linha só tem data da compra', () => {
    const c = conta({ id: 'card', tipo: 'cartao_credito', dia_fechamento: 2, dia_vencimento: 9 })
    const v = [
      tx({ id: 'a', tipo: 'saida', conta_id: 'card', valor_cents: 100_00, status: 'pendente', data_vencimento: '2026-10-09' }),
      // 05/10 passou do fechamento (dia 2): cai na fatura de 09/11
      tx({ id: 'b', tipo: 'saida', conta_id: 'card', valor_cents: 50_00, status: 'pendente', data_competencia: '2026-10-05' }),
    ]
    expect(faturaAberta(c, v)).toBe(100_00)
    expect(faturaAberta(c, v)).toBe(faturasDoCartao(c, v, '2026-10-08').find((f) => f.falta_cents > 0)!.falta_cents)
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

  it('soma o valor combinado quando a fatura pede (compra em aberto conta)', () => {
    const fatura = [
      tx({ id: '5', tipo: 'saida', categoria_id: 'mercado', valor_cents: 80_00, status: 'pendente' }),
      tx({ id: '6', tipo: 'saida', categoria_id: 'mercado', valor_cents: 20_00, status: 'realizado' }),
    ]
    expect(agrupar(fatura, (t) => t.categoria_id, 'saida')).toEqual([
      { chave: 'mercado', total_cents: 20_00, qtd: 2 },
    ])
    expect(agrupar(fatura, (t) => t.categoria_id, 'saida', (t) => t.valor_cents)).toEqual([
      { chave: 'mercado', total_cents: 100_00, qtd: 2 },
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

describe('fila de cobrança por prazo', () => {
  const hoje = '2026-09-10'
  const aberta = (id: string, venc: string | null, valor = 1000) =>
    tx({ id, tipo: 'entrada', status: 'pendente', valor_cents: valor, data_vencimento: venc })

  it('classifica cada vencimento na faixa certa', () => {
    expect(faixaDePrazo(aberta('a', '2026-09-01'), hoje)).toBe('vencido')
    expect(faixaDePrazo(aberta('b', '2026-09-10'), hoje)).toBe('hoje')
    expect(faixaDePrazo(aberta('c', '2026-09-17'), hoje)).toBe('semana')
    expect(faixaDePrazo(aberta('d', '2026-09-25'), hoje)).toBe('mes')
    expect(faixaDePrazo(aberta('e', '2026-10-02'), hoje)).toBe('proximo')
    expect(faixaDePrazo(aberta('f', null), hoje)).toBe('sem_data')
  })

  it('agrupa em ordem de urgência, omite faixa vazia e soma o que falta', () => {
    const grupos = agruparPorPrazo([
      aberta('x', '2026-10-02', 300),
      aberta('y', '2026-09-03', 500),
      aberta('z', '2026-09-01', 200),
      tx({ id: 'w', tipo: 'entrada', status: 'parcial', valor_cents: 1000, recebido_cents: 400, data_vencimento: '2026-09-10' }),
    ], hoje)
    expect(grupos.map((g) => g.faixa)).toEqual(['vencido', 'hoje', 'proximo'])
    expect(grupos[0].itens.map((t) => t.id)).toEqual(['z', 'y'])
    expect(grupos[0].total_cents).toBe(700)
    expect(grupos[1].total_cents).toBe(600)
  })
})

describe('ciclo de fatura', () => {
  const cartao = conta({ id: 'k', tipo: 'cartao_credito', dia_fechamento: 25, dia_vencimento: 5 })

  it('antes do fechamento: fecha este mês, vence no próximo', () => {
    expect(cicloFatura(cartao, '2026-09-10')).toEqual({ fechamento: '2026-09-25', vencimento: '2026-10-05' })
  })

  it('depois do fechamento: ciclo já é o do mês seguinte', () => {
    expect(cicloFatura(cartao, '2026-09-26')).toEqual({ fechamento: '2026-10-25', vencimento: '2026-11-05' })
  })

  it('vencimento depois do fechamento no mesmo mês', () => {
    const c = conta({ id: 'k', tipo: 'cartao_credito', dia_fechamento: 5, dia_vencimento: 15 })
    expect(cicloFatura(c, '2026-09-01')).toEqual({ fechamento: '2026-09-05', vencimento: '2026-09-15' })
  })

  it('fechamento dia 31 em mês de 30 cai no último dia', () => {
    const c = conta({ id: 'k', tipo: 'cartao_credito', dia_fechamento: 31, dia_vencimento: 10 })
    expect(cicloFatura(c, '2026-09-01')!.fechamento).toBe('2026-09-30')
  })

  it('sem dias configurados não inventa ciclo', () => {
    expect(cicloFatura(conta({ id: 'k', tipo: 'cartao_credito' }), '2026-09-01')).toBeNull()
  })

  it('parcelado em aberto conta só parcelas do cartão ainda devidas', () => {
    const r = parceladoAberto(cartao, [
      tx({ id: '1', tipo: 'saida', conta_id: 'k', parcela_de: 3, parcela_num: 1, status: 'realizado', valor_cents: 100 }),
      tx({ id: '2', tipo: 'saida', conta_id: 'k', parcela_de: 3, parcela_num: 2, status: 'pendente', valor_cents: 100 }),
      tx({ id: '3', tipo: 'saida', conta_id: 'k', parcela_de: 3, parcela_num: 3, status: 'pendente', valor_cents: 100 }),
      tx({ id: '4', tipo: 'saida', conta_id: 'outra', parcela_de: 2, status: 'pendente', valor_cents: 100 }),
    ])
    expect(r).toEqual({ qtd: 2, cents: 200 })
  })
})

describe('saldo numa data', () => {
  it('ignora o que liquidou depois da data conferida', () => {
    const c = conta({ id: 'c', saldo_inicial_cents: 1000 })
    const ts = [
      tx({ id: '1', tipo: 'entrada', conta_id: 'c', valor_cents: 500, status: 'realizado', data_liquidacao: '2026-09-01' }),
      tx({ id: '2', tipo: 'saida', conta_id: 'c', valor_cents: 200, status: 'realizado', data_liquidacao: '2026-09-10' }),
    ]
    expect(saldoContaEm(c, ts, '2026-09-05')).toBe(1500)
    expect(saldoContaEm(c, ts, '2026-09-10')).toBe(1300)
  })
})

describe('helpers que saíram das telas', () => {
  it('totalEmAberto soma só o que falta, inclusive parcial', () => {
    expect(totalEmAberto([
      tx({ id: '1', tipo: 'entrada', valor_cents: 5000, recebido_cents: 2000, status: 'parcial' }),
      tx({ id: '2', tipo: 'entrada', valor_cents: 1000, status: 'pendente' }),
      tx({ id: '3', tipo: 'entrada', valor_cents: 9000, status: 'cancelado' }),
    ])).toBe(4000)
  })

  it('próximos vencimentos ignoram transferência', () => {
    const ts = [
      tx({ id: 'conta', tipo: 'saida', valor_cents: 100, status: 'pendente', data_vencimento: '2026-08-12' }),
      tx({ id: 'transf', tipo: 'transferencia', valor_cents: 100, status: 'pendente', data_vencimento: '2026-08-12' }),
    ]
    expect(proximosVencimentos(ts, '2026-08-10').map((t) => t.id)).toEqual(['conta'])
  })

  it('serieResultado: total é a soma dos meses, margem sobre o total', () => {
    const ts = [
      tx({ id: 'a', tipo: 'entrada', valor_cents: 10000, data_competencia: '2026-07-05' }),
      tx({ id: 'b', tipo: 'entrada', valor_cents: 10000, data_competencia: '2026-08-05' }),
      tx({ id: 'c', tipo: 'saida', valor_cents: 5000, data_competencia: '2026-08-10' }),
      tx({ id: 'fora', tipo: 'entrada', valor_cents: 99999, data_competencia: '2026-09-01' }),
    ]
    const { serie, total } = serieResultado(ts, ['2026-07', '2026-08'])
    expect(serie.map((m) => m.lucro_cents)).toEqual([10000, 5000])
    expect(total).toEqual({ receita_cents: 20000, despesa_cents: 5000, lucro_cents: 15000, margem: 0.75 })
  })

  it('ticketMedio só conta recebimento liquidado', () => {
    expect(ticketMedio([
      tx({ id: '1', tipo: 'entrada', valor_cents: 1000 }),
      tx({ id: '2', tipo: 'entrada', valor_cents: 2001 }),
      tx({ id: '3', tipo: 'entrada', valor_cents: 5000, status: 'pendente' }),
      tx({ id: '4', tipo: 'saida', valor_cents: 7000 }),
    ])).toBe(1501)
    expect(ticketMedio([])).toBe(0)
  })
})

describe('metas e orçamentos de gasto', () => {
  const meta = (p: Partial<Meta>): Meta => ({
    id: 'm', especie: 'orcamento', nome: 'Alimentação', contexto: 'empresa', categoria_id: 'cat',
    conta_id: null, alvo_cents: 50000, inicio: '2026-08-01', fim: null, ativa: true, ...p,
  })
  const gasto = (id: string, data: string, v = 10000) =>
    tx({ id, tipo: 'saida', categoria_id: 'cat', valor_cents: v, data_competencia: data })

  it('orçamento sem fim vale só o mês do início (não soma para sempre)', () => {
    expect(periodoDaMeta(meta({}))).toEqual({ de: '2026-08-01', ate: '2026-08-31' })
    expect(periodoDaMeta(meta({ inicio: '2026-02-01' })).ate).toBe('2026-02-28')
    const ts = [gasto('jul', '2026-07-31'), gasto('ago1', '2026-08-01'), gasto('ago2', '2026-08-31'), gasto('set', '2026-09-01')]
    expect(consumoDaMeta(meta({}), ts)).toBe(20000)
  })

  it('com fim, vale o período informado', () => {
    const ts = [gasto('ago', '2026-08-15'), gasto('set', '2026-09-15'), gasto('out', '2026-10-15')]
    expect(consumoDaMeta(meta({ fim: '2026-09-30' }), ts)).toBe(20000)
  })

  it('meta de acúmulo sem fim não termina e mede entrada', () => {
    expect(periodoDaMeta(meta({ especie: 'meta' })).ate).toBeNull()
    const ts = [
      tx({ id: 'e1', tipo: 'entrada', categoria_id: 'cat', valor_cents: 3000, data_competencia: '2026-08-10' }),
      tx({ id: 'e2', tipo: 'entrada', categoria_id: 'cat', valor_cents: 4000, data_competencia: '2027-03-10' }),
      gasto('s', '2026-08-10'),
    ]
    expect(consumoDaMeta(meta({ especie: 'meta' }), ts)).toBe(7000)
  })
})

describe('faturas do cartão', () => {
  const visa = conta({ id: 'v', tipo: 'cartao_credito', limite_cents: 1000_00, dia_fechamento: 2, dia_vencimento: 9 })
  const c = (p: Partial<Transacao> & { id: string }) =>
    tx({ tipo: 'saida', conta_id: 'v', status: 'pendente', valor_cents: 100_00, ...p })

  it('agrupa por vencimento e deriva a situação', () => {
    const ts = [
      c({ id: 'set', data_vencimento: '2026-09-09', status: 'realizado', recebido_cents: 100_00 }),
      c({ id: 'out1', data_vencimento: '2026-10-09', valor_cents: 300_00, recebido_cents: 100_00, status: 'parcial' }),
      c({ id: 'out2', data_vencimento: '2026-10-09', valor_cents: 50_00 }),
      c({ id: 'est', tipo: 'entrada', data_vencimento: '2026-10-09', valor_cents: 20_00 }),
      c({ id: 'nov', data_vencimento: '2026-11-09', valor_cents: 70_00 }),
      c({ id: 'semvenc', data_competencia: '2026-10-05', valor_cents: 10_00 }), // depois do fechamento (2) → vence 09/11
      tx({ id: 'outra', tipo: 'saida', conta_id: 'x', data_vencimento: '2026-10-09', valor_cents: 999_00 }),
    ]
    const f = faturasDoCartao(visa, ts, '2026-10-08')
    expect(f.map((x) => x.vencimento)).toEqual(['2026-09-09', '2026-10-09', '2026-11-09'])
    expect(f[0]).toMatchObject({ situacao: 'paga', total_cents: 100_00, falta_cents: 0, pago_cents: 100_00 })
    expect(f[1]).toMatchObject({ situacao: 'fechada', fechamento: '2026-10-02', total_cents: 330_00, falta_cents: 230_00, pago_cents: 100_00 })
    expect(f[2]).toMatchObject({ situacao: 'aberta', total_cents: 80_00 })
    expect(f[2].linhas.map((t) => t.id).sort()).toEqual(['nov', 'semvenc'])
    expect(faturasDoCartao(visa, ts, '2026-10-10')[1].situacao).toBe('atrasada')
  })

  it('fatura atual = primeira com saldo; sem saldo, a próxima a vencer', () => {
    const ts = [
      c({ id: 'a', data_vencimento: '2026-09-09', status: 'realizado', recebido_cents: 100_00 }),
      c({ id: 'b', data_vencimento: '2026-10-09' }),
      c({ id: 'n', data_vencimento: '2026-11-09' }),
    ]
    expect(indiceFaturaAtual(faturasDoCartao(visa, ts, '2026-10-08'), '2026-10-08')).toBe(1)
    const pagas = ts.map((t) => ({ ...t, status: 'realizado' as const, recebido_cents: t.valor_cents }))
    expect(indiceFaturaAtual(faturasDoCartao(visa, pagas, '2026-10-08'), '2026-10-08')).toBe(1)
    expect(indiceFaturaAtual([], '2026-10-08')).toBe(-1)
  })
})

describe('extrato da conta', () => {
  it('saldo acumulado linha a linha, mais recente primeiro, terminando no saldo da conta', () => {
    const cc = conta({ id: 'cc', saldo_inicial_cents: 100_00 })
    const ts = [
      tx({ id: 'e', tipo: 'entrada', conta_id: 'cc', valor_cents: 50_00, status: 'realizado', data_liquidacao: '2026-10-01' }),
      tx({ id: 's', tipo: 'saida', conta_id: 'cc', valor_cents: 30_00, status: 'realizado', data_liquidacao: '2026-10-02' }),
      tx({ id: 't', tipo: 'transferencia', conta_id: 'cc', conta_destino_id: 'cartao', valor_cents: 40_00, status: 'realizado', data_liquidacao: '2026-10-03' }),
      tx({ id: 'in', tipo: 'transferencia', conta_id: 'outra', conta_destino_id: 'cc', valor_cents: 5_00, status: 'realizado', data_liquidacao: '2026-10-03' }),
      tx({ id: 'aberta', tipo: 'saida', conta_id: 'cc', valor_cents: 99_00, status: 'pendente', data_vencimento: '2026-10-04' }),
    ]
    const ext = extratoDaConta(cc, ts)
    expect(ext.map((l) => [l.t.id, l.valor_cents, l.saldo_cents])).toEqual([
      ['in', 5_00, 85_00], ['t', -40_00, 80_00], ['s', -30_00, 120_00], ['e', 50_00, 150_00],
    ])
    expect(ext[0].saldo_cents).toBe(saldoConta(cc, ts))
  })
})

describe('cobertura e patrimônio', () => {
  const cc = conta({ id: 'cc', tipo: 'corrente', saldo_inicial_cents: -100_00, limite_cents: 300_00 })
  const visa = conta({ id: 'v', tipo: 'cartao_credito', dia_fechamento: 2, dia_vencimento: 9, limite_cents: 1000_00 })
  const ts = [
    tx({ id: 'atrasada', tipo: 'saida', conta_id: 'cc', valor_cents: 50_00, status: 'vencido', data_vencimento: '2026-10-01' }),
    tx({ id: 'semana', tipo: 'saida', conta_id: 'cc', valor_cents: 60_00, status: 'pendente', data_vencimento: '2026-10-14' }),
    tx({ id: 'longe', tipo: 'saida', conta_id: 'cc', valor_cents: 70_00, status: 'pendente', data_vencimento: '2026-10-20' }),
    tx({ id: 'receber', tipo: 'entrada', conta_id: 'cc', valor_cents: 500_00, status: 'pendente', data_vencimento: '2026-10-10' }),
    tx({ id: 'fat', tipo: 'saida', conta_id: 'v', valor_cents: 400_00, status: 'pendente', data_vencimento: '2026-10-09' }),
    tx({ id: 'fatnov', tipo: 'saida', conta_id: 'v', valor_cents: 80_00, status: 'pendente', data_vencimento: '2026-11-09' }),
  ]
  it('cobertura soma o que vence em 7 dias (com atrasadas e fatura) contra saldo + limite', () => {
    expect(cobertura([cc, visa], ts, '2026-10-08')).toEqual({
      a_pagar_cents: 510_00, disponivel_cents: 200_00, falta_cents: 310_00, itens: 3,
    })
  })
  it('saidasDaCobertura lista só o que a cobertura soma: saída aberta em conta ativa não-cartão', () => {
    const inativa = conta({ id: 'x', tipo: 'corrente', ativa: false })
    const extra = [
      tx({ id: 'inativa', tipo: 'saida', conta_id: 'x', valor_cents: 9_00, status: 'pendente', data_vencimento: '2026-10-10' }),
      tx({ id: 'sem-conta', tipo: 'saida', valor_cents: 9_00, status: 'pendente', data_vencimento: '2026-10-10' }),
    ]
    expect(saidasDaCobertura([cc, visa, inativa], [...ts, ...extra], '2026-10-08').map((t) => t.id))
      .toEqual(['atrasada', 'semana'])
  })
  it('patrimônio = contas − dívida dos cartões − empréstimos', () => {
    expect(patrimonioLiquido([cc, visa], ts, undefined, 1000_00)).toEqual({
      contas_cents: -100_00, cartoes_cents: 480_00, emprestimos_cents: 1000_00, liquido_cents: -1580_00,
    })
  })
})

describe('cheque especial', () => {
  it('usado é o saldo abaixo de zero; saldo positivo não usa nada', () => {
    expect(chequeEspecialUsado(-1637_74)).toBe(1637_74)
    expect(chequeEspecialUsado(0)).toBe(0)
    expect(chequeEspecialUsado(500_00)).toBe(0)
  })
})

describe('filtrarLancamentos', () => {
  const ts = [
    tx({ id: 'e', tipo: 'entrada', conta_id: 'cc', categoria_id: 'cat1', status: 'pendente', descricao: 'Projeto site', cliente_id: 'cli' }),
    tx({ id: 's', tipo: 'saida', conta_id: 'cc', categoria_id: 'cat2', status: 'realizado', descricao: 'Aluguel', fornecedor: 'Imobiliária' }),
    tx({ id: 't', tipo: 'transferencia', conta_id: 'pp', conta_destino_id: 'cc', status: 'realizado', descricao: 'Reserva' }),
    tx({ id: 'x', tipo: 'saida', conta_id: 'pp', status: 'cancelado', descricao: 'Estornada' }),
  ]
  const ids = (r: Transacao[]) => r.map((t) => t.id)

  it('sem filtro devolve tudo', () => {
    expect(ids(filtrarLancamentos(ts, {}))).toEqual(['e', 's', 't', 'x'])
  })
  it('conta casa origem e destino da transferência', () => {
    expect(ids(filtrarLancamentos(ts, { conta: 'cc' }))).toEqual(['e', 's', 't'])
    expect(ids(filtrarLancamentos(ts, { conta: 'pp' }))).toEqual(['t', 'x'])
  })
  it('categoria', () => {
    expect(ids(filtrarLancamentos(ts, { categoria: 'cat2' }))).toEqual(['s'])
  })
  it('status: em aberto junta os status ainda devidos', () => {
    expect(ids(filtrarLancamentos(ts, { status: 'aberto' }))).toEqual(['e'])
    expect(ids(filtrarLancamentos(ts, { status: 'realizado' }))).toEqual(['s', 't'])
    expect(ids(filtrarLancamentos(ts, { status: 'cancelado' }))).toEqual(['x'])
  })
  it('tipo', () => {
    expect(ids(filtrarLancamentos(ts, { tipo: 'transferencia' }))).toEqual(['t'])
  })
  it('busca por descrição, fornecedor e nome do cliente', () => {
    const nome = (id: string) => (id === 'cli' ? 'Vibra' : undefined)
    expect(ids(filtrarLancamentos(ts, { busca: 'aluguel' }))).toEqual(['s'])
    expect(ids(filtrarLancamentos(ts, { busca: 'imobili' }))).toEqual(['s'])
    expect(ids(filtrarLancamentos(ts, { busca: 'vibra' }, nome))).toEqual(['e'])
    expect(ids(filtrarLancamentos(ts, { busca: '   ' }))).toHaveLength(4)
  })
  it('filtros combinam (E)', () => {
    expect(ids(filtrarLancamentos(ts, { conta: 'cc', tipo: 'saida', status: 'realizado' }))).toEqual(['s'])
  })
})
