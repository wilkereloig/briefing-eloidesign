import { useMemo, useState } from 'react'
import { financas } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { NotaFiscal, StatusNF } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Folha, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, ChipNota, Dinheiro } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'

const STATUS: StatusNF[] = ['pendente', 'pronta', 'emitida', 'enviada', 'cancelada', 'substituida']
const ROTULO: Record<StatusNF, string> = {
  pendente: 'Pendente', pronta: 'Pronta', emitida: 'Emitida',
  enviada: 'Enviada', cancelada: 'Cancelada', substituida: 'Substituída',
}

export default function Notas() {
  const { notas, servicos, recarregar } = useFinancas()
  const nomes = useNomes()
  const [filtro, setFiltro] = useState<StatusNF | 'todas'>('todas')
  const [folha, setFolha] = useState<{ nf?: NotaFiscal; servicoId?: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Serviço concluído e sem nota é dinheiro faturado que a contabilidade não vê.
  const semNota = useMemo(() => servicos.filter((s) =>
    s.status_execucao === 'concluida' && !s.nf_numero &&
    !notas.some((n) => n.servico_id === s.id && n.status !== 'cancelada')), [servicos, notas])

  const lista = useMemo(() => notas
    .filter((n) => filtro === 'todas' || n.status === filtro)
    .sort((a, b) => (b.competencia ?? '').localeCompare(a.competencia ?? '')), [notas, filtro])

  const emitidas = notas.filter((n) => n.status === 'emitida' || n.status === 'enviada')
  const totalImposto = emitidas.reduce((s, n) => s + n.imposto_cents, 0)

  return (
    <div className="tela pilha">
      <Cabecalho secao="Fiscal" titulo="Notas fiscais">
        <Botao variante="primario" onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={16} />Nova nota
        </Botao>
      </Cabecalho>

      <Carga linhas={4}>
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Emitidas" valor={String(emitidas.length)}
            nota={fmtBRL(emitidas.reduce((s, n) => s + n.valor_cents, 0))} />
          <Indicador rotulo="Aguardando emissão"
            valor={String(notas.filter((n) => n.status === 'pendente' || n.status === 'pronta').length)}
            cor={notas.some((n) => n.status === 'pronta') ? 'coral' : undefined}
            nota="Pendentes e prontas" />
          <Indicador rotulo="Serviços sem nota" valor={String(semNota.length)}
            cor={semNota.length ? 'coral' : undefined} nota="Concluídos e não faturados" />
          <Indicador rotulo="Imposto estimado" valor={fmtBRL(totalImposto)}
            nota="Sobre as notas emitidas" />
        </div>

        {semNota.length > 0 && (
          <Painel titulo="Serviços concluídos sem nota"
            acao={<span className="t-legenda">{semNota.length}</span>}>
            <ul className="lista">
              {semNota.slice(0, 8).map((s) => (
                <li key={s.id} className="lista-item">
                  <span className="marca-cor" style={{ background: 'var(--coral)' }} aria-hidden />
                  <span className="celula">
                    <span className="t-ui espremer">{s.descricao}</span>
                    <span className="t-legenda espremer">
                      {s.cliente_id ? nomes.cliente.get(s.cliente_id)?.nome ?? '' : 'Sem cliente'}
                      {s.data_competencia ? ` · ${s.data_competencia.slice(0, 7)}` : ''}
                    </span>
                  </span>
                  <Dinheiro cents={s.valor_cents} className="t-valor" />
                  <Botao compacto onClick={() => setFolha({ servicoId: s.id })}>Emitir</Botao>
                </li>
              ))}
            </ul>
          </Painel>
        )}

        <div className="abas" role="tablist" aria-label="Status da nota">
          <Pilula ativa={filtro === 'todas'} role="tab" aria-selected={filtro === 'todas'}
            onClick={() => setFiltro('todas')}>Todas · {notas.length}</Pilula>
          {STATUS.map((s) => (
            <Pilula key={s} ativa={filtro === s} role="tab" aria-selected={filtro === s}
              onClick={() => setFiltro(s)}>
              {ROTULO[s]} · {notas.filter((n) => n.status === s).length}
            </Pilula>
          ))}
        </div>

        <Painel titulo={`${lista.length} ${lista.length === 1 ? 'nota' : 'notas'}`}>
          {lista.length === 0 ? (
            <Vazio icone="nota-fiscal" titulo="Nenhuma nota neste filtro"
              instrucao="Registre uma nota fiscal para acompanhar emissão, envio e imposto."
              acao={<Botao variante="primario" onClick={() => setFolha({})}>Nova nota</Botao>} />
          ) : (
            <ul className="lista">
              {lista.map((n) => (
                <li key={n.id} className="lista-item">
                  <Icone nome="nota-fiscal" tamanho={18} />
                  <span className="celula">
                    <span className="t-ui espremer">{n.numero ? `NF ${n.numero}` : 'Sem número'}</span>
                    <span className="t-legenda espremer">
                      {n.cliente_id ? nomes.cliente.get(n.cliente_id)?.nome ?? '' : 'Sem cliente'}
                      {n.competencia ? ` · ${n.competencia.slice(0, 7)}` : ''}
                      {n.emitida_em ? ` · emitida em ${dataCurta(n.emitida_em)}` : ''}
                    </span>
                  </span>
                  {n.imposto_cents > 0 && (
                    <span className="col-desktop t-legenda">imposto {fmtBRL(n.imposto_cents)}</span>
                  )}
                  <Dinheiro cents={n.valor_cents} className="t-valor" />
                  <ChipNota status={n.status} />
                  <Botao variante="icone" aria-label={`Editar nota ${n.numero ?? ''}`}
                    onClick={() => setFolha({ nf: n })}>
                    <Icone nome="editar" tamanho={16} />
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </Carga>

      {folha && (
        <FolhaNota inicial={folha.nf} servicoId={folha.servicoId}
          aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

function FolhaNota({ inicial, servicoId, aoFechar, aoSalvar }: {
  inicial?: NotaFiscal
  servicoId?: string
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes, servicos } = useFinancas()
  const servico = servicoId ? servicos.find((s) => s.id === servicoId) : null

  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? servico?.cliente_id ?? '')
  const [numero, setNumero] = useState(inicial?.numero ?? '')
  const [status, setStatus] = useState<StatusNF>(inicial?.status ?? 'pendente')
  const [valor, setValor] = useState(
    inicial ? fmtBRL(inicial.valor_cents) : servico ? fmtBRL(servico.valor_cents) : '')
  const [imposto, setImposto] = useState(inicial ? fmtBRL(inicial.imposto_cents) : '')
  const [competencia, setCompetencia] = useState(
    inicial?.competencia ?? servico?.data_competencia ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const e: Record<string, string> = {}
    // Regra do servidor repetida aqui só para o erro aparecer antes do envio.
    if ((status === 'emitida' || status === 'enviada') && !numero.trim()) {
      e.numero = 'Nota emitida precisa de número'
    }
    if (centsDeBRL(valor) <= 0) e.valor = 'Informe o valor da nota'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await financas.salvarNota({
        id: inicial?.id,
        cliente_id: clienteId || null,
        servico_id: inicial?.servico_id ?? servicoId ?? null,
        numero: numero.trim() || null,
        status,
        valor_cents: centsDeBRL(valor),
        imposto_cents: centsDeBRL(imposto),
        competencia: competencia || null,
        emitida_em: status === 'emitida' || status === 'enviada'
          ? inicial?.emitida_em ?? new Date().toISOString().slice(0, 10)
          : null,
      })
      aoSalvar(inicial ? 'Nota atualizada' : 'Nota registrada')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar nota fiscal' : 'Nova nota fiscal'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        {servico && <p className="t-sec">Referente ao serviço “{servico.descricao}”.</p>}

        <div className="campo">
          <label htmlFor="nf-cliente">Cliente</label>
          <select id="nf-cliente" className="campo-caixa" value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Sem cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="nf-status">Status</label>
          <select id="nf-status" className="campo-caixa" value={status}
            onChange={(e) => setStatus(e.target.value as StatusNF)}>
            {STATUS.map((s) => <option key={s} value={s}>{ROTULO[s]}</option>)}
          </select>
        </div>

        <Campo rotulo="Número" value={numero} erro={erros.numero}
          onChange={(e) => setNumero(e.target.value)} placeholder="000123" />

        <div className="grade-dois">
          <Campo rotulo="Valor" value={valor} inputMode="decimal" erro={erros.valor}
            onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
          <Campo rotulo="Imposto estimado" value={imposto} inputMode="decimal"
            onChange={(e) => setImposto(e.target.value)} placeholder="R$ 0,00" />
        </div>

        <div className="campo">
          <label htmlFor="nf-comp">Competência</label>
          <input id="nf-comp" type="date" className="campo-caixa" value={competencia}
            onChange={(e) => setCompetencia(e.target.value)} />
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}
