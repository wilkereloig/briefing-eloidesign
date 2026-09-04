import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { orcamentos as orcamentosApi, type CatalogoItem } from '../../../lib/api'
import { fmtBRL } from '../../../lib/dinheiro'
import { useAbrirNovo } from '../../../lib/abrir-novo'
import { useFinancas } from '../../../lib/financas-store'
import { estaExpirado, linkPublico, VALIDADE_DIAS } from '../../../domain/orcamento'
import {
  Aviso, Botao, Chip, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import type { EstadoChip } from '../../../ui/tokens'
import type { OrcamentoRow, OrcamentoStatus } from '../../../lib/tipos'
import { FolhaExcluir, FolhaOrcamento } from '../folhas'

const ESTADO: Record<OrcamentoStatus, EstadoChip> = {
  rascunho: 'rascunho', enviado: 'enviado', aprovado: 'aprovado', recusado: 'atrasado',
}
const ROTULO: Record<OrcamentoStatus, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado',
}

export default function Orcamentos() {
  const { orcamentos, clientes, recarregar } = useFinancas()
  const [filtro, setFiltro] = useState<OrcamentoStatus | 'todos' | 'expirado'>('todos')
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [folha, setFolha] = useState<{ o?: OrcamentoRow; duplicar?: boolean } | null>(null)
  useAbrirNovo(() => setFolha({}))
  const [excluir, setExcluir] = useState<OrcamentoRow | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // null = a busca falhou (o botão de catálogo fica desabilitado, com explicação);
  // [] = o catálogo está vazio. Distinção que o painel antigo já fazia.
  const [catalogo, setCatalogo] = useState<CatalogoItem[] | null>(null)

  const carregarCatalogo = useCallback(() => {
    orcamentosApi.catalogo().then(setCatalogo).catch(() => setCatalogo(null))
  }, [])
  useEffect(carregarCatalogo, [carregarCatalogo])

  const nomeCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome])), [clientes])

  const executar = async (id: string, oque: string, acao: () => Promise<unknown>) => {
    setOcupado(id)
    try {
      await acao()
      setAviso({ texto: oque })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    } finally {
      setOcupado(null)
    }
  }

  const enviar = (o: OrcamentoRow) => executar(o.id, 'Proposta marcada como enviada',
    () => orcamentosApi.update({ id: o.id, status: 'enviado' }))

  // Reenviar é só empurrar `updated_at`: expirado é derivado dele, então
  // salvar o mesmo status devolve os 15 dias de validade.
  const reenviar = (o: OrcamentoRow) => executar(o.id, 'Validade renovada',
    () => orcamentosApi.update({ id: o.id, status: 'enviado' }))

  const decidir = (o: OrcamentoRow, status: 'aprovado' | 'recusado') => executar(o.id,
    status === 'aprovado' ? 'Proposta aprovada — projeto criado' : 'Proposta marcada como recusada',
    () => orcamentosApi.update({ id: o.id, status }))

  const copiarLink = async (o: OrcamentoRow) => {
    const url = linkPublico(o, window.location.origin)
    if (!url) return setAviso({ texto: 'Sem link ainda — recarregue a lista', tipo: 'erro' })
    try {
      await navigator.clipboard.writeText(url)
      setAviso({ texto: 'Link copiado' })
    } catch {
      setAviso({ texto: url, tipo: 'erro' })
    }
  }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return orcamentos
      .filter((o) => {
        if (filtro === 'expirado') return estaExpirado(o)
        if (filtro !== 'todos' && o.status !== filtro) return false
        if (clienteFiltro && o.cliente_id !== clienteFiltro) return false
        if (!q) return true
        const cli = (o.cliente_id ? nomeCliente.get(o.cliente_id) : o.cliente) ?? ''
        return (o.titulo ?? '').toLowerCase().includes(q) || cli.toLowerCase().includes(q)
      })
      .filter((o) => !clienteFiltro || o.cliente_id === clienteFiltro)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [orcamentos, filtro, clienteFiltro, busca, nomeCliente])

  const conta = (s: OrcamentoStatus) => orcamentos.filter((o) => o.status === s).length
  const expirados = orcamentos.filter((o) => estaExpirado(o)).length
  const emAberto = orcamentos.filter((o) => o.status === 'enviado')
  const aprovados = orcamentos.filter((o) => o.status === 'aprovado')

  return (
    <div className="tela pilha">
      <Cabecalho secao="Comercial" titulo="Orçamentos">
        <Botao variante="primario" onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={16} />Nova proposta
        </Botao>
      </Cabecalho>

      <Carga linhas={4}>
        {orcamentos.length === 0 ? (
          <Vazio icone="documentos" titulo="Nenhuma proposta ainda"
            instrucao="Monte a primeira proposta: escolha o cliente, some os itens e mande o link para ele aprovar."
            acao={<Botao variante="primario" onClick={() => setFolha({})}>Nova proposta</Botao>} />
        ) : (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Aguardando resposta" valor={String(emAberto.length)}
                nota={fmtBRL(Math.round(emAberto.reduce((s, o) => s + Number(o.valor_total || 0), 0) * 100))} />
              <Indicador rotulo="Aprovadas" valor={String(aprovados.length)} cor="acento"
                nota={fmtBRL(Math.round(aprovados.reduce((s, o) => s + Number(o.valor_total || 0), 0) * 100))} />
              <Indicador rotulo="Vencidas" valor={String(expirados)}
                cor={expirados ? 'coral' : undefined}
                nota={`Enviadas há mais de ${VALIDADE_DIAS} dias`} />
              <Indicador rotulo="Rascunhos" valor={String(conta('rascunho'))}
                nota="Ainda não enviadas" />
            </div>

            <Painel titulo="Filtros">
              <div className="abas" role="group" aria-label="Situação">
                <Pilula ativa={filtro === 'todos'} onClick={() => setFiltro('todos')}>
                  Todos · {orcamentos.length}
                </Pilula>
                {(Object.keys(ROTULO) as OrcamentoStatus[]).map((s) => (
                  <Pilula key={s} ativa={filtro === s} onClick={() => setFiltro(s)}>
                    {ROTULO[s]} · {conta(s)}
                  </Pilula>
                ))}
                {expirados > 0 && (
                  <Pilula ativa={filtro === 'expirado'} onClick={() => setFiltro('expirado')}>
                    Vencidas · {expirados}
                  </Pilula>
                )}
              </div>

              <div className="grade-filtros" style={{ marginTop: 'var(--espaco-03)' }}>
                <div className="campo">
                  <label htmlFor="orc-cliente">Cliente</label>
                  <select id="orc-cliente" className="campo-caixa" value={clienteFiltro}
                    onChange={(e) => setClienteFiltro(e.target.value)}>
                    <option value="">Todos os clientes</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="busca">
                  <Icone nome="pesquisa" tamanho={17} />
                  <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por título ou cliente" aria-label="Buscar proposta" />
                  {busca && (
                    <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                      <Icone nome="fechar" tamanho={14} />
                    </Botao>
                  )}
                </div>
              </div>
            </Painel>

            {lista.length === 0 ? (
              <Vazio icone="pesquisa" titulo="Nenhuma proposta nesse filtro"
                instrucao="Ajuste a situação ou o cliente."
                acao={<Botao onClick={() => { setFiltro('todos'); setClienteFiltro(''); setBusca('') }}>
                  Limpar filtros
                </Botao>} />
            ) : (
              <Painel titulo={`${lista.length} ${lista.length === 1 ? 'proposta' : 'propostas'}`}>
                <ul className="lista">
                  {lista.map((o) => {
                    const vencida = estaExpirado(o)
                    const cli = (o.cliente_id ? nomeCliente.get(o.cliente_id) : null) ?? o.cliente
                    const ocupadaAqui = ocupado === o.id
                    return (
                      <li key={o.id} className="lista-item">
                        <span className="celula">
                          <span className="t-ui espremer">
                            {o.numero ? `#${o.numero} · ` : ''}{o.titulo || 'Sem título'}
                          </span>
                          <span className="t-legenda espremer">
                            {cli || 'Sem cliente'}
                            {o.cliente_id ? '' : ' · não cadastrado'}
                            {` · ${dataCurta(o.created_at.slice(0, 10))}`}
                          </span>
                          {o.status === 'aprovado' && !o.servico_id && (
                            <span className="t-legenda espremer" style={{ color: 'var(--coral)' }}>
                              Aprovada, mas sem projeto criado
                            </span>
                          )}
                        </span>

                        <span className="t-valor">
                          {fmtBRL(Math.round(Number(o.valor_total || 0) * 100))}
                        </span>
                        <Chip estado={vencida ? 'atrasado' : ESTADO[o.status]}>
                          {vencida ? 'Vencida' : ROTULO[o.status]}
                        </Chip>

                        {o.status === 'rascunho' && (
                          <Botao compacto carregando={ocupadaAqui} onClick={() => void enviar(o)}>
                            Marcar enviada
                          </Botao>
                        )}
                        {o.status === 'enviado' && (
                          <>
                            {vencida && (
                              <Botao compacto carregando={ocupadaAqui} onClick={() => void reenviar(o)}>
                                Renovar validade
                              </Botao>
                            )}
                            <Botao compacto carregando={ocupadaAqui} onClick={() => void decidir(o, 'aprovado')}>
                              Aprovar
                            </Botao>
                            <Botao compacto variante="destrutivo" carregando={ocupadaAqui}
                              onClick={() => void decidir(o, 'recusado')}>
                              Recusar
                            </Botao>
                          </>
                        )}
                        {o.status === 'aprovado' && !o.servico_id && (
                          <Botao compacto carregando={ocupadaAqui}
                            onClick={() => void executar(o.id, 'Projeto criado',
                              () => orcamentosApi.gerarServico(o.id))}>
                            Criar projeto
                          </Botao>
                        )}

                        <Botao variante="icone" aria-label={`Copiar link de ${o.titulo || 'proposta'}`}
                          onClick={() => void copiarLink(o)}>
                          <Icone nome="compartilhar" tamanho={16} />
                        </Botao>
                        <Botao variante="icone" aria-label={`Duplicar ${o.titulo || 'proposta'}`}
                          onClick={() => setFolha({ o, duplicar: true })}>
                          <Icone nome="documentos" tamanho={16} />
                        </Botao>
                        <Botao variante="icone" aria-label={`Editar ${o.titulo || 'proposta'}`}
                          onClick={() => setFolha({ o })}>
                          <Icone nome="editar" tamanho={16} />
                        </Botao>
                        <Botao variante="icone" aria-label={`Excluir ${o.titulo || 'proposta'}`}
                          onClick={() => setExcluir(o)}>
                          <Icone nome="excluir" tamanho={16} />
                        </Botao>
                        {o.cliente_id && (
                          <Link to={`/admin/clientes/${o.cliente_id}`} className="btn btn-icone"
                            aria-label={`Abrir ficha de ${cli}`}>
                            <Icone nome="avancar" tamanho={16} />
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Painel>
            )}
          </>
        )}
      </Carga>

      {folha && (
        <FolhaOrcamento inicial={folha.o} duplicar={folha.duplicar} catalogo={catalogo}
          aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso({ texto: msg }); await recarregar() }} />
      )}
      {excluir && (
        <FolhaExcluir titulo={excluir.titulo || 'Proposta sem título'}
          consequencia={excluir.status === 'aprovado'
            ? 'Esta proposta foi aprovada. O projeto e o serviço criados a partir dela continuam — some só a proposta.'
            : 'A proposta some do painel e o link que o cliente tem para de funcionar.'}
          aoFechar={() => setExcluir(null)}
          aoConfirmar={async () => {
            await orcamentosApi.remover(excluir.id)
            setAviso({ texto: 'Proposta excluída' })
            await recarregar()
          }} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
