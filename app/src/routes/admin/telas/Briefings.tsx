import { useCallback, useEffect, useMemo, useState } from 'react'
import { briefingsApi } from '../../../lib/api'
import { useAbrirNovo } from '../../../lib/abrir-novo'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { BriefingLegadoRow, BriefingLinkRow } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Chip, Erro, Esqueleto, Folha, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import {
  caminhoTipo, lerResposta, rotuloTipo, TIPOS_BRIEFING,
} from '../../../lib/briefing-mapas'
import { FolhaExcluir } from '../folhas'

// Duas origens que o painel precisa mostrar junto: convites por token
// (briefing_links) e as respostas antigas que chegaram sem token (legado).
// Vincular a um cliente é a ação que transforma resposta solta em histórico.
type Aba = 'convites' | 'legado'

export default function Briefings() {
  const { clientes, briefings: convites, recarregar } = useFinancas()
  const nomes = useNomes()
  const [legado, setLegado] = useState<(BriefingLegadoRow & { origem: 'visual' | 'ecommerce' })[]>([])
  const [carregandoLegado, setCarregandoLegado] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('convites')
  const [aviso, setAviso] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  useAbrirNovo(() => setNovo(true))
  /** Convite ou resposta antiga: a folha desenha as duas com os mesmos mapas. */
  const [vendo, setVendo] = useState<
    { tipo: string; cliente: string | null; nome: string | null; email: string | null
      whatsapp: string | null; responded_at: string | null; raw: unknown } | null>(null)
  const [excluir, setExcluir] = useState<BriefingLinkRow | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Convites vêm do store (a fila de "Precisa de você" também os lê — duas
  // buscas seriam duas verdades). O legado só existe aqui, então fica local.
  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [vis, ec] = await Promise.all([
        briefingsApi.legadoVisual().catch(() => [] as BriefingLegadoRow[]),
        briefingsApi.legadoEcommerce().catch(() => [] as BriefingLegadoRow[]),
      ])
      setLegado([
        ...vis.map((b) => ({ ...b, origem: 'visual' as const })),
        ...ec.map((b) => ({ ...b, origem: 'ecommerce' as const })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregandoLegado(false)
    }
    await recarregar()
  }, [recarregar])
  useEffect(() => { void carregar() }, [carregar])

  const respondidos = useMemo(
    () => convites.filter((c) => c.status === 'respondido'), [convites])
  const pendentes = useMemo(
    () => convites.filter((c) => c.status === 'pendente' && !c.revogado_em), [convites])
  const semCliente = useMemo(
    () => legado.filter((b) => !b.cliente_id), [legado])

  async function executar(id: string, oque: string, acao: () => Promise<unknown>) {
    setOcupado(id)
    try {
      await acao()
      setAviso(oque)
      await carregar()
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function copiarLink(c: BriefingLinkRow) {
    const url = `${window.location.origin}${caminhoTipo(c.tipo)}?t=${c.token}`
    try {
      await navigator.clipboard.writeText(url)
      setAviso('Link copiado')
    } catch {
      setAviso(url)
    }
  }

  async function vincular(id: string, clienteId: string, origem: 'visual' | 'ecommerce' | 'convite') {
    if (!clienteId) return
    try {
      if (origem === 'convite') await briefingsApi.vincularConvite(id, clienteId)
      else if (origem === 'visual') await briefingsApi.vincularLegadoVisual(id, clienteId)
      else await briefingsApi.vincularLegadoEcommerce(id, clienteId)
      setAviso('Vinculado ao cliente')
      await carregar()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Entrada" titulo="Briefings">
        <Botao variante="primario" onClick={() => setNovo(true)}>
          <Icone nome="adicionar" tamanho={16} />Novo convite
        </Botao>
      </Cabecalho>

      {carregandoLegado && convites.length === 0 ? <Esqueleto linhas={4} altura={64} /> : (
        <>
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Respondidos" valor={String(respondidos.length)}
              nota="Convites com resposta" />
            <Indicador rotulo="Aguardando" valor={String(pendentes.length)}
              nota="Links enviados sem resposta" />
            <Indicador rotulo="Respostas antigas" valor={String(legado.length)}
              nota="Chegaram sem token" />
            <Indicador rotulo="Sem cliente" valor={String(semCliente.length)}
              cor={semCliente.length ? 'coral' : undefined}
              nota="Precisam ser vinculadas" />
          </div>

          {erro && <Erro causa={erro} aoTentar={() => void carregar()} />}

          <div className="abas" role="tablist" aria-label="Origem do briefing">
            <Pilula ativa={aba === 'convites'} role="tab" aria-selected={aba === 'convites'}
              onClick={() => setAba('convites')}>Convites · {convites.length}</Pilula>
            <Pilula ativa={aba === 'legado'} role="tab" aria-selected={aba === 'legado'}
              onClick={() => setAba('legado')}>Respostas antigas · {legado.length}</Pilula>
          </div>

          {aba === 'convites' && (
            <Painel titulo="Convites por token">
              {convites.length === 0 ? (
                <Vazio icone="briefing" titulo="Nenhum convite gerado"
                  instrucao="Gere um link com token e mande ao cliente. A resposta cai aqui, já ligada a ele."
                  acao={<Botao variante="primario" onClick={() => setNovo(true)}>Novo convite</Botao>} />
              ) : (
                <ul className="lista">
                  {convites.map((c) => (
                    <li key={c.id} className="lista-item">
                      <Icone nome="briefing" tamanho={18} />
                      <span className="celula">
                        <span className="t-ui espremer">{c.cliente || 'Sem nome'}</span>
                        <span className="t-legenda espremer">
                          {rotuloTipo(c.tipo)} · {dataCurta(c.created_at.slice(0, 10))}
                          {c.cliente_id ? ` · ${nomes.cliente.get(c.cliente_id)?.nome ?? ''}` : ''}
                          {c.responded_at ? ` · respondeu em ${dataCurta(c.responded_at.slice(0, 10))}` : ''}
                        </span>
                      </span>
                      {c.revogado_em
                        ? <Chip estado="rascunho">Revogado</Chip>
                        : c.status === 'respondido'
                          ? <Chip estado="pago">Respondido</Chip>
                          : <Chip estado="aguardando">Aguardando</Chip>}

                      {c.status === 'respondido' && (
                        <Botao compacto onClick={() => setVendo(c)}>Ver resposta</Botao>
                      )}
                      {!c.cliente_id && c.status === 'respondido' && (
                        <SeletorCliente clientes={clientes}
                          aoEscolher={(id) => void vincular(c.id, id, 'convite')} />
                      )}
                      {!c.revogado_em && c.status === 'pendente' && (
                        <Botao variante="icone" aria-label={`Copiar link de ${c.cliente || 'convite'}`}
                          onClick={() => void copiarLink(c)}>
                          <Icone nome="compartilhar" tamanho={16} />
                        </Botao>
                      )}
                      {/* Reabrir é a única forma de um briefing respondido
                          aceitar novo envio: briefing-submit recusa com 409. */}
                      {c.status === 'respondido' && !c.revogado_em && (
                        <Botao compacto carregando={ocupado === c.id}
                          onClick={() => void executar(c.id, 'Convite reaberto',
                            () => briefingsApi.reabrirConvite(c.id))}>
                          Reabrir
                        </Botao>
                      )}
                      <Botao compacto carregando={ocupado === c.id}
                        onClick={() => void executar(c.id, c.revogado_em ? 'Link reativado' : 'Link revogado',
                          () => briefingsApi.revogarConvite(c.id, !c.revogado_em))}>
                        {c.revogado_em ? 'Reativar' : 'Revogar'}
                      </Botao>
                      <Botao variante="icone" aria-label={`Excluir convite de ${c.cliente || 'sem nome'}`}
                        onClick={() => setExcluir(c)}>
                        <Icone nome="excluir" tamanho={16} />
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          )}

          {aba === 'legado' && (
            <Painel titulo="Respostas sem token"
              acao={<span className="t-legenda">{semCliente.length} sem cliente</span>}>
              {legado.length === 0 ? (
                <Vazio icone="documentos" titulo="Nenhuma resposta antiga"
                  instrucao="Formulários respondidos sem token apareceriam aqui." />
              ) : (
                <ul className="lista">
                  {legado.map((b) => (
                    <li key={`${b.origem}:${b.id}`} className="lista-item">
                      <Icone nome="documentos" tamanho={18} />
                      <span className="celula">
                        <span className="t-ui espremer">{b.nome || b.empresa || 'Sem nome'}</span>
                        <span className="t-legenda espremer">
                          {b.origem === 'visual' ? 'Identidade visual' : 'E-commerce'}
                          {b.email ? ` · ${b.email}` : ''}
                          {` · ${dataCurta(b.created_at.slice(0, 10))}`}
                        </span>
                      </span>
                      <Botao compacto onClick={() => setVendo({
                        tipo: b.origem === 'visual' ? 'briefing' : 'briefing-ecommerce',
                        cliente: b.empresa ?? null, nome: b.nome, email: b.email,
                        whatsapp: b.whatsapp, responded_at: b.created_at, raw: b.raw,
                      })}>Ver resposta</Botao>
                      {b.cliente_id
                        ? <Chip estado="pago">{nomes.cliente.get(b.cliente_id)?.nome ?? 'Vinculado'}</Chip>
                        : <SeletorCliente clientes={clientes}
                          aoEscolher={(id) => void vincular(b.id, id, b.origem)} />}
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          )}
        </>
      )}

      {novo && (
        <FolhaConvite clientes={clientes} aoFechar={() => setNovo(false)}
          aoSalvar={async (msg) => { setAviso(msg); await carregar() }} />
      )}
      {vendo && <FolhaResposta convite={vendo} aoFechar={() => setVendo(null)} />}
      {excluir && (
        <FolhaExcluir titulo={excluir.cliente || 'Convite sem nome'}
          consequencia={excluir.status === 'respondido'
            ? 'A resposta que o cliente mandou some junto. Para só matar o link, use Revogar.'
            : 'O link para de funcionar e o convite some da lista.'}
          aoFechar={() => setExcluir(null)}
          aoConfirmar={async () => {
            await briefingsApi.removerConvite(excluir.id)
            setAviso('Convite excluído')
            await carregar()
          }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

/** Gera o link com token. O cliente cadastrado é opcional aqui de propósito:
 *  muita conversa começa antes de existir cliente no sistema — vincular
 *  depois, quando a resposta chega, é o caminho normal. */
function FolhaConvite({ clientes, aoFechar, aoSalvar }: {
  clientes: ReturnType<typeof useFinancas>['clientes']
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState(TIPOS_BRIEFING[0].chave)
  const [clienteId, setClienteId] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [link, setLink] = useState('')

  async function gerar() {
    if (!nome.trim()) return setErros({ nome: 'Diga para quem é' })
    setErros({})
    setSalvando(true)
    try {
      const invite = await briefingsApi.criarConvite({
        cliente: nome.trim(), tipo, cliente_id: clienteId || null,
      })
      setLink(`${window.location.origin}${caminhoTipo(tipo)}?t=${invite.token}`)
      aoSalvar('Convite criado')
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo="Novo convite de briefing" aoFechar={aoFechar}
      rodape={link
        ? <Botao variante="destaque" style={{ flex: 1 }} onClick={aoFechar}>Fechar</Botao>
        : <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="destaque" onClick={() => void gerar()} carregando={salvando}
            style={{ flex: 2 }}>Gerar link</Botao>
        </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        {link ? (
          <>
            <p className="t-corpo">Link pronto. Mande para o cliente:</p>
            <p className="t-legenda" style={{ wordBreak: 'break-all' }}>{link}</p>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              <Botao onClick={() => void navigator.clipboard.writeText(link).catch(() => {})}>
                <Icone nome="compartilhar" tamanho={16} />Copiar
              </Botao>
              <a className="btn btn-secundario" target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Oi! Pra montar sua proposta, responde esse briefing rápido: ${link}`)}`}>
                WhatsApp<Icone nome="link-externo" tamanho={14} />
              </a>
              <a className="btn btn-secundario" href={link} target="_blank" rel="noreferrer">
                Abrir<Icone nome="link-externo" tamanho={14} />
              </a>
            </div>
          </>
        ) : (
          <>
            <Campo rotulo="Para quem" value={nome} erro={erros.nome}
              onChange={(e) => setNome(e.target.value)} placeholder="Nome da pessoa ou da empresa" />
            <div className="campo">
              <label htmlFor="bri-tipo">Tipo de briefing</label>
              <select id="bri-tipo" className="campo-caixa" value={tipo}
                onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_BRIEFING.map((t) => (
                  <option key={t.chave} value={t.chave}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="bri-cliente">Cliente cadastrado</label>
              <select id="bri-cliente" className="campo-caixa" value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Ainda não é cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <span className="t-legenda">Opcional — dá para vincular depois que a resposta chegar.</span>
            </div>
            {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
          </>
        )}
      </div>
    </Folha>
  )
}

/** A resposta inteira, traduzida. Antes disso só o painel estático sabia
 *  desenhar isso — e o briefing "Guia Viver Bem" não era legível em lugar
 *  nenhum, porque grava a pergunta em português como chave. */
function FolhaResposta({ convite, aoFechar }: {
  convite: {
    tipo: string; cliente: string | null; nome: string | null; email: string | null
    whatsapp: string | null; responded_at: string | null; raw: unknown
  }
  aoFechar: () => void
}) {
  const blocos = lerResposta(convite.tipo, convite.raw)
  const zap = (convite.whatsapp ?? '').replace(/\D/g, '')

  const texto = [
    `BRIEFING — ${rotuloTipo(convite.tipo)}`,
    convite.cliente ? `Cliente: ${convite.cliente}` : '',
    [convite.nome, convite.email, convite.whatsapp].filter(Boolean).join(' · '),
    '',
    ...blocos.flatMap((b) => [
      `== ${b.titulo} ==`,
      ...b.linhas.filter((l) => l.valor).map((l) => `${l.rotulo}: ${l.valor}`),
      '',
    ]),
  ].filter((l) => l !== undefined).join('\n')

  return (
    <Folha titulo={convite.cliente || 'Resposta do briefing'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>
        <Botao variante="destaque" style={{ flex: 2 }}
          onClick={() => void navigator.clipboard.writeText(texto).catch(() => {})}>
          Copiar tudo
        </Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <dl className="ficha">
          <div><dt className="etiqueta-mini">Tipo</dt>
            <dd className="t-corpo">{rotuloTipo(convite.tipo)}</dd></div>
          {convite.nome && (
            <div><dt className="etiqueta-mini">Respondeu</dt>
              <dd className="t-corpo">{convite.nome}</dd></div>
          )}
          {convite.email && (
            <div><dt className="etiqueta-mini">E-mail</dt>
              <dd className="t-corpo">{convite.email}</dd></div>
          )}
          {convite.whatsapp && (
            <div><dt className="etiqueta-mini">WhatsApp</dt><dd className="t-corpo">
              <a href={`https://wa.me/${zap.length <= 11 ? '55' : ''}${zap}`}
                target="_blank" rel="noreferrer">{convite.whatsapp}</a>
            </dd></div>
          )}
        </dl>

        {blocos.length === 0 ? (
          <p className="t-sec">Este convite não tem resposta gravada.</p>
        ) : blocos.map((b) => (
          <div key={b.titulo} className="campo">
            <span className="etiqueta-mini">{b.titulo}</span>
            <dl className="ficha">
              {b.linhas.map((l) => (
                <div key={l.campo}>
                  <dt className="etiqueta-mini">{l.rotulo}</dt>
                  <dd className={l.valor ? 't-corpo' : 't-sec'}>{l.valor || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Folha>
  )
}

/** Select inline: vincular é uma ação de uma escolha só — folha seria demais. */
function SeletorCliente({ clientes, aoEscolher }: {
  clientes: ReturnType<typeof useFinancas>['clientes']
  aoEscolher: (id: string) => void
}) {
  return (
    <select className="campo-caixa select-inline" defaultValue=""
      aria-label="Vincular a um cliente"
      onChange={(e) => { aoEscolher(e.target.value); e.target.value = '' }}>
      <option value="">Vincular a…</option>
      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  )
}
