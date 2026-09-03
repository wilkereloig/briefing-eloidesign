import { useState } from 'react'
import {
  CATEGORIAS_ENTREGA, clientes as clientesApi, contatos as contatosApi, financas,
  materiaisApi, orcamentos as orcamentosApi, servicos as servicosApi,
  subClientes as subClientesApi, type CatalogoItem, type CategoriaEntrega,
} from '../../lib/api'
import { centsDeBRL, fmtBRL } from '../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../lib/financas-store'
import { saldoAberto } from '../../domain/financeiro'
import type {
  ClienteRow, Conta, ContatoRow, Contexto, MaterialRow, OrcamentoRow, Periodicidade,
  Recorrencia, ServicoRow, StatusExecucao, SubClienteRow, TipoConta, TipoMov, Transacao,
} from '../../lib/tipos'
import {
  calcular, COMPLEXIDADES, lerItens, URGENCIAS,
  type Complexidade, type ItemOrcamento, type Urgencia,
} from '../../domain/orcamento'
import { Botao, Campo, CampoTexto, Folha, Icone, Pilula } from '../../ui/componentes'
import { rotuloConta, rotuloPeriodo, custoMensal } from '../../ui/formato'
import { corCliente } from '../../ui/tokens'

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
  const [cor, setCor] = useState(inicial?.cor ?? corCliente[0])
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
  const [cor, setCor] = useState(inicial?.cor ?? corCliente[0])
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

/** Pessoa de contato. Agenda, não CRM: só o suficiente para ligar, escrever
 *  ou mandar mensagem sem procurar em outro lugar. */
export function FolhaContato({ clienteId, inicial, aoFechar, aoSalvar }: {
  clienteId: string
  inicial?: ContatoRow
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { subClientes } = useFinancas()
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [funcao, setFuncao] = useState(inicial?.funcao ?? '')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [telefone, setTelefone] = useState(inicial?.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(inicial?.whatsapp ?? '')
  const [subClienteId, setSubClienteId] = useState(inicial?.sub_cliente_id ?? '')
  const [principal, setPrincipal] = useState(inicial?.principal ?? false)
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const marcas = subClientes.filter((m) => m.cliente_id === clienteId)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = 'Informe o nome'
    if (!email.trim() && !telefone.trim() && !whatsapp.trim()) {
      e.geral = 'Informe pelo menos uma forma de contato'
    }
    setErros(e)
    if (Object.keys(e).length) return
    setSalvando(true)
    try {
      await contatosApi.upsert({
        id: inicial?.id, cliente_id: clienteId, nome: nome.trim(),
        funcao: funcao.trim() || null, email: email.trim() || null,
        telefone: telefone.trim() || null, whatsapp: whatsapp.trim() || null,
        sub_cliente_id: subClienteId || null, principal,
        observacoes: observacoes.trim() || null,
      })
      aoSalvar(inicial ? 'Contato atualizado' : 'Contato cadastrado')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar contato' : 'Novo contato'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <Campo rotulo="Nome" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)} placeholder="Ana Prado" />
        <Campo rotulo="Função" value={funcao}
          onChange={(e) => setFuncao(e.target.value)} placeholder="Atendimento, produção, financeiro" />
        <Campo rotulo="E-mail" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="ana@empresa.com.br" />
        <div className="grade-dois">
          <Campo rotulo="Telefone" type="tel" value={telefone}
            onChange={(e) => setTelefone(e.target.value)} placeholder="(84) 99999-0000" />
          <Campo rotulo="WhatsApp" type="tel" value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)} placeholder="(84) 99999-0000" />
        </div>

        {marcas.length > 0 && (
          <div className="campo">
            <label htmlFor="ct-marca">Marca</label>
            <select id="ct-marca" className="campo-caixa" value={subClienteId}
              onChange={(e) => setSubClienteId(e.target.value)}>
              <option value="">Contato do cliente inteiro</option>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <span className="t-legenda">Use quando a pessoa responde só por uma marca.</span>
          </div>
        )}

        <label className="linha" style={{ gap: 'var(--e-3)', minHeight: 44 }}>
          <input type="checkbox" checked={principal}
            onChange={(e) => setPrincipal(e.target.checked)} />
          <span className="celula">
            <span className="t-ui">Contato principal</span>
            <span className="t-legenda">Quem procurar primeiro. Só um por cliente — marcar aqui tira o anterior.</span>
          </span>
        </label>

        <CampoTexto rotulo="Observações" value={observacoes} rows={2}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Opcional — horário, preferência de canal" />

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

/** Marca atendida por intermédio do cliente (D-18). Cadastro mínimo de
 *  propósito: quem contrata, paga e recebe nota continua sendo o cliente. */
export function FolhaSubCliente({ clienteId, inicial, aoFechar, aoSalvar }: {
  clienteId: string
  inicial?: SubClienteRow
  aoFechar: () => void
  aoSalvar: (salvo: SubClienteRow) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErros({ nome: 'Informe o nome da marca' })
    setErros({})
    setSalvando(true)
    try {
      const salvo = await subClientesApi.upsert({
        id: inicial?.id, cliente_id: clienteId, nome: nome.trim(), ativo,
        observacoes: observacoes.trim() || null,
      })
      aoSalvar(salvo)
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar marca' : 'Nova marca'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <Campo rotulo="Nome da marca" value={nome} erro={erros.nome}
          onChange={(e) => setNome(e.target.value)} placeholder="Vibra" />
        <CampoTexto rotulo="Observações" value={observacoes} rows={2}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Opcional — contato, particularidade do fluxo" />
        {inicial && (
          <label className="linha" style={{ gap: 'var(--e-3)', minHeight: 44 }}>
            <input type="checkbox" checked={!ativo}
              onChange={(e) => setAtivo(!e.target.checked)} />
            <span className="celula">
              <span className="t-ui">Marca encerrada</span>
              <span className="t-legenda">
                Some da escolha em serviço novo. Os serviços que já são dela continuam iguais.
              </span>
            </span>
          </label>
        )}
        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

/** Serviço é a unidade de trabalho entregue. A etapa do projeto é calculada
 *  daqui + do orçamento de origem (domain/projeto.ts): não existe campo etapa. */
export function FolhaServico({ inicial, aoFechar, aoSalvar }: {
  inicial?: ServicoRow
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes, subClientes, recarregar } = useFinancas()
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [subClienteId, setSubClienteId] = useState(inicial?.sub_cliente_id ?? '')
  const [novaMarca, setNovaMarca] = useState(false)
  const [valor, setValor] = useState(inicial ? fmtBRL(inicial.valor_cents) : '')
  const [status, setStatus] = useState<StatusExecucao>(inicial?.status_execucao ?? 'em_execucao')
  const [pago, setPago] = useState(inicial?.pago ?? false)
  const [competencia, setCompetencia] = useState(inicial?.data_competencia ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  // Marcas do cliente escolhido. Marca de outro cliente é rejeitada pelo
  // trigger no banco, então trocar de cliente limpa a escolha aqui.
  const marcas = subClientes.filter((m) => m.cliente_id === clienteId && (m.ativo || m.id === subClienteId))

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
        sub_cliente_id: subClienteId || null, valor_cents: centsDeBRL(valor),
        status_execucao: status, pago,
        data_pagamento: pago ? inicial?.data_pagamento ?? hojeISO() : null,
        data_competencia: competencia || null,
        observacoes: observacoes.trim(),
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
            onChange={(e) => { setClienteId(e.target.value); setSubClienteId('') }}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {erros.cliente && <span className="campo-erro" role="alert">{erros.cliente}</span>}
        </div>

        <Campo rotulo="Descrição" value={descricao} erro={erros.descricao}
          onChange={(e) => setDescricao(e.target.value)} placeholder="Identidade visual completa" />

        <div className="campo">
          <label htmlFor="srv-marca">Marca atendida</label>
          <select id="srv-marca" className="campo-caixa" value={subClienteId}
            disabled={!clienteId}
            onChange={(e) => {
              if (e.target.value === '+') { setNovaMarca(true); return }
              setSubClienteId(e.target.value)
            }}>
            <option value="">Trabalho direto para o cliente</option>
            {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            {clienteId && <option value="+">+ Nova marca…</option>}
          </select>
          <span className="t-legenda">
            {clienteId
              ? 'A marca que o cliente atende (Vibra, ASUS). Sem marca = trabalho direto.'
              : 'Escolha o cliente primeiro.'}
          </span>
        </div>

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
          <div className="campo">
            <span className="etiqueta-mini">Nota fiscal</span>
            {/* O número não se digita aqui desde 2026-09-03: quem define é a
                nota (eloi_notas_fiscais) e nf_numero é espelho por trigger. */}
            <p className="t-legenda">
              {inicial?.nf_numero
                ? `NF ${inicial.nf_numero} — vinculada na tela Notas fiscais.`
                : 'Vincule este serviço a uma nota na tela Notas fiscais.'}
            </p>
          </div>
        </div>

        {novaMarca && (
          <FolhaSubCliente clienteId={clienteId} aoFechar={() => setNovaMarca(false)}
            aoSalvar={async (m) => { setSubClienteId(m.id); await recarregar() }} />
        )}

        <CampoTexto rotulo="Observações" value={observacoes} rows={3}
          onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />

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

// ── entrega de material ──────────────────────────────────────────────────────

const ROTULO_CATEGORIA: Record<CategoriaEntrega, string> = {
  arquivo: 'Arquivo',
  apresentacao: 'Apresentação',
  fonte: 'Fonte',
}

/**
 * Publica um material na área do cliente. Duas escritas em ordem deliberada:
 * primeiro o binário sobe para o bucket privado, depois a linha em
 * `eloi_materiais` aponta para ele. Invertido, uma falha de rede deixaria um
 * card no portal do cliente com botão de baixar que não baixa nada — o pior dos
 * dois erros possíveis. Nesta ordem, o pior caso é um arquivo órfão no Storage.
 *
 * Rascunho é o padrão: o cliente só enxerga o que está `publicado`, e subir não
 * é a mesma decisão que liberar.
 */
export function FolhaEntrega({ inicial, clienteInicial, aoFechar, aoSalvar }: {
  inicial?: MaterialRow
  clienteInicial?: string
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes } = useFinancas()
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? clienteInicial ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [categoria, setCategoria] = useState<CategoriaEntrega>(
    (CATEGORIAS_ENTREGA as readonly string[]).includes(inicial?.categoria ?? '')
      ? inicial!.categoria as CategoriaEntrega : 'arquivo')
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [versao, setVersao] = useState(String(inicial?.versao ?? 1))
  const [publicar, setPublicar] = useState(inicial?.status === 'publicado')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [etapa, setEtapa] = useState<'enviando' | 'registrando' | null>(null)

  // Trocar o binário de um material já publicado mudaria o que o cliente baixa
  // sem mudar o registro. Editar aqui é só metadado; arquivo novo é entrega nova.
  const editando = !!inicial

  function escolher(file: File | null) {
    setArquivo(file)
    if (file && !titulo.trim()) setTitulo(file.name.replace(/\.[^.]+$/, ''))
  }

  async function salvar() {
    const e: Record<string, string> = {}
    if (!clienteId) e.cliente = 'Escolha o cliente que vai receber'
    if (!editando && !arquivo) e.arquivo = 'Escolha o arquivo da entrega'
    if (!titulo.trim()) e.titulo = 'Dê um nome que o cliente entenda'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      let path = inicial?.path
      if (arquivo) {
        setEtapa('enviando')
        path = await materiaisApi.enviarEntrega(arquivo, clienteId, categoria)
      }
      setEtapa('registrando')
      await materiaisApi.upsert({
        id: inicial?.id,
        cliente_id: clienteId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        categoria,
        versao: Number(versao) || 1,
        status: publicar ? 'publicado' : 'rascunho',
        path,
      })
      aoSalvar(publicar ? 'Entrega publicada — já aparece no portal' : 'Entrega salva como rascunho')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
      setEtapa(null)
    }
  }

  return (
    <Folha titulo={editando ? 'Editar entrega' : 'Nova entrega'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>
          {etapa === 'enviando' ? 'Enviando arquivo…'
            : etapa === 'registrando' ? 'Registrando…'
              : publicar ? 'Publicar' : 'Salvar rascunho'}
        </Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div className="campo" data-erro={erros.cliente ? 'true' : undefined}>
          <label htmlFor="ent-cliente">Cliente</label>
          <select id="ent-cliente" className="campo-caixa" value={clienteId}
            disabled={editando}
            onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {erros.cliente && <span className="campo-erro" role="alert">{erros.cliente}</span>}
          {editando && (
            <span className="t-legenda">
              O arquivo já está na pasta deste cliente — mover exige nova entrega.
            </span>
          )}
        </div>

        <div>
          <span className="etiqueta" style={{ color: 'var(--texto-3)' }}>Categoria</span>
          <div className="linha" style={{ marginTop: 'var(--e-3)' }}>
            {CATEGORIAS_ENTREGA.map((c) => (
              <Pilula key={c} ativa={categoria === c} onClick={() => setCategoria(c)}>
                {ROTULO_CATEGORIA[c]}
              </Pilula>
            ))}
          </div>
        </div>

        <div className="campo" data-erro={erros.arquivo ? 'true' : undefined}>
          <label htmlFor="ent-arquivo">{editando ? 'Substituir arquivo' : 'Arquivo'}</label>
          <input id="ent-arquivo" type="file" className="campo-caixa"
            onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
          {erros.arquivo && <span className="campo-erro" role="alert">{erros.arquivo}</span>}
          {editando && !arquivo && (
            <span className="t-legenda">Deixe vazio para manter o arquivo atual.</span>
          )}
        </div>

        <Campo rotulo="Título" value={titulo} erro={erros.titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Logo principal — versão final" />

        <Campo rotulo="Descrição" value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Opcional — o cliente lê isto embaixo do título" />

        <Campo rotulo="Versão" value={versao} inputMode="numeric"
          onChange={(e) => setVersao(e.target.value)} placeholder="1" />

        <label className="linha" style={{ gap: 'var(--e-3)', cursor: 'pointer' }}>
          <input type="checkbox" className="caixa-marcar" checked={publicar}
            onChange={(e) => setPublicar(e.target.checked)} />
          <span className="t-ui">Publicar no portal do cliente agora</span>
        </label>
        <p className="t-legenda" style={{ marginTop: 'calc(var(--e-5) * -1)' }}>
          {publicar
            ? 'O cliente passa a ver e baixar este material assim que você salvar.'
            : 'Fica guardado só para você até ser publicado.'}
        </p>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

// ── senha do portal do cliente ───────────────────────────────────────────────

/**
 * Gera (ou regenera) a senha de acesso do cliente ao portal. A senha aparece
 * UMA vez: o banco guarda só o hash PBKDF2, então não há tela onde consultá-la
 * depois — regenerar é a única saída, e isso derruba a senha anterior.
 */
export function FolhaSenhaPortal({ cliente, aoFechar, aoSalvar }: {
  cliente: { id: string; nome: string; portal_senha_gerada_em?: string | null }
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)
  const [copiada, setCopiada] = useState(false)
  const jaTinha = !!cliente.portal_senha_gerada_em

  async function gerar() {
    setIndo(true)
    setErro('')
    try {
      setSenha(await clientesApi.gerarSenhaPortal(cliente.id))
      aoSalvar('Senha gerada')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setIndo(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha)
      setCopiada(true)
      setTimeout(() => setCopiada(false), 2000)
    } catch {
      setErro('Não consegui copiar — selecione e copie na mão.')
    }
  }

  return (
    <Folha titulo="Acesso do cliente" aoFechar={aoFechar}
      rodape={senha
        ? <Botao variante="destaque" onClick={aoFechar} style={{ flex: 1 }}>Terminei de copiar</Botao>
        : <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="destaque" onClick={() => void gerar()} carregando={indo}
            style={{ flex: 2 }}>{jaTinha ? 'Gerar nova senha' : 'Gerar senha'}</Botao>
        </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <div>
          <p className="t-card">{cliente.nome}</p>
          <p className="t-sec">
            {jaTinha
              ? 'Já existe uma senha ativa. Gerar outra invalida a anterior na hora.'
              : 'Ainda sem acesso ao portal.'}
          </p>
        </div>

        {!senha && (
          <p className="t-corpo">
            O cliente entra em <span className="acesso-cod">/portal/</span> com esta
            senha e vê os materiais publicados, os orçamentos e as notas dele.
          </p>
        )}

        {senha && (
          <>
            <div className="campo">
              <label htmlFor="senha-portal">Senha — anote agora</label>
              <input id="senha-portal" className="campo-caixa" readOnly value={senha}
                onFocus={(e) => e.currentTarget.select()} />
            </div>
            <Botao variante="secundario" onClick={() => void copiar()}>
              {copiada ? 'Copiada' : 'Copiar senha'}<Icone nome="compartilhar" tamanho={14} />
            </Botao>
            <p className="t-legenda" role="status">
              Esta é a única vez que ela aparece. O banco guarda só o hash — se
              perder, o caminho é gerar outra.
            </p>
          </>
        )}

        {erro && <p className="campo-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  )
}

// ── confirmação de exclusão ──────────────────────────────────────────────────

/** Destrutivo nunca é o botão de maior peso visual (COMPONENT_INVENTORY). */

// ── orçamento ────────────────────────────────────────────────────────────────

/** Editor da proposta. O cálculo não mora aqui: vem de `domain/orcamento.ts`,
 *  que é o mesmo que a página do cliente usa. A tela só mostra o resultado. */
export function FolhaOrcamento({ inicial, duplicar, catalogo, aoFechar, aoSalvar }: {
  inicial?: OrcamentoRow
  /** Abre com o conteúdo de `inicial`, mas salva como proposta nova. */
  duplicar?: boolean
  /** `null` = a busca do catálogo falhou; `[]` = catálogo vazio. */
  catalogo: CatalogoItem[] | null
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes } = useFinancas()
  const editando = !!inicial && !duplicar

  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '')
  const [clienteTexto, setClienteTexto] = useState(inicial?.cliente ?? '')
  const [titulo, setTitulo] = useState(
    duplicar ? `${inicial?.titulo ?? ''} (cópia)`.trim() : inicial?.titulo ?? '')
  const [itens, setItens] = useState<ItemOrcamento[]>(lerItens(inicial?.itens))
  const [complexidade, setComplexidade] = useState<Complexidade>(inicial?.complexidade ?? 'simples')
  const [urgencia, setUrgencia] = useState<Urgencia>(inicial?.urgencia ?? 'normal')
  const [desconto, setDesconto] = useState(String(inicial?.desconto_pct ?? 0))
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [verCatalogo, setVerCatalogo] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  // Recalcula a cada tecla: o total é o número que decide a conversa com o
  // cliente, e vê-lo mudar enquanto se ajusta o desconto é o ponto da tela.
  const conta = calcular({ itens, complexidade, urgencia, desconto_pct: Number(desconto) || 0 })
  const emReais = (v: number) => fmtBRL(Math.round(v * 100))

  const mudarItem = (i: number, campo: 'nome' | 'valor', valor: string) =>
    setItens((atual) => atual.map((it, j) => j === i
      ? { ...it, [campo]: campo === 'valor' ? Number(valor.replace(',', '.')) || 0 : valor }
      : it))

  async function salvar() {
    const e: Record<string, string> = {}
    if (!titulo.trim()) e.titulo = 'Dê um título à proposta'
    if (!itens.length) e.itens = 'Adicione ao menos um item'
    if (!clienteId && !clienteTexto.trim()) e.cliente = 'Escolha um cliente ou escreva o nome'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      const corpo = {
        cliente: clienteId ? clientes.find((c) => c.id === clienteId)?.nome ?? null : clienteTexto.trim() || null,
        cliente_id: clienteId || null,
        titulo: titulo.trim(),
        itens,
        // valor_total é REAIS (exceção herdada), e é o total já ajustado —
        // é o número que a página do cliente exibe sem recalcular.
        valor_total: conta.total,
        observacoes: observacoes.trim() || null,
        complexidade,
        urgencia,
        desconto_pct: Math.min(100, Math.max(0, Number(desconto) || 0)),
      }
      if (editando) await orcamentosApi.update({ id: inicial!.id, ...corpo })
      // Cópia nasce rascunho: mandar como enviada sem revisar é o tipo de
      // acidente que chega ao cliente.
      else await orcamentosApi.criar({ ...corpo, status: 'rascunho' })
      aoSalvar(editando ? 'Proposta atualizada' : 'Proposta criada')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={editando ? 'Editar proposta' : duplicar ? 'Duplicar proposta' : 'Nova proposta'}
      aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar · {emReais(conta.total)}</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        {editando && inicial!.status === 'aprovado' && (
          <p className="t-sec">
            Proposta aprovada com projeto criado tem título, valor e cliente
            travados no servidor — ajuste pelo serviço, em Projetos.
          </p>
        )}

        <div className="campo" data-erro={erros.cliente ? 'true' : undefined}>
          <label htmlFor="orc-cli">Cliente</label>
          <select id="orc-cli" className="campo-caixa" value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Não cadastrado…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {!clienteId && (
            <input className="campo-caixa" style={{ marginTop: 'var(--e-3)' }}
              value={clienteTexto} onChange={(e) => setClienteTexto(e.target.value)}
              placeholder="Nome de quem vai receber" aria-label="Nome do cliente não cadastrado" />
          )}
          <span className="t-legenda">
            Enviar ou aprovar exige cliente cadastrado — é o que liga a proposta ao projeto e à cobrança.
          </span>
          {erros.cliente && <span className="campo-erro" role="alert">{erros.cliente}</span>}
        </div>

        <Campo rotulo="Título" value={titulo} erro={erros.titulo}
          onChange={(e) => setTitulo(e.target.value)} placeholder="Identidade visual completa" />

        <div className="campo" data-erro={erros.itens ? 'true' : undefined}>
          <span className="etiqueta-mini">Itens</span>
          {itens.length === 0 && <p className="t-sec">Nenhum item ainda.</p>}
          <ul className="lista">
            {itens.map((it, i) => (
              <li key={i} className="lista-item">
                <input className="campo-caixa" style={{ flex: 1 }} value={it.nome}
                  aria-label={`Nome do item ${i + 1}`} placeholder="Descrição"
                  onChange={(e) => mudarItem(i, 'nome', e.target.value)} />
                <input className="campo-caixa valor-linha" inputMode="decimal"
                  aria-label={`Valor do item ${i + 1}`} value={String(it.valor)}
                  onChange={(e) => mudarItem(i, 'valor', e.target.value)} />
                <Botao variante="icone" aria-label={`Remover item ${i + 1}`}
                  onClick={() => setItens((a) => a.filter((_, j) => j !== i))}>
                  <Icone nome="excluir" tamanho={16} />
                </Botao>
              </li>
            ))}
          </ul>
          <div className="linha" style={{ marginTop: 'var(--e-3)', flexWrap: 'wrap' }}>
            <Botao compacto onClick={() => setItens((a) => [...a, { nome: '', valor: 0 }])}>
              <Icone nome="adicionar" tamanho={14} />Item
            </Botao>
            <Botao compacto disabled={catalogo === null} onClick={() => setVerCatalogo(true)}
              title={catalogo === null ? 'Catálogo indisponível — adicione os itens à mão' : undefined}>
              Do catálogo
            </Botao>
          </div>
          {erros.itens && <span className="campo-erro" role="alert">{erros.itens}</span>}
        </div>

        <div className="grade-dois">
          <div className="campo">
            <label htmlFor="orc-cplx">Complexidade</label>
            <select id="orc-cplx" className="campo-caixa" value={complexidade}
              onChange={(e) => setComplexidade(e.target.value as Complexidade)}>
              {COMPLEXIDADES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}{c.m !== 1 ? ` ×${c.m}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="orc-urg">Urgência</label>
            <select id="orc-urg" className="campo-caixa" value={urgencia}
              onChange={(e) => setUrgencia(e.target.value as Urgencia)}>
              {URGENCIAS.map((u) => (
                <option key={u.key} value={u.key}>{u.label}{u.m !== 1 ? ` ×${u.m}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <Campo rotulo="Desconto (%)" value={desconto} inputMode="decimal"
          onChange={(e) => setDesconto(e.target.value)} placeholder="0" />

        {/* Espelho do que o cliente vai ver. Os ajustes são exibição: nunca
            entram em `itens`, senão o próximo cálculo os multiplicaria de novo. */}
        <div className="campo">
          <span className="etiqueta-mini">Como o cliente vê</span>
          <ul className="lista">
            <li className="lista-item">
              <span className="celula"><span className="t-ui">Subtotal</span></span>
              <span className="t-valor">{emReais(conta.base)}</span>
            </li>
            {conta.ajustes.map((a) => (
              <li key={a.nome} className="lista-item">
                <span className="celula"><span className="t-legenda">{a.nome}</span></span>
                <span className="t-valor">{emReais(a.valor)}</span>
              </li>
            ))}
            <li className="lista-item">
              <span className="celula"><span className="t-ui">Total</span></span>
              <span className="t-valor">{emReais(conta.total)}</span>
            </li>
          </ul>
        </div>

        <CampoTexto rotulo="Observações" value={observacoes} rows={3}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Prazo, forma de pagamento, o que está fora do escopo" />

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>

      {verCatalogo && catalogo && (
        <FolhaCatalogo itens={catalogo} aoFechar={() => setVerCatalogo(false)}
          aoEscolher={(escolhidos) => setItens((a) => [...a, ...escolhidos])} />
      )}
    </Folha>
  )
}

/** Escolha de itens do catálogo, com quantidade. Só leitura: manter o catálogo
 *  é outra tela (Configurações), e misturar as duas coisas aqui faria escolher
 *  um item e editar o preço-base dele parecerem a mesma ação. */
function FolhaCatalogo({ itens, aoFechar, aoEscolher }: {
  itens: CatalogoItem[]
  aoFechar: () => void
  aoEscolher: (escolhidos: ItemOrcamento[]) => void
}) {
  const [qtd, setQtd] = useState<Record<string, number>>({})
  const ativos = itens.filter((i) => i.ativo)
  const escolhidos = ativos
    .filter((i) => (qtd[i.id] ?? 0) > 0)
    .map((i) => {
      const q = qtd[i.id]
      return {
        nome: q > 1 ? `${i.nome} × ${q}` : i.nome,
        valor: Math.round(Number(i.preco_base) * q * 100) / 100,
      }
    })

  return (
    <Folha titulo="Catálogo" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" style={{ flex: 2 }} disabled={escolhidos.length === 0}
          onClick={() => { aoEscolher(escolhidos); aoFechar() }}>
          Adicionar {escolhidos.length || ''}
        </Botao>
      </>}>
      {ativos.length === 0 ? (
        <p className="t-sec">
          Nenhum item ativo no catálogo. Cadastre itens reutilizáveis em
          Configurações para montar proposta mais rápido.
        </p>
      ) : (
        <ul className="lista">
          {ativos.map((i) => (
            <li key={i.id} className="lista-item">
              <span className="celula">
                <span className="t-ui espremer">{i.nome}</span>
                <span className="t-legenda espremer">
                  {[i.categoria, `por ${i.unidade}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="t-valor">{fmtBRL(Math.round(Number(i.preco_base) * 100))}</span>
              <input className="campo-caixa" type="number" min={0} max={99} inputMode="numeric"
                style={{ width: '4.5rem', minHeight: 44 }} aria-label={`Quantidade de ${i.nome}`}
                value={qtd[i.id] ?? 0}
                onChange={(e) => setQtd((q) => ({ ...q, [i.id]: Math.max(0, Number(e.target.value) || 0) }))} />
            </li>
          ))}
        </ul>
      )}
    </Folha>
  )
}

export function FolhaExcluir({ titulo, consequencia, aoFechar, aoConfirmar }: {
  titulo: string
  consequencia: string
  aoFechar: () => void
  aoConfirmar: () => Promise<void> | void
}) {
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState('')
  return (
    <Folha titulo="Excluir" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar} style={{ flex: 2 }}>Manter</Botao>
        <Botao variante="destrutivo" carregando={indo} onClick={async () => {
          setIndo(true)
          setErro('')
          try { await aoConfirmar(); aoFechar() }
          catch (e) { setErro((e as Error).message) }
          finally { setIndo(false) }
        }}>Excluir</Botao>
      </>}>
      <div className="linha" style={{ alignItems: 'flex-start', gap: 'var(--e-5)' }}>
        <span className="alerta-icone" aria-hidden><Icone nome="alerta" tamanho={20} /></span>
        <div>
          <p className="t-h2">{titulo}</p>
          <p className="t-corpo">{consequencia}</p>
          {erro && <p className="campo-erro" role="alert">{erro}</p>}
        </div>
      </div>
    </Folha>
  )
}
