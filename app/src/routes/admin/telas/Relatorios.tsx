import { useMemo, useState } from 'react'
import { financas } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { deslocarMes, hojeISO, useFinancas, useNomes } from '../../../lib/financas-store'
import {
  agrupar, consumoOrcamento, previsaoCaixa, resultado, valorLiquidado,
} from '../../../domain/financeiro'
import type { Contexto, Meta } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Etiqueta, Folha, Icone, Indicador, Painel, Pilula, Progresso, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro, SeletorLente } from '../../../ui/painel'

type Aba = 'resultado' | 'clientes' | 'categorias' | 'previsao' | 'metas'
const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'resultado', label: 'Resultado' },
  { chave: 'clientes', label: 'Por cliente' },
  { chave: 'categorias', label: 'Por categoria' },
  { chave: 'previsao', label: 'Previsão' },
  { chave: 'metas', label: 'Metas e orçamentos' },
]

export default function Relatorios() {
  const { contas, transacoes, metas, mes, contexto, recarregar } = useFinancas()
  const nomes = useNomes()
  const hoje = hojeISO()
  const [aba, setAba] = useState<Aba>('resultado')
  const [folha, setFolha] = useState<Meta | 'nova' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Doze meses terminando no mês em foco. A janela do store cobre exatamente
  // isso, então nenhuma coluna aparece truncada por falta de dado carregado.
  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => deslocarMes(mes, i - 11)), [mes])

  const serie = useMemo(() => meses.map((m) => {
    const r = resultado(transacoes, contexto, m)
    return { mes: m, ...r }
  }), [meses, transacoes, contexto])

  const teto = Math.max(...serie.map((s) => Math.max(s.receita_cents, s.despesa_cents)), 1)
  const totalAno = serie.reduce((acc, s) => ({
    receita: acc.receita + s.receita_cents,
    despesa: acc.despesa + s.despesa_cents,
  }), { receita: 0, despesa: 0 })

  const porCliente = useMemo(
    () => agrupar(transacoes.filter((t) => !contexto || t.contexto === contexto),
      (t) => t.cliente_id, 'entrada'), [transacoes, contexto])
  const porCategoria = useMemo(
    () => agrupar(transacoes.filter((t) => !contexto || t.contexto === contexto),
      (t) => t.categoria_id, 'saida'), [transacoes, contexto])

  const cenarios = useMemo(
    () => previsaoCaixa(contas, transacoes, hoje, 90, contexto), [contas, transacoes, hoje, contexto])

  const metasVisiveis = metas.filter((m) => !contexto || m.contexto === contexto)

  return (
    <div className="tela pilha">
      <Cabecalho secao="Análise" titulo="Relatórios">
        <SeletorLente />
      </Cabecalho>

      <Carga linhas={5}>
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
                valor={fmtBRL(ticketMedio(transacoes.filter((t) => !contexto || t.contexto === contexto)))}
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
              <div className="linha" style={{ marginTop: 'var(--e-7)' }}>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--roxo)' }} />Recebido</span>
                <span className="legenda-item"><span className="ponto-cor" style={{ background: 'var(--coral)' }} />Gasto</span>
              </div>
            </Painel>
          </>
        )}

        {aba === 'clientes' && (
          <Painel titulo="Faturamento por cliente"
            acao={<span className="t-legenda">{porCliente.length} clientes</span>}>
            {porCliente.length === 0
              ? <Vazio icone="cliente" titulo="Nenhuma receita por cliente"
                instrucao="Vincule os recebimentos a clientes para ver o ranking." />
              : <Ranking itens={porCliente.map((f) => ({
                chave: nomes.cliente.get(f.chave)?.nome ?? 'Cliente removido',
                total: f.total_cents, qtd: f.qtd,
              }))} />}
          </Painel>
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
              <p className="t-sec" style={{ marginTop: 'var(--e-5)' }}>
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
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
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
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div>
          <Etiqueta>Tipo</Etiqueta>
          <div className="linha" style={{ marginTop: 'var(--e-3)' }}>
            <Pilula ativa={especie === 'orcamento'} onClick={() => setEspecie('orcamento')}>
              Limite de gasto
            </Pilula>
            <Pilula ativa={especie === 'meta'} onClick={() => setEspecie('meta')}>
              Meta de acúmulo
            </Pilula>
          </div>
          <p className="t-legenda" style={{ marginTop: 'var(--e-3)' }}>
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
