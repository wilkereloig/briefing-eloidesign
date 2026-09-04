// Estado inicial do financeiro: com zero contas, saldo, previsão e relatório
// mostram zero — e zero parece resultado, não configuração faltando. Esta
// lista diz o que falta, na ordem em que faz sentido fazer.
import type { Categoria, Conta, Transacao } from '../lib/tipos'

export interface Passo {
  chave: 'contas' | 'saldos' | 'cartoes' | 'categorias' | 'lancamentos'
  titulo: string
  detalhe: string
  feito: boolean
  /** Só informativo: cartão é opcional; quem não tem não precisa marcar. */
  opcional?: boolean
}

export function passosOnboarding(
  contas: Conta[], categorias: Categoria[], transacoes: Transacao[],
): Passo[] {
  const ativas = contas.filter((c) => c.ativa)
  const semCartao = ativas.filter((c) => c.tipo !== 'cartao_credito')
  const cartoes = ativas.filter((c) => c.tipo === 'cartao_credito')
  return [
    {
      chave: 'contas', titulo: 'Adicione suas contas',
      detalhe: 'Corrente, digital, dinheiro em espécie — onde o saldo vive.',
      feito: semCartao.length > 0,
    },
    {
      chave: 'saldos', titulo: 'Informe os saldos iniciais',
      detalhe: 'O saldo de hoje em cada conta. Sem isso o painel parte do zero.',
      // Feito quando alguma conta tem saldo inicial ou já existe lançamento
      // liquidado — quem começou do zero de propósito também está certo.
      feito: semCartao.some((c) => c.saldo_inicial_cents !== 0)
        || transacoes.some((t) => t.status === 'realizado'),
    },
    {
      chave: 'cartoes', titulo: 'Cadastre cartões',
      detalhe: 'Fechamento e vencimento fazem a fatura se calcular sozinha.',
      feito: cartoes.length > 0, opcional: true,
    },
    {
      chave: 'categorias', titulo: 'Revise as categorias',
      detalhe: 'Elas separam o gasto por tipo nos relatórios.',
      feito: categorias.some((c) => c.ativa),
    },
    {
      chave: 'lancamentos', titulo: 'Comece seus lançamentos',
      detalhe: 'Receita, despesa ou transferência — o resto se deriva.',
      feito: transacoes.length > 0,
    },
  ]
}

/** Onboarding fica visível até o essencial existir: conta e algum lançamento. */
export function precisaOnboarding(passos: Passo[]): boolean {
  return passos.some((p) => !p.feito && !p.opcional)
}
