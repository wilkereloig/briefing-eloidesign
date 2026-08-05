// Estado financeiro compartilhado por todas as telas do /admin.
//
// Por que um store e não fetch por tela: o dashboard, o relatório e a tela de
// contas a receber leem o MESMO conjunto de transações. Buscando cada um por si,
// além do custo de rede, dois números da mesma coisa podem divergir porque cada
// tela pegou a janela num instante diferente. Aqui a janela é uma só.
//
// Janela carregada: 11 meses para trás (comparação e gráfico anual) e 12 para
// frente (parcelas e previsão). Histórico inteiro nunca entra — o briefing pede
// explicitamente para não carregar tudo de uma vez.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import {
  clientes as clientesApi, financas, orcamentos as orcamentosApi, servicos as servicosApi,
} from './api'
import type {
  Categoria, ClienteRow, Conta, Contexto, Meta, NotaFiscal, OrcamentoRow,
  Recorrencia, ServicoRow, Transacao,
} from './tipos'

/** Filtro de contexto da interface: 'tudo' soma pessoal + empresa. */
export type Lente = 'tudo' | Contexto

export const mesAtual = () => new Date().toISOString().slice(0, 7)
export const hojeISO = () => new Date().toISOString().slice(0, 10)

/** Primeiro dia do mês `desloc` meses a partir de `mes` ('AAAA-MM'). */
export function deslocarMes(mes: string, desloc: number): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + desloc, 1))
  return d.toISOString().slice(0, 7)
}

export const rotuloMes = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1))
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

interface Estado {
  contas: Conta[]
  categorias: Categoria[]
  recorrencias: Recorrencia[]
  metas: Meta[]
  transacoes: Transacao[]
  notas: NotaFiscal[]
  clientes: ClienteRow[]
  servicos: ServicoRow[]
  orcamentos: OrcamentoRow[]
  carregando: boolean
  erro: string | null
  /** Mês em foco, 'AAAA-MM'. */
  mes: string
  lente: Lente
  setMes: (m: string) => void
  setLente: (l: Lente) => void
  recarregar: () => Promise<void>
  /** Contexto a passar para as funções de domínio: undefined = consolidado. */
  contexto: Contexto | undefined
}

const Ctx = createContext<Estado>(null!)
export const useFinancas = () => useContext(Ctx)

type Dados = Pick<Estado, 'contas' | 'categorias' | 'recorrencias' | 'metas'
  | 'transacoes' | 'notas' | 'clientes' | 'servicos' | 'orcamentos'>

const VAZIO: Dados = {
  contas: [], categorias: [], recorrencias: [], metas: [],
  transacoes: [], notas: [], clientes: [], servicos: [], orcamentos: [],
}

export function FinancasProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mes, setMes] = useState(mesAtual)
  const [lente, setLente] = useState<Lente>('tudo')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      // Materializa recorrências vencidas antes de ler: abrir o painel é o
      // gatilho natural: não há cron aqui. A chamada é idempotente por
      // vencimento, então abrir dez vezes no mesmo dia não duplica nada.
      await financas.gerarRecorrencias().catch(() => { /* não bloqueia a carga */ })

      const de = deslocarMes(mes, -11) + '-01'
      const ate = deslocarMes(mes, 12) + '-31'
      const [ref, transacoes, notas, cli, svc, orc] = await Promise.all([
        financas.bootstrap(),
        financas.transacoes({ de, ate, limite: 2000 }),
        financas.notas(),
        clientesApi.list(),
        servicosApi.list(),
        // Orçamentos alimentam o funil de projetos (domain/projeto.ts). Falha
        // aqui não derruba o painel financeiro inteiro.
        orcamentosApi.list().catch(() => [] as OrcamentoRow[]),
      ])
      setDados({
        contas: ref.contas, categorias: ref.categorias,
        recorrencias: ref.recorrencias, metas: ref.metas,
        transacoes, notas, clientes: cli, servicos: svc, orcamentos: orc,
      })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [mes])

  useEffect(() => { void carregar() }, [carregar])

  const valor = useMemo<Estado>(() => ({
    ...dados,
    carregando,
    erro,
    mes,
    lente,
    setMes,
    setLente,
    recarregar: carregar,
    contexto: lente === 'tudo' ? undefined : lente,
  }), [dados, carregando, erro, mes, lente, carregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Transações do mês em foco, já filtradas pela lente ativa. */
export function useTransacoesDoMes() {
  const { transacoes, mes, contexto } = useFinancas()
  return useMemo(() => transacoes.filter((t) => {
    if (contexto && t.contexto !== contexto) return false
    const comp = t.data_competencia || t.data_vencimento || t.data_liquidacao
    return !!comp && comp.slice(0, 7) === mes
  }), [transacoes, mes, contexto])
}

/** Índice id→nome para não repetir `.find()` em toda linha de tabela. */
export function useNomes() {
  const { contas, categorias, clientes } = useFinancas()
  return useMemo(() => ({
    conta: new Map(contas.map((c) => [c.id, c])),
    categoria: new Map(categorias.map((c) => [c.id, c])),
    cliente: new Map(clientes.map((c) => [c.id, c])),
  }), [contas, categorias, clientes])
}
