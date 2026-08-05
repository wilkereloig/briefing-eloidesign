import { useEffect, useMemo, useState } from 'react'
import { materiaisApi } from '../../../lib/api'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { MaterialRow, MaterialStatus } from '../../../lib/tipos'
import { Chip, Esqueleto, Icone, Indicador, Painel, Pilula, Vazio, Botao } from '../../../ui/componentes'
import { Cabecalho } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import type { EstadoChip } from '../../../ui/tokens'

// Materiais entregues ao cliente (eloi_materiais). O cliente só enxerga o que
// está 'publicado' — por isso o status é a informação principal da linha.
const STATUS: { chave: MaterialStatus; label: string; chip: EstadoChip }[] = [
  { chave: 'rascunho', label: 'Rascunho', chip: 'rascunho' },
  { chave: 'publicado', label: 'Publicado', chip: 'pago' },
  { chave: 'arquivado', label: 'Arquivado', chip: 'aberto' },
]
const INFO = new Map(STATUS.map((s) => [s.chave, s]))

export default function Entregas() {
  const { clientes } = useFinancas()
  const nomes = useNomes()
  const [materiais, setMateriais] = useState<MaterialRow[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<MaterialStatus | 'todos'>('todos')
  const [cliente, setCliente] = useState('')

  async function carregar() {
    setErro(null)
    try {
      setMateriais(await materiaisApi.list())
    } catch (e) {
      setErro((e as Error).message)
      setMateriais([])
    }
  }
  useEffect(() => { void carregar() }, [])

  const lista = useMemo(() => (materiais ?? [])
    .filter((m) => filtro === 'todos' || m.status === filtro)
    .filter((m) => !cliente || m.cliente_id === cliente)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [materiais, filtro, cliente])

  // Agrupa por cliente: entrega de marca é sempre lida "por quem recebeu".
  const grupos = useMemo(() => {
    const mapa = new Map<string, MaterialRow[]>()
    for (const m of lista) mapa.set(m.cliente_id, [...(mapa.get(m.cliente_id) ?? []), m])
    return [...mapa.entries()].map(([id, itens]) => ({
      id, nome: nomes.cliente.get(id)?.nome ?? 'Cliente removido',
      cor: nomes.cliente.get(id)?.cor || 'var(--roxo)', itens,
    }))
  }, [lista, nomes])

  const publicados = (materiais ?? []).filter((m) => m.status === 'publicado')

  return (
    <div className="tela pilha">
      <Cabecalho secao="Ferramentas" titulo="Entregas de marca">
        <a className="btn btn-secundario" href="/marca/" target="_blank" rel="noreferrer">
          Gerar variações<Icone nome="link-externo" tamanho={14} />
        </a>
      </Cabecalho>

      {materiais === null ? <Esqueleto linhas={4} altura={64} /> : (
        <>
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Materiais" valor={String(materiais.length)}
              nota={`${grupos.length} clientes atendidos`} />
            <Indicador rotulo="Publicados" valor={String(publicados.length)} cor="acento"
              nota="Visíveis no portal do cliente" />
            <Indicador rotulo="Rascunhos"
              valor={String(materiais.filter((m) => m.status === 'rascunho').length)}
              nota="Ainda não liberados" />
            <Indicador rotulo="Arquivados"
              valor={String(materiais.filter((m) => m.status === 'arquivado').length)}
              nota="Fora do portal" />
          </div>

          {erro && (
            <Painel erro titulo="Erro">
              <p className="t-msg" role="alert" style={{ color: 'var(--coral)' }}>{erro}</p>
              <Botao onClick={() => void carregar()} style={{ marginTop: 'var(--e-7)' }}>
                Tentar de novo
              </Botao>
            </Painel>
          )}

          <div className="abas" role="tablist" aria-label="Status do material">
            <Pilula ativa={filtro === 'todos'} role="tab" aria-selected={filtro === 'todos'}
              onClick={() => setFiltro('todos')}>Todos · {materiais.length}</Pilula>
            {STATUS.map((s) => (
              <Pilula key={s.chave} ativa={filtro === s.chave} role="tab"
                aria-selected={filtro === s.chave} onClick={() => setFiltro(s.chave)}>
                {s.label} · {materiais.filter((m) => m.status === s.chave).length}
              </Pilula>
            ))}
          </div>

          <div className="campo">
            <label htmlFor="filtro-cliente">Cliente</label>
            <select id="filtro-cliente" className="campo-caixa" value={cliente}
              onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {grupos.length === 0 ? (
            <Vazio icone="entrega" titulo="Nenhuma entrega neste filtro"
              instrucao="Materiais publicados aparecem no portal do cliente."
              acao={<Botao onClick={() => { setFiltro('todos'); setCliente('') }}>
                Limpar filtros
              </Botao>} />
          ) : grupos.map((g) => (
            <Painel key={g.id}
              titulo={<span className="linha">
                <span className="marca-grupo" style={{ background: g.cor }} aria-hidden />
                <span className="etiqueta etiqueta-acento">{g.nome}</span>
              </span>}
              acao={<span className="t-legenda">{g.itens.length}</span>}>
              <ul className="lista">
                {g.itens.map((m) => {
                  const info = INFO.get(m.status)!
                  return (
                    <li key={m.id} className="lista-item">
                      <Icone nome="entrega" tamanho={18} />
                      <span className="celula">
                        <span className="t-ui espremer">{m.titulo}</span>
                        <span className="t-legenda espremer">
                          {m.categoria}
                          {m.versao ? ` · v${m.versao}` : ''}
                          {` · ${dataCurta(m.created_at.slice(0, 10))}`}
                          {m.published_at ? ` · publicado em ${dataCurta(m.published_at.slice(0, 10))}` : ''}
                        </span>
                      </span>
                      <Chip estado={info.chip}>{info.label}</Chip>
                    </li>
                  )
                })}
              </ul>
            </Painel>
          ))}
        </>
      )}
    </div>
  )
}
