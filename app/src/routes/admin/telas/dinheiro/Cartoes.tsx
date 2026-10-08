import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fmtBRL } from '../../../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../../../lib/financas-store'
import {
  dividaDoCartao, faturasDoCartao, indiceFaturaAtual, limiteDisponivel, parceladoAberto,
} from '../../../../domain/financeiro'
import type { Conta, Transacao } from '../../../../lib/tipos'
import { Aviso, Botao, Icone, Painel, Progresso, Vazio } from '../../../../ui/componentes'
import { Carga, Dinheiro } from '../../../../ui/painel'
import { FolhaConta } from '../../folhas'
import { diaMes } from '../../../../ui/formato'
import { ChipFatura } from './compartilhado'

/** Cartões ativos da lente: fatura atual, limite usado e parcelado. O card
 *  inteiro leva à página do cartão, onde ficam as faturas mês a mês. */
export default function Cartoes() {
  const { contas, transacoes, contexto, recarregar } = useFinancas()
  const [params, setParams] = useSearchParams()
  // `?novo=1` abre a folha direto e sai do endereço (mesmo padrão de Contas).
  const [novo, setNovo] = useState(params.get('novo') === '1')
  useEffect(() => { if (params.has('novo')) setParams({}, { replace: true }) }, [params, setParams])
  const [aviso, setAviso] = useState<string | null>(null)
  const apos = async (msg: string) => { setAviso(msg); await recarregar() }
  const hoje = hojeISO()

  const cartoes = contas.filter((c) =>
    c.tipo === 'cartao_credito' && c.ativa && (!contexto || c.contexto === contexto))

  return (
    <Carga linhas={4}>
      <Painel titulo="Cartões"
        acao={<Botao compacto onClick={() => setNovo(true)}>
          <Icone nome="adicionar" tamanho={14} />Novo cartão
        </Botao>}>
        {cartoes.length === 0 ? (
          <Vazio icone="pagamento" titulo="Nenhum cartão ativo"
            instrucao="Cadastre o cartão para acompanhar fatura, limite e parcelas."
            acao={<Botao variante="primario" onClick={() => setNovo(true)}>Cadastrar cartão</Botao>} />
        ) : (
          <div className="grade-indicadores">
            {cartoes.map((c) => <CardCartao key={c.id} c={c} transacoes={transacoes} hoje={hoje} />)}
          </div>
        )}
      </Painel>

      {novo && (
        <FolhaConta contextoInicial={contexto} tipoInicial="cartao_credito"
          aoFechar={() => setNovo(false)} aoSalvar={apos} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </Carga>
  )
}

function CardCartao({ c, transacoes, hoje }: { c: Conta; transacoes: Transacao[]; hoje: string }) {
  const faturas = faturasDoCartao(c, transacoes, hoje)
  const f = faturas[indiceFaturaAtual(faturas, hoje)]
  const divida = dividaDoCartao(c, transacoes)
  const disponivel = limiteDisponivel(c, transacoes)
  const parcelado = parceladoAberto(c, transacoes)
  return (
    <Link to={`/admin/dinheiro/cartoes/${c.id}`} className="card card-hover conta-card lista-link">
      <span className="linha" style={{ justifyContent: 'space-between' }}>
        <span className="t-card espremer">{c.nome}</span>
        <span className="ponto-cor" style={{ background: c.cor || 'var(--roxo)' }} aria-hidden />
      </span>
      <span className="t-legenda espremer">{[c.instituicao, c.contexto].filter(Boolean).join(' · ')}</span>

      <span style={{ marginTop: 'var(--espaco-03)' }}>
        <Dinheiro cents={f?.falta_cents ?? 0} className="t-valor-g" />
      </span>
      <span className="linha" style={{ gap: 'var(--espaco-02)', flexWrap: 'wrap' }}>
        {f
          ? <><span className="t-legenda">Fatura · vence {diaMes(f.vencimento)}</span><ChipFatura situacao={f.situacao} /></>
          : <span className="t-legenda">Sem fatura</span>}
      </span>

      <span className="pilha" style={{ gap: 'var(--espaco-01)', marginTop: 'auto', paddingTop: 'var(--espaco-03)' }}>
        {c.limite_cents && disponivel != null ? (
          <>
            <Progresso pct={(divida / c.limite_cents) * 100} rotulo={`Limite usado de ${c.nome}`} />
            <span className="t-legenda">{fmtBRL(disponivel)} disponível de {fmtBRL(c.limite_cents)}</span>
          </>
        ) : <span className="t-legenda">Limite não informado</span>}
        <span className="t-legenda">
          Parcelado: {parcelado.qtd ? `${parcelado.qtd} ${parcelado.qtd === 1 ? 'parcela' : 'parcelas'} · ${fmtBRL(parcelado.cents)}` : 'nenhum'}
        </span>
      </span>
    </Link>
  )
}
