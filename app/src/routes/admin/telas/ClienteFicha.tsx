import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { financas } from '../../../lib/api'
import { centsDeReais, fmtBRL } from '../../../lib/dinheiro'
import { useFinancas } from '../../../lib/financas-store'
import { estaEmAberto, saldoAberto, valorLiquidado } from '../../../domain/financeiro'
import { juntarProjetos } from '../../../domain/projeto'
import { Aviso, Botao, Chip, Icone, Indicador, Painel, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, ChipMovimento, ChipNota, Dinheiro } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import type { Arquivo, OrcamentoStatus } from '../../../lib/tipos'
import type { EstadoChip } from '../../../ui/tokens'
import { FolhaCliente } from '../folhas'

// Estado da proposta → par de cores do sistema. Mesmo mapa do funil de Projetos.
const ESTADO_ORCAMENTO: Record<OrcamentoStatus, EstadoChip> = {
  rascunho: 'rascunho', enviado: 'enviado', aprovado: 'aprovado', recusado: 'atrasado',
}

export default function ClienteFicha() {
  const { id } = useParams()
  const { clientes, servicos, orcamentos, transacoes, notas, recarregar } = useFinancas()
  const [editando, setEditando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])

  const cliente = clientes.find((c) => c.id === id)

  // Arquivos não vêm no store financeiro (é acervo próprio, com filtro por
  // dono): a ficha busca só os deste cliente em vez de carregar tudo.
  useEffect(() => {
    if (!id) return
    let vivo = true
    financas.arquivos({ cliente_id: id })
      .then((a) => { if (vivo) setArquivos(a) })
      .catch(() => { if (vivo) setArquivos([]) })
    return () => { vivo = false }
  }, [id])

  async function abrirArquivo(a: Arquivo) {
    try {
      const url = await financas.urlArquivo(a.path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  const doCliente = useMemo(() => {
    const tx = transacoes.filter((t) => t.cliente_id === id)
    return {
      transacoes: tx.sort((a, b) => (b.data_vencimento ?? '').localeCompare(a.data_vencimento ?? '')),
      servicos: servicos.filter((s) => s.cliente_id === id),
      notas: notas.filter((n) => n.cliente_id === id),
      orcamentos: orcamentos.filter((o) => o.cliente_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      projetos: juntarProjetos(orcamentos, servicos).filter((p) => p.clienteId === id),
      faturado: servicos.filter((s) => s.cliente_id === id).reduce((s, x) => s + x.valor_cents, 0),
      recebido: tx.filter((t) => t.tipo === 'entrada').reduce((s, t) => s + valorLiquidado(t), 0),
      aReceber: tx.filter((t) => t.tipo === 'entrada' && estaEmAberto(t))
        .reduce((s, t) => s + saldoAberto(t), 0),
    }
  }, [id, transacoes, servicos, notas, orcamentos])

  return (
    <div className="tela pilha">
      <Cabecalho secao="Cliente" titulo={cliente?.nome ?? 'Ficha do cliente'}>
        <Link to="/admin/clientes" className="btn btn-secundario">
          <Icone nome="voltar" tamanho={16} />Clientes
        </Link>
        {cliente && (
          <Botao variante="primario" onClick={() => setEditando(true)}>
            <Icone nome="editar" tamanho={16} />Editar
          </Botao>
        )}
      </Cabecalho>

      <Carga linhas={4}>
        {!cliente ? (
          <Vazio icone="erro" titulo="Cliente não encontrado"
            instrucao="O cliente pode ter sido removido ou o endereço está errado."
            acao={<Link className="btn btn-primario" to="/admin/clientes">Voltar para clientes</Link>} />
        ) : (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Total faturado" valor={fmtBRL(doCliente.faturado)}
                nota={`${doCliente.servicos.length} serviços`} />
              <Indicador rotulo="Recebido" valor={fmtBRL(doCliente.recebido)} cor="acento"
                nota="Liquidado de fato" />
              <Indicador rotulo="A receber" valor={fmtBRL(doCliente.aReceber)}
                cor={doCliente.aReceber > 0 ? 'coral' : undefined}
                nota="Lançamentos em aberto" />
              <Indicador rotulo="Notas emitidas"
                valor={String(doCliente.notas.filter((n) => n.status === 'emitida' || n.status === 'enviada').length)}
                nota={`${doCliente.notas.length} no total`} />
            </div>

            <Painel titulo="Cadastro">
              <dl className="ficha">
                <div><dt className="etiqueta-mini">Contato</dt><dd className="t-corpo">{cliente.contato || '—'}</dd></div>
                <div><dt className="etiqueta-mini">Portal</dt><dd>
                  {cliente.portal_ativo ? <Chip estado="pago">Ativo</Chip> : <Chip estado="rascunho">Inativo</Chip>}
                </dd></div>
                <div><dt className="etiqueta-mini">Marca</dt><dd>
                  {cliente.marca_publicada
                    ? <Chip estado="execucao">Publicada</Chip>
                    : <Chip estado="rascunho">Não publicada</Chip>}
                </dd></div>
                <div><dt className="etiqueta-mini">Cliente desde</dt>
                  <dd className="t-corpo">{dataCurta(cliente.created_at.slice(0, 10))}</dd></div>
              </dl>
            </Painel>

            <Painel titulo="Projetos e serviços"
              acao={<span className="t-legenda">{doCliente.projetos.length}</span>}>
              {doCliente.projetos.length === 0
                ? <p className="t-sec">Nenhum projeto registrado para este cliente.</p>
                : <ul className="lista">
                  {doCliente.projetos.map((p) => (
                    <li key={p.id} className="lista-item">
                      <span className="celula">
                        <span className="t-ui espremer">{p.titulo}</span>
                        <span className="t-legenda espremer">
                          {p.servico?.sub_cliente ? <span className="sub-cliente">{p.servico.sub_cliente}</span> : null}
                          {p.servico?.nf_numero ? `NF ${p.servico.nf_numero}` : 'Sem nota fiscal'}
                        </span>
                      </span>
                      <Dinheiro cents={p.valorCents} className="t-valor" />
                      <Chip estado={p.etapa === 'pago' ? 'pago' : p.etapa === 'execucao' ? 'execucao' : 'aberto'}>
                        {p.etapa}
                      </Chip>
                    </li>
                  ))}
                </ul>}
            </Painel>

            <div className="grade-dupla">
              <Painel titulo="Histórico financeiro">
                {doCliente.transacoes.length === 0
                  ? <p className="t-sec">Nenhum lançamento financeiro ligado a este cliente.</p>
                  : <ul className="lista">
                    {doCliente.transacoes.slice(0, 10).map((t) => (
                      <li key={t.id} className="lista-item">
                        <span className="mov-icone" data-tipo={t.tipo} aria-hidden>
                          <Icone nome={t.tipo === 'entrada' ? 'avancar' : 'voltar'} tamanho={16} />
                        </span>
                        <span className="celula">
                          <span className="t-ui espremer">{t.descricao}</span>
                          <span className="t-legenda">
                            {t.data_vencimento ? dataCurta(t.data_vencimento) : 'sem vencimento'}
                          </span>
                        </span>
                        <Dinheiro cents={estaEmAberto(t) ? saldoAberto(t) : valorLiquidado(t)} className="t-valor" />
                        <ChipMovimento status={t.status} />
                      </li>
                    ))}
                  </ul>}
              </Painel>

              <Painel titulo="Notas fiscais">
                {doCliente.notas.length === 0
                  ? <p className="t-sec">Nenhuma nota registrada.</p>
                  : <ul className="lista">
                    {doCliente.notas.map((n) => (
                      <li key={n.id} className="lista-item">
                        <Icone nome="nota-fiscal" tamanho={18} />
                        <span className="celula">
                          <span className="t-ui espremer">{n.numero ? `NF ${n.numero}` : 'Sem número'}</span>
                          <span className="t-legenda">{n.competencia?.slice(0, 7) ?? 'sem competência'}</span>
                        </span>
                        <Dinheiro cents={n.valor_cents} className="t-valor" />
                        <ChipNota status={n.status} />
                      </li>
                    ))}
                  </ul>}
              </Painel>
            </div>

            <div className="grade-dupla">
              <Painel titulo="Propostas"
                acao={<span className="t-legenda">{doCliente.orcamentos.length}</span>}>
                {doCliente.orcamentos.length === 0
                  ? <p className="t-sec">Nenhuma proposta registrada para este cliente.</p>
                  : <ul className="lista">
                    {doCliente.orcamentos.map((o) => (
                      <li key={o.id} className="lista-item">
                        <Icone nome="briefing" tamanho={18} />
                        <span className="celula">
                          <span className="t-ui espremer">{o.titulo}</span>
                          <span className="t-legenda espremer">
                            {o.numero ? `nº ${o.numero} · ` : ''}
                            {dataCurta(o.created_at.slice(0, 10))}
                          </span>
                        </span>
                        <Dinheiro cents={centsDeReais(o.valor_total)} className="t-valor" />
                        <Chip estado={ESTADO_ORCAMENTO[o.status]}>{o.status}</Chip>
                      </li>
                    ))}
                  </ul>}
              </Painel>

              <Painel titulo="Arquivos"
                acao={<Link to="/admin/arquivos" className="t-legenda">Acervo</Link>}>
                {arquivos.length === 0
                  ? <p className="t-sec">Nenhum arquivo ligado a este cliente.</p>
                  : <ul className="lista">
                    {arquivos.map((a) => (
                      <li key={a.id} className="lista-item">
                        <Icone nome="documentos" tamanho={18} />
                        <span className="celula">
                          <span className="t-ui espremer">{a.titulo}</span>
                          <span className="t-legenda espremer">
                            {a.categoria} · {dataCurta(a.created_at.slice(0, 10))}
                          </span>
                        </span>
                        <Botao variante="icone" aria-label={`Abrir ${a.titulo}`}
                          onClick={() => void abrirArquivo(a)}>
                          <Icone nome="baixar" tamanho={16} />
                        </Botao>
                      </li>
                    ))}
                  </ul>}
              </Painel>
            </div>
          </>
        )}
      </Carga>

      {editando && cliente && (
        <FolhaCliente inicial={cliente} aoFechar={() => setEditando(false)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
