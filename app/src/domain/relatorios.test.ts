import { describe, it, expect } from 'vitest'
import { aging, analiseGastos, compromissoMensal, aplicarFiltro, CARTAO_SEM_DETALHE, lugarDoGasto, montarCsv, porCliente, reaisCsv, resumoFiscal, resumoProjetos } from './relatorios'
import type { Categoria, Emprestimo, NotaFiscal, Recorrencia, ServicoRow, Transacao } from '../lib/tipos'
import type { Projeto } from './projeto'

const tx = (p: Partial<Transacao> & { id: string }): Transacao => ({
  tipo: 'entrada', contexto: 'empresa', status: 'pendente', descricao: 'x', valor_cents: 100, recebido_cents: 0,
  conta_id: null, conta_destino_id: null, categoria_id: null, cliente_id: 'c1', servico_id: null,
  fornecedor: null, data_competencia: '2026-09-01', data_vencimento: '2026-09-10', data_liquidacao: null,
  forma_pagamento: null, grupo_id: null, parcela_num: null, parcela_de: null,
  recorrencia_id: null, observacoes: null, origem: 'manual', importacao_chave: null, emprestimo_id: null, created_at: '2026-01-01', ...p,
})
const srv = (p: Partial<ServicoRow> & { id: string }): ServicoRow => ({
  cliente_id: 'c1', orcamento_id: null, sub_cliente_id: null, sub_cliente: null, nota_fiscal_id: null,
  prazo: null, descricao: 'Site', valor_cents: 5000, status_execucao: 'em_execucao', pago: false,
  data_pagamento: null, data_competencia: null, data_vencimento: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
  created_at: '2026-01-01', valor_sugerido_cents: null, valor_sugerido_em: null, valor_sugerido_observacao: null, ...p,
})
const hoje = '2026-09-15'

describe('filtro', () => {
  const servicos = new Map([['s1', { sub_cliente_id: 'm1', sub_cliente: 'Vibra' }]])
  it('período por competência, cliente e marca via serviço', () => {
    const ts = [
      tx({ id: 'a', data_competencia: '2026-08-15' }),
      tx({ id: 'b', data_competencia: '2026-09-15', servico_id: 's1' }),
      tx({ id: 'c', data_competencia: '2026-09-20', cliente_id: 'c2' }),
    ]
    expect(aplicarFiltro(ts, { de: '2026-09-01' }, servicos).map((t) => t.id)).toEqual(['b', 'c'])
    expect(aplicarFiltro(ts, { clienteId: 'c1' }, servicos).map((t) => t.id)).toEqual(['a', 'b'])
    expect(aplicarFiltro(ts, { subClienteId: 'm1' }, servicos).map((t) => t.id)).toEqual(['b'])
  })
})

describe('por cliente', () => {
  it('recebido, a receber, projetos e ticket; ordena por recebido', () => {
    const r = porCliente([
      tx({ id: 'a', status: 'realizado', valor_cents: 1000 }),
      tx({ id: 'b', status: 'parcial', valor_cents: 1000, recebido_cents: 400 }),
      tx({ id: 'c', cliente_id: 'c2', status: 'realizado', valor_cents: 5000 }),
      tx({ id: 'd', tipo: 'saida', status: 'realizado', valor_cents: 9999 }),
    ], [srv({ id: 's1' }), srv({ id: 's2' })])
    expect(r.map((l) => l.chave)).toEqual(['c2', 'c1'])
    expect(r[1]).toEqual({ chave: 'c1', recebido_cents: 1400, a_receber_cents: 600, projetos: 2, ticket_cents: 700 })
  })

  it('por marca usa o serviço da transação', () => {
    const r = porCliente(
      [tx({ id: 'a', status: 'realizado', valor_cents: 1000, servico_id: 's1' }), tx({ id: 'b', status: 'realizado', valor_cents: 1 })],
      [srv({ id: 's1', sub_cliente_id: 'm1' })], true)
    expect(r).toEqual([{ chave: 'm1', recebido_cents: 1000, a_receber_cents: 0, projetos: 1, ticket_cents: 1000 }])
  })
})

describe('aging de recebíveis', () => {
  it('vencido por faixa e a vencer acumulado por horizonte', () => {
    const a = aging([
      tx({ id: 'v1', data_vencimento: '2026-09-10', valor_cents: 100 }),
      tx({ id: 'v2', data_vencimento: '2026-07-01', valor_cents: 200 }),
      tx({ id: 'p1', data_vencimento: '2026-09-30', valor_cents: 300 }),
      tx({ id: 'p2', data_vencimento: '2026-11-01', valor_cents: 400 }),
      tx({ id: 'pago', data_vencimento: '2026-07-01', status: 'realizado', valor_cents: 999 }),
      tx({ id: 'saida', tipo: 'saida', data_vencimento: '2026-07-01', valor_cents: 999 }),
    ], hoje)
    expect(a.vencido_cents).toBe(300)
    expect(a.faixas.find((f) => f.faixa === '1-30')).toEqual({ faixa: '1-30', qtd: 1, cents: 100 })
    expect(a.faixas.find((f) => f.faixa === '61-90')).toEqual({ faixa: '61-90', qtd: 1, cents: 200 })
    expect(a.proximos.map((p) => p.cents)).toEqual([300, 700, 700])
  })
})

describe('projetos e fiscal', () => {
  it('resumo de projetos conta atrasado por prazo', () => {
    const p = (etapa: Projeto['etapa'], servico: ServicoRow | null, v = 100): Projeto =>
      ({ id: etapa, clienteId: 'c1', titulo: etapa, etapa, valorCents: v, orcamento: null, servico })
    const r = resumoProjetos([
      p('execucao', srv({ id: 'a', prazo: '2026-09-01' })),
      p('aprovado', srv({ id: 'b' }), 50),
      p('entregue', srv({ id: 'c', status_execucao: 'concluida', prazo: '2026-09-01' })),
      p('pago', srv({ id: 'd', status_execucao: 'concluida' })),
    ], hoje)
    expect(r.atrasados).toBe(1)
    expect(r.entregues).toBe(2)
    expect(r.em_execucao_cents).toBe(150)
    expect(r.porEtapa.find((e) => e.etapa === 'execucao')).toEqual({ etapa: 'execucao', qtd: 1, cents: 100 })
  })

  it('fiscal separa emitidas de pendentes e soma imposto', () => {
    const nf = (p: Partial<NotaFiscal> & { id: string }): NotaFiscal => ({
      cliente_id: 'c1', servico_id: null, transacao_id: null, numero: null, status: 'pendente',
      valor_cents: 100, imposto_cents: 6, competencia: '2026-09', emitida_em: null, enviada_em: null,
      arquivo_path: null, observacoes: null, ...p,
    })
    const r = resumoFiscal([
      nf({ id: 'a', status: 'emitida', emitida_em: '2026-09-02' }),
      nf({ id: 'b', status: 'enviada', emitida_em: '2026-09-03', valor_cents: 200, imposto_cents: 12 }),
      nf({ id: 'c', status: 'pronta' }),
      nf({ id: 'd', status: 'cancelada' }),
    ], {})
    expect(r).toEqual({ emitidas: 2, emitido_cents: 300, imposto_cents: 18, pendentes: 1, pendente_cents: 100 })
  })
})

describe('csv', () => {
  it('ponto e vírgula, BOM e aspas só quando precisa', () => {
    const csv = montarCsv(['a', 'b'], [['x;y', 1], ['plain', null]])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.slice(1)).toBe('a;b\n"x;y";1\nplain;')
    expect(reaisCsv(123456)).toBe('1234,56')
  })
})

describe('análise de gastos', () => {
  const cat = (id: string, nome: string, tipo: Categoria['tipo'] = 'saida'): Categoria =>
    ({ id, nome, contexto: 'pessoal', tipo, pai_id: null, cor: null, icone: null, ativa: true })
  const cats = [cat('ali', 'Alimentação'), cat('div', 'Empréstimos e dívidas'), cat('jur', 'Juros, tarifas e encargos'),
    cat('out', 'Outros'), cat('ren', 'Projetos', 'entrada'), cat('emp', 'Empréstimos recebidos', 'entrada'),
    cat('est', 'Estornos e devoluções', 'entrada'), cat('dco', 'Dinheiro de outras contas', 'entrada')]
  const g = (p: Partial<Transacao> & { id: string }) => tx({ contexto: 'pessoal', tipo: 'saida', cliente_id: null, ...p })
  const ts = [
    // compra no cartão AINDA NÃO PAGA conta como gasto do mês da compra
    g({ id: '1', categoria_id: 'ali', valor_cents: 3000, descricao: 'Padaria Central — Rio', data_competencia: '2026-08-05' }),
    g({ id: '2', categoria_id: 'ali', valor_cents: 2000, descricao: 'Padaria Central — Rio', data_competencia: '2026-09-05', status: 'realizado', recebido_cents: 2000 }),
    g({ id: '3', categoria_id: 'div', valor_cents: 10000, descricao: 'Empréstimo (3/12)', data_competencia: '2026-09-13' }),
    g({ id: '4', categoria_id: 'jur', valor_cents: 500, descricao: 'IOF', data_competencia: '2026-09-02' }),
    g({ id: '5', categoria_id: 'out', valor_cents: 7000, descricao: 'Fatura Cartão X out/2026 — parcial', data_competencia: '2026-09-30' }),
    g({ id: '6', tipo: 'transferencia', valor_cents: 99999, descricao: 'Pagamento da fatura', data_competencia: '2026-09-09' }),
    g({ id: '7', categoria_id: 'ali', valor_cents: 400, status: 'cancelado', data_competencia: '2026-09-01' }),
    g({ id: 'r', tipo: 'entrada', categoria_id: 'ren', valor_cents: 20000, data_competencia: '2026-09-10' }),
    g({ id: 'e', tipo: 'entrada', categoria_id: 'emp', valor_cents: 50000, data_competencia: '2026-09-10' }),
    g({ id: 's', tipo: 'entrada', categoria_id: 'est', valor_cents: 100, data_competencia: '2026-09-10' }),
    g({ id: 'd', tipo: 'entrada', categoria_id: 'dco', valor_cents: 9000, data_competencia: '2026-09-10' }),
    g({ id: 'x', categoria_id: 'ali', valor_cents: 1, data_competencia: '2026-06-30' }), // fora do período
  ]
  const a = analiseGastos(ts, cats, ['2026-08', '2026-09'])
  it('soma o valor original por competência; transferência, cancelado e fora do período não entram', () => {
    expect(a.total_cents).toBe(3000 + 2000 + 10000 + 500 + 7000)
    expect(a.media_mensal_cents).toBe(11250)
    expect(a.porMes.map((m) => m.saidas_cents)).toEqual([3000, 19500])
  })
  it('separa o que paga o passado (dívida + juros) e o cartão sem detalhe', () => {
    expect(a.porGrupo).toEqual({ dia_a_dia: 5000, divida: 10000, juros: 500, cartao_sem_detalhe: 7000 })
    expect(a.passado_cents).toBe(10500)
    expect(a.qtdPorGrupo).toEqual({ dia_a_dia: 2, divida: 1, juros: 1, cartao_sem_detalhe: 1 })
    expect(a.porCategoria.find((c) => c.categoria_id === CARTAO_SEM_DETALHE)?.total_cents).toBe(7000)
    expect(a.porCategoria.find((c) => c.categoria_id === 'out')).toBeUndefined()
  })
  it('renda é só entrada operacional: empréstimo, dinheiro de outra conta e estorno ficam de fora', () => {
    expect(a.renda_cents).toBe(20000)
    expect(a.porMes[1].renda_cents).toBe(20000)
  })
  it('ranking de lugares junta pelo nome e só olha o dia a dia', () => {
    expect(a.lugares).toEqual([{ nome: 'Padaria Central', total_cents: 5000, qtd: 2 }])
    expect(lugarDoGasto({ descricao: '99 — corrida', fornecedor: null })).toBe('99')
    expect(lugarDoGasto({ descricao: 'PIX para Fulano', fornecedor: null })).toBe('PIX para pessoas')
  })
})

describe('compromisso mensal', () => {
  const rec = (p: Partial<Recorrencia> & { id: string }): Recorrencia => ({
    nome: p.id, tipo: 'saida', contexto: 'pessoal', valor_cents: 1000, periodicidade: 'mensal', dia_cobranca: 10,
    conta_id: null, categoria_id: null, fornecedor: null, inicio: '2026-01-01', fim: null, proxima_cobranca: null,
    ativa: true, pausada_em: null, encerrada_em: null, observacoes: null, ...p,
  })
  const emp = (p: Partial<Emprestimo> & { id: string }): Emprestimo => ({
    nome: p.id, instituicao: null, contexto: 'pessoal', conta_id: null, categoria_id: null, valor_recebido_cents: 0,
    parcelas_total: 2, valor_parcela_cents: 5000, primeiro_vencimento: '2026-10-01', parcelas_pagas_antes: 0,
    ativo: true, observacoes: null, created_at: '2026-01-01', ...p,
  } as Emprestimo)
  it('soma contas fixas pelo mês e parcelas de empréstimo com saldo devedor', () => {
    const recs = [rec({ id: 'luz' }), rec({ id: 'seguro', valor_cents: 12000, periodicidade: 'anual' }),
      rec({ id: 'pausada', pausada_em: '2026-09-01' }), rec({ id: 'entrada', tipo: 'entrada' })]
    const parcela = tx({ id: 'p1', tipo: 'saida', emprestimo_id: 'e1', valor_cents: 5000, data_vencimento: '2026-11-01' })
    const c = compromissoMensal(recs, [emp({ id: 'e1' }), emp({ id: 'quitado' })], [parcela])
    expect(c.fixas_cents).toBe(1000 + 1000)
    expect(c.dividas_cents).toBe(5000)
    expect(c.itens.map((i) => i.nome)).toEqual(['e1', 'luz', 'seguro'])
  })
})
