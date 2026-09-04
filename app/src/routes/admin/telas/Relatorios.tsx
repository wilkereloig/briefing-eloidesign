import { useMemo, useState } from 'react'
import { financas } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { baixarCsv } from '../../../lib/exportar'
import { deslocarMes, hojeISO, useFinancas, useNomes } from '../../../lib/financas-store'
import {
  agrupar, consumoOrcamento, previsaoCaixa, resultado, valorLiquidado,
} from '../../../domain/financeiro'
import {
  aging, aplicarFiltro, porCliente, reaisCsv, resumoFiscal, resumoProjetos, type Filtro,
} from '../../../domain/relatorios'
import { juntarProjetos } from '../../../domain/projeto'
import type { Contexto, Meta } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Etiqueta, Folha, Icone, Indicador, Painel, Pilula, Progresso, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro, SeletorLente } from '../../../ui/painel'

type Aba = 'resultado' | 'clientes' | 'projetos' | 'recebiveis' | 'fiscal' | 'categorias' | 'previsao' | 'metas'
const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'resultado', label: 'Resultado' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'projetos', label: 'Projetos' },
  { chave: 'recebiveis', label: 'Recebíveis' },
  { chave: 'fiscal', label: 'Fiscal' },
  { chave: 'categorias', label: 'Por categoria' },
  { chave: 'previsao', label: 'Previsão' },
  { chave: 'metas', label: 'Metas e orçamentos' },
]

const ROTULO_ETAPA = {
  orcamento: 'Em proposta', aprovado: 'Aprovado', execucao: 'Em execução', entregue: 'Entregue', pago: 'Pago',
} as const

export default function Relatorios() {
  const {
    contas, transacoes, metas, servicos, orcamentos, notas, clientes, subClientes, mes, contexto, recarregar,
  } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [aba, setAba] = useState<Aba>('resultado')
  const [folha, setFolha] = useState<Meta | 'nova' | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  // Um filtro para todas as abas: período por competência, cliente, marca.
  // A lente pessoal/empresa continua no cabeçalho, como nas outras telas.
  const [filtro, setFiltro] = useState<Filtro>({})
  const [porMarca, setPorMarca] = useState(false)
  const temFiltro = !!(filtro.de || filtro.ate || filtro.clienteId || filtro.subClienteId)

  const servicoMapa = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos])
  // Base de todas as abas: lente + filtro. O gráfico de 12 meses ignora o
  // período (ele É o período) mas respeita cliente e marca.
  const base = useMemo(() => aplicarFiltro(
    transacoes.filter((t) => !contexto || t.contexto === contexto), filtro, servicoMapa),
    [transacoes, contexto, filtro, servicoMapa])
  const baseSemPeriodo = useMemo(() => aplicarFiltro(
    transacoes.filter((t) => !contexto || t.contexto === contexto),
    { clienteId: filtro.clienteId, subClienteId: filtro.subClienteId }, servicoMapa),
    [transacoes, contexto, filtro.clienteId, filtro.subClienteId, servicoMapa])
  const servicosFiltrados = useMemo(() => servicos.filter((s) =>
    (!filtro.clienteId || s.cliente_id === filtro.clienteId)
    && (!filtro.subClienteId || s.sub_cliente_id === filtro.subClienteId)),
    [servicos, filtro.clienteId, filtro.subClienteId])

  const linhasCliente = useMemo(() => porCliente(base, servicosFiltrados, porMarca), [base, servicosFiltrados, porMarca])
  const projetos = useMemo(() => resumoProjetos(
    juntarProjetos(orcamentos.filter((o) => !filtro.clienteId || o.cliente_id === filtro.clienteId), servicosFiltrados), hoje),
    [orcamentos, servicosFiltrados, filtro.clienteId, hoje])
  const recebiveis = useMemo(() => aging(base, hoje), [base, hoje])
  const fiscal = useMemo(() => resumoFiscal(notas, filtro), [notas, filtro])

  const nomeChave = (k: string) => porMarca
    ? nomes.subCliente.get(k)?.nome ?? 'Marca removida'
    : nomes.cliente.get(k)?.nome ?? 'Cliente removido'

  // Exportação: o que a aba mostra, em CSV com ; e vírgula decimal.
  const exportar = () => {
    const sufixo = filtro.de || filtro.ate ? `-${filtro.de ?? 'inicio'}-a-${filtro.ate ?? 'hoje'}` : `-${mes}`
    if (aba === 'clientes') {
      baixarCsv(`${porMarca ? 'marcas' : 'clientes'}${sufixo}`,
        [porMarca ? 'Marca' : 'Cliente', 'Recebido', 'A receber', 'Projetos', 'Ticket médio'],
        linhasCliente.map((l) => [nomeChave(l.chave), reaisCsv(l.recebido_cents), reaisCsv(l.a_receber_cents), l.projetos, reaisCsv(l.ticket_cents)]))
    } else if (aba === 'recebiveis') {
      const abertas = base.filter((t) => t.tipo === 'entrada' && t.status !== 'cancelado' && t.status !== 'realizado')
      baixarCsv(`recebiveis${sufixo}`,
        ['Vencimento', 'Descrição', 'Cliente', 'Combinado', 'Recebido', 'Restante', 'Status'],
        abertas.map((t) => [t.data_vencimento, t.descricao, t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : '',
          reaisCsv(t.valor_cents), reaisCsv(t.recebido_cents), reaisCsv(t.valor_cents - t.recebido_cents), t.status]))
    } else if (aba === 'categorias') {
      baixarCsv(`despesas-por-categoria${sufixo}`, ['Categoria', 'Total', 'Lançamentos'],
        porCategoria.map((f) => [nomes.categoria.get(f.chave)?.nome ?? 'Sem categoria', reaisCsv(f.total_cents), f.qtd]))
    } else if (aba === 'fiscal') {
      baixarCsv(`notas${sufixo}`, ['Número', 'Cliente', 'Status', 'Valor', 'Imposto', 'Emitida em', 'Competência'],
        notas.filter((n) => !filtro.clienteId || n.cliente_id === filtro.clienteId)
          .map((n) => [n.numero, n.cliente_id ? nomes.cliente.get(n.cliente_id)?.nome : '', n.status, reaisCsv(n.valor_cents), reaisCsv(n.imposto_cents), n.emitida_em, n.competencia]))
    } else {
      // Resultado, projetos e previsão: exporta os lançamentos do recorte.
      baixarCsv(`lancamentos${sufixo}`,
        ['Competência', 'Vencimento', 'Liquidação', 'Tipo', 'Descrição', 'Cliente', 'Categoria', 'Conta', 'Combinado', 'Liquidado', 'Status', 'Origem'],
        base.filter((t) => t.tipo !== 'transferencia').map((t) => [
          t.data_competencia, t.data_vencimento, t.data_liquidacao, t.tipo, t.descricao,
          t.cliente_id ? nomes.cliente.get(t.cliente_id)?.nome : '', t.categoria_id ? nomes.categoria.get(t.categoria_id)?.nome : '',
          t.conta_id ? nomes.conta.get(t.conta_id)?.nome : '', reaisCsv(t.valor_cents), reaisCsv(valorLiquidado(t)), t.status, t.origem,
        ]))
    }
  }

  const encerrarMeta = async (m: Meta) => {
    try {
      await financas.desativarMeta(m.id)
      setAviso({ texto: 'Meta encerrada' })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }

  // Doze meses terminando no mês em foco. A janela do store cobre exatamente
  // isso, então nenhuma coluna aparece truncada por falta de dado carregado.
  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => deslocarMes(mes, i - 11)), [mes])

  const serie = useMemo(() => meses.map((m) => {
    const r = resultado(baseSemPeriodo, contexto, m)
    return { mes: m, ...r }
  }), [meses, baseSemPeriodo, contexto])

  const teto = Math.max(...serie.map((s) => Math.max(s.receita_cents, s.despesa_cents)), 1)
  const totalAno = serie.reduce((acc, s) => ({
    receita: acc.receita + s.receita_cents,
    despesa: acc.despesa + s.despesa_cents,
  }), { receita: 0, despesa: 0 })

  const porCategoria = useMemo(() => agrupar(base, (t) => t.categoria_id, 'saida'), [base])

  const cenarios = useMemo(
    () => previsaoCaixa(contas, transacoes, hoje, 90, contexto), [contas, transacoes, hoje, contexto])

  const metasVisiveis = metas.filter((m) => !contexto || m.contexto === contexto)

  return (
    <div className="tela pilha">
      <Cabecalho secao="Análise" titulo="Relatórios">
        <SeletorLente />
        <Botao onClick={exportar} className="nao-imprime">
          <Icone nome="baixar" tamanho={16} />CSV
        </Botao>
        <Botao onClick={() => window.print()} className="col-desktop nao-imprime">Imprimir</Botao>
      </Cabecalho>

      <Carga linhas={5}>
        <div className="grade-filtros nao-imprime" role="group" aria-label="Filtros">
          <div className="campo">
            <label htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" className="campo-caixa" value={filtro.de ?? ''}
              onChange={(e) => setFiltro({ ...filtro, de: e.target.value || undefined })} />
          </div>
          <div className="campo">
            <label htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" className="campo-caixa" value={filtro.ate ?? ''}
              onChange={(e) => setFiltro({ ...filtro, ate: e.target.value || undefined })} />
          </div>
          <div className="campo">
            <label htmlFor="rel-cliente">Cliente</label>
            <select id="rel-cliente" className="campo-caixa" value={filtro.clienteId ?? ''}
              onChange={(e) => setFiltro({ ...filtro, clienteId: e.target.value || undefined, subClienteId: undefined })}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {filtro.clienteId && subClientes.some((m) => m.cliente_id === filtro.clienteId) && (
            <div className="campo">
              <label htmlFor="rel-marca">Marca</label>
              <select id="rel-marca" className="campo-caixa" value={filtro.subClienteId ?? ''}
                onChange={(e) => setFiltro({ ...filtro, subClienteId: e.target.value || undefined })}>
                <option value="">Todas</option>
                {subClientes.filter((m) => m.cliente_id === filtro.clienteId).map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {temFiltro && (
          <p className="t-legenda">
            Recorte ativo: {[
              filtro.de || filtro.ate ? `${filtro.de ?? 'início'} → ${filtro.ate ?? 'hoje'}` : null,
              filtro.clienteId ? nomes.cliente.get(filtro.clienteId)?.nome : null,
              filtro.subClienteId ? nomes.subCliente.get(filtro.subClienteId)?.nome : null,
            ].filter(Boolean).join(' · ')}.{' '}
            <button type="button" className="btn-texto t-legenda" onClick={() => setFiltro({})}>Limpar</button>
          </p>
        )}

        <div className="abas" role="tablist" aria-label="Relatórios">
          {ABAS.map((a) => (
            <Pilula key={a.chave} ativa={aba === a.chave} role="tab" aria-selected={aba === a.chave}
              onClick={() => setAba(a.chave)}>{a.label}</Pilula>
          ))}
        </div>

        {aba === 'resultado' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Receita em 12 meses" valor={fmtBRL(totalAno.receita)}
                nota="Só o que foi efetivamente recebido" />
              <Indicador rotulo="Despesa em 12 meses" valor={fmtBRL(totalAno.despesa)} nota="Liquidado" />
              <Indicador rotulo="Resultado" valor={fmtBRL(totalAno.receita - totalAno.despesa)}
                cor={totalAno.receita - totalAno.despesa < 0 ? 'coral' : 'acento'}
                nota={totalAno.receita > 0
                  ? `Margem de ${(((totalAno.receita - totalAno.despesa) / totalAno.receita) * 100).toFixed(0)}%`
                  : 'Sem receita no período'} />
              <Indicador rotulo="Ticket médio"
                valor={fmtBRL(ticketMedio(base))}
                nota="Por recebimento liquidado" />
            </div>

            <Painel titulo="Receita e despesa por mês"
              acao={<span className="t-legenda">Últimos 12 meses</span>}>
              {/* Gráfico em CSS puro: nenhuma dependência nova só para desenhar
                  12 barras. Sem eixo Y e sem grade, como manda o KV. */}
              <div className="grafico" role="img"
                aria-label={`Receita e despesa mês a mês. Total recebido ${fmtBRL(totalAno.receita)}, total gasto ${fmtBRL(totalAno.despesa)}.`}>
                {serie.map((s) => (
                  <div key={s.mes} className="grafico-col">
                    <span className="grafico-valor">
                      {s.receita_cents > 0 ? fmtCompacto(s.receita_cents) : ''}
                    </span>
                    <div className="grafico-barras">
                      <span className="barra barra-receita"
                        style={{ height: `${(s.receita_cents / teto) * 100}%` }} />
                      <span className="barra barra-despesa"
                        style={{ height: `${(s.despesa_cents / teto) * 100}%` }} />
                    </div>
                    <span className="etiqueta-mini">{s.mes.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="linha" style={{ marginTop: 'var(--espaco-04)' }}>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--roxo)' }} />Recebido</span>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--coral)' }} />Gasto</span>
              </div>
            </Painel>
          </>
        )}

        {aba === 'clientes' && (
          <Painel titulo={porMarca ? 'Por marca' : 'Por cliente'}
            acao={<span className="linha" style={{ gap: 'var(--espaco-02)' }}>
              <Pilula ativa={!porMarca} onClick={() => setPorMarca(false)}>Cliente</Pilula>
              <Pilula ativa={porMarca} onClick={() => setPorMarca(true)}>Marca</Pilula>
            </span>}>
            {linhasCliente.length === 0
              ? <Vazio icone="cliente" titulo={temFiltro ? 'Nada neste recorte' : 'Nenhuma receita por cliente'}
                instrucao={temFiltro ? 'Ajuste o período ou o cliente.' : 'Vincule os recebimentos a clientes para ver o ranking.'} />
              : <div className="rolagem-x">
                <table className="tabela">
                  <thead>
                    <tr><th>{porMarca ? 'Marca' : 'Cliente'}</th><th>Recebido</th><th>A receber</th><th>Projetos</th><th>Ticket</th></tr>
                  </thead>
                  <tbody>
                    {linhasCliente.map((l) => (
                      <tr key={l.chave}>
                        <td className="t-ui">{nomeChave(l.chave)}</td>
                        <td className="dinheiro">{fmtBRL(l.recebido_cents)}</td>
                        <td className="dinheiro">{l.a_receber_cents ? fmtBRL(l.a_receber_cents) : '—'}</td>
                        <td>{l.projetos}</td>
                        <td className="dinheiro">{l.ticket_cents ? fmtBRL(l.ticket_cents) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </Painel>
        )}

        {aba === 'projetos' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Em execução" valor={fmtBRL(projetos.em_execucao_cents)}
                nota="Aprovado + em andamento" />
              <Indicador rotulo="Entregues" valor={String(projetos.entregues)} nota="Entregue ou pago" />
              <Indicador rotulo="Atrasados" valor={String(projetos.atrasados)}
                cor={projetos.atrasados ? 'coral' : undefined} nota="Prazo combinado passou" />
              <Indicador rotulo="Em proposta"
                valor={String(projetos.porEtapa.find((e) => e.etapa === 'orcamento')?.qtd ?? 0)}
                nota="Pode virar trabalho" />
            </div>
            <Painel titulo="Projetos por etapa">
              <ul className="lista">
                {projetos.porEtapa.map((e) => (
                  <li key={e.etapa} className="lista-item">
                    <span className="celula">
                      <span className="t-ui">{ROTULO_ETAPA[e.etapa]}</span>
                      <span className="t-legenda">{e.qtd} {e.qtd === 1 ? 'projeto' : 'projetos'}</span>
                    </span>
                    <Dinheiro cents={e.cents} className="t-valor" />
                  </li>
                ))}
              </ul>
            </Painel>
          </>
        )}

        {aba === 'recebiveis' && (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Vencido" valor={fmtBRL(recebiveis.vencido_cents)}
                cor={recebiveis.vencido_cents ? 'coral' : undefined}
                nota={`${recebiveis.faixas.reduce((s, f) => s + f.qtd, 0)} em atraso`} />
              {recebiveis.proximos.map((p) => (
                <Indicador key={p.dias} rotulo={`Próximos ${p.dias} dias`} valor={fmtBRL(p.cents)}
                  nota={`${p.qtd} a vencer`} />
              ))}
            </div>
            <Painel titulo="Atraso por faixa">
              <ul className="lista">
                {recebiveis.faixas.map((f) => (
                  <li key={f.faixa} className="lista-item">
                    <span className="celula">
                      <span className="t-ui">{f.faixa} dias</span>
                      <span className="t-legenda">{f.qtd} {f.qtd === 1 ? 'lançamento' : 'lançamentos'}</span>
                    </span>
                    <Dinheiro cents={f.cents} className="t-valor" />
                  </li>
                ))}
              </ul>
              <p className="t-legenda" style={{ marginTop: 'var(--espaco-03)' }}>
                Quanto mais velho o atraso, menor a chance de entrar — a previsão de caixa usa essa lógica.
              </p>
            </Painel>
          </>
        )}

        {aba === 'fiscal' && (
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Emitido" valor={fmtBRL(fiscal.emitido_cents)}
              nota={`${fiscal.emitidas} ${fiscal.emitidas === 1 ? 'nota' : 'notas'}`} />
            <Indicador rotulo="Imposto estimado" valor={fmtBRL(fiscal.imposto_cents)}
              nota="Soma do informado em cada nota" />
            <Indicador rotulo="Pendentes" valor={String(fiscal.pendentes)}
              cor={fiscal.pendentes ? 'coral' : undefined} nota={fmtBRL(fiscal.pendente_cents)} />
            <Indicador rotulo="Serviços sem nota"
              valor={String(servicosFiltrados.filter((sv) => sv.status_execucao === 'concluida' && !sv.nota_fiscal_id).length)}
              nota="Concluídos sem NF vinculada" />
          </div>
        )}

        {aba === 'categorias' && (
          <Painel titulo="Despesas por categoria"
            acao={<span className="t-legenda">{porCategoria.length} categorias</span>}>
            {porCategoria.length === 0
              ? <Vazio icone="grafico" titulo="Nenhuma despesa categorizada"
                instrucao="Classifique as despesas para descobrir onde o dinheiro concentra." />
              : <Ranking itens={porCategoria.map((f) => ({
                chave: nomes.categoria.get(f.chave)?.nome ?? 'Sem categoria',
                total: f.total_cents, qtd: f.qtd,
              }))} />}
          </Painel>
        )}

        {aba === 'previsao' && (
          <>
            <div className="grade-indicadores">
              <Indicador rotulo="Conservador" valor={fmtBRL(cenarios.conservador)}
                cor={cenarios.conservador < 0 ? 'coral' : undefined}
                nota="70% do que vence em dia; nada do atrasado" />
              <Indicador dominante rotulo="Provável" valor={fmtBRL(cenarios.provavel)}
                nota="Tudo em dia + metade do atrasado" />
              <Indicador rotulo="Otimista" valor={fmtBRL(cenarios.otimista)} cor="acento"
                nota="Todo o valor em aberto entra" />
              <Indicador rotulo="Horizonte" valor="90 dias"
                nota="Despesa prevista entra inteira nos três" />
            </div>
            <Painel titulo="Como ler">
              <p className="t-corpo">
                Os três cenários partem do saldo de hoje e somam o que está em aberto com vencimento
                nos próximos 90 dias. A diferença entre eles é só a confiança no recebimento:
                conta vencida tem menos chance de entrar do que conta a vencer. Despesa prevista é
                descontada por inteiro nos três — obrigação não escolhe cenário.
              </p>
              <p className="t-sec" style={{ marginTop: 'var(--espaco-03)' }}>
                Valores projetados nunca se misturam com realizado: o que já foi liquidado está no saldo.
              </p>
            </Painel>
          </>
        )}

        {aba === 'metas' && (
          <Painel titulo="Metas e orçamentos"
            acao={<Botao compacto onClick={() => setFolha('nova')}>
              <Icone nome="adicionar" tamanho={14} />Nova
            </Botao>}>
            {metasVisiveis.length === 0 ? (
              <Vazio icone="resultados" titulo="Nenhuma meta definida"
                instrucao="Crie um limite de gasto por categoria ou uma meta de reserva para acompanhar o progresso."
                acao={<Botao variante="primario" onClick={() => setFolha('nova')}>Criar meta</Botao>} />
            ) : (
              <ul className="lista">
                {metasVisiveis.map((m) => {
                  const gasto = gastoDaMeta(m, transacoes)
                  const c = consumoOrcamento(m.alvo_cents, gasto)
                  return (
                    <li key={m.id} className="lista-item meta-item">
                      <span className="celula">
                        <span className="linha" style={{ justifyContent: 'space-between' }}>
                          <span className="t-ui espremer">{m.nome}</span>
                          <span className="t-legenda">
                            <Dinheiro cents={gasto} /> de <Dinheiro cents={m.alvo_cents} />
                          </span>
                        </span>
                        <Progresso pct={c.percentual * 100}
                          rotulo={`${m.nome}: ${(c.percentual * 100).toFixed(0)}% de ${fmtBRL(m.alvo_cents)}`} />
                        <span className="t-legenda">
                          {m.especie === 'orcamento'
                            ? c.estourou
                              ? `Estourou ${fmtBRL(-c.restante_cents)}`
                              : `Restam ${fmtBRL(c.restante_cents)}`
                            : `Faltam ${fmtBRL(Math.max(0, c.restante_cents))} para a meta`}
                        </span>
                      </span>
                      <Botao variante="icone" aria-label={`Editar ${m.nome}`} onClick={() => setFolha(m)}>
                        <Icone nome="editar" tamanho={16} />
                      </Botao>
                      {/* Desativar, não apagar: o que foi planejado continua
                          sendo registro do que foi planejado. */}
                      <Botao variante="icone" aria-label={`Encerrar ${m.nome}`}
                        onClick={() => void encerrarMeta(m)}>
                        <Icone nome="excluir" tamanho={16} />
                      </Botao>
                    </li>
                  )
                })}
              </ul>
            )}
          </Painel>
        )}
      </Carga>

      {folha && (
        <FolhaMeta inicial={folha === 'nova' ? undefined : folha}
          aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso({ texto: msg }); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

// ── partes ───────────────────────────────────────────────────────────────────

function Ranking({ itens }: { itens: { chave: string; total: number; qtd: number }[] }) {
  const teto = Math.max(...itens.map((i) => i.total), 1)
  return (
    <ul className="lista">
      {itens.map((i) => (
        <li key={i.chave} className="lista-item meta-item">
          <span className="celula">
            <span className="linha" style={{ justifyContent: 'space-between' }}>
              <span className="t-ui espremer">{i.chave}</span>
              {/* percentual nunca sem o valor absoluto ao lado */}
              <span className="t-legenda">
                <Dinheiro cents={i.total} /> · {((i.total / teto) * 100).toFixed(0)}%
              </span>
            </span>
            <span className="barra-ranking" aria-hidden>
              <span style={{ width: `${(i.total / teto) * 100}%` }} />
            </span>
            <span className="t-legenda">{i.qtd} {i.qtd === 1 ? 'lançamento' : 'lançamentos'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function FolhaMeta({ inicial, aoFechar, aoSalvar }: {
  inicial?: Meta
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { categorias } = useFinancas()
  const [especie, setEspecie] = useState<'meta' | 'orcamento'>(inicial?.especie ?? 'orcamento')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [contexto, setContexto] = useState<Contexto>(inicial?.contexto ?? 'pessoal')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria_id ?? '')
  const [alvo, setAlvo] = useState(inicial ? fmtBRL(inicial.alvo_cents) : '')
  const [inicio, setInicio] = useState(inicial?.inicio ?? new Date().toISOString().slice(0, 8) + '01')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = 'Dê um nome'
    if (centsDeBRL(alvo) <= 0) e.alvo = 'Informe o valor alvo'
    if (especie === 'orcamento' && !categoriaId) e.categoria = 'Orçamento precisa de uma categoria'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await financas.salvarMeta({
        id: inicial?.id, especie, nome: nome.trim(), contexto,
        categoria_id: categoriaId || null, alvo_cents: centsDeBRL(alvo), inicio,
      })
      aoSalvar(inicial ? 'Meta atualizada' : 'Meta criada')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar meta' : 'Nova meta'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <div>
          <Etiqueta>Tipo</Etiqueta>
          <div className="linha" style={{ marginTop: 'var(--espaco-02)' }}>
            <Pilula ativa={especie === 'orcamento'} onClick={() => setEspecie('orcamento')}>
              Limite de gasto
            </Pilula>
            <Pilula ativa={especie === 'meta'} onClick={() => setEspecie('meta')}>
              Meta de acúmulo
            </Pilula>
          </div>
          <p className="t-legenda" style={{ marginTop: 'var(--espaco-02)' }}>
            {especie === 'orcamento'
              ? 'Compara o gasto da categoria com o limite no período.'
              : 'Acompanha quanto já entrou em direção a um alvo.'}
          </p>
        </div>

        <Campo rotulo="Nome" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={especie === 'orcamento' ? 'Alimentação de agosto' : 'Reserva de emergência'} />

        <div className="linha">
          <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
          <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
        </div>

        <div className="campo" data-erro={erros.categoria ? 'true' : undefined}>
          <label htmlFor="meta-cat">Categoria</label>
          <select id="meta-cat" className="campo-caixa" value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">{especie === 'meta' ? 'Sem categoria' : 'Selecione…'}</option>
            {categorias.filter((c) => c.contexto === contexto).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          {erros.categoria && <span className="campo-erro" role="alert">{erros.categoria}</span>}
        </div>

        <Campo rotulo="Valor alvo" value={alvo} inputMode="decimal" erro={erros.alvo}
          onChange={(e) => setAlvo(e.target.value)} placeholder="R$ 0,00" />

        <div className="campo">
          <label htmlFor="meta-inicio">Início do período</label>
          <input id="meta-inicio" type="date" className="campo-caixa" value={inicio}
            onChange={(e) => setInicio(e.target.value)} />
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── cálculos de apresentação ─────────────────────────────────────────────────

/** Orçamento mede saída da categoria; meta mede entrada acumulada. */
function gastoDaMeta(m: Meta, transacoes: Parameters<typeof agrupar>[0]): number {
  return transacoes
    .filter((t) => {
      if (t.contexto !== m.contexto) return false
      if (m.categoria_id && t.categoria_id !== m.categoria_id) return false
      if (t.tipo !== (m.especie === 'orcamento' ? 'saida' : 'entrada')) return false
      const d = t.data_competencia || t.data_liquidacao
      if (!d || d < m.inicio) return false
      return !m.fim || d <= m.fim
    })
    .reduce((s, t) => s + valorLiquidado(t), 0)
}

function ticketMedio(transacoes: Parameters<typeof agrupar>[0]): number {
  const entradas = transacoes.filter((t) => t.tipo === 'entrada' && valorLiquidado(t) > 0)
  if (!entradas.length) return 0
  return Math.round(entradas.reduce((s, t) => s + valorLiquidado(t), 0) / entradas.length)
}

/** Valor curto para o topo da coluna do gráfico: 12,4 mil. */
function fmtCompacto(cents: number): string {
  const reais = cents / 100
  if (reais >= 1000) return `${(reais / 1000).toFixed(reais >= 10000 ? 0 : 1)} mil`
  return reais.toFixed(0)
}
