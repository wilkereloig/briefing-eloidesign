import { useMemo, useRef, useState } from 'react'
import { financas } from '../../lib/api'
import { centsDeBRL, fmtBRL } from '../../lib/dinheiro'
import { hojeISO, useFinancas } from '../../lib/financas-store'
import { saldoContaEm } from '../../domain/financeiro'
import {
  classificar, detectarColunas, interpretar, lerCsv, type Mapa, type Situacao, type Tabela,
} from '../../domain/importacao'
import type { Conta, Contexto } from '../../lib/tipos'
import { Botao, Campo, CampoTexto, Chip, Folha, Pilula } from '../../ui/componentes'
import { dataCurta } from '../../ui/formato'

// As duas folhas que olham para o extrato do banco: conferir o saldo dele
// contra o do painel, e trazer as linhas dele para dentro.

// ── conferência ──────────────────────────────────────────────────────────────

/** Sistema × extrato numa data. Grava a fotografia; ajuste só se pedido, e
 *  como transação própria (origem=ajuste). Nunca mexe em lançamento. */
export function FolhaConferencia({ conta, aoFechar, aoSalvar }: {
  conta: Conta
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { transacoes, conferencias } = useFinancas()
  const [data, setData] = useState(hojeISO())
  const [informado, setInformado] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [criarAjuste, setCriarAjuste] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const sistema = useMemo(() => saldoContaEm(conta, transacoes, data), [conta, transacoes, data])
  const informadoCents = informado.trim() ? centsDeBRL(informado) : null
  const diferenca = informadoCents == null ? null : informadoCents - sistema
  const anteriores = conferencias.filter((c) => c.conta_id === conta.id).slice(0, 5)

  async function salvar() {
    if (informadoCents == null) return setErro('Informe o saldo que o extrato mostra')
    setSalvando(true)
    try {
      const r = await financas.registrarConferencia({
        conta_id: conta.id, data, saldo_informado_cents: informadoCents, saldo_sistema_cents: sistema,
        observacoes: observacoes.trim() || undefined, criar_ajuste: criarAjuste && diferenca !== 0,
      })
      aoSalvar(r.ajuste ? 'Conferência registrada com ajuste' : diferenca === 0 ? 'Saldo bateu' : 'Conferência registrada')
      aoFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo={`Conferir ${conta.nome}`} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Registrar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <div className="campo">
          <label htmlFor="conf-data">Data do extrato</label>
          <input id="conf-data" type="date" className="campo-caixa" value={data}
            onChange={(e) => setData(e.target.value)} />
        </div>

        <p className="t-sec">
          Saldo do painel em {dataCurta(data)}: <span className="dinheiro t-ui">{fmtBRL(sistema)}</span>
        </p>

        <Campo rotulo="Saldo que o extrato mostra" value={informado} inputMode="decimal" erro={erro}
          placeholder="R$ 0,00" onChange={(e) => { setInformado(e.target.value); setErro('') }} />

        {diferenca != null && (
          <p className="t-corpo" role="status">
            {diferenca === 0
              ? 'Bateu. Nada a fazer.'
              : diferenca > 0
                ? <>Extrato tem <span className="dinheiro">{fmtBRL(diferenca)}</span> a mais que o painel — entrou dinheiro que não foi lançado.</>
                : <>Extrato tem <span className="dinheiro">{fmtBRL(-diferenca)}</span> a menos que o painel — saiu dinheiro que não foi lançado.</>}
          </p>
        )}

        {diferenca != null && diferenca !== 0 && (
          <label className="linha" style={{ gap: 'var(--espaco-02)', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={criarAjuste} onChange={(e) => setCriarAjuste(e.target.checked)}
              style={{ marginTop: 4 }} />
            <span className="t-sec">
              Criar lançamento de ajuste de {fmtBRL(Math.abs(diferenca))}, identificado como ajuste.
              O melhor é achar o movimento que falta e lançá-lo; o ajuste é para quando não dá.
            </span>
          </label>
        )}

        <CampoTexto rotulo="Observação" value={observacoes} rows={2}
          onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: tarifa bancária não lançada" />

        {anteriores.length > 0 && (
          <div>
            <p className="etiqueta-mini">Conferências anteriores</p>
            <ul className="lista" style={{ marginTop: 'var(--espaco-02)' }}>
              {anteriores.map((c) => (
                <li key={c.id} className="lista-item">
                  <span className="celula">
                    <span className="t-ui">{dataCurta(c.data)}</span>
                    <span className="t-legenda">
                      {c.diferenca_cents === 0 ? 'bateu' : `diferença ${fmtBRL(c.diferenca_cents)}`}
                      {c.ajuste_transacao_id ? ' · com ajuste' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Folha>
  )
}

// ── importação ───────────────────────────────────────────────────────────────

const ROTULO_SITUACAO: Record<Situacao, string> = {
  nova: 'Nova', duplicada: 'Já importada', provavel: 'Talvez já lançada', invalida: 'Inválida',
}
// Estados de chip existentes (ui/tokens.ts): nada de cor nova por situação.
const ESTADO_SITUACAO: Record<Situacao, 'realizado' | 'previsto' | 'fila' | 'atrasado'> = {
  nova: 'realizado', duplicada: 'previsto', provavel: 'fila', invalida: 'atrasado',
}

/** Arquivo → colunas → prévia → importar. Nada grava antes da prévia. */
export function FolhaImportar({ aoFechar, aoSalvar }: {
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const { contas, transacoes } = useFinancas()
  const entrada = useRef<HTMLInputElement>(null)
  const [tabela, setTabela] = useState<Tabela | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [mapa, setMapa] = useState<Mapa>({ data: 0, descricao: 1, valor: 2 })
  const [inverter, setInverter] = useState(false)
  const contasAtivas = contas.filter((c) => c.ativa)
  const [contaId, setContaId] = useState(contasAtivas[0]?.id ?? '')
  const conta = contasAtivas.find((c) => c.id === contaId)
  const [contexto, setContexto] = useState<Contexto>(conta?.contexto ?? 'empresa')
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const linhas = useMemo(() => (tabela ? interpretar(tabela, mapa, inverter) : []), [tabela, mapa, inverter])
  const situacoes = useMemo(() => classificar(linhas, transacoes, contaId), [linhas, transacoes, contaId])

  async function lerArquivo(f: File | undefined) {
    if (!f) return
    setErro('')
    const texto = await f.text()
    const t = lerCsv(texto)
    if (!t.linhas.length) return setErro('Não encontrei linhas nesse arquivo.')
    if (t.cabecalho.length < 2) return setErro('Precisa de pelo menos data, descrição e valor em colunas separadas.')
    setNomeArquivo(f.name)
    setTabela(t)
    const m = detectarColunas(t)
    setMapa(m)
    // Pré-marca só o que é novo. Duplicada e "talvez" começam desmarcadas.
    const sit = classificar(interpretar(t, m, inverter), transacoes, contaId)
    setMarcadas(new Set(sit.flatMap((s, i) => (s === 'nova' ? [i] : []))))
  }

  const alternar = (i: number) => setMarcadas((m) => {
    const n = new Set(m); if (n.has(i)) n.delete(i); else n.add(i); return n
  })

  const selecionadas = linhas.filter((_, i) => marcadas.has(i) && situacoes[i] !== 'invalida')
  const totais = selecionadas.reduce((acc, l) => {
    if ((l.valor_cents ?? 0) > 0) acc.entrada += l.valor_cents!; else acc.saida -= l.valor_cents!
    return acc
  }, { entrada: 0, saida: 0 })

  async function importar() {
    if (!contaId) return setErro('Escolha a conta do extrato')
    if (!selecionadas.length) return setErro('Nenhuma linha marcada')
    setSalvando(true)
    try {
      const r = await financas.importar({
        conta_id: contaId, contexto,
        linhas: selecionadas.map((l) => ({
          data: l.data!, descricao: l.descricao, valor_cents: l.valor_cents!, chave: l.chave,
        })),
      })
      aoSalvar(`${r.importadas} ${r.importadas === 1 ? 'lançamento importado' : 'lançamentos importados'}${r.ignoradas ? ` · ${r.ignoradas} já existiam` : ''}`)
      aoFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const selectColuna = (rotulo: string, chave: keyof Mapa) => (
    <div className="campo">
      <label htmlFor={`imp-${chave}`}>{rotulo}</label>
      <select id={`imp-${chave}`} className="campo-caixa" value={mapa[chave]}
        onChange={(e) => setMapa({ ...mapa, [chave]: Number(e.target.value) })}>
        {tabela!.cabecalho.map((c, i) => <option key={i} value={i}>{c}</option>)}
      </select>
    </div>
  )

  return (
    <Folha titulo="Importar extrato" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void importar()} carregando={salvando}
          disabled={!tabela || !selecionadas.length} style={{ flex: 2 }}>
          Importar {selecionadas.length ? `${selecionadas.length}` : ''}
        </Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <div>
          <input ref={entrada} type="file" accept=".csv,.txt,text/csv" className="so-leitor"
            aria-label="Arquivo CSV" onChange={(e) => void lerArquivo(e.target.files?.[0])} />
          <Botao onClick={() => entrada.current?.click()}>
            {nomeArquivo ? `Trocar arquivo (${nomeArquivo})` : 'Escolher arquivo CSV'}
          </Botao>
          <p className="t-legenda" style={{ marginTop: 'var(--espaco-02)' }}>
            CSV exportado do banco. Planilha XLSX: salve como CSV antes.
          </p>
        </div>

        {erro && <p className="campo-erro" role="alert">{erro}</p>}

        {tabela && (
          <>
            <div className="grade-filtros">
              {selectColuna('Data', 'data')}
              {selectColuna('Descrição', 'descricao')}
              {selectColuna('Valor', 'valor')}
            </div>
            <label className="linha" style={{ gap: 'var(--espaco-02)' }}>
              <input type="checkbox" checked={inverter} onChange={(e) => setInverter(e.target.checked)} />
              <span className="t-sec">Inverter sinal (extrato de cartão em que compra vem positiva)</span>
            </label>

            <div className="grade-filtros">
              <div className="campo">
                <label htmlFor="imp-conta">Conta do extrato</label>
                <select id="imp-conta" className="campo-caixa" value={contaId}
                  onChange={(e) => {
                    setContaId(e.target.value)
                    const c = contasAtivas.find((x) => x.id === e.target.value)
                    if (c) setContexto(c.contexto)
                  }}>
                  <option value="">Selecione…</option>
                  {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.contexto}</option>)}
                </select>
              </div>
              <div className="campo">
                <span className="etiqueta-mini">Contexto</span>
                <div className="linha" style={{ marginTop: 'var(--espaco-02)' }}>
                  <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
                  <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
                </div>
              </div>
            </div>

            <div className="linha" style={{ justifyContent: 'space-between' }}>
              <span className="t-sec">
                {selecionadas.length} de {linhas.length} marcadas · entra {fmtBRL(totais.entrada)} · sai {fmtBRL(totais.saida)}
              </span>
              <span className="linha" style={{ gap: 'var(--espaco-02)' }}>
                <Botao compacto onClick={() => setMarcadas(new Set(situacoes.flatMap((s, i) => (s === 'nova' ? [i] : []))))}>Só novas</Botao>
                <Botao compacto onClick={() => setMarcadas(new Set())}>Nenhuma</Botao>
              </span>
            </div>

            {/* Prévia: tudo que vai entrar, linha a linha. Ninguém importa no escuro. */}
            <div className="rolagem-x">
              <table className="tabela tabela-previa">
                <thead>
                  <tr><th /><th>Data</th><th>Descrição</th><th>Valor</th><th>Situação</th></tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 300).map((l, i) => {
                    const s = situacoes[i]
                    return (
                      <tr key={i} data-situacao={s}>
                        <td>
                          <input type="checkbox" checked={marcadas.has(i)} disabled={s === 'invalida'}
                            onChange={() => alternar(i)} aria-label={`Importar linha ${i + 1}`} />
                        </td>
                        <td className="t-ui">{l.data ? dataCurta(l.data) : '—'}</td>
                        <td className="espremer" style={{ maxWidth: 220 }}>{l.descricao}</td>
                        <td className="dinheiro">{l.valor_cents != null ? fmtBRL(l.valor_cents) : '—'}</td>
                        <td><Chip estado={ESTADO_SITUACAO[s]}>{l.problema ?? ROTULO_SITUACAO[s]}</Chip></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {linhas.length > 300 && <p className="t-legenda">Mostrando 300 de {linhas.length}. Todas as marcadas entram.</p>}
            <p className="t-legenda">
              {conta?.tipo === 'cartao_credito'
                ? 'Extrato de cartão: as compras entram pendentes e vão para a fatura.'
                : 'Extrato de conta: as linhas entram como realizadas na data do extrato.'}
              {' '}Tudo fica marcado como importado; reimportar o mesmo arquivo não duplica.
            </p>
          </>
        )}
      </div>
    </Folha>
  )
}
