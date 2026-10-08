import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFinancas } from '../../../../lib/financas-store'
import { saldoConta } from '../../../../domain/financeiro'
import type { Conta, Transacao } from '../../../../lib/tipos'
import { Aviso, Botao, Etiqueta, Icone, Painel, Vazio } from '../../../../ui/componentes'
import { Carga, Dinheiro } from '../../../../ui/painel'
import { rotuloConta } from '../../../../ui/formato'
import { FolhaConta } from '../../folhas'
import { LegendaCheque } from './compartilhado'

/** Contas que guardam dinheiro (tudo menos cartão — cartão tem página própria).
 *  Arquivadas ficam recolhidas: somem da soma, não do histórico. */
export default function Contas() {
  const { contas, transacoes, contexto, recarregar } = useFinancas()
  const [params, setParams] = useSearchParams()
  // `?novo=1` (link da Visão geral) abre a folha direto. Sai do endereço logo
  // depois, senão recarregar a página reabriria a folha.
  const [nova, setNova] = useState(params.get('novo') === '1')
  useEffect(() => { if (params.has('novo')) setParams({}, { replace: true }) }, [params, setParams])
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const apos = async (msg: string) => { setAviso(msg); await recarregar() }

  const doContexto = contas.filter((c) => c.tipo !== 'cartao_credito' && (!contexto || c.contexto === contexto))
  const ativas = doContexto.filter((c) => c.ativa)
  const arquivadas = doContexto.filter((c) => !c.ativa)

  return (
    <Carga linhas={4}>
      <Painel titulo="Contas"
        acao={<Botao compacto onClick={() => setNova(true)}>
          <Icone nome="adicionar" tamanho={14} />Nova conta
        </Botao>}>
        {ativas.length === 0 ? (
          <Vazio icone="caixa" titulo="Nenhuma conta ativa"
            instrucao="Sem conta o painel não tem onde somar saldo."
            acao={<Botao variante="primario" onClick={() => setNova(true)}>Cadastrar conta</Botao>} />
        ) : (
          <div className="grade-indicadores">
            {ativas.map((c) => <CardConta key={c.id} c={c} transacoes={transacoes} />)}
          </div>
        )}
      </Painel>

      {arquivadas.length > 0 && (
        <Painel titulo={`Arquivadas (${arquivadas.length})`}
          acao={<Botao compacto aria-expanded={verArquivadas} onClick={() => setVerArquivadas((v) => !v)}>
            {verArquivadas ? 'Ocultar' : 'Mostrar'}
          </Botao>}>
          {verArquivadas
            ? <div className="grade-indicadores">
              {arquivadas.map((c) => <CardConta key={c.id} c={c} transacoes={transacoes} />)}
            </div>
            : <p className="t-sec">Fora do saldo e das listas de lançamento. O extrato continua disponível.</p>}
        </Painel>
      )}

      {nova && (
        <FolhaConta contextoInicial={contexto} aoFechar={() => setNova(false)} aoSalvar={apos} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </Carga>
  )
}

/** O card inteiro é o link: a ação principal de uma conta é abrir o extrato. */
function CardConta({ c, transacoes }: { c: Conta; transacoes: Transacao[] }) {
  const saldo = saldoConta(c, transacoes)
  return (
    <Link to={`/admin/dinheiro/contas/${c.id}`} className="card card-hover conta-card lista-link">
      <span className="linha" style={{ justifyContent: 'space-between' }}>
        <Etiqueta mini>{rotuloConta(c.tipo)}</Etiqueta>
        <span className="ponto-cor" style={{ background: c.cor || 'var(--roxo)' }} aria-hidden />
      </span>
      <span className="t-card espremer" style={{ marginTop: 'var(--espaco-02)' }}>{c.nome}</span>
      <span className="t-legenda espremer">{[c.instituicao, c.contexto].filter(Boolean).join(' · ')}</span>
      <span style={{ marginTop: 'auto', paddingTop: 'var(--espaco-03)' }}>
        <Dinheiro cents={saldo} className="t-valor-g" />
      </span>
      {!!c.limite_cents && <LegendaCheque saldo={saldo} limite={c.limite_cents} />}
    </Link>
  )
}
