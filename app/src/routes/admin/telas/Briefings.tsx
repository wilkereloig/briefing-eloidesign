import { useEffect, useMemo, useState } from 'react'
import { briefingsApi } from '../../../lib/api'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { BriefingLegadoRow, BriefingLinkRow } from '../../../lib/tipos'
import {
  Aviso, Botao, Chip, Esqueleto, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'

// Duas origens que o painel precisa mostrar junto: convites por token
// (briefing_links) e as respostas antigas que chegaram sem token (legado).
// Vincular a um cliente é a ação que transforma resposta solta em histórico.
type Aba = 'convites' | 'legado'

export default function Briefings() {
  const { clientes } = useFinancas()
  const nomes = useNomes()
  const [convites, setConvites] = useState<BriefingLinkRow[] | null>(null)
  const [legado, setLegado] = useState<(BriefingLegadoRow & { origem: 'visual' | 'ecommerce' })[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('convites')
  const [aviso, setAviso] = useState<string | null>(null)

  async function carregar() {
    setErro(null)
    try {
      const [inv, vis, ec] = await Promise.all([
        briefingsApi.convites(),
        briefingsApi.legadoVisual().catch(() => [] as BriefingLegadoRow[]),
        briefingsApi.legadoEcommerce().catch(() => [] as BriefingLegadoRow[]),
      ])
      setConvites(inv)
      setLegado([
        ...vis.map((b) => ({ ...b, origem: 'visual' as const })),
        ...ec.map((b) => ({ ...b, origem: 'ecommerce' as const })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) {
      setErro((e as Error).message)
      setConvites([])
    }
  }
  useEffect(() => { void carregar() }, [])

  const respondidos = useMemo(
    () => (convites ?? []).filter((c) => c.status === 'respondido'), [convites])
  const pendentes = useMemo(
    () => (convites ?? []).filter((c) => c.status === 'pendente' && !c.revogado_em), [convites])
  const semCliente = useMemo(
    () => legado.filter((b) => !b.cliente_id), [legado])

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
        <a className="btn btn-secundario" href="/painel-briefings/" target="_blank" rel="noreferrer">
          Gerar link<Icone nome="link-externo" tamanho={14} />
        </a>
      </Cabecalho>

      {convites === null ? <Esqueleto linhas={4} altura={64} /> : (
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

          {erro && (
            <Painel erro titulo="Erro">
              <p className="t-msg" role="alert" style={{ color: 'var(--coral)' }}>{erro}</p>
              <Botao onClick={() => void carregar()} style={{ marginTop: 'var(--e-7)' }}>
                Tentar de novo
              </Botao>
            </Painel>
          )}

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
                  instrucao="Gere um link com token no painel de briefings para enviar ao cliente."
                  acao={<a className="btn btn-primario" href="/painel-briefings/" target="_blank"
                    rel="noreferrer">Gerar link</a>} />
              ) : (
                <ul className="lista">
                  {convites.map((c) => (
                    <li key={c.id} className="lista-item">
                      <Icone nome="briefing" tamanho={18} />
                      <span className="celula">
                        <span className="t-ui espremer">{c.cliente || 'Sem nome'}</span>
                        <span className="t-legenda espremer">
                          {c.tipo} · {dataCurta(c.created_at.slice(0, 10))}
                          {c.cliente_id ? ` · ${nomes.cliente.get(c.cliente_id)?.nome ?? ''}` : ''}
                        </span>
                      </span>
                      {c.revogado_em
                        ? <Chip estado="rascunho">Revogado</Chip>
                        : c.status === 'respondido'
                          ? <Chip estado="pago">Respondido</Chip>
                          : <Chip estado="aberto">Aguardando</Chip>}
                      {!c.cliente_id && c.status === 'respondido' && (
                        <SeletorCliente clientes={clientes}
                          aoEscolher={(id) => void vincular(c.id, id, 'convite')} />
                      )}
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

      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
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
