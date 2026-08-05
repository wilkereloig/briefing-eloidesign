import { useState } from 'react'
import { clientes as clientesApi, financas, servicos as servicosApi } from '../../lib/api'
import { centsDeBRL, fmtBRL } from '../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../lib/financas-store'
import { saldoAberto } from '../../domain/financeiro'
import type {
  ClienteRow, Conta, Contexto, Periodicidade, Recorrencia, ServicoRow, StatusExecucao,
  TipoConta, TipoMov, Transacao,
} from '../../lib/tipos'
import { Botao, Campo, Folha, Icone, Pilula } from '../../ui/componentes'
import { rotuloConta, rotuloPeriodo, custoMensal } from '../../ui/formato'

// Folhas de cadastro e de ação. Todas seguem o mesmo par no rodapé
// (Cancelar contorno / confirmar em destaque, proporção 1:2) e devolvem uma
// mensagem para o toast de quem abriu.

const TIPOS_CONTA: TipoConta[] = ['corrente', 'digital', 'poupanca', 'dinheiro',
  'cartao_credito', 'investimento', 'reserva', 'outro']

export function FolhaConta({ inicial, contextoInicial, aoFechar, aoSalvar }: {
  inicial?: Conta
  /** Contexto do painel que abriu a folha — "Nova" em Contas pessoais nascia
   *  como empresa e o Wilke só descobria depois de salvar. */
  contextoInicial?: Contexto
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState<TipoConta>(inicial?.tipo ?? 'corrente')
  const [contexto, setContexto] = useState<Contexto>(inicial?.contexto ?? contextoInicial ?? 'empresa')
  const [instituicao, setInstituicao] = useState(inicial?.instituicao ?? '')
  const [saldoInicial, setSaldoInicial] = useState(
    inicial ? fmtBRL(inicial.saldo_inicial_cents) : '')
  const [limite, setLimite] = useState(inicial?.limite_cents ? fmtBRL(inicial.limite_cents) : '')
  const [fechamento, setFechamento] = useState(String(inicial?.dia_fechamento ?? ''))
  const [vencimento, setVencimento] = useState(String(inicial?.dia_vencimento ?? ''))
  const [cor, setCor] = useState(inicial?.cor ?? '#7D2AE8')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const ehCartao = tipo === 'cartao_credito'

  async function salvar() {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = 'Dê um nome à conta'
    if (ehCartao) {
      const f = Number(fechamento), v = Number(vencimento)
      if (!(f >= 1 && f <= 31)) e.fechamento = 'Dia entre 1 e 31'
      if (!(v >= 1 && v <= 31)) e.vencimento = 'Dia entre 1 e 31'
    }
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await financas.salvarConta({
        id: inicial?.id, nome: nome.trim(), tipo, contexto,
        instituicao: instituicao.trim() || null,
        saldo_inicial_cents: centsDeBRL(saldoInicial),
        limite_cents: ehCartao ? centsDeBRL(limite) : null,
        dia_fechamento: ehCartao ? Number(fechamento) : null,
        dia_vencimento: ehCartao ? Number(vencimento) : null,
        cor,
      })
      aoSalvar(inicial ? 'Conta atualizada' : 'Conta criada')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar conta' : 'Nova conta'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <Campo rotulo="Nome" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)} placeholder="Conta PJ Inter" />

        <div>
          <span className="etiqueta" style={{ color: 'var(--texto-3)' }}>Contexto</span>
          <div className="linha" style={{ marginTop: 'var(--e-3)' }}>
            <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
            <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="tipo-conta">Tipo</label>
          <select id="tipo-conta" className="campo-caixa" value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoConta)}>
            {TIPOS_CONTA.map((t) => <option key={t} value={t}>{rotuloConta(t)}</option>)}
          </select>
        </div>

        <Campo rotulo="Instituição" value={instituicao}
          onChange={(e) => setInstituicao(e.target.value)} placeholder="Opcional" />

        <Campo rotulo={ehCartao ? 'Saldo inicial da fatura' : 'Saldo inicial'} value={saldoInicial}
          inputMode="decimal" onChange={(e) => setSaldoInicial(e.target.value)} placeholder="R$ 0,00" />

        {ehCartao && (
          <>
            <Campo rotulo="Limite" value={limite} inputMode="decimal"
              onChange={(e) => setLimite(e.target.value)} placeholder="R$ 0,00" />
            <div className="grade-dois">
              <Campo rotulo="Dia de fechamento" value={fechamento} inputMode="numeric"
                erro={erros.fechamento} onChange={(e) => setFechamento(e.target.value)} placeholder="20" />
              <Campo rotulo="Dia de vencimento" value={vencimento} inputMode="numeric"
                erro={erros.vencimento} onChange={(e) => setVencimento(e.target.value)} placeholder="28" />
            </div>
          </>
        )}

        <div className="campo">
          <label htmlFor="cor-conta">Cor de identificação</label>
          <input id="cor-conta" type="color" className="campo-cor" value={cor}
            onChange={(e) => setCor(e.target.value)} />
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── liquidar ─────────────────────────────────────────────────────────────────

/** Registrar pagamento. Aceita valor menor que o total: parcial é normal. */
export function FolhaLiquidar({ transacao, aoFechar, aoSalvar }: {
  transacao: Transacao
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const aberto = saldoAberto(transacao)
  const [valor, setValor] = useState(fmtBRL(aberto))
  const [data, setData] = useState(hojeISO())
  const [forma, setForma] = useState(transacao.forma_pagamento ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const cents = centsDeBRL(valor)

  async function salvar() {
    if (cents <= 0) return setErro('Informe um valor maior que zero')
    if (cents > aberto) return setErro(`O máximo em aberto é ${fmtBRL(aberto)}`)
    setSalvando(true)
    try {
      await financas.liquidar(transacao.id, cents, data, forma.trim() || undefined)
      aoSalvar(cents === aberto ? 'Baixa registrada' : 'Pagamento parcial registrado')
      aoFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={transacao.tipo === 'entrada' ? 'Registrar recebimento' : 'Registrar pagamento'}
      aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Confirmar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div>
          <p className="t-card">{transacao.descricao}</p>
          <p className="t-sec">
            Em aberto: <span className="dinheiro">{fmtBRL(aberto)}</span>
            {transacao.recebido_cents > 0 && ` · já liquidado ${fmtBRL(transacao.recebido_cents)}`}
          </p>
        </div>

        <Campo rotulo="Valor" value={valor} inputMode="decimal" erro={erro}
          onChange={(e) => { setValor(e.target.value); setErro('') }} />

        <div className="campo">
          <label htmlFor="data-liq">Data</label>
          <input id="data-liq" type="date" className="campo-caixa" value={data}
            onChange={(e) => setData(e.target.value)} />
        </div>

        <Campo rotulo="Forma de pagamento" value={forma}
          onChange={(e) => setForma(e.target.value)} placeholder="Pix, boleto, cartão…" />
      </div>
    </Folha>
  )
}

// ── recorrência ──────────────────────────────────────────────────────────────

const PERIODOS: Periodicidade[] = ['semanal', 'quinzenal', 'mensal', 'bimestral',
  'trimestral', 'semestral', 'anual']

export function FolhaRecorrencia({ inicial, aoFechar, aoSalvar }: {
  inicial?: Recorrencia
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { contas, categorias } = useFinancas()
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState<TipoMov>(inicial?.tipo ?? 'saida')
  const [contexto, setContexto] = useState<Contexto>(inicial?.contexto ?? 'empresa')
  const [valor, setValor] = useState(inicial ? fmtBRL(inicial.valor_cents) : '')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(inicial?.periodicidade ?? 'mensal')
  const [contaId, setContaId] = useState(inicial?.conta_id ?? '')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria_id ?? '')
  const [inicio, setInicio] = useState(inicial?.inicio ?? hojeISO())
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const cents = centsDeBRL(valor)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = 'Dê um nome à recorrência'
    if (cents <= 0) e.valor = 'Informe um valor maior que zero'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await financas.salvarRecorrencia({
        id: inicial?.id, nome: nome.trim(), tipo, contexto, valor_cents: cents,
        periodicidade, conta_id: contaId || null, categoria_id: categoriaId || null,
        inicio, proxima_cobranca: inicial?.proxima_cobranca ?? inicio,
      })
      aoSalvar(inicial ? 'Recorrência atualizada' : 'Recorrência criada')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar recorrência' : 'Nova recorrência'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <Campo rotulo="Nome" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)} placeholder="Adobe Creative Cloud" />

        <div className="linha">
          <Pilula ativa={tipo === 'saida'} onClick={() => setTipo('saida')}>Despesa</Pilula>
          <Pilula ativa={tipo === 'entrada'} onClick={() => setTipo('entrada')}>Receita</Pilula>
          <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
          <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
        </div>

        <Campo rotulo="Valor" value={valor} inputMode="decimal" erro={erros.valor}
          onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />

        <div className="campo">
          <label htmlFor="periodo">Periodicidade</label>
          <select id="periodo" className="campo-caixa" value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
            {PERIODOS.map((p) => <option key={p} value={p}>{rotuloPeriodo(p)}</option>)}
          </select>
          {cents > 0 && (
            <span className="t-legenda">
              Equivale a {fmtBRL(custoMensal(cents, periodicidade))} por mês
            </span>
          )}
        </div>

        <div className="campo">
          <label htmlFor="conta-rec">Conta</label>
          <select id="conta-rec" className="campo-caixa" value={contaId}
            onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {contas.filter((c) => c.ativa && c.contexto === contexto)
              .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="cat-rec">Categoria</label>
          <select id="cat-rec" className="campo-caixa" value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categorias.filter((c) => c.contexto === contexto && c.tipo === tipo)
              .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="inicio-rec">Primeira cobrança</label>
          <input id="inicio-rec" type="date" className="campo-caixa" value={inicio}
            onChange={(e) => setInicio(e.target.value)} />
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── cliente ──────────────────────────────────────────────────────────────────

/** Cadastro do cliente. É o primeiro passo do fluxo comercial: sem ele não há
 *  a quem ligar proposta, projeto, cobrança, nota nem arquivo. */
export function FolhaCliente({ inicial, aoFechar, aoSalvar }: {
  inicial?: Pick<ClienteRow, 'id' | 'nome' | 'contato' | 'cor' | 'marca_slug' | 'marca_publicada'>
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [contato, setContato] = useState(inicial?.contato ?? '')
  const [cor, setCor] = useState(inicial?.cor ?? '#7D2AE8')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErros({ nome: 'Informe o nome do cliente' })
    setErros({})
    setSalvando(true)
    try {
      await clientesApi.upsert({
        id: inicial?.id, nome: nome.trim(), contato: contato.trim() || null, cor,
        marca_slug: inicial?.marca_slug ?? null,
        marca_publicada: inicial?.marca_publicada ?? false,
      })
      aoSalvar(inicial ? 'Cliente atualizado' : 'Cliente cadastrado')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar cliente' : 'Novo cliente'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <Campo rotulo="Nome" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)} placeholder="Solarium" />
        <Campo rotulo="Contato" value={contato}
          onChange={(e) => setContato(e.target.value)}
          placeholder="E-mail, WhatsApp ou nome de quem responde" />
        <div className="campo">
          <label htmlFor="cor-cliente">Cor de identificação</label>
          <input id="cor-cliente" type="color" className="campo-cor" value={cor}
            onChange={(e) => setCor(e.target.value)} />
          <span className="t-legenda">Aparece como barra na lista e nos agrupamentos.</span>
        </div>
        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── serviço / projeto ────────────────────────────────────────────────────────

const STATUS_SERVICO: { chave: StatusExecucao; label: string }[] = [
  { chave: 'aguardando_inicio', label: 'Aguardando início' },
  { chave: 'em_execucao', label: 'Em execução' },
  { chave: 'concluida', label: 'Concluída' },
]

/** Serviço é a unidade de trabalho entregue. A etapa do projeto é calculada
 *  daqui + do orçamento de origem (domain/projeto.ts): não existe campo etapa. */
export function FolhaServico({ inicial, aoFechar, aoSalvar }: {
  inicial?: ServicoRow
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes } = useFinancas()
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [subCliente, setSubCliente] = useState(inicial?.sub_cliente ?? '')
  const [valor, setValor] = useState(inicial ? fmtBRL(inicial.valor_cents) : '')
  const [status, setStatus] = useState<StatusExecucao>(inicial?.status_execucao ?? 'em_execucao')
  const [pago, setPago] = useState(inicial?.pago ?? false)
  const [competencia, setCompetencia] = useState(inicial?.data_competencia ?? '')
  const [nfNumero, setNfNumero] = useState(inicial?.nf_numero ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!clienteId) e.cliente = 'Escolha o cliente'
    if (!descricao.trim()) e.descricao = 'Descreva o serviço'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await servicosApi.upsert({
        id: inicial?.id, cliente_id: clienteId, descricao: descricao.trim(),
        sub_cliente: subCliente.trim() || null, valor_cents: centsDeBRL(valor),
        status_execucao: status, pago,
        data_pagamento: pago ? inicial?.data_pagamento ?? hojeISO() : null,
        data_competencia: competencia || null,
        nf_numero: nfNumero.trim() || null,
      })
      aoSalvar(inicial ? 'Serviço atualizado' : 'Serviço criado')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar serviço' : 'Novo serviço'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div className="campo" data-erro={erros.cliente ? 'true' : undefined}>
          <label htmlFor="srv-cliente">Cliente</label>
          <select id="srv-cliente" className="campo-caixa" value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {erros.cliente && <span className="campo-erro" role="alert">{erros.cliente}</span>}
        </div>

        <Campo rotulo="Descrição" value={descricao} erro={erros.descricao}
          onChange={(e) => setDescricao(e.target.value)} placeholder="Identidade visual completa" />

        <Campo rotulo="Marca ou sub-cliente" value={subCliente}
          onChange={(e) => setSubCliente(e.target.value)}
          placeholder="Opcional — agrupa marcas dentro do mesmo cliente" />

        <div className="grade-dois">
          <Campo rotulo="Valor" value={valor} inputMode="decimal"
            onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
          <div className="campo">
            <label htmlFor="srv-status">Status</label>
            <select id="srv-status" className="campo-caixa" value={status}
              onChange={(e) => setStatus(e.target.value as StatusExecucao)}>
              {STATUS_SERVICO.map((s) => <option key={s.chave} value={s.chave}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grade-dois">
          <div className="campo">
            <label htmlFor="srv-comp">Competência</label>
            <input id="srv-comp" type="date" className="campo-caixa" value={competencia}
              onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <Campo rotulo="Número da NF" value={nfNumero}
            onChange={(e) => setNfNumero(e.target.value)} placeholder="Opcional" />
        </div>

        <label className="linha" style={{ gap: 'var(--e-3)', cursor: 'pointer' }}>
          <input type="checkbox" className="caixa-marcar" checked={pago}
            onChange={(e) => setPago(e.target.checked)} />
          <span className="t-ui">Serviço já pago</span>
        </label>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── confirmação de exclusão ──────────────────────────────────────────────────

/** Destrutivo nunca é o botão de maior peso visual (COMPONENT_INVENTORY). */
export function FolhaExcluir({ titulo, consequencia, aoFechar, aoConfirmar }: {
  titulo: string
  consequencia: string
  aoFechar: () => void
  aoConfirmar: () => Promise<void> | void
}) {
  const [indo, setIndo] = useState(false)
  return (
    <Folha titulo="Excluir" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar} style={{ flex: 2 }}>Manter</Botao>
        <Botao variante="destrutivo" carregando={indo} onClick={async () => {
          setIndo(true)
          try { await aoConfirmar(); aoFechar() } finally { setIndo(false) }
        }}>Excluir</Botao>
      </>}>
      <div className="linha" style={{ alignItems: 'flex-start', gap: 'var(--e-5)' }}>
        <span className="alerta-icone" aria-hidden><Icone nome="alerta" tamanho={20} /></span>
        <div>
          <p className="t-h2">{titulo}</p>
          <p className="t-corpo">{consequencia}</p>
        </div>
      </div>
    </Folha>
  )
}
