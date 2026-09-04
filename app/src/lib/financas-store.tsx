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
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import {
  briefingsApi, clientes as clientesApi, financas, orcamentos as orcamentosApi,
  servicos as servicosApi, subClientes as subClientesApi, tarefas as tarefasApi,
} from './api'
import type {
  BriefingLinkRow, Categoria, ClienteRow, Conferencia, Conta, Contexto, Meta, NotaFiscal,
  OrcamentoRow, Recorrencia, ServicoRow, SubClienteRow, TarefaRow, Transacao,
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

/** Último dia real do mês `mes` ('AAAA-MM') — fev/abr/jun/set/nov não têm 31. */
export function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

export const rotuloMes = (mes: string) =>
  new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1))
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

interface Estado {
  contas: Conta[]
  categorias: Categoria[]
  recorrencias: Recorrencia[]
  metas: Meta[]
  /** Últimas conferências de saldo, mais recente primeiro. */
  conferencias: Conferencia[]
  transacoes: Transacao[]
  notas: NotaFiscal[]
  clientes: ClienteRow[]
  subClientes: SubClienteRow[]
  servicos: ServicoRow[]
  orcamentos: OrcamentoRow[]
  /** Convites por token. Fonte única: a tela de Briefings e a fila de "Precisa
   *  de você" leem daqui, não cada uma da sua busca. */
  briefings: BriefingLinkRow[]
  /** Tarefas manuais (abertas + recentes). Hoje, calendário e ficha leem daqui. */
  tarefas: TarefaRow[]
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

type Dados = Pick<Estado, 'contas' | 'categorias' | 'recorrencias' | 'metas' | 'conferencias'
  | 'transacoes' | 'notas' | 'clientes' | 'subClientes' | 'servicos' | 'orcamentos'
  | 'briefings' | 'tarefas'>

const VAZIO: Dados = {
  contas: [], categorias: [], recorrencias: [], metas: [], conferencias: [],
  transacoes: [], notas: [], clientes: [], subClientes: [], servicos: [], orcamentos: [],
  briefings: [], tarefas: [],
}

export function FinancasProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mes, setMes] = useState(mesAtual)
  const [lente, setLente] = useState<Lente>('tudo')

  // Esqueleto só na primeira carga (ou troca de mês). Salvar uma folha chama
  // `recarregar` e a tela não pode piscar inteira por isso: os dados velhos
  // ficam na tela até os novos chegarem.
  const jaCarregou = useRef(false)
  const carregar = useCallback(async () => {
    if (!jaCarregou.current) setCarregando(true)
    setErro(null)
    try {
      // Materializa recorrências vencidas antes de ler: abrir o painel é o
      // gatilho natural: não há cron aqui. A chamada é idempotente por
      // vencimento, então abrir dez vezes no mesmo dia não duplica nada.
      await financas.gerarRecorrencias().catch(() => { /* não bloqueia a carga */ })

      const de = deslocarMes(mes, -11) + '-01'
      const ate = ultimoDiaDoMes(deslocarMes(mes, 12))
      const [ref, transacoes, notas, cli, sub, svc, orc, bri, tar] = await Promise.all([
        financas.bootstrap(),
        financas.transacoes({ de, ate, limite: 2000 }),
        financas.notas(),
        clientesApi.list(),
        // Marcas são rótulo, não dinheiro: se a edge ainda não conhece a action
        // (repo publicado antes do deploy), o painel abre sem elas em vez de
        // não abrir. Mesmo motivo do catch de orçamentos abaixo.
        subClientesApi.list().catch(() => [] as SubClienteRow[]),
        servicosApi.list(),
        // Orçamentos alimentam o funil de projetos (domain/projeto.ts). Falha
        // aqui não derruba o painel financeiro inteiro.
        orcamentosApi.list().catch(() => [] as OrcamentoRow[]),
        briefingsApi.convites().catch(() => [] as BriefingLinkRow[]),
        tarefasApi.list().catch(() => [] as TarefaRow[]),
      ])
      setDados({
        contas: ref.contas, categorias: ref.categorias,
        recorrencias: ref.recorrencias, metas: ref.metas,
        conferencias: ref.conferencias ?? [],
        transacoes, notas, clientes: cli, subClientes: sub, servicos: svc, orcamentos: orc,
        briefings: bri, tarefas: tar,
      })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      jaCarregou.current = true
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
  const { contas, categorias, clientes, subClientes } = useFinancas()
  return useMemo(() => ({
    conta: new Map(contas.map((c) => [c.id, c])),
    categoria: new Map(categorias.map((c) => [c.id, c])),
    cliente: new Map(clientes.map((c) => [c.id, c])),
    subCliente: new Map(subClientes.map((s) => [s.id, s])),
  }), [contas, categorias, clientes, subClientes])
}
