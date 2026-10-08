import { useState } from 'react'
import { financas } from '../../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../../../lib/financas-store'
import { consumoDaMeta, consumoOrcamento } from '../../../../domain/financeiro'
import type { Contexto, Meta } from '../../../../lib/tipos'
import {
  Aviso, Botao, Campo, Etiqueta, Folha, Icone, Painel, Pilula, Progresso, Vazio,
} from '../../../../ui/componentes'
import { Dinheiro } from '../../../../ui/painel'

/** Metas de acúmulo e limites de gasto por categoria. Morava numa aba de
 *  Relatórios; desde 2026-10-08 é a aba "Metas e orçamentos" do Planejamento. */
export function Metas() {
  const { metas, transacoes, contexto, recarregar } = useFinancas()
  const [folha, setFolha] = useState<Meta | 'nova' | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)

  const encerrarMeta = async (m: Meta) => {
    try {
      await financas.desativarMeta(m.id)
      setAviso({ texto: 'Meta encerrada' })
      await recarregar()
    } catch (e) {
      setAviso({ texto: (e as Error).message, tipo: 'erro' })
    }
  }

  const metasVisiveis = metas.filter((m) => !contexto || m.contexto === contexto)

  return (
    <>
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
              const gasto = consumoDaMeta(m, transacoes)
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

      {folha && (
        <FolhaMeta inicial={folha === 'nova' ? undefined : folha}
          aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso({ texto: msg }); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </>
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
  const [inicio, setInicio] = useState(inicial?.inicio ?? hojeISO().slice(0, 8) + '01')
  const [fim, setFim] = useState(inicial?.fim ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = 'Dê um nome'
    if (centsDeBRL(alvo) <= 0) e.alvo = 'Informe o valor alvo'
    if (especie === 'orcamento' && !categoriaId) e.categoria = 'Orçamento precisa de uma categoria'
    if (fim && fim < inicio) e.fim = 'O fim vem depois do início'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await financas.salvarMeta({
        id: inicial?.id, especie, nome: nome.trim(), contexto,
        categoria_id: categoriaId || null, alvo_cents: centsDeBRL(alvo), inicio, fim: fim || null,
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

        <div className="campo" data-erro={erros.fim ? 'true' : undefined}>
          <label htmlFor="meta-fim">Fim do período</label>
          <input id="meta-fim" type="date" className="campo-caixa" value={fim}
            onChange={(e) => setFim(e.target.value)} />
          {erros.fim
            ? <span className="campo-erro" role="alert">{erros.fim}</span>
            : <span className="t-legenda">
              {especie === 'orcamento'
                ? 'Vazio: o limite vale só para o mês do início.'
                : 'Vazio: a meta acumula sem data para acabar.'}
            </span>}
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}
