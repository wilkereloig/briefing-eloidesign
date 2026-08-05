import { useMemo, useState } from 'react'
import { financas } from '../../lib/api'
import { centsDeBRL, fmtBRL } from '../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../lib/financas-store'
import { dividirParcelas } from '../../domain/financeiro'
import type { Contexto, TipoMov, Transacao } from '../../lib/tipos'
import { Botao, Campo, CampoTexto, Folha, Pilula } from '../../ui/componentes'

// Um formulário só para receita, despesa e transferência: os três guardam a
// mesma linha (ver database/migrations/2026-08-04-gestao-eloi-financeiro.sql). Três formulários
// separados dariam três lugares para a validação divergir.

const TIPOS: { chave: TipoMov; label: string }[] = [
  { chave: 'entrada', label: 'Receita' },
  { chave: 'saida', label: 'Despesa' },
  { chave: 'transferencia', label: 'Transferência' },
]

export function FolhaTransacao({ inicial, aoFechar, aoSalvar }: {
  inicial?: Partial<Transacao>
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { contas, categorias, clientes, servicos } = useFinancas()
  const editando = !!inicial?.id
  const [tipo, setTipo] = useState<TipoMov>(inicial?.tipo ?? 'saida')
  const [contexto, setContexto] = useState<Contexto>(inicial?.contexto ?? 'empresa')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [valor, setValor] = useState(inicial?.valor_cents ? fmtBRL(inicial.valor_cents) : '')
  const [contaId, setContaId] = useState(inicial?.conta_id ?? '')
  const [contaDestinoId, setContaDestinoId] = useState(inicial?.conta_destino_id ?? '')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria_id ?? '')
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '')
  const [servicoId, setServicoId] = useState(inicial?.servico_id ?? '')
  const [fornecedor, setFornecedor] = useState(inicial?.fornecedor ?? '')
  const [vencimento, setVencimento] = useState(inicial?.data_vencimento ?? hojeISO())
  const [parcelas, setParcelas] = useState(1)
  const [jaPago, setJaPago] = useState(false)
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const cents = centsDeBRL(valor)
  const ehTransferencia = tipo === 'transferencia'
  // Já liquidado por inteiro: "já paguei" não tem o que fazer, e mostrar a caixa
  // marcável sugeriria que desmarcar estorna — estorno é outra ação.
  const jaLiquidado = editando && (inicial?.recebido_cents ?? 0) >= (inicial?.valor_cents ?? 1)

  const contasDoContexto = useMemo(
    // Transferência é o único caso que enxerga as duas caixas: é assim que
    // pró-labore e aporte são lançados sem virar receita.
    () => contas.filter((c) => c.ativa && (ehTransferencia || c.contexto === contexto)),
    [contas, contexto, ehTransferencia])

  const categoriasDoTipo = useMemo(
    () => categorias.filter((c) => c.contexto === contexto && c.tipo === tipo),
    [categorias, contexto, tipo])

  const servicosDoCliente = useMemo(
    () => (clienteId ? servicos.filter((s) => s.cliente_id === clienteId) : []),
    [servicos, clienteId])

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!descricao.trim()) e.descricao = 'Descreva o lançamento'
    if (cents <= 0) e.valor = 'Informe um valor maior que zero'
    if (!contaId) e.conta = ehTransferencia ? 'Escolha a conta de origem' : 'Escolha a conta'
    if (ehTransferencia) {
      if (!contaDestinoId) e.destino = 'Escolha a conta de destino'
      else if (contaDestinoId === contaId) e.destino = 'Destino precisa ser diferente da origem'
    }
    if (parcelas > 1 && ehTransferencia) e.parcelas = 'Transferência não é parcelada'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar() {
    if (!validar()) return
    setSalvando(true)
    try {
      const base: Partial<Transacao> = {
        // O `id` faltando aqui era o bug: "Editar lançamento" gravava uma linha
        // nova a cada salvamento em vez de atualizar a existente.
        ...(inicial?.id ? { id: inicial.id } : {}),
        tipo, contexto, descricao: descricao.trim(), valor_cents: cents,
        conta_id: contaId || null,
        conta_destino_id: ehTransferencia ? contaDestinoId : null,
        categoria_id: ehTransferencia ? null : categoriaId || null,
        cliente_id: ehTransferencia ? null : clienteId || null,
        servico_id: ehTransferencia ? null : servicoId || null,
        fornecedor: tipo === 'saida' ? fornecedor.trim() || null : null,
        data_vencimento: vencimento || null,
        data_competencia: vencimento || null,
        observacoes: observacoes.trim() || null,
      }
      if (parcelas > 1) {
        await financas.parcelar(base, parcelas)
        aoSalvar(`${parcelas} parcelas lançadas`)
      } else {
        // "já pago" preenche recebido: o status sai do valor, no servidor.
        // Editando sem marcar nada, `recebido_cents` NÃO vai no payload — o
        // servidor mantém o que já havia sido liquidado. Mandar 0 apagaria um
        // pagamento parcial só porque alguém corrigiu a descrição.
        await financas.salvar({
          ...base,
          ...(jaPago
            ? { recebido_cents: cents, data_liquidacao: hojeISO() }
            : editando ? {} : { recebido_cents: 0, data_liquidacao: null }),
        })
        aoSalvar(editando ? 'Lançamento atualizado' : 'Lançamento salvo')
      }
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  const previa = parcelas > 1 && cents > 0 ? dividirParcelas(cents, parcelas) : null

  return (
    <Folha titulo={inicial?.id ? 'Editar lançamento' : 'Novo lançamento'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div>
          <span className="etiqueta" style={{ color: 'var(--texto-3)' }}>Tipo</span>
          <div className="linha" style={{ marginTop: 'var(--e-3)' }} role="group" aria-label="Tipo">
            {TIPOS.map((t) => (
              <Pilula key={t.chave} ativa={tipo === t.chave} onClick={() => setTipo(t.chave)}>
                {t.label}
              </Pilula>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta" style={{ color: 'var(--texto-3)' }}>Contexto</span>
          <div className="linha" style={{ marginTop: 'var(--e-3)' }} role="group" aria-label="Contexto">
            <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
            <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
          </div>
        </div>

        <Campo rotulo="Descrição" value={descricao} erro={erros.descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={ehTransferencia ? 'Pró-labore de agosto' : 'Identidade visual — parcela 1'} />

        <Campo rotulo="Valor" value={valor} erro={erros.valor} inputMode="decimal"
          onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />

        <div className="campo">
          <label htmlFor="conta-origem">{ehTransferencia ? 'De qual conta' : 'Conta'}</label>
          <select id="conta-origem" className="campo-caixa" value={contaId}
            onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {contasDoContexto.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} · {c.contexto}</option>
            ))}
          </select>
          {erros.conta && <span className="campo-erro" role="alert">{erros.conta}</span>}
        </div>

        {ehTransferencia && (
          <div className="campo">
            <label htmlFor="conta-destino">Para qual conta</label>
            <select id="conta-destino" className="campo-caixa" value={contaDestinoId}
              onChange={(e) => setContaDestinoId(e.target.value)}>
              <option value="">Selecione…</option>
              {contasDoContexto.filter((c) => c.id !== contaId).map((c) => (
                <option key={c.id} value={c.id}>{c.nome} · {c.contexto}</option>
              ))}
            </select>
            {erros.destino && <span className="campo-erro" role="alert">{erros.destino}</span>}
            <span className="t-legenda">
              Transferência move saldo entre contas e não entra em receita nem em despesa.
            </span>
          </div>
        )}

        {!ehTransferencia && (
          <div className="campo">
            <label htmlFor="categoria">Categoria</label>
            <select id="categoria" className="campo-caixa" value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {tipo === 'saida' && (
          <Campo rotulo="Fornecedor" value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)} placeholder="Opcional" />
        )}

        {!ehTransferencia && contexto === 'empresa' && (
          <div className="campo">
            <label htmlFor="cliente">Cliente</label>
            <select id="cliente" className="campo-caixa" value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setServicoId('') }}>
              <option value="">Sem cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {/* Serviço só aparece com cliente escolhido: é o vínculo que liga o
            dinheiro ao projeto e faz o resultado por projeto existir. */}
        {!ehTransferencia && contexto === 'empresa' && !!servicosDoCliente.length && (
          <div className="campo">
            <label htmlFor="servico">Projeto ou serviço</label>
            <select id="servico" className="campo-caixa" value={servicoId}
              onChange={(e) => setServicoId(e.target.value)}>
              <option value="">Sem vínculo</option>
              {servicosDoCliente.map((s) => (
                <option key={s.id} value={s.id}>{s.descricao}</option>
              ))}
            </select>
          </div>
        )}

        <div className="campo">
          <label htmlFor="venc">Vencimento</label>
          <input id="venc" type="date" className="campo-caixa" value={vencimento}
            onChange={(e) => setVencimento(e.target.value)} />
        </div>

        {/* Parcelar cria N linhas irmãs: só faz sentido em lançamento novo.
            Reparcelar o que já existe é excluir o grupo e lançar de novo. */}
        {!ehTransferencia && !editando && (
          <div className="campo">
            <label htmlFor="parcelas">Parcelas</label>
            <input id="parcelas" type="number" min={1} max={120} className="campo-caixa"
              inputMode="numeric" value={parcelas}
              onChange={(e) => setParcelas(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} />
            {erros.parcelas && <span className="campo-erro" role="alert">{erros.parcelas}</span>}
            {previa && (
              <span className="t-legenda">
                {parcelas}× de {fmtBRL(previa[1] ?? previa[0])}
                {previa[0] !== previa[1] ? ` (a primeira sai ${fmtBRL(previa[0])} para fechar o total)` : ''}
              </span>
            )}
          </div>
        )}

        {parcelas === 1 && !jaLiquidado && (
          <label className="linha" style={{ gap: 'var(--e-3)', cursor: 'pointer' }}>
            <input type="checkbox" className="caixa-marcar" checked={jaPago}
              onChange={(e) => setJaPago(e.target.checked)} />
            <span className="t-ui">
              {ehTransferencia ? 'Já transferi' : tipo === 'entrada' ? 'Já recebi' : 'Já paguei'}
            </span>
          </label>
        )}

        <CampoTexto rotulo="Observações" value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}
