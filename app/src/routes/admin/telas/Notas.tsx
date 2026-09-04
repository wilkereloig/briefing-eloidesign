import { useCallback, useEffect, useMemo, useState } from 'react'
import { financas } from '../../../lib/api'
import { centsDeBRL, fmtBRL } from '../../../lib/dinheiro'
import { useAbrirNovo } from '../../../lib/abrir-novo'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { NotaFiscal, ServicoRow, StatusNF } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Esqueleto, Folha, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, ChipNota, Dinheiro, Paginacao, SeletorMes } from '../../../ui/painel'
import { usePaginacao } from '../../../ui/paginacao'
import { dataCurta } from '../../../ui/formato'
import { FolhaExcluir } from '../folhas'

const STATUS: StatusNF[] = ['pendente', 'pronta', 'emitida', 'enviada', 'cancelada', 'substituida']
const ROTULO: Record<StatusNF, string> = {
  pendente: 'Pendente', pronta: 'Pronta', emitida: 'Emitida',
  enviada: 'Enviada', cancelada: 'Cancelada', substituida: 'Substituída',
}

export default function Notas() {
  const { notas, servicos, clientes, mes, recarregar } = useFinancas()
  const nomes = useNomes()
  const [filtro, setFiltro] = useState<StatusNF | 'todas'>('todas')
  const [clienteId, setClienteId] = useState('')
  // As 42 notas do backfill são de fevereiro a julho: cortar pelo mês do painel
  // deixava a tela vazia. Desligado, a edge não recebe `mes` e devolve tudo.
  const [filtrarPorMes, setFiltrarPorMes] = useState(false)
  const [folha, setFolha] = useState<
    { nf?: NotaFiscal; servicoId?: string } | { excluir: NotaFiscal } | null>(null)
  useAbrirNovo(() => setFolha({}))
  const [aviso, setAviso] = useState<string | null>(null)

  // Serviço concluído e sem nota é dinheiro faturado que a contabilidade não vê.
  // A fonte é `nota_fiscal_id` (D-22) — `nf_numero` é espelho e o vínculo 1:1
  // antigo (`nota.servico_id`) está sempre nulo desde a migração de 09-03.
  const semNota = useMemo(() => servicos.filter((s) =>
    s.status_execucao === 'concluida' && !s.nota_fiscal_id), [servicos])

  // Lista da tela é filtrada por mês/cliente no servidor: `notas` (acima) vem
  // sem corte de data, com limit(500) — filtrar em memória esconderia notas
  // antigas que já caíram fora do topo dos 500 antes de chegar no mês pedido.
  const [notasFiltradas, setNotasFiltradas] = useState<NotaFiscal[] | null>(null)
  const [erroFiltro, setErroFiltro] = useState<string | null>(null)
  const carregarFiltro = useCallback(() => {
    setErroFiltro(null)
    return financas.notas({ mes: filtrarPorMes ? mes : undefined, cliente_id: clienteId || undefined })
      .then((r) => setNotasFiltradas(r))
      .catch((e) => setErroFiltro((e as Error).message))
  }, [mes, clienteId, filtrarPorMes])
  useEffect(() => { void carregarFiltro() }, [carregarFiltro])

  const lista = useMemo(() => (notasFiltradas ?? [])
    .filter((n) => filtro === 'todas' || n.status === filtro)
    .sort((a, b) => (b.competencia ?? '').localeCompare(a.competencia ?? '')), [notasFiltradas, filtro])
  const pag = usePaginacao(lista, 'notas')

  const emitidas = notas.filter((n) => n.status === 'emitida' || n.status === 'enviada')
  const totalImposto = emitidas.reduce((s, n) => s + n.imposto_cents, 0)

  return (
    <div className="tela pilha" data-density="dense">
      <Cabecalho secao="Fiscal" titulo="Notas fiscais">
        <Botao variante="primario" onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={16} />Anexar nota
        </Botao>
      </Cabecalho>

      <Carga linhas={4}>
        <div className="grade-indicadores">
          <Indicador dominante rotulo="Emitidas" valor={String(emitidas.length)}
            nota={fmtBRL(emitidas.reduce((s, n) => s + n.valor_cents, 0))} />
          <Indicador rotulo="Sem PDF anexado"
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
                  <Botao compacto onClick={() => setFolha({ servicoId: s.id })}>Anexar nota</Botao>
                </li>
              ))}
            </ul>
          </Painel>
        )}

        <div className="linha" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--espaco-04)' }}>
          <label className="linha t-legenda" style={{ gap: 'var(--espaco-02)', minHeight: 44 }}>
            <input type="checkbox" checked={filtrarPorMes}
              onChange={(e) => setFiltrarPorMes(e.target.checked)} />
            Mostrar só o mês selecionado
          </label>
          {filtrarPorMes && <SeletorMes />}
          <div className="campo" style={{ minWidth: '12rem' }}>
            <label htmlFor="filtro-cliente">Cliente</label>
            <select id="filtro-cliente" className="campo-caixa" value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="abas" role="tablist" aria-label="Status da nota">
          <Pilula ativa={filtro === 'todas'} role="tab" aria-selected={filtro === 'todas'}
            onClick={() => setFiltro('todas')}>Todas · {(notasFiltradas ?? []).length}</Pilula>
          {STATUS.map((s) => (
            <Pilula key={s} ativa={filtro === s} role="tab" aria-selected={filtro === s}
              onClick={() => setFiltro(s)}>
              {ROTULO[s]} · {(notasFiltradas ?? []).filter((n) => n.status === s).length}
            </Pilula>
          ))}
        </div>

        {erroFiltro && <p className="campo-erro" role="alert">{erroFiltro}</p>}

        <Painel titulo={`${lista.length} ${lista.length === 1 ? 'nota' : 'notas'}`}>
          {notasFiltradas === null ? <Esqueleto linhas={3} altura={56} /> : lista.length === 0 ? (
            <Vazio icone="nota-fiscal" titulo="Nenhuma nota neste filtro"
              instrucao="Registre uma nota fiscal para acompanhar emissão, envio e imposto."
              acao={<Botao variante="primario" onClick={() => setFolha({})}>Anexar nota</Botao>} />
          ) : (
            <>
            <ul className="lista">
              {pag.visiveis.map((n) => (
                <li key={n.id} className="lista-item">
                  <Icone nome="nota-fiscal" tamanho={18} />
                  <span className="celula">
                    <span className="t-ui espremer">{n.numero ? `NF ${n.numero}` : 'Sem número'}</span>
                    <span className="t-legenda espremer">
                      {n.cliente_id ? nomes.cliente.get(n.cliente_id)?.nome ?? '' : 'Sem cliente'}
                      {n.competencia ? ` · ${n.competencia.slice(0, 7)}` : ''}
                      {n.emitida_em ? ` · emitida em ${dataCurta(n.emitida_em)}` : ''}
                      {n.arquivo_path ? ' · PDF anexado' : ''}
                    </span>
                    <span className="t-legenda espremer">
                      {n.servicos?.length
                        ? n.servicos.length === 1
                          ? n.servicos[0].descricao
                          : `${n.servicos.length} serviços · ${n.servicos.map((s) => s.descricao).join(', ')}`
                        : 'Nenhum serviço vinculado'}
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
                  <Botao variante="icone" aria-label={`Excluir nota ${n.numero ?? ''}`}
                    onClick={() => setFolha({ excluir: n })}>
                    <Icone nome="excluir" tamanho={16} />
                  </Botao>
                </li>
              ))}
            </ul>
            <Paginacao {...pag} />
            </>
          )}
        </Painel>
      </Carga>

      {folha && !('excluir' in folha) && (
        <FolhaNota inicial={folha.nf} servicoId={folha.servicoId}
          aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar(); await carregarFiltro() }} />
      )}
      {folha && 'excluir' in folha && (
        <FolhaExcluir
          titulo={`Excluir a nota ${folha.excluir.numero ? `nº ${folha.excluir.numero}` : 'sem número'}?`}
          consequencia="O registro fiscal sai do painel. O lançamento financeiro ligado a ela continua."
          aoFechar={() => setFolha(null)}
          aoConfirmar={async () => {
            await financas.removerNota(folha.excluir.id)
            setAviso('Nota excluída')
            await recarregar()
            await carregarFiltro()
          }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

export function FolhaNota({ inicial, servicoId, aoFechar, aoSalvar }: {
  inicial?: NotaFiscal
  servicoId?: string
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { clientes, servicos, transacoes } = useFinancas()
  const servico = servicoId ? servicos.find((s) => s.id === servicoId) : null

  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? servico?.cliente_id ?? '')
  const [transacaoId, setTransacaoId] = useState(inicial?.transacao_id ?? '')
  const [numero, setNumero] = useState(inicial?.numero ?? '')
  const [status, setStatus] = useState<StatusNF>(inicial?.status ?? 'pendente')
  const [valor, setValor] = useState(
    inicial ? fmtBRL(inicial.valor_cents) : servico ? fmtBRL(servico.valor_cents) : '')
  const [imposto, setImposto] = useState(inicial ? fmtBRL(inicial.imposto_cents) : '')
  const [competencia, setCompetencia] = useState(
    inicial?.competencia ?? servico?.data_competencia ?? '')
  // Serviços que esta nota cobre (D-22). Abrir a folha por "Anexar nota" já traz o
  // serviço que originou a ação.
  const [escolhidos, setEscolhidos] = useState<string[]>(
    inicial?.servicos?.map((s) => s.id) ?? (servicoId ? [servicoId] : []))
  const [soSemNota, setSoSemNota] = useState(true)
  // O painel NÃO emite nota — guarda a que já foi emitida fora daqui. Por isso
  // o PDF é anexo, não resultado: quem emitiu foi o sistema da prefeitura.
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const recebimentos = useMemo(() => transacoes.filter((t) =>
    t.tipo === 'entrada' && t.contexto === 'empresa' &&
    (!clienteId || t.cliente_id === clienteId)), [transacoes, clienteId])

  // Candidatos: serviços do cliente escolhido. "Só sem nota" evita a lista
  // inteira de 59; o que já está nesta nota nunca some do filtro.
  const candidatos = useMemo(() => servicos.filter((s: ServicoRow) =>
    s.cliente_id === clienteId &&
    (!soSemNota || !s.nota_fiscal_id || escolhidos.includes(s.id))),
  [servicos, clienteId, soSemNota, escolhidos])
  const somaEscolhidos = useMemo(() => servicos
    .filter((s) => escolhidos.includes(s.id))
    .reduce((acc, s) => acc + s.valor_cents, 0), [servicos, escolhidos])

  const alternar = (id: string) => setEscolhidos((atual) =>
    atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id])

  async function salvar() {
    const e: Record<string, string> = {}
    // Regra do servidor repetida aqui só para o erro aparecer antes do envio.
    if ((status === 'emitida' || status === 'enviada') && !numero.trim()) {
      e.numero = 'Nota com status emitida precisa do número da prefeitura'
    }
    if (centsDeBRL(valor) <= 0) e.valor = 'Informe o valor da nota'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      // O binário sobe antes do registro: se falhar, nada é gravado e o botão
      // volta com o erro. Gravar primeiro deixaria uma nota apontando para um
      // arquivo que não chegou.
      let arquivoPath = inicial?.arquivo_path ?? null
      if (arquivo) {
        setEnviando(true)
        arquivoPath = await financas.enviarArquivo(arquivo)
        setEnviando(false)
      }
      await financas.salvarNota({
        id: inicial?.id,
        arquivo_path: arquivoPath,
        cliente_id: clienteId || null,
        // servico_id (1:1) fica no passado: quem liga nota a serviço agora é
        // servico_ids, que aceita mais de um (D-22).
        servico_ids: escolhidos,
        transacao_id: transacaoId || null,
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
      setEnviando(false)
    }
  }

  async function verAnexo() {
    if (!inicial?.arquivo_path) return
    try {
      window.open(await financas.urlArquivo(inicial.arquivo_path), '_blank', 'noopener,noreferrer')
    } catch (err) {
      setErros({ geral: (err as Error).message })
    }
  }

  return (
    <Folha titulo={inicial ? 'Editar nota fiscal' : 'Anexar nota fiscal'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>{enviando ? 'Enviando PDF…' : 'Salvar'}</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
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

        {/* Anexo do PDF que a prefeitura devolveu. Fica no bucket privado
            eloi-notas; o cliente vê pelo portal, que assina o link na hora. */}
        <div className="campo">
          <label htmlFor="nf-arquivo">
            {inicial?.arquivo_path ? 'Substituir PDF da nota' : 'PDF da nota'}
          </label>
          <input id="nf-arquivo" type="file" className="campo-caixa" accept=".pdf,application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          {inicial?.arquivo_path && !arquivo && (
            <span className="t-legenda">
              Já existe um arquivo anexado.{' '}
              <button type="button" className="acesso-link" onClick={() => void verAnexo()}>
                Ver o atual
              </button>
            </span>
          )}
        </div>

        {/* Uma nota pode cobrir vários serviços — é como a NFS-e 42 nasceu,
            com dois trabalhos na mesma nota. */}
        <div className="campo">
          <label className="etiqueta-mini" htmlFor="nf-servicos-busca">Serviços cobertos por esta nota</label>
          {!clienteId ? (
            <span className="t-legenda">Escolha o cliente para listar os serviços.</span>
          ) : (
            <>
              <label className="linha t-legenda" style={{ gap: 'var(--espaco-02)', minHeight: 44 }}>
                <input id="nf-servicos-busca" type="checkbox" checked={soSemNota}
                  onChange={(e) => setSoSemNota(e.target.checked)} />
                Mostrar só os que ainda não têm nota
              </label>
              {candidatos.length === 0 ? (
                <span className="t-legenda">Nenhum serviço deste cliente nesse filtro.</span>
              ) : (
                <ul className="lista lista-escolha">
                  {candidatos.map((s) => (
                    <li key={s.id} className="lista-item">
                      <label className="linha" style={{ gap: 'var(--espaco-02)', minHeight: 44, flex: 1 }}>
                        <input type="checkbox" checked={escolhidos.includes(s.id)}
                          onChange={() => alternar(s.id)} />
                        <span className="celula">
                          <span className="t-ui espremer">{s.descricao}</span>
                          <span className="t-legenda espremer">
                            {s.sub_cliente ? `${s.sub_cliente} · ` : ''}
                            {s.data_competencia ? s.data_competencia.slice(0, 7) : 'sem competência'}
                            {s.nota_fiscal_id && !escolhidos.includes(s.id) ? ' · já em outra nota' : ''}
                          </span>
                        </span>
                        <span className="t-valor">{fmtBRL(s.valor_cents)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {escolhidos.length > 0 && (
                <span className="t-legenda">
                  {escolhidos.length} selecionado{escolhidos.length === 1 ? '' : 's'} · soma {fmtBRL(somaEscolhidos)}
                  {somaEscolhidos !== centsDeBRL(valor) && (
                    <>
                      {' '}
                      <button type="button" className="acesso-link"
                        onClick={() => setValor(fmtBRL(somaEscolhidos))}>
                        usar como valor da nota
                      </button>
                    </>
                  )}
                </span>
              )}
            </>
          )}
        </div>

        {/* Vínculo com a receita: é o que faz "nota emitida" e "dinheiro
            recebido" pararem de ser duas verdades separadas. Só receitas do
            cliente escolhido entram na lista. */}
        <div className="campo">
          <label htmlFor="nf-tx">Recebimento correspondente</label>
          <select id="nf-tx" className="campo-caixa" value={transacaoId}
            onChange={(e) => setTransacaoId(e.target.value)}>
            <option value="">Sem vínculo</option>
            {recebimentos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descricao} · {fmtBRL(t.valor_cents)}
              </option>
            ))}
          </select>
          {!clienteId && <span className="t-legenda">Escolha o cliente para listar os recebimentos.</span>}
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}
