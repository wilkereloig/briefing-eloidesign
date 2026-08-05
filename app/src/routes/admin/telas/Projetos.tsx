import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtBRL } from '../../../lib/dinheiro'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import { juntarProjetos, type Etapa } from '../../../domain/projeto'
import { Botao, Chip, Icone, Indicador, Painel, Pilula, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro } from '../../../ui/painel'
import type { EstadoChip } from '../../../ui/tokens'

// Etapa é calculada de orçamento + serviço (domain/projeto.ts), não é coluna.
const ETAPAS: { chave: Etapa; label: string; chip: EstadoChip }[] = [
  { chave: 'orcamento', label: 'Orçamento', chip: 'rascunho' },
  { chave: 'aprovado', label: 'Aprovado', chip: 'fila' },
  { chave: 'execucao', label: 'Em execução', chip: 'execucao' },
  { chave: 'entregue', label: 'Entregue', chip: 'aberto' },
  { chave: 'pago', label: 'Pago', chip: 'pago' },
]
const ETAPA_INFO = new Map(ETAPAS.map((e) => [e.chave, e]))

export default function Projetos() {
  const { orcamentos, servicos } = useFinancas()
  const nomes = useNomes()
  const [etapa, setEtapa] = useState<Etapa | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const projetos = useMemo(() => juntarProjetos(orcamentos, servicos), [orcamentos, servicos])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return projetos.filter((p) => {
      if (etapa !== 'todos' && p.etapa !== etapa) return false
      if (!q) return true
      const cliente = p.clienteId ? nomes.cliente.get(p.clienteId)?.nome ?? '' : ''
      return p.titulo.toLowerCase().includes(q) || cliente.toLowerCase().includes(q)
    })
  }, [projetos, etapa, busca, nomes])

  // Agrupa por cliente. Sub-cliente aparece como etiqueta na linha: é
  // agrupamento de marca, não cliente próprio (ver CONTEXT.md).
  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof filtrados>()
    for (const p of filtrados) {
      const k = p.clienteId ?? 'sem-cliente'
      mapa.set(k, [...(mapa.get(k) ?? []), p])
    }
    return [...mapa.entries()]
      .map(([id, itens]) => ({
        id,
        nome: id === 'sem-cliente' ? 'Sem cliente' : nomes.cliente.get(id)?.nome ?? 'Cliente removido',
        cor: id === 'sem-cliente' ? 'var(--linha-forte)' : nomes.cliente.get(id)?.cor || 'var(--roxo)',
        itens,
        total: itens.reduce((s, p) => s + p.valorCents, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [filtrados, nomes])

  const porEtapa = (e: Etapa) => projetos.filter((p) => p.etapa === e)

  return (
    <div className="tela pilha">
      <Cabecalho secao="Operação" titulo="Projetos e serviços" />

      <Carga linhas={5}>
        {projetos.length === 0 ? (
          <Vazio icone="projetos" titulo="Nenhum projeto ainda"
            instrucao="Projetos aparecem aqui quando um orçamento é criado ou um serviço é registrado na gestão." />
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

            <div className="abas" role="tablist" aria-label="Etapa">
              <Pilula ativa={etapa === 'todos'} role="tab" aria-selected={etapa === 'todos'}
                onClick={() => setEtapa('todos')}>Todos</Pilula>
              {ETAPAS.map((e) => (
                <Pilula key={e.chave} ativa={etapa === e.chave} role="tab" aria-selected={etapa === e.chave}
                  onClick={() => setEtapa(e.chave)}>
                  {e.label} · {porEtapa(e.chave).length}
                </Pilula>
              ))}
            </div>

            <div className="busca">
              <Icone nome="pesquisa" tamanho={17} />
              <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por projeto ou cliente" aria-label="Buscar projeto" />
              {busca && (
                <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                  <Icone nome="fechar" tamanho={14} />
                </Botao>
              )}
            </div>

            {grupos.length === 0 ? (
              <Vazio icone="pesquisa" titulo="Nenhum projeto nesse filtro"
                instrucao="Ajuste a etapa ou limpe a busca."
                acao={<Botao onClick={() => { setEtapa('todos'); setBusca('') }}>Limpar filtros</Botao>} />
            ) : grupos.map((g) => (
              <Painel key={g.id}
                titulo={<span className="linha">
                  <span className="marca-grupo" style={{ background: g.cor }} aria-hidden />
                  <span className="etiqueta etiqueta-acento">{g.nome}</span>
                </span>}
                acao={<Dinheiro cents={g.total} className="t-valor" />}>
                <ul className="lista">
                  {g.itens.map((p) => {
                    const info = ETAPA_INFO.get(p.etapa)!
                    const sub = p.servico?.sub_cliente
                    const semNota = !p.servico?.nf_numero && (p.etapa === 'pago' || p.etapa === 'entregue')
                    return (
                      <li key={p.id} className="lista-item">
                        <span className="celula">
                          <span className="t-ui espremer">{p.titulo}</span>
                          <span className="t-legenda espremer">
                            {sub ? <span className="sub-cliente">{sub}</span> : null}
                            {p.servico?.nf_numero ? `NF ${p.servico.nf_numero}` : semNota ? 'Sem nota fiscal' : ''}
                            {p.servico?.data_competencia ? ` · ${p.servico.data_competencia.slice(0, 7)}` : ''}
                          </span>
                        </span>
                        {/* estado da NF por ícone além da cor (acessibilidade) */}
                        <span className="col-desktop" style={{ color: semNota ? 'var(--coral)' : 'var(--acento)' }}>
                          <Icone nome="nota-fiscal" tamanho={16}
                            rotulo={p.servico?.nf_numero ? 'Nota emitida' : 'Sem nota fiscal'} />
                        </span>
                        <Dinheiro cents={p.valorCents} className="t-valor" />
                        <Chip estado={info.chip}>{info.label}</Chip>
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
              </Painel>
            ))}
          </>
        )}
      </Carga>
    </div>
  )
}
