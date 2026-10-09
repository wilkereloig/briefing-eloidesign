import { useCallback, useEffect, useMemo, useState } from 'react'
import { financas } from '../../../../lib/api'
import { fmtBRL } from '../../../../lib/dinheiro'
import { useFinancas } from '../../../../lib/financas-store'
import { eventosPorDia, lerPlano, resumoPlano, type EventoPlano, type PlanoPagamento } from '../../../../domain/plano'
import { Chip, Erro, Esqueleto, Indicador, Painel, Vazio } from '../../../../ui/componentes'
import { dataCurta, diaMes, fmtCompacto } from '../../../../ui/formato'

type Estado =
  | { fase: 'carregando' }
  | { fase: 'erro'; causa: string }
  | { fase: 'vazio' }
  | { fase: 'invalido' }
  | { fase: 'ok'; plano: PlanoPagamento; titulo: string; gerado_em: string }

/**
 * Plano de pagamentos dia a dia: quanto sai, quanto entra e de onde vem o
 * dinheiro (conta ou cheque especial). É um retrato gerado sob pedido e gravado
 * em `eloi_relatorios`; a tela mostra o mais recente e não recalcula nada —
 * os números saem de domain/plano.ts.
 */
export default function Plano() {
  const { contexto } = useFinancas()
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' })

  const carregar = useCallback(async () => {
    setEstado({ fase: 'carregando' })
    try {
      const r = await financas.planoPagamento(contexto ?? undefined)
      if (!r) return setEstado({ fase: 'vazio' })
      const plano = lerPlano(r.dados)
      setEstado(plano ? { fase: 'ok', plano, titulo: r.titulo, gerado_em: r.gerado_em } : { fase: 'invalido' })
    } catch (e) { setEstado({ fase: 'erro', causa: (e as Error).message }) }
  }, [contexto])
  useEffect(() => { void carregar() }, [carregar])

  if (estado.fase === 'carregando') return <Esqueleto linhas={6} altura={48} />
  if (estado.fase === 'erro') return <Erro causa={estado.causa} aoTentar={() => void carregar()} />
  if (estado.fase === 'vazio') return (
    <Vazio icone="cronograma" titulo="Nenhum plano gerado"
      instrucao="Peça ao assistente para gerar o plano de pagamentos: ele calcula com os dados do painel e o plano aparece aqui." />
  )
  if (estado.fase === 'invalido') return (
    <Vazio icone="erro" titulo="Plano em formato desconhecido"
      instrucao="O último plano gravado não passou na conferência. Peça para gerar de novo." />
  )
  return <Conteudo plano={estado.plano} titulo={estado.titulo} geradoEm={estado.gerado_em} />
}

function Conteudo({ plano, titulo, geradoEm }: { plano: PlanoPagamento; titulo: string; geradoEm: string }) {
  const r = useMemo(() => resumoPlano(plano), [plano])
  const dias = useMemo(() => eventosPorDia(plano), [plano])

  return (
    <div className="pilha" data-density="dense">
      <p className="t-legenda">
        {titulo} · {dataCurta(plano.de)} a {dataCurta(plano.ate)} · gerado em{' '}
        {new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </p>

      <div className="grade-indicadores">
        <Indicador rotulo="Pico do cheque especial" valor={fmtBRL(r.pico_cheque_cents)}
          cor={r.pico_cheque_cents > 0 ? 'coral' : undefined}
          nota={r.pico_em ? `em ${dataCurta(r.pico_em)} · limite ${fmtBRL(plano.limite_cheque_cents)}` : 'não usa o cheque'} />
        <Indicador rotulo="Dias no cheque" valor={String(r.dias_no_cheque)}
          nota={`juros estimados ${fmtBRL(r.juros_cheque_cents)}`} />
        <Indicador rotulo="Entra no período" valor={fmtBRL(r.entra_cents)} cor="acento"
          nota={`sai ${fmtBRL(r.sai_cents)}`} />
        <Indicador rotulo="Saldo no fim" valor={fmtBRL(r.saldo_final_cents)}
          cor={r.saldo_final_cents < 0 ? 'coral' : undefined} nota={`em ${dataCurta(plano.ate)}`} />
      </div>

      {plano.decisoes.length > 0 && (
        <Painel titulo="Decisões">
          <ul className="lista">
            {plano.decisoes.map((d) => (
              <li key={d.titulo} className="lista-item">
                <span className="celula">
                  <span className="t-ui">{d.titulo}</span>
                  <span className="t-legenda">{d.texto}</span>
                </span>
                {d.urgente
                  ? <Chip estado="atrasado">{d.prazo ? `até ${diaMes(d.prazo)}` : 'urgente'}</Chip>
                  : d.prazo && <Chip estado="aguardando">até {diaMes(d.prazo)}</Chip>}
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <Painel titulo="Dinheiro em conta × cheque especial">
        <Grafico plano={plano} />
      </Painel>

      {dias.map((g) => (
        <Painel key={g.data} titulo={dataCurta(g.data)}>
          <ul className="lista">{g.eventos.map((e, i) => <LinhaEvento key={i} e={e} />)}</ul>
        </Painel>
      ))}

      {plano.premissas.length > 0 && (
        <Painel titulo="Premissas">
          <ul className="lista">
            {plano.premissas.map((p) => <li key={p} className="lista-item t-legenda">{p}</li>)}
          </ul>
        </Painel>
      )}
    </div>
  )
}

/** De onde sai e para onde vai: o chip diz a fonte com ícone e texto. */
function LinhaEvento({ e }: { e: EventoPlano }) {
  const sinal = e.tipo === 'paga' ? '− ' : e.tipo === 'recebe' ? '+ ' : ''
  return (
    <li className="lista-item">
      <span className="celula">
        <span className="t-ui">{e.descricao}</span>
        {e.nota && <span className="t-legenda">{e.nota}</span>}
      </span>
      <span className="linha plano-fontes">
        {e.tipo === 'paga' && e.caixa_cents > 0 && <Chip estado="previsto">conta {fmtBRL(e.caixa_cents)}</Chip>}
        {e.tipo === 'paga' && e.cheque_cents > 0 && <Chip estado="atrasado">cheque {fmtBRL(e.cheque_cents)}</Chip>}
        {e.tipo === 'recebe' && <Chip estado="pago">recebimento</Chip>}
        {e.tipo === 'recebe' && e.quita_cheque_cents > 0
          && <Chip estado="parcial">devolve cheque {fmtBRL(e.quita_cheque_cents)}</Chip>}
        {e.tipo === 'decisao' && <Chip estado="aguardando">decisão</Chip>}
      </span>
      {e.tipo !== 'decisao' && <span className="dinheiro t-valor">{sinal}{fmtBRL(e.valor_cents)}</span>}
    </li>
  )
}

/** Barras por dia: acima da linha, dinheiro em conta; abaixo, cheque especial em
 *  uso. A posição (cima/baixo) e a legenda informam junto com a cor. */
function Grafico({ plano }: { plano: PlanoPagamento }) {
  const L = 10, ALT = 200
  const maxCaixa = Math.max(1, ...plano.dias.map((d) => d.caixa_cents))
  const maxCheque = Math.max(1, plano.limite_cheque_cents, ...plano.dias.map((d) => d.cheque_cents))
  // Zero onde a proporção entre os dois lados pede, com folga para os rótulos.
  const zero = Math.round(ALT * (maxCaixa / (maxCaixa + maxCheque)))
  const esc = ALT / (maxCaixa + maxCheque)
  const comEvento = new Set(plano.eventos.map((e) => e.data))
  const largura = plano.dias.length * L
  const yLimite = zero + plano.limite_cheque_cents * esc

  return (
    <>
      <div className="plano-grafico rolagem-x">
        <svg viewBox={`0 0 ${largura} ${ALT + 18}`} preserveAspectRatio="none" role="img"
          aria-label={`Por dia: dinheiro em conta acima da linha, cheque especial abaixo. ${plano.dias
            .filter((d) => comEvento.has(d.data))
            .map((d) => `${diaMes(d.data)}: ${d.cheque_cents ? `cheque ${fmtBRL(d.cheque_cents)}` : `conta ${fmtBRL(d.caixa_cents)}`}`)
            .join('; ')}.`}>
          <line x1={0} x2={largura} y1={yLimite} y2={yLimite} className="plano-limite" />
          {plano.dias.map((d, i) => (
            <g key={d.data}>
              <title>{`${diaMes(d.data)} · conta ${fmtBRL(d.caixa_cents)}${d.cheque_cents ? ` · cheque ${fmtBRL(d.cheque_cents)}` : ''}`}</title>
              <rect x={i * L + 1} width={L - 2} y={zero - d.caixa_cents * esc} height={d.caixa_cents * esc} className="plano-conta" />
              <rect x={i * L + 1} width={L - 2} y={zero} height={d.cheque_cents * esc} className="plano-cheque" />
              {/* rect, não circle: o SVG estica na horizontal e o círculo viraria elipse. */}
              {comEvento.has(d.data) && <rect x={i * L + 2} y={ALT + 5} width={L - 4} height={6} className="plano-marca" />}
            </g>
          ))}
          <line x1={0} x2={largura} y1={zero} y2={zero} className="plano-zero" />
        </svg>
      </div>
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <span className="etiqueta-mini">{diaMes(plano.dias[0].data)}</span>
        <span className="etiqueta-mini">{diaMes(plano.dias[plano.dias.length - 1].data)}</span>
      </div>
      <div className="linha" style={{ marginTop: 'var(--espaco-03)', flexWrap: 'wrap' }}>
        <span className="legenda-item"><span className="ponto-cor plano-conta" />Em conta (acima da linha) · até {fmtCompacto(maxCaixa)}</span>
        <span className="legenda-item"><span className="ponto-cor plano-cheque" />Cheque especial (abaixo)</span>
        <span className="legenda-item"><span className="ponto-cor plano-marca" />Dia com conta ou recebimento</span>
        <span className="legenda-item">Tracejado: limite do cheque</span>
      </div>
    </>
  )
}
