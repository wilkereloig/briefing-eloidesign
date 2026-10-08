import { useMemo, useState } from 'react'
import { financas } from '../../../../lib/api'
import { fmtBRL } from '../../../../lib/dinheiro'
import { useFinancas, useNomes } from '../../../../lib/financas-store'
import { resumoEmprestimo, type ResumoEmprestimo } from '../../../../domain/financeiro'
import type { Emprestimo } from '../../../../lib/tipos'
import { Aviso, Botao, Card, Chip, Icone, Indicador, Painel, Progresso, Vazio } from '../../../../ui/componentes'
import { Carga, ChipMovimento, Dinheiro } from '../../../../ui/painel'
import { dataLonga } from '../../../../ui/formato'
import { FolhaEmprestimo, FolhaExcluir } from '../../folhas'

/** Empréstimos da lente: quanto falta, quanto já foi, juros e a próxima
 *  parcela. As parcelas são lançamentos comuns (pagar = liquidar na Agenda);
 *  aqui é só o retrato de cada contrato. Números saem de resumoEmprestimo. */
export default function Emprestimos() {
  const { emprestimos, transacoes, contexto, recarregar } = useFinancas()
  const [folha, setFolha] = useState<{ tipo: 'editar'; e?: Emprestimo } | { tipo: 'encerrar'; e: Emprestimo } | null>(null)
  const [verEncerrados, setVerEncerrados] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const fechar = () => setFolha(null)
  const apos = async (msg: string) => { setAviso(msg); await recarregar() }

  const lista = useMemo(() => emprestimos
    .filter((e) => !contexto || e.contexto === contexto)
    .map((e) => ({ e, r: resumoEmprestimo(e, transacoes) })), [emprestimos, transacoes, contexto])
  const ativos = lista.filter((x) => x.e.ativo)
  const encerrados = lista.filter((x) => !x.e.ativo)
  const emAberto = ativos.reduce((s, x) => s + x.r.falta_cents, 0)

  return (
    <Carga linhas={4}>
      <div className="grade-indicadores">
        <Indicador dominante rotulo="Total em aberto" valor={fmtBRL(emAberto)}
          nota={`${ativos.length} ${ativos.length === 1 ? 'empréstimo ativo' : 'empréstimos ativos'}`} />
      </div>

      <Painel titulo="Empréstimos"
        acao={<Botao compacto onClick={() => setFolha({ tipo: 'editar' })}>
          <Icone nome="adicionar" tamanho={14} />Novo empréstimo
        </Botao>}>
        {ativos.length === 0 ? (
          <Vazio icone="dinheiro" titulo="Nenhum empréstimo ativo"
            instrucao="Cadastre o empréstimo para lançar as parcelas e acompanhar quanto falta."
            acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'editar' })}>Cadastrar empréstimo</Botao>} />
        ) : (
          <div className="grade-indicadores">
            {ativos.map(({ e, r }) => (
              <CardEmprestimo key={e.id} e={e} r={r}
                aoEditar={() => setFolha({ tipo: 'editar', e })}
                aoEncerrar={() => setFolha({ tipo: 'encerrar', e })} />
            ))}
          </div>
        )}
      </Painel>

      {encerrados.length > 0 && (
        <Painel titulo={`Encerrados (${encerrados.length})`}
          acao={<Botao compacto aria-expanded={verEncerrados} onClick={() => setVerEncerrados((v) => !v)}>
            {verEncerrados ? 'Ocultar' : 'Mostrar'}
          </Botao>}>
          {verEncerrados
            ? <div className="grade-indicadores">
              {encerrados.map(({ e, r }) => <CardEmprestimo key={e.id} e={e} r={r} />)}
            </div>
            : <p className="t-sec">Fora do total em aberto e do patrimônio. As parcelas lançadas continuam nos lançamentos.</p>}
        </Painel>
      )}

      {folha?.tipo === 'editar' && (
        <FolhaEmprestimo inicial={folha.e} contextoInicial={contexto} aoFechar={fechar} aoSalvar={apos} />
      )}
      {folha?.tipo === 'encerrar' && (
        <FolhaExcluir acao="Encerrar" titulo={`Encerrar "${folha.e.nome}"?`}
          consequencia="Sai da lista de ativos e do patrimônio líquido. Nada é apagado: as parcelas já lançadas ficam como estão."
          aoFechar={fechar}
          aoConfirmar={async () => {
            await financas.encerrarEmprestimo(folha.e.id)
            await apos('Empréstimo encerrado')
          }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </Carga>
  )
}

function CardEmprestimo({ e, r, aoEditar, aoEncerrar }:
  { e: Emprestimo; r: ResumoEmprestimo; aoEditar?: () => void; aoEncerrar?: () => void }) {
  const nomes = useNomes()
  const p = r.proxima
  const contaDaProxima = p?.conta_id ? nomes.conta.get(p.conta_id)?.nome : null
  return (
    <Card className="pilha" style={{ gap: 'var(--espaco-03)' }}>
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="celula">
          <span className="t-card espremer">{e.nome}</span>
          <span className="t-legenda espremer">{[e.instituicao, e.contexto].filter(Boolean).join(' · ')}</span>
        </span>
        {e.ativo ? (
          <span className="linha" style={{ gap: 0 }}>
            <Botao variante="icone" aria-label={`Editar ${e.nome}`} onClick={aoEditar}>
              <Icone nome="editar" tamanho={16} />
            </Botao>
            <Botao variante="icone" aria-label={`Encerrar ${e.nome}`} onClick={aoEncerrar}>
              <Icone nome="excluir" tamanho={16} />
            </Botao>
          </span>
        ) : <Chip estado="rascunho">Encerrado</Chip>}
      </div>

      <span className="pilha" style={{ gap: 'var(--espaco-01)' }}>
        <Progresso pct={r.progresso * 100} rotulo={`Parcelas pagas de ${e.nome}`} />
        <span className="t-legenda">{r.parcelas_pagas} de {e.parcelas_total} parcelas pagas</span>
      </span>

      <dl className="ficha">
        <div><dt className="etiqueta-mini">Pago</dt><dd><Dinheiro cents={r.pago_cents} className="t-valor" /></dd></div>
        <div><dt className="etiqueta-mini">Falta</dt><dd><Dinheiro cents={r.falta_cents} className="t-valor" /></dd></div>
        <div><dt className="etiqueta-mini">Juros</dt><dd>
          {r.juros_cents == null
            ? <span className="t-legenda">valor recebido não informado</span>
            : <Dinheiro cents={r.juros_cents} className="t-valor" />}
        </dd></div>
        <div><dt className="etiqueta-mini">Quitação</dt><dd className="t-corpo">{dataLonga(r.quitacao)}</dd></div>
      </dl>

      <div className="pilha" style={{ gap: 'var(--espaco-02)' }}>
        <span className="etiqueta-mini">Próxima parcela</span>
        {p ? (
          <span className="linha" style={{ gap: 'var(--espaco-02)', flexWrap: 'wrap' }}>
            <span className="t-corpo">{p.data_vencimento ? dataLonga(p.data_vencimento) : 'sem data'}</span>
            <Dinheiro cents={p.valor_cents} className="t-valor" />
            {contaDaProxima && <span className="t-legenda">{contaDaProxima}</span>}
            <ChipMovimento status={p.status} />
          </span>
        ) : <span className="t-legenda">Nenhuma em aberto</span>}
      </div>
    </Card>
  )
}
