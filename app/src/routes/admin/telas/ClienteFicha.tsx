import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clientes as clientesApi, contatos as contatosApi, financas, subClientes as subClientesApi } from '../../../lib/api'
import { centsDeReais, fmtBRL } from '../../../lib/dinheiro'
import { useFinancas } from '../../../lib/financas-store'
import { estaEmAberto, saldoAberto, valorLiquidado } from '../../../domain/financeiro'
import { juntarProjetos } from '../../../domain/projeto'
import { Aviso, Botao, Chip, Icone, Indicador, Painel, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, ChipMovimento, ChipNota, Dinheiro } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import type { Arquivo, ContatoRow, OrcamentoStatus, SubClienteRow } from '../../../lib/tipos'
import type { EstadoChip } from '../../../ui/tokens'
import {
  FolhaCliente, FolhaContato, FolhaEntrega, FolhaExcluir, FolhaSenhaPortal, FolhaSubCliente,
} from '../folhas'

// Estado da proposta → par de cores do sistema. Mesmo mapa do funil de Projetos.
const ESTADO_ORCAMENTO: Record<OrcamentoStatus, EstadoChip> = {
  rascunho: 'rascunho', enviado: 'enviado', aprovado: 'aprovado', recusado: 'atrasado',
}

export default function ClienteFicha() {
  const { id } = useParams()
  const { clientes, servicos, subClientes, orcamentos, transacoes, notas, recarregar } = useFinancas()
  const [editando, setEditando] = useState(false)
  const [senhaPortal, setSenhaPortal] = useState(false)
  const [entrega, setEntrega] = useState(false)
  const [folhaMarca, setFolhaMarca] = useState<{ m?: SubClienteRow } | null>(null)
  const [excluir, setExcluir] = useState<
    { tipo: 'contato'; c: ContatoRow } | { tipo: 'marca'; m: SubClienteRow } | null>(null)
  const [arquivando, setArquivando] = useState(false)
  const [folhaContato, setFolhaContato] = useState<{ c?: ContatoRow } | null>(null)
  const [listaContatos, setListaContatos] = useState<ContatoRow[] | null>(null)
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

  // Contatos não entram no store financeiro pelo mesmo motivo dos arquivos:
  // são deste cliente, e nenhuma outra tela precisa deles.
  const carregarContatos = useCallback(() => {
    if (!id) return Promise.resolve()
    return contatosApi.list(id).then(setListaContatos).catch(() => setListaContatos([]))
  }, [id])
  useEffect(() => { void carregarContatos() }, [carregarContatos])

  async function copiar(texto: string, oque: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setAviso(`${oque} copiado`)
    } catch {
      setAviso('Não consegui copiar — o navegador bloqueou')
    }
  }

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
      // Uma linha por marca do cliente, mais "Trabalho direto" quando existe
      // serviço sem marca. Serviço é a fonte: total, quantidade e pendências.
      marcas: (() => {
        const meus = servicos.filter((sv) => sv.cliente_id === id)
        const linhas = subClientes.filter((m) => m.cliente_id === id).map((m) => {
          const itens = meus.filter((sv) => sv.sub_cliente_id === m.id)
          return {
            id: m.id, nome: m.nome, ativo: m.ativo, itens: itens.length,
            total: itens.reduce((acc, sv) => acc + sv.valor_cents, 0),
            semValor: itens.filter((sv) => sv.valor_cents === 0).length,
            semNota: itens.filter((sv) => !sv.nf_numero).length,
          }
        })
        const direto = meus.filter((sv) => !sv.sub_cliente_id)
        return direto.length
          ? [...linhas, {
            id: 'direto', nome: 'Trabalho direto', ativo: true, itens: direto.length,
            total: direto.reduce((acc, sv) => acc + sv.valor_cents, 0),
            semValor: direto.filter((sv) => sv.valor_cents === 0).length,
            semNota: direto.filter((sv) => !sv.nf_numero).length,
          }]
          : linhas
      })(),
      faturado: servicos.filter((s) => s.cliente_id === id).reduce((s, x) => s + x.valor_cents, 0),
      recebido: tx.filter((t) => t.tipo === 'entrada').reduce((s, t) => s + valorLiquidado(t), 0),
      aReceber: tx.filter((t) => t.tipo === 'entrada' && estaEmAberto(t))
        .reduce((s, t) => s + saldoAberto(t), 0),
    }
  }, [id, transacoes, servicos, subClientes, notas, orcamentos])

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
        {/* Arquivar, não excluir: a FK de serviços é RESTRICT de propósito —
            apagar o cliente levaria junto o rastro de nota e recebimento. */}
        {cliente && (
          <Botao carregando={arquivando} onClick={async () => {
            setArquivando(true)
            try {
              await clientesApi.upsert({
                id: cliente.id, nome: cliente.nome, cor: cliente.cor,
                contato: cliente.contato, marca_slug: cliente.marca_slug,
                marca_publicada: cliente.marca_publicada,
                arquivado: !cliente.arquivado_em,
              })
              setAviso(cliente.arquivado_em ? 'Cliente reativado' : 'Cliente arquivado')
              await recarregar()
            } catch (e) {
              setAviso((e as Error).message)
            } finally {
              setArquivando(false)
            }
          }}>
            <Icone nome="caixa" tamanho={16} />
            {cliente.arquivado_em ? 'Reativar' : 'Arquivar'}
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
                {cliente.arquivado_em && (
                  <div><dt className="etiqueta-mini">Situação</dt><dd>
                    <Chip estado="rascunho">
                      Arquivado em {dataCurta(cliente.arquivado_em.slice(0, 10))}
                    </Chip>
                  </dd></div>
                )}
              </dl>
            </Painel>

            {/* Agenda, não CRM: o que resolve é ligar para a pessoa certa
                sem procurar em outro lugar. */}
            <Painel titulo="Contatos"
              acao={<Botao compacto onClick={() => setFolhaContato({})}>
                <Icone nome="adicionar" tamanho={14} />Novo contato
              </Botao>}>
              {listaContatos === null ? <p className="t-sec">Carregando…</p>
                : listaContatos.length === 0
                  ? <p className="t-sec">
                    Nenhum contato cadastrado. Guarde aqui quem responde por este
                    cliente — nome, função, e-mail e WhatsApp.
                  </p>
                  : <ul className="lista">
                    {listaContatos.map((c) => {
                      const marca = c.sub_cliente_id ? subClientes.find((m) => m.id === c.sub_cliente_id) : null
                      const zap = (c.whatsapp ?? '').replace(/\D/g, '')
                      return (
                        <li key={c.id} className="lista-item" data-cancelado={!c.ativo ? 'true' : undefined}>
                          <span className="celula">
                            <span className="t-ui espremer">
                              {c.nome}
                              {c.principal && <span className="etiqueta-mini"> · principal</span>}
                            </span>
                            <span className="t-legenda espremer">
                              {[c.funcao, marca?.nome, c.email, c.telefone].filter(Boolean).join(' · ') || 'Sem detalhes'}
                            </span>
                          </span>
                          {c.email && (
                            <Botao variante="icone" aria-label={`Copiar e-mail de ${c.nome}`}
                              onClick={() => void copiar(c.email!, 'E-mail')}>
                              <Icone nome="comunicacao" tamanho={16} />
                            </Botao>
                          )}
                          {c.telefone && (
                            <Botao variante="icone" aria-label={`Copiar telefone de ${c.nome}`}
                              onClick={() => void copiar(c.telefone!, 'Telefone')}>
                              <Icone nome="contato" tamanho={16} />
                            </Botao>
                          )}
                          {zap && (
                            <a className="btn btn-icone" aria-label={`Abrir WhatsApp de ${c.nome}`}
                              href={`https://wa.me/${zap.length <= 11 ? '55' : ''}${zap}`}
                              target="_blank" rel="noreferrer">
                              <Icone nome="atendimento" tamanho={16} />
                            </a>
                          )}
                          <Botao variante="icone" aria-label={`Editar ${c.nome}`}
                            onClick={() => setFolhaContato({ c })}>
                            <Icone nome="editar" tamanho={16} />
                          </Botao>
                          <Botao variante="icone" aria-label={`Excluir ${c.nome}`}
                            onClick={() => setExcluir({ tipo: 'contato', c })}>
                            <Icone nome="excluir" tamanho={16} />
                          </Botao>
                        </li>
                      )
                    })}
                  </ul>}
            </Painel>

            {/* Portal e entregas moram juntos de propósito: são as duas metades
                da mesma pergunta — "o cliente consegue pegar o material dele?".
                Senha sem material é porta para sala vazia; material sem senha é
                sala trancada. */}
            <Painel titulo="Área do cliente"
              acao={<Botao compacto onClick={() => setEntrega(true)}>Enviar material</Botao>}>
              <dl className="ficha">
                <div><dt className="etiqueta-mini">Acesso ao portal</dt><dd>
                  {cliente.portal_senha_gerada_em
                    ? <span className="t-corpo">
                      Senha ativa desde {dataCurta(cliente.portal_senha_gerada_em.slice(0, 10))}
                    </span>
                    : <span className="t-sec">Nenhuma senha gerada ainda</span>}
                </dd></div>
                <div><dt className="etiqueta-mini">Endereço</dt>
                  <dd className="t-corpo">
                    <a href="/portal/" target="_blank" rel="noreferrer">/portal/</a>
                  </dd></div>
              </dl>
              <div className="linha" style={{ marginTop: 'var(--e-5)' }}>
                <Botao variante="primario" onClick={() => setSenhaPortal(true)}>
                  <Icone nome="usuario" tamanho={16} />
                  {cliente.portal_senha_gerada_em ? 'Gerar nova senha' : 'Gerar senha de acesso'}
                </Botao>
              </div>
              <p className="t-legenda" style={{ marginTop: 'var(--e-3)' }}>
                A senha aparece uma única vez. O portal mostra ao cliente só os
                materiais publicados.
              </p>
            </Painel>

            {/* Marcas antes dos projetos: é por elas que a F2 pergunta
                ("como está a Vibra?"), e cada linha leva ao filtro pronto. */}
            <Painel titulo="Marcas atendidas"
              acao={<Botao compacto onClick={() => setFolhaMarca({})}>
                <Icone nome="adicionar" tamanho={14} />Nova marca
              </Botao>}>
              {doCliente.marcas.length === 0
                ? <p className="t-sec">
                  Nenhuma marca cadastrada. Use marcas quando este cliente
                  intermedia o trabalho de outras (F2 → Vibra, ASUS).
                </p>
                : <ul className="lista">
                  {doCliente.marcas.map((m) => (
                    <li key={m.id} className="lista-item" data-cancelado={!m.ativo ? 'true' : undefined}>
                      <span className="celula">
                        <span className="t-ui espremer">{m.nome}</span>
                        <span className="t-legenda espremer">
                          {m.itens} serviço{m.itens === 1 ? '' : 's'}
                          {m.semValor ? ` · ${m.semValor} sem valor` : ''}
                          {m.semNota ? ` · ${m.semNota} sem nota` : ''}
                          {m.ativo ? '' : ' · inativa'}
                        </span>
                      </span>
                      <Dinheiro cents={m.total} className="t-valor" />
                      {m.id !== 'direto' && (
                        <Botao variante="icone" aria-label={`Editar ${m.nome}`}
                          onClick={() => {
                            const marca = subClientes.find((x) => x.id === m.id)
                            if (marca) setFolhaMarca({ m: marca })
                          }}>
                          <Icone nome="editar" tamanho={16} />
                        </Botao>
                      )}
                      {m.id !== 'direto' && m.itens === 0 && (
                        <Botao variante="icone" aria-label={`Excluir ${m.nome}`}
                          onClick={() => {
                            const marca = subClientes.find((x) => x.id === m.id)
                            if (marca) setExcluir({ tipo: 'marca', m: marca })
                          }}>
                          <Icone nome="excluir" tamanho={16} />
                        </Botao>
                      )}
                    </li>
                  ))}
                </ul>}
              <p className="t-legenda" style={{ marginTop: 'var(--e-3)' }}>
                Marca com serviço não se exclui — encerre pela edição. O histórico fica.
              </p>
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
                          {p.servico?.sub_cliente_id
                            ? <span className="sub-cliente">{p.servico.sub_cliente}</span>
                            : null}
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

      {senhaPortal && cliente && (
        <FolhaSenhaPortal cliente={cliente}
          aoFechar={() => setSenhaPortal(false)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}

      {entrega && cliente && (
        <FolhaEntrega clienteInicial={cliente.id}
          aoFechar={() => setEntrega(false)}
          aoSalvar={(msg) => setAviso(msg)} />
      )}
      {folhaContato && cliente && (
        <FolhaContato clienteId={cliente.id} inicial={folhaContato.c}
          aoFechar={() => setFolhaContato(null)}
          aoSalvar={async (msg) => { setAviso(msg); await carregarContatos() }} />
      )}
      {folhaMarca && cliente && (
        <FolhaSubCliente clienteId={cliente.id} inicial={folhaMarca.m}
          aoFechar={() => setFolhaMarca(null)}
          aoSalvar={async () => { setAviso(folhaMarca.m ? 'Marca atualizada' : 'Marca cadastrada'); await recarregar() }} />
      )}
      {excluir?.tipo === 'contato' && (
        <FolhaExcluir titulo={excluir.c.nome}
          consequencia="O contato sai da agenda deste cliente. Nada mais é afetado."
          aoFechar={() => setExcluir(null)}
          aoConfirmar={async () => {
            await contatosApi.remover(excluir.c.id)
            setAviso('Contato excluído')
            await carregarContatos()
          }} />
      )}
      {excluir?.tipo === 'marca' && (
        <FolhaExcluir titulo={excluir.m.nome}
          consequencia="A marca sai da lista. Só é possível porque nenhum serviço aponta para ela — com serviço, o servidor recusa e o caminho é encerrar."
          aoFechar={() => setExcluir(null)}
          aoConfirmar={async () => {
            await subClientesApi.remover(excluir.m.id)
            setAviso('Marca excluída')
            await recarregar()
          }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
