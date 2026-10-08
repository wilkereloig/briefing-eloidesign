// Estado financeiro compartilhado por todas as telas do /admin.
//
// Por que um store e não fetch por tela: o dashboard, o relatório e a tela de
// contas a receber leem o MESMO conjunto de transações. Buscando cada um por si,
// além do custo de rede, dois números da mesma coisa podem divergir porque cada
// tela pegou a janela num instante diferente. Aqui a carga é uma só.
//
// Transações: o histórico INTEIRO, numa carga só. Saldo de conta, saldo
// disponível, previsão e "recebido por cliente" somam desde o primeiro
// lançamento — com uma janela por competência eles mostravam um saldo que
// mudava ao trocar o mês. O mês em foco é só filtro derivado
// (useTransacoesDoMes); trocar de mês não busca nada.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import {
  briefingsApi, clientes as clientesApi, financas, orcamentos as orcamentosApi,
  servicos as servicosApi, subClientes as subClientesApi, tarefas as tarefasApi,
} from './api'
import type {
  BriefingLinkRow, Categoria, ClienteRow, Conferencia, Conta, Contexto, Emprestimo, Meta, NotaFiscal,
  OrcamentoRow, Recorrencia, SaldoServidor, ServicoRow, SubClienteRow, TarefaRow, Transacao,
} from './tipos'
import { competenciaDe, saldoConta } from '../domain/financeiro'
import { mesAtual } from '../domain/datas'

/** Filtro de contexto da interface: 'tudo' soma pessoal + empresa. */
export type Lente = 'tudo' | Contexto

// "Hoje" no fuso de Brasília — fonte única em domain/datas.ts.
export { hojeISO, mesAtual } from '../domain/datas'

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
  /** Só as ativas: é o que os seletores oferecem. */
  categorias: Categoria[]
  /** Ativas e inativas: nomeia o histórico e alimenta Planejamento › Categorias. */
  categoriasTodas: Categoria[]
  recorrencias: Recorrencia[]
  metas: Meta[]
  /** Últimas conferências de saldo, mais recente primeiro. */
  conferencias: Conferencia[]
  /** Ativos e encerrados; a tela filtra. */
  emprestimos: Emprestimo[]
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
  /** Saldo oficial por conta calculado no banco (histórico inteiro). Vazio se a
   *  edge/migração ainda não estiverem publicadas. */
  saldosServidor: SaldoServidor[]
  carregando: boolean
  erro: string | null
  /** Partes que falharam sem derrubar o painel (marcas, orçamentos, convites,
   *  tarefas) ou vieram incompletas. A tela mostra; nunca vira lista vazia muda. */
  falhas: Partial<Record<Parte, string>>
  /** Mês em foco, 'AAAA-MM'. */
  mes: string
  lente: Lente
  setMes: (m: string) => void
  setLente: (l: Lente) => void
  recarregar: () => Promise<void>
  /** Contexto a passar para as funções de domínio: undefined = consolidado. */
  contexto: Contexto | undefined
}

export type Parte = 'transacoes' | 'subClientes' | 'orcamentos' | 'briefings' | 'tarefas' | 'recorrencias' | 'saldos'

export const ROTULO_PARTE: Record<Parte, string> = {
  transacoes: 'lançamentos', subClientes: 'marcas', orcamentos: 'orçamentos',
  briefings: 'convites de briefing', tarefas: 'tarefas', recorrencias: 'contas fixas', saldos: 'saldos',
}

// Teto de uma chamada: a edge pagina até 20000 e diz se veio TUDO
// (`completo`, contagem no banco com os mesmos filtros). O aviso sai dessa
// resposta — nunca de adivinhar pelo tamanho da lista. Saldo oficial não
// depende disto: vem calculado no banco (bootstrap.saldos).
const LIMITE_TRANSACOES = 20000

// Recorrências: uma vez por sessão do navegador, não a cada recarga (cada folha
// salva chama recarregar). A rotina diária do banco (eloi_rotina_diaria) é o
// gatilho principal; isto cobre o período até o cron estar ligado.
let recorrenciasGeradasNestaSessao = false

/** Contas cujo saldo calculado na tela difere do saldo oficial do servidor. */
export function divergenciasDeSaldo(contas: Conta[], transacoes: Transacao[], saldos: SaldoServidor[]): string[] {
  const porId = new Map(saldos.map((x) => [x.conta_id, Number(x.saldo_cents)]))
  return contas.filter((c) => porId.has(c.id) && porId.get(c.id) !== saldoConta(c, transacoes)).map((c) => c.nome)
}

const Ctx = createContext<Estado>(null!)
export const useFinancas = () => useContext(Ctx)

type Dados = Pick<Estado, 'contas' | 'categoriasTodas' | 'recorrencias' | 'metas' | 'conferencias' | 'emprestimos'
  | 'transacoes' | 'notas' | 'clientes' | 'subClientes' | 'servicos' | 'orcamentos'
  | 'briefings' | 'tarefas' | 'saldosServidor'>

const VAZIO: Dados = {
  contas: [], categoriasTodas: [], recorrencias: [], metas: [], conferencias: [], emprestimos: [],
  transacoes: [], notas: [], clientes: [], subClientes: [], servicos: [], orcamentos: [],
  briefings: [], tarefas: [], saldosServidor: [],
}

export function FinancasProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [falhas, setFalhas] = useState<Partial<Record<Parte, string>>>({})
  const [mes, setMes] = useState(() => mesAtual())
  const [lente, setLente] = useState<Lente>('tudo')

  // Esqueleto só na primeira carga. Salvar uma folha chama `recarregar` e a
  // tela não pode piscar inteira por isso: os dados velhos ficam na tela até
  // os novos chegarem. Não depende do mês — trocar de mês não recarrega.
  const jaCarregou = useRef(false)
  const carregar = useCallback(async () => {
    if (!jaCarregou.current) setCarregando(true)
    setErro(null)
    try {
      // Partes secundárias não derrubam o painel, mas a falha fica registrada
      // e aparece na tela — lista vazia calada parece "não tem nada".
      const novasFalhas: Partial<Record<Parte, string>> = {}

      // Materializa recorrências antes de ler (uma vez por sessão). Idempotente
      // no banco; falha ou recorrência travada aparece em `falhas`, não some.
      if (!recorrenciasGeradasNestaSessao) {
        recorrenciasGeradasNestaSessao = true
        try {
          const g = await financas.gerarRecorrencias()
          if (g.erros?.length) {
            novasFalhas.recorrencias = `${g.erros.length} conta(s) fixa(s) não geraram a cobrança: ${g.erros[0].erro}`
          }
        } catch (e) {
          recorrenciasGeradasNestaSessao = false
          novasFalhas.recorrencias = `não foi possível gerar as contas fixas: ${(e as Error).message}`
        }
      }
      const parcial = <T,>(parte: Parte, p: Promise<T[]>) =>
        p.catch((e: unknown) => { novasFalhas[parte] = (e as Error).message; return [] as T[] })

      const [ref, lista, notas, cli, sub, svc, orc, bri, tar] = await Promise.all([
        financas.bootstrap(),
        financas.transacoes({ limite: LIMITE_TRANSACOES }),
        financas.notas(),
        clientesApi.list(),
        // Marcas são rótulo, não dinheiro: se a edge ainda não conhece a action
        // (repo publicado antes do deploy), o painel abre sem elas.
        parcial<SubClienteRow>('subClientes', subClientesApi.list()),
        servicosApi.list(),
        // Orçamentos alimentam o funil de projetos (domain/projeto.ts).
        parcial<OrcamentoRow>('orcamentos', orcamentosApi.list()),
        parcial<BriefingLinkRow>('briefings', briefingsApi.convites()),
        parcial<TarefaRow>('tarefas', tarefasApi.list()),
      ])
      const transacoes = lista.transacoes
      if (lista.completo === false) {
        novasFalhas.transacoes = `o servidor tem ${lista.total ?? 'mais'} lançamentos e devolveu ${transacoes.length}; ` +
          'listas e relatórios estão incompletos'
      } else if (lista.completo === undefined && transacoes.length >= LIMITE_TRANSACOES) {
        // Edge antiga (sem `completo`): só dá para afirmar no teto.
        novasFalhas.transacoes = `o servidor devolveu ${transacoes.length} lançamentos (teto); pode haver mais`
      }
      const saldosServidor = ref.saldos ?? []
      if (ref.saldos_erro) novasFalhas.saldos = `saldo oficial indisponível: ${ref.saldos_erro}`
      else if (lista.completo !== false) {
        const div = divergenciasDeSaldo(ref.contas, transacoes, saldosServidor)
        if (div.length) novasFalhas.saldos = `saldo da tela difere do servidor em: ${div.join(', ')}`
      }
      setDados({
        contas: ref.contas, categoriasTodas: ref.categorias,
        recorrencias: ref.recorrencias, metas: ref.metas,
        conferencias: ref.conferencias ?? [],
        emprestimos: ref.emprestimos ?? [],
        transacoes, notas, clientes: cli, subClientes: sub, servicos: svc, orcamentos: orc,
        briefings: bri, tarefas: tar, saldosServidor,
      })
      setFalhas(novasFalhas)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      jaCarregou.current = true
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const valor = useMemo<Estado>(() => ({
    ...dados,
    // Edge anterior a 2026-10-08 só devolvia ativas; `ativa !== false` aceita as duas.
    categorias: dados.categoriasTodas.filter((c) => c.ativa !== false),
    carregando,
    erro,
    falhas,
    mes,
    lente,
    setMes,
    setLente,
    recarregar: carregar,
    contexto: lente === 'tudo' ? undefined : lente,
  }), [dados, carregando, erro, falhas, mes, lente, carregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Transações do mês em foco, já filtradas pela lente ativa. */
export function useTransacoesDoMes() {
  const { transacoes, mes, contexto } = useFinancas()
  return useMemo(() => transacoes.filter((t) =>
    (!contexto || t.contexto === contexto) && competenciaDe(t) === mes), [transacoes, mes, contexto])
}

/** Índice id→nome para não repetir `.find()` em toda linha de tabela. */
export function useNomes() {
  const { contas, categoriasTodas, clientes, subClientes } = useFinancas()
  return useMemo(() => ({
    conta: new Map(contas.map((c) => [c.id, c])),
    // Inclui inativas: desativar uma categoria não apaga o nome do histórico.
    categoria: new Map(categoriasTodas.map((c) => [c.id, c])),
    cliente: new Map(clientes.map((c) => [c.id, c])),
    subCliente: new Map(subClientes.map((s) => [s.id, s])),
  }), [contas, categoriasTodas, clientes, subClientes])
}
