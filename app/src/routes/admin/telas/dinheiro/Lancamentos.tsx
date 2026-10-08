import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas, useNomes, useTransacoesDoMes } from '../../../../lib/financas-store'
import { filtrarLancamentos, resultado, type StatusFiltro } from '../../../../domain/financeiro'
import type { TipoMov } from '../../../../lib/tipos'
import { Aviso, Botao, Icone, Indicador, Painel, Vazio } from '../../../../ui/componentes'
import { Carga, Paginacao, SeletorMes } from '../../../../ui/painel'
import { usePaginacao } from '../../../../ui/paginacao'
import { FolhaTransacao } from '../../FolhaTransacao'
import { FolhaImportar } from '../../FolhasExtrato'
import { Onboarding } from '../../Onboarding'
import { alternarCancelamento, CampoBusca, FolhasMov, LinhaMov, type FolhaMov } from './compartilhado'

const STATUS: Record<StatusFiltro, string> = { aberto: 'Em aberto', realizado: 'Realizado', cancelado: 'Cancelado' }
const TIPOS: Record<TipoMov, string> = { entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência' }
/** Valor da URL só vale se for uma chave conhecida; o resto é ignorado. */
const chave = <K extends string>(r: Record<K, string>, v: string | null) =>
  v && Object.hasOwn(r, v) ? (v as K) : undefined

/** Lançamentos do mês com filtros por conta, categoria, status e tipo. Os
 *  filtros moram na URL: a página da conta linka `?conta=<id>` e o recorte
 *  sobrevive a recarregar e a voltar do navegador. */
export default function Lancamentos() {
  const { transacoes, contas, categorias, mes, contexto, recarregar } = useFinancas()
  const doMes = useTransacoesDoMes()
  const nomes = useNomes()
  const hoje = hojeISO()

  const [params, setParams] = useSearchParams()
  const conta = params.get('conta') ?? ''
  const categoria = params.get('categoria') ?? ''
  const status = chave(STATUS, params.get('status'))
  const tipo = chave(TIPOS, params.get('tipo'))
  const filtrando = !!(conta || categoria || status || tipo)
  const mudar = (k: string, v: string) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (v) n.set(k, v)
    else n.delete(k)
    return n
  }, { replace: true })

  const [busca, setBusca] = useState('')
  const [folha, setFolha] = useState<FolhaMov | { tipo: 'nova' } | { tipo: 'importar' } | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (msg: string, tipo?: 'ok' | 'erro') => { setAviso({ texto: msg, tipo }); await recarregar() }
  const erro = (e: unknown) => setAviso({ texto: (e as Error).message, tipo: 'erro' })

  // A selecionada entra mesmo arquivada ou de outra lente: link velho não
  // pode virar um select dizendo "Todas" enquanto filtra por ela.
  const opContas = contas.filter((c) => c.id === conta || (c.ativa && (!contexto || c.contexto === contexto)))
  const opCategorias = categorias.filter((c) => c.id === categoria || (c.ativa && (!contexto || c.contexto === contexto)))

  const movimentos = useMemo(() => filtrarLancamentos(
    [...doMes].sort((a, b) => (b.data_vencimento || b.created_at).localeCompare(a.data_vencimento || a.created_at)),
    { conta, categoria, status, tipo, busca },
    (id) => nomes.cliente.get(id)?.nome,
  ), [doMes, conta, categoria, status, tipo, busca, nomes])
  const pag = usePaginacao(movimentos, 'dinheiro-movimentos')
  const r = useMemo(() => resultado(transacoes, contexto, mes), [transacoes, contexto, mes])

  const limpar = () => { setBusca(''); setParams({}, { replace: true }) }

  return (
    <div className="pilha" data-density="dense">
      <div className="linha">
        <SeletorMes />
        <Botao onClick={() => setFolha({ tipo: 'importar' })} className="col-desktop">Importar extrato</Botao>
        <Botao variante="primario" onClick={() => setFolha({ tipo: 'nova' })}>
          <Icone nome="adicionar" tamanho={16} />Lançar
        </Botao>
      </div>

      <Carga linhas={6}>
        <Onboarding />
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Resultado do mês" valor={fmtBRL(r.lucro_cents)}
            nota={`${fmtBRL(r.receita_cents)} recebido · ${fmtBRL(r.despesa_cents)} gasto`} />
        </div>

        <div className="grade-filtros" role="group" aria-label="Filtros dos lançamentos">
          <div className="campo">
            <label htmlFor="lanc-conta">Conta</label>
            <select id="lanc-conta" className="campo-caixa" value={conta} onChange={(e) => mudar('conta', e.target.value)}>
              <option value="">Todas</option>
              {opContas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="lanc-categoria">Categoria</label>
            <select id="lanc-categoria" className="campo-caixa" value={categoria}
              onChange={(e) => mudar('categoria', e.target.value)}>
              <option value="">Todas</option>
              {opCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="lanc-status">Status</label>
            <select id="lanc-status" className="campo-caixa" value={status ?? ''}
              onChange={(e) => mudar('status', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="lanc-tipo">Tipo</label>
            <select id="lanc-tipo" className="campo-caixa" value={tipo ?? ''} onChange={(e) => mudar('tipo', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <CampoBusca valor={busca} aoMudar={setBusca} />

        <Painel titulo={`${movimentos.length} ${movimentos.length === 1 ? 'lançamento' : 'lançamentos'}`}
          acao={filtrando ? <Botao compacto onClick={limpar}>Limpar filtros</Botao> : undefined}>
          {movimentos.length === 0 ? (
            filtrando || busca ? (
              <Vazio icone="pesquisa" titulo="Nada com esses filtros"
                instrucao="Nenhum lançamento do mês bate com o recorte."
                acao={<Botao onClick={limpar}>Limpar filtros</Botao>} />
            ) : (
              <Vazio icone="dinheiro" titulo="Nenhum lançamento neste mês"
                instrucao="Lance a primeira receita ou despesa do mês."
                acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'nova' })}>Lançar</Botao>} />
            )
          ) : (
            <>
              <ul className="lista">
                {/* Lista global: transferência sem sinal (sem conta em contexto). */}
                {pag.visiveis.map((t) => (
                  <LinhaMov key={t.id} t={t} nomes={nomes} hoje={hoje}
                    aoEditar={() => setFolha({ tipo: 'editar', t })}
                    aoCancelar={() => void alternarCancelamento(t, apos, erro)}
                    aoLiquidar={() => setFolha({ tipo: 'liquidar', t })}
                    aoExcluir={() => setFolha({ tipo: 'excluir', t })} />
                ))}
              </ul>
              <Paginacao {...pag} />
            </>
          )}
        </Painel>
      </Carga>

      {folha?.tipo === 'nova' && <FolhaTransacao aoFechar={fechar} aoSalvar={apos} />}
      {folha?.tipo === 'importar' && <FolhaImportar aoFechar={fechar} aoSalvar={apos} />}
      {folha && 't' in folha && <FolhasMov folha={folha} aoFechar={fechar} aoSalvar={apos} />}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
