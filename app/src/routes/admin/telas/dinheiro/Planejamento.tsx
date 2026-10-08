import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { financas } from '../../../../lib/api'
import { fmtBRL } from '../../../../lib/dinheiro'
import { useFinancas, useNomes } from '../../../../lib/financas-store'
import type { Recorrencia } from '../../../../lib/tipos'
import { Aviso, Botao, Icone, Indicador, Painel, Pilula, Vazio } from '../../../../ui/componentes'
import { Carga, Dinheiro } from '../../../../ui/painel'
import { custoAnual, custoMensal, dataCurta, rotuloPeriodo } from '../../../../ui/formato'
import { FolhaRecorrencia } from '../../folhas'
import { Categorias } from './Categorias'
import { Metas } from './Metas'

type Aba = 'recorrencias' | 'metas' | 'categorias'
const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'recorrencias', label: 'Recorrências' },
  { chave: 'metas', label: 'Metas e orçamentos' },
  { chave: 'categorias', label: 'Categorias' },
]

/** Planejamento: o que se repete, o que se pretende e como se classifica.
 *  A aba mora na URL (`?aba=`); sem ela abre Recorrências, que é o uso de
 *  todo mês e o destino dos links antigos (`/admin/dinheiro?aba=recorrencias`). */
export default function Planejamento() {
  const [params, setParams] = useSearchParams()
  const aba: Aba = ABAS.find((a) => a.chave === params.get('aba'))?.chave ?? 'recorrencias'

  return (
    <div className="pilha" data-density="dense">
      <div className="abas" role="tablist" aria-label="Planejamento">
        {ABAS.map((a) => (
          <Pilula key={a.chave} ativa={aba === a.chave} role="tab" aria-selected={aba === a.chave}
            onClick={() => setParams({ aba: a.chave }, { replace: true })}>{a.label}</Pilula>
        ))}
      </div>
      <Carga linhas={5}>
        {aba === 'recorrencias' && <Recorrencias />}
        {aba === 'metas' && <Metas />}
        {aba === 'categorias' && <Categorias />}
      </Carga>
    </div>
  )
}

/** Assinaturas e contas fixas. */
function Recorrencias() {
  const { recorrencias, contexto, recarregar } = useFinancas()
  const nomes = useNomes()
  const [folha, setFolha] = useState<{ r?: Recorrencia } | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }

  const mudarRecorrencia = async (r: Recorrencia, estado: 'pausar' | 'retomar' | 'encerrar') => {
    try {
      await financas.estadoRecorrencia(r.id, estado)
      await apos(estado === 'pausar' ? 'Recorrência pausada'
        : estado === 'retomar' ? 'Recorrência retomada' : 'Recorrência encerrada')
    } catch (e) { setAviso({ texto: (e as Error).message, tipo: 'erro' }) }
  }

  const visiveis = recorrencias.filter((x) => !contexto || x.contexto === contexto)
  // Pausada não gera cobrança: não é custo do mês enquanto estiver parada.
  const ativas = visiveis.filter((x) => !x.pausada_em)

  return (
    <>
      <div className="grade-indicadores">
        <Indicador rotulo="Custo recorrente"
          valor={fmtBRL(ativas.reduce((s, x) =>
            s + (x.tipo === 'saida' ? custoMensal(x.valor_cents, x.periodicidade) : 0), 0))}
          nota={`${ativas.length} ativas · por mês`} />
      </div>

      <Painel titulo="Assinaturas e recorrências"
        acao={<Botao compacto onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={14} />Nova
        </Botao>}>
        {/* Editar muda só o molde: o que já foi gerado é obrigação real e
            fica como está — ver recorrencias.upsert na edge. */}
        {visiveis.length === 0 ? (
          <Vazio icone="cronograma" titulo="Nenhuma recorrência ativa"
            instrucao="Cadastre assinaturas e contas fixas para o painel lançar sozinho todo mês."
            acao={<Botao variante="primario" onClick={() => setFolha({})}>Cadastrar</Botao>} />
        ) : (
          <ul className="lista">
            {visiveis.map((x) => (
              <li key={x.id} className="lista-item" data-cancelado={x.pausada_em ? 'true' : undefined}>
                <span className="marca-cor" aria-hidden
                  style={{ background: x.tipo === 'entrada' ? 'var(--acento)' : 'var(--coral)' }} />
                <span className="celula">
                  <span className="t-ui espremer">{x.nome}</span>
                  <span className="t-legenda espremer">
                    {[
                      rotuloPeriodo(x.periodicidade),
                      x.categoria_id ? nomes.categoria.get(x.categoria_id)?.nome : null,
                      x.conta_id ? nomes.conta.get(x.conta_id)?.nome : null,
                      x.contexto,
                    ].filter(Boolean).join(' · ')}
                    {x.pausada_em
                      ? ' · pausada'
                      : x.proxima_cobranca ? ` · próxima em ${dataCurta(x.proxima_cobranca)}` : ''}
                    {` · desde ${dataCurta(x.inicio)}`}{x.fim ? ` até ${dataCurta(x.fim)}` : ''}
                  </span>
                </span>
                <span className="col-desktop t-legenda">
                  {fmtBRL(custoAnual(x.valor_cents, x.periodicidade))}/ano
                </span>
                <Dinheiro cents={x.valor_cents} className="t-valor" />
                {/* Pausar suspende a geração sem apagar o que já virou
                    obrigação; encerrar tira do painel e mantém o histórico. */}
                <Botao variante="icone"
                  aria-label={x.pausada_em ? `Retomar ${x.nome}` : `Pausar ${x.nome}`}
                  onClick={() => void mudarRecorrencia(x, x.pausada_em ? 'retomar' : 'pausar')}>
                  <Icone nome={x.pausada_em ? 'iteracao' : 'pendente'} tamanho={16} />
                </Botao>
                <Botao variante="icone" aria-label={`Editar ${x.nome}`} onClick={() => setFolha({ r: x })}>
                  <Icone nome="editar" tamanho={16} />
                </Botao>
                <Botao variante="icone" aria-label={`Encerrar ${x.nome}`}
                  onClick={() => void mudarRecorrencia(x, 'encerrar')}>
                  <Icone nome="excluir" tamanho={16} />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {folha && <FolhaRecorrencia inicial={folha.r} aoFechar={fechar} aoSalvar={apos} />}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </>
  )
}
