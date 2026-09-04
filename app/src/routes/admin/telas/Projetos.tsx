import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { orcamentos as orcamentosApi, servicos as servicosApi } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { useAbrirNovo } from '../../../lib/abrir-novo'
import { hojeISO, rotuloMes, useFinancas, useNomes } from '../../../lib/financas-store'
import { dataCurta } from '../../../ui/formato'
import { juntarProjetos, mesDoProjeto, type Etapa, type Projeto } from '../../../domain/projeto'
import { Aviso, Botao, Chip, Icone, Indicador, Painel, Pilula, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro, SeletorMes } from '../../../ui/painel'
import type { EstadoChip } from '../../../ui/tokens'
import type { ServicoRow } from '../../../lib/tipos'
import { FolhaExcluir, FolhaServico } from '../folhas'

// Etapa é calculada de orçamento + serviço (domain/projeto.ts), não é coluna.
const ETAPAS: { chave: Etapa; label: string; chip: EstadoChip }[] = [
  { chave: 'orcamento', label: 'Orçamento', chip: 'rascunho' },
  { chave: 'aprovado', label: 'Aprovado', chip: 'fila' },
  { chave: 'execucao', label: 'Em execução', chip: 'execucao' },
  { chave: 'entregue', label: 'Entregue', chip: 'aberto' },
  { chave: 'pago', label: 'Pago', chip: 'pago' },
]
const ETAPA_INFO = new Map(ETAPAS.map((e) => [e.chave, e]))

/** Atalhos de pendência. Três de propósito: acima de 4 pílulas o inventário
 *  manda virar menu — cliente, marca e etapa já são `<select>` por isso. */
type Pendencia = 'sem_valor' | 'sem_nota' | 'entregue_nao_pago'
const PENDENCIAS: { chave: Pendencia; label: string; casa: (p: Projeto) => boolean }[] = [
  { chave: 'sem_valor', label: 'Sem valor', casa: (p) => p.valorCents === 0 },
  { chave: 'sem_nota', label: 'Sem nota', casa: (p) => !!p.servico && !p.servico.nf_numero },
  { chave: 'entregue_nao_pago', label: 'Entregue e não pago', casa: (p) => p.etapa === 'entregue' },
]

type Nomes = ReturnType<typeof useNomes>

// Cliente → marca. A marca é cabeçalho de sub-grupo, não etiqueta na linha —
// é assim que a F2 se lê (Vibra, ASUS, PLANO&PLANO).
function agruparPorCliente(itens: Projeto[], nomes: Nomes) {
  const porCliente = new Map<string, Projeto[]>()
  for (const p of itens) {
    const k = p.clienteId ?? 'sem-cliente'
    porCliente.set(k, [...(porCliente.get(k) ?? []), p])
  }
  const recente = (a: Projeto, b: Projeto) =>
    (mesDoProjeto(b) ?? '9999').localeCompare(mesDoProjeto(a) ?? '9999')
  return [...porCliente.entries()]
    .map(([id, itens]) => {
      const porMarca = new Map<string, Projeto[]>()
      for (const p of itens) {
        const k = p.servico?.sub_cliente_id ?? 'direto'
        porMarca.set(k, [...(porMarca.get(k) ?? []), p])
      }
      return {
        id,
        nome: id === 'sem-cliente' ? 'Sem cliente' : nomes.cliente.get(id)?.nome ?? 'Cliente removido',
        cor: id === 'sem-cliente' ? 'var(--linha-forte)' : nomes.cliente.get(id)?.cor || 'var(--roxo)',
        total: itens.reduce((s, p) => s + p.valorCents, 0),
        marcas: [...porMarca.entries()]
          .map(([mid, mitens]) => ({
            id: mid,
            nome: mid === 'direto' ? 'Trabalho direto' : nomes.subCliente.get(mid)?.nome ?? 'Marca removida',
            itens: [...mitens].sort(recente),
            total: mitens.reduce((s, p) => s + p.valorCents, 0),
          }))
          .sort((a, b) => b.total - a.total),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export default function Projetos() {
  const { orcamentos, servicos, subClientes, mes, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [etapa, setEtapa] = useState<Etapa | 'todos'>('todos')
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [marcaFiltro, setMarcaFiltro] = useState('')
  const [pendencia, setPendencia] = useState<Pendencia | null>(null)
  // Mesmo `mes` do store que Dinheiro, Notas e Calendário usam: a tela abre
  // no mês atual e o seletor do cabeçalho anda. Quem não tem mês (orçamento
  // em aberto, serviço sem data) aparece sempre, numa seção própria.
  const [busca, setBusca] = useState('')
  const [folha, setFolha] = useState<{ s?: ServicoRow } | null>(null)
  useAbrirNovo(() => setFolha({}))
  const [excluir, setExcluir] = useState<Projeto | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  /** Rascunho da edição de valor em linha: id → texto digitado. */
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})

  // Aprovar a proposta é o que converte orçamento em projeto: o trigger
  // trg_eloi_orcamento_aprovado cria o serviço vinculado no banco, então aqui
  // basta mudar o status e recarregar.
  const aprovar = async (p: Projeto) => {
    if (!p.orcamento) return
    try {
      await orcamentosApi.update({ id: p.orcamento.id, status: 'aprovado' })
      setAviso({ texto: 'Proposta aprovada — projeto criado' })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }

  // Sugestão de valor do cliente (portal-cliente.ts, servicos.sugerir_valor) fica
  // pendente até o dono aprovar aqui — só aprovar_valor_sugerido vira valor_cents oficial.
  const aprovarSugestao = async (p: Projeto) => {
    if (!p.servico) return
    try {
      await servicosApi.aprovarValorSugerido(p.servico.id)
      setAviso({ texto: 'Valor sugerido aprovado' })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }
  const rejeitarSugestao = async (p: Projeto) => {
    if (!p.servico) return
    try {
      await servicosApi.rejeitarValorSugerido(p.servico.id)
      setAviso({ texto: 'Sugestão rejeitada' })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }

  // Sair do campo salva. Só grava se o valor mudou de fato — sair sem digitar
  // nada não pode disparar escrita nem apagar a sugestão pendente do cliente.
  const salvarValor = async (s: ServicoRow) => {
    const texto = rascunhos[s.id]
    setRascunhos(({ [s.id]: _fora, ...resto }) => resto)
    if (texto === undefined) return
    const cents = centsDeBRL(texto)
    if (cents === s.valor_cents) return
    try {
      await servicosApi.salvarValores([{ id: s.id, valor_cents: cents }])
      setAviso({ texto: `Valor gravado: ${fmtBRL(cents)}` })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }

  const projetos = useMemo(() => juntarProjetos(orcamentos, servicos), [orcamentos, servicos])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const casaPendencia = PENDENCIAS.find((x) => x.chave === pendencia)?.casa
    return projetos.filter((p) => {
      // Orçamento sem serviço (sem mês) nunca some no filtro de mês — só
      // existe data depois que o orçamento é aprovado.
      const m = mesDoProjeto(p)
      if (m && m !== mes) return false
      if (etapa !== 'todos' && p.etapa !== etapa) return false
      if (clienteFiltro && p.clienteId !== clienteFiltro) return false
      if (marcaFiltro && p.servico?.sub_cliente_id !== marcaFiltro) return false
      if (casaPendencia && !casaPendencia(p)) return false
      if (!q) return true
      const cliente = p.clienteId ? nomes.cliente.get(p.clienteId)?.nome ?? '' : ''
      const marca = p.servico?.sub_cliente ?? ''
      return p.titulo.toLowerCase().includes(q) || cliente.toLowerCase().includes(q)
        || marca.toLowerCase().includes(q)
    })
  }, [projetos, etapa, clienteFiltro, marcaFiltro, pendencia, busca, nomes, mes])

  // Três níveis: mês → cliente → marca. Mês mais recente primeiro; o que
  // não tem mês (orçamento em aberto, serviço sem data) fica por último em
  // "Sem mês". Dentro do mês, cliente e marca como a F2 se lê.
  const meses = useMemo(() => {
    const porMes = new Map<string, Projeto[]>()
    for (const p of filtrados) {
      const k = mesDoProjeto(p) ?? 'sem'
      porMes.set(k, [...(porMes.get(k) ?? []), p])
    }
    return [...porMes.entries()]
      .sort(([a], [b]) => (a === 'sem' ? -1 : b === 'sem' ? 1 : a.localeCompare(b)) * -1)
      .map(([mes, itens]) => ({
        mes,
        rotulo: mes === 'sem' ? 'Sem mês' : rotuloMes(mes),
        total: itens.reduce((s, p) => s + p.valorCents, 0),
        qtd: itens.length,
        clientes: agruparPorCliente(itens, nomes),
      }))
  }, [filtrados, nomes])

  const porEtapa = (e: Etapa) => projetos.filter((p) => p.etapa === e)
  const marcasDoFiltro = subClientes.filter((m) => !clienteFiltro || m.cliente_id === clienteFiltro)
  const limparFiltros = () => {
    setEtapa('todos'); setBusca(''); setClienteFiltro(''); setMarcaFiltro('')
    setPendencia(null)
  }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Operação" titulo="Projetos e serviços">
        <SeletorMes />
        <Botao variante="primario" onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={16} />Novo serviço
        </Botao>
      </Cabecalho>

      <Carga linhas={5}>
        {projetos.length === 0 ? (
          <Vazio icone="projetos" titulo="Nenhum projeto ainda"
            instrucao="Registre um serviço aqui, ou aprove um orçamento para o projeto nascer da proposta."
            acao={<Botao variante="primario" onClick={() => setFolha({})}>Criar serviço</Botao>} />
        ) : (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Em execução" valor={String(porEtapa('execucao').length)}
                nota={fmtBRL(porEtapa('execucao').reduce((s, p) => s + p.valorCents, 0))} />
              <Indicador rotulo="Aguardando início" valor={String(porEtapa('aprovado').length)}
                nota="Aprovados na fila" />
              <Indicador rotulo="Entregues sem pagar" valor={String(porEtapa('entregue').length)}
                cor={porEtapa('entregue').length ? 'coral' : undefined}
                nota={fmtBRL(porEtapa('entregue').reduce((s, p) => s + p.valorCents, 0))} />
              <Indicador rotulo="Em orçamento" valor={String(porEtapa('orcamento').length)}
                nota="Ainda não aprovados" />
            </div>

            <Painel titulo="Filtros">
              <div className="grade-filtros">
                <div className="campo">
                  <label htmlFor="f-cliente">Cliente</label>
                  <select id="f-cliente" className="campo-caixa" value={clienteFiltro}
                    onChange={(e) => { setClienteFiltro(e.target.value); setMarcaFiltro('') }}>
                    <option value="">Todos os clientes</option>
                    {[...nomes.cliente.values()].map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="f-marca">Marca</label>
                  <select id="f-marca" className="campo-caixa" value={marcaFiltro}
                    onChange={(e) => setMarcaFiltro(e.target.value)}>
                    <option value="">Todas as marcas</option>
                    {marcasDoFiltro.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="f-etapa">Etapa</label>
                  <select id="f-etapa" className="campo-caixa" value={etapa}
                    onChange={(e) => setEtapa(e.target.value as Etapa | 'todos')}>
                    <option value="todos">Todas as etapas</option>
                    {ETAPAS.map((e) => (
                      <option key={e.chave} value={e.chave}>{e.label} · {porEtapa(e.chave).length}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="abas" role="group" aria-label="Pendências">
                {PENDENCIAS.map((x) => (
                  <Pilula key={x.chave} ativa={pendencia === x.chave}
                    onClick={() => setPendencia(pendencia === x.chave ? null : x.chave)}>
                    {x.label} · {projetos.filter(x.casa).length}
                  </Pilula>
                ))}
              </div>

              <div className="busca" style={{ marginTop: 'var(--e-4)' }}>
                <Icone nome="pesquisa" tamanho={17} />
                <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por projeto, cliente ou marca" aria-label="Buscar projeto" />
                {busca && (
                  <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                    <Icone nome="fechar" tamanho={14} />
                  </Botao>
                )}
              </div>

              <p className="t-legenda" style={{ marginTop: 'var(--e-3)' }}>
                {filtrados.length} de {projetos.length} projetos · {rotuloMes(mes)}
              </p>
            </Painel>

            {meses.length === 0 ? (
              <Vazio icone="pesquisa" titulo={`Nenhum projeto em ${rotuloMes(mes)}`}
                instrucao="Troque o mês no cabeçalho ou ajuste cliente, marca e etapa."
                acao={<Botao onClick={limparFiltros}>Limpar filtros</Botao>} />
            ) : meses.map((m) => (
              <section key={m.mes} className="pilha" aria-label={m.rotulo}>
                <div className="grupo-marca-cabeca">
                  <span className="etiqueta etiqueta-acento">{m.rotulo}</span>
                  <span className="t-legenda">{m.qtd} · {fmtBRL(m.total)}</span>
                </div>
                {m.clientes.map((g) => (
              <Painel key={g.id}
                titulo={<span className="linha">
                  <span className="marca-grupo" style={{ background: g.cor }} aria-hidden />
                  <span className="etiqueta etiqueta-acento">{g.nome}</span>
                </span>}
                acao={<Dinheiro cents={g.total} className="t-valor" />}>
                {g.marcas.map((m) => (
                  <div key={m.id} className="grupo-marca">
                    {/* Sub-grupo só aparece quando há mais de uma marca: com uma
                        só, o cabeçalho seria ruído repetindo o painel inteiro. */}
                    {g.marcas.length > 1 && (
                      <div className="grupo-marca-cabeca">
                        <span className="etiqueta-mini">{m.nome}</span>
                        <span className="t-legenda">{m.itens.length} · {fmtBRL(m.total)}</span>
                      </div>
                    )}
                    <ul className="lista">
                      {m.itens.map((p) => {
                        const info = ETAPA_INFO.get(p.etapa)!
                        const semNota = !p.servico?.nf_numero && (p.etapa === 'pago' || p.etapa === 'entregue')
                        const editandoValor = p.servico && !p.servico.pago
                        return (
                          <li key={p.id} className="lista-item"
                            data-atrasada={p.servico?.prazo && p.servico.prazo < hoje && p.servico.status_execucao !== 'concluida' ? 'true' : undefined}>
                            <span className="celula">
                              <span className="t-ui espremer">{p.titulo}</span>
                              <span className="t-legenda espremer">
                                {[
                                  p.servico?.nf_numero ? `NF ${p.servico.nf_numero}` : semNota ? 'Sem nota fiscal' : null,
                                  p.servico?.data_competencia ? dataCurta(p.servico.data_competencia)
                                    : p.servico?.data_pagamento ? `pago ${dataCurta(p.servico.data_pagamento)}` : null,
                                  p.servico?.prazo && p.servico.status_execucao !== 'concluida'
                                    ? (p.servico.prazo < hoje ? `entrega venceu ${dataCurta(p.servico.prazo)}` : `entrega ${dataCurta(p.servico.prazo)}`)
                                    : null,
                                ].filter(Boolean).join(' · ')}
                              </span>
                              {p.servico?.valor_sugerido_cents != null && (
                                <span className="t-legenda espremer" style={{ color: 'var(--acento)' }}>
                                  Cliente sugeriu {fmtBRL(p.servico.valor_sugerido_cents)}
                                  {p.servico.valor_sugerido_observacao ? ` — "${p.servico.valor_sugerido_observacao}"` : ''}
                                </span>
                              )}
                            </span>
                            {/* estado da NF por ícone além da cor (acessibilidade) */}
                            <span className="col-desktop" style={{ color: semNota ? 'var(--coral)' : 'var(--acento)' }}>
                              <Icone nome="nota-fiscal" tamanho={16}
                                rotulo={p.servico?.nf_numero ? 'Nota anexada' : 'Sem nota fiscal'} />
                            </span>
                            {editandoValor ? (
                              <input className="campo-caixa valor-linha" inputMode="decimal"
                                aria-label={`Valor de ${p.titulo}`}
                                value={rascunhos[p.servico!.id] ?? (p.valorCents ? fmtBRL(p.valorCents) : '')}
                                placeholder="R$ 0,00"
                                onChange={(e) => setRascunhos((r) => ({ ...r, [p.servico!.id]: e.target.value }))}
                                onBlur={() => void salvarValor(p.servico!)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                            ) : (
                              <Dinheiro cents={p.valorCents} className="t-valor" />
                            )}
                            <Chip estado={info.chip}>{info.label}</Chip>
                            {p.etapa === 'orcamento' && (
                              <Botao compacto onClick={() => void aprovar(p)}>Aprovar</Botao>
                            )}
                            {p.servico?.valor_sugerido_cents != null && (
                              <>
                                <Botao compacto onClick={() => void aprovarSugestao(p)}>Aprovar valor</Botao>
                                <Botao compacto variante="destrutivo" onClick={() => void rejeitarSugestao(p)}>Rejeitar</Botao>
                              </>
                            )}
                            {p.servico && (
                              <Botao variante="icone" aria-label={`Editar ${p.titulo}`}
                                onClick={() => setFolha({ s: p.servico! })}>
                                <Icone nome="editar" tamanho={16} />
                              </Botao>
                            )}
                            {p.servico && (
                              <Botao variante="icone" aria-label={`Excluir ${p.titulo}`}
                                onClick={() => setExcluir(p)}>
                                <Icone nome="excluir" tamanho={16} />
                              </Botao>
                            )}
                            {p.clienteId && (
                              <Link to={`/admin/clientes/${p.clienteId}`} className="btn btn-icone"
                                aria-label={`Abrir ficha de ${g.nome}`}>
                                <Icone nome="avancar" tamanho={16} />
                              </Link>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </Painel>
                ))}
              </section>
            ))}
          </>
        )}
      </Carga>

      {folha && (
        <FolhaServico inicial={folha.s} aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso({ texto: msg }); await recarregar() }} />
      )}
      {excluir?.servico && (
        <FolhaExcluir titulo={excluir.titulo}
          consequencia="Some da lista, dos totais do cliente e da marca. Serviço com nota fiscal ou pagamento registrado não é excluído — o servidor recusa e explica."
          aoFechar={() => setExcluir(null)}
          aoConfirmar={async () => {
            await servicosApi.remover(excluir.servico!.id)
            setAviso({ texto: 'Serviço excluído' })
            await recarregar()
          }} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
