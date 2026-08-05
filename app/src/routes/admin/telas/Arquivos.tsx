import { useEffect, useMemo, useRef, useState } from 'react'
import { financas, materiaisApi } from '../../../lib/api'
import { useFinancas, useNomes } from '../../../lib/financas-store'
import type { Arquivo, MaterialRow } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Esqueleto, Folha, Icone, Indicador, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
// Arquivos tem carga própria (não vem do store financeiro), então trata
// esqueleto e erro localmente em vez de usar <Carga>.
import { Cabecalho } from '../../../ui/painel'
import { dataCurta } from '../../../ui/formato'
import { FolhaExcluir } from '../folhas'

const CATEGORIAS: Arquivo['categoria'][] = ['contrato', 'proposta', 'nota_fiscal',
  'comprovante', 'boleto', 'documento', 'relatorio', 'outro']
const ROTULO: Record<Arquivo['categoria'], string> = {
  contrato: 'Contrato', proposta: 'Proposta', nota_fiscal: 'Nota fiscal',
  comprovante: 'Comprovante', boleto: 'Boleto', documento: 'Documento',
  relatorio: 'Relatório', outro: 'Outro',
}

export default function Arquivos() {
  const { clientes } = useFinancas()
  const nomes = useNomes()
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)
  const [materiais, setMateriais] = useState<MaterialRow[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Arquivo['categoria'] | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [folha, setFolha] = useState<'novo' | { excluir: Arquivo } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function carregar() {
    setErro(null)
    try {
      const [arq, mat] = await Promise.all([
        financas.arquivos(),
        // Materiais das entregas de marca já existiam: entram como leitura para
        // o acervo ser um lugar só, sem migrar nada.
        materiaisApi.list().catch(() => [] as MaterialRow[]),
      ])
      setArquivos(arq)
      setMateriais(mat)
    } catch (e) {
      setErro((e as Error).message)
      setArquivos([])
    }
  }
  useEffect(() => { void carregar() }, [])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (arquivos ?? [])
      .filter((a) => filtro === 'todos' || a.categoria === filtro)
      .filter((a) => !q || a.titulo.toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [arquivos, filtro, busca])

  async function abrir(a: Arquivo) {
    try {
      const url = await financas.urlArquivo(a.path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Acervo" titulo="Arquivos">
        <Botao variante="primario" onClick={() => setFolha('novo')}>
          <Icone nome="upload" tamanho={16} />Enviar
        </Botao>
      </Cabecalho>

      {arquivos === null ? <Esqueleto linhas={5} altura={64} /> : (
        <>
          <div className="grade-indicadores">
            <Indicador dominante rotulo="Arquivos" valor={String(arquivos.length)}
              nota="Enviados pelo painel" />
            <Indicador rotulo="Contratos"
              valor={String(arquivos.filter((a) => a.categoria === 'contrato').length)}
              nota="Documentos assinados" />
            <Indicador rotulo="Comprovantes"
              valor={String(arquivos.filter((a) => a.categoria === 'comprovante' || a.categoria === 'boleto').length)}
              nota="Boletos e recibos" />
            <Indicador rotulo="Entregas de marca" valor={String(materiais.length)}
              nota="Materiais do portal do cliente" />
          </div>

          {erro && <Painel erro titulo="Erro"><p className="t-msg" role="alert"
            style={{ color: 'var(--coral)' }}>{erro}</p></Painel>}

          <div className="abas" role="tablist" aria-label="Categoria do arquivo">
            <Pilula ativa={filtro === 'todos'} role="tab" aria-selected={filtro === 'todos'}
              onClick={() => setFiltro('todos')}>Todos · {arquivos.length}</Pilula>
            {CATEGORIAS.map((c) => (
              <Pilula key={c} ativa={filtro === c} role="tab" aria-selected={filtro === c}
                onClick={() => setFiltro(c)}>
                {ROTULO[c]} · {arquivos.filter((a) => a.categoria === c).length}
              </Pilula>
            ))}
          </div>

          <div className="busca">
            <Icone nome="pesquisa" tamanho={17} />
            <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar arquivo" aria-label="Buscar arquivo" />
            {busca && (
              <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                <Icone nome="fechar" tamanho={14} />
              </Botao>
            )}
          </div>

          <Painel titulo={`${lista.length} ${lista.length === 1 ? 'arquivo' : 'arquivos'}`}>
            {lista.length === 0 ? (
              <Vazio icone="documentos" titulo="Nenhum arquivo aqui"
                instrucao="Envie contratos, comprovantes e notas para manter tudo ligado ao cliente certo."
                acao={<Botao variante="primario" onClick={() => setFolha('novo')}>Enviar arquivo</Botao>} />
            ) : (
              <ul className="lista">
                {lista.map((a) => (
                  <li key={a.id} className="lista-item">
                    <Icone nome="documentos" tamanho={18} />
                    <span className="celula">
                      <span className="t-ui espremer">{a.titulo}</span>
                      <span className="t-legenda espremer">
                        {ROTULO[a.categoria]}
                        {a.cliente_id ? ` · ${nomes.cliente.get(a.cliente_id)?.nome ?? ''}` : ''}
                        {` · ${dataCurta(a.created_at.slice(0, 10))}`}
                        {a.tamanho_bytes ? ` · ${tamanho(a.tamanho_bytes)}` : ''}
                      </span>
                    </span>
                    <Botao variante="icone" onClick={() => void abrir(a)} aria-label={`Abrir ${a.titulo}`}>
                      <Icone nome="baixar" tamanho={16} />
                    </Botao>
                    <Botao variante="icone" onClick={() => setFolha({ excluir: a })}
                      aria-label={`Excluir ${a.titulo}`}>
                      <Icone nome="excluir" tamanho={16} />
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          {materiais.length > 0 && (
            <Painel titulo="Entregas de marca"
              acao={<span className="t-legenda">somente leitura</span>}>
              <ul className="lista">
                {materiais.slice(0, 10).map((m) => (
                  <li key={m.id} className="lista-item">
                    <Icone nome="entrega" tamanho={18} />
                    <span className="celula">
                      <span className="t-ui espremer">{m.titulo}</span>
                      <span className="t-legenda espremer">
                        {m.categoria}
                        {m.cliente_id ? ` · ${nomes.cliente.get(m.cliente_id)?.nome ?? ''}` : ''}
                        {m.versao ? ` · v${m.versao}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Painel>
          )}
        </>
      )}

      {folha === 'novo' && (
        <FolhaUpload clientes={clientes} aoFechar={() => setFolha(null)}
          aoSalvar={async (msg) => { setAviso(msg); await carregar() }} />
      )}
      {folha && folha !== 'novo' && (
        <FolhaExcluir titulo={`Excluir "${folha.excluir.titulo}"?`}
          consequencia="O registro e o arquivo saem do acervo. Essa ação não tem desfazer."
          aoFechar={() => setFolha(null)}
          aoConfirmar={async () => {
            await financas.removerArquivo(folha.excluir.id)
            setAviso('Arquivo excluído')
            await carregar()
          }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

function FolhaUpload({ clientes, aoFechar, aoSalvar }: {
  clientes: ReturnType<typeof useFinancas>['clientes']
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<Arquivo['categoria']>('documento')
  const [clienteId, setClienteId] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  async function salvar() {
    const e: Record<string, string> = {}
    if (!file) e.file = 'Escolha um arquivo'
    if (!titulo.trim()) e.titulo = 'Dê um título'
    // O schema exige que todo arquivo tenha dono — sem isso ele fica órfão e
    // some de qualquer filtro.
    if (!clienteId) e.cliente = 'Ligue o arquivo a um cliente'
    setErros(e)
    if (Object.keys(e).length || !file) return

    setEnviando(true)
    try {
      const path = await financas.enviarArquivo(file)
      await financas.salvarArquivo({
        titulo: titulo.trim(), path, mime: file.type || null,
        tamanho_bytes: file.size, categoria, cliente_id: clienteId,
      })
      aoSalvar('Arquivo enviado')
      aoFechar()
    } catch (err) {
      setErros({ geral: (err as Error).message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Folha titulo="Enviar arquivo" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={enviando}
          style={{ flex: 2 }}>Enviar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
        <button type="button" className="area-upload" onClick={() => entrada.current?.click()}>
          <Icone nome="upload" tamanho={30} />
          <span className="t-ui">{file ? file.name : 'Toque para escolher um arquivo'}</span>
          <span className="t-legenda">{file ? tamanho(file.size) : 'PDF, imagem ou documento'}</span>
        </button>
        <input ref={entrada} type="file" className="so-leitor" aria-label="Arquivo"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !titulo) setTitulo(f.name.replace(/\.[^.]+$/, ''))
          }} />
        {erros.file && <span className="campo-erro" role="alert">{erros.file}</span>}

        <Campo rotulo="Título" value={titulo} erro={erros.titulo}
          onChange={(e) => setTitulo(e.target.value)} placeholder="Contrato Solarium 2026" />

        <div className="campo">
          <label htmlFor="arq-cat">Categoria</label>
          <select id="arq-cat" className="campo-caixa" value={categoria}
            onChange={(e) => setCategoria(e.target.value as Arquivo['categoria'])}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO[c]}</option>)}
          </select>
        </div>

        <div className="campo" data-erro={erros.cliente ? 'true' : undefined}>
          <label htmlFor="arq-cli">Cliente</label>
          <select id="arq-cli" className="campo-caixa" value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {erros.cliente && <span className="campo-erro" role="alert">{erros.cliente}</span>}
        </div>

        {erros.geral && <p className="campo-erro" role="alert">{erros.geral}</p>}
      </div>
    </Folha>
  )
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
