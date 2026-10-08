import { useState } from 'react'
import { Link } from 'react-router-dom'
import { financas } from '../../../lib/api'
import { useFinancas } from '../../../lib/financas-store'
import type { Categoria, Contexto, TipoMov } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Etiqueta, Folha, Icone, Painel, Pilula,
} from '../../../ui/componentes'
import { Cabecalho, Carga } from '../../../ui/painel'

export default function Config() {
  const { categorias, recarregar } = useFinancas()
  const [folha, setFolha] = useState<
    | { tipo: 'categoria'; contexto: Contexto }
    | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Sistema" titulo="Configurações" />

      <Carga linhas={4}>
        {/* Contas moram em Dinheiro → Contas (página por conta, extrato,
            arquivar). Aqui fica só o atalho, para não haver dois cadastros. */}
        <Painel titulo="Contas e cartões">
          <p className="t-sec" style={{ marginBottom: 'var(--espaco-04)' }}>
            Cadastro, edição, limite e arquivamento de contas e cartões ficam na área Dinheiro.
          </p>
          <Link className="btn btn-secundario" to="/admin/dinheiro/contas">Gerenciar contas e cartões</Link>
        </Painel>

        <Painel titulo="Categorias"
          acao={<Botao compacto onClick={() => setFolha({ tipo: 'categoria', contexto: 'empresa' })}>
            <Icone nome="adicionar" tamanho={14} />Nova
          </Botao>}>
          <p className="t-sec" style={{ marginBottom: 'var(--espaco-04)' }}>
            {categorias.length} categorias ativas. Elas classificam despesas e receitas nos
            relatórios e nos limites de gasto.
          </p>
          <div className="grade-dupla">
            {(['empresa', 'pessoal'] as Contexto[]).map((ctx) => (
              <div key={ctx}>
                <Etiqueta acento>{ctx}</Etiqueta>
                <div className="linha" style={{ marginTop: 'var(--espaco-03)' }}>
                  {categorias.filter((c) => c.contexto === ctx).map((c) => (
                    <span key={c.id} className="chip-categoria" data-tipo={c.tipo}>
                      {c.nome}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Painel>

        <Painel titulo="Sobre os dados">
          <div className="ficha">
            <div>
              <dt className="etiqueta-mini">Dinheiro</dt>
              <dd className="t-corpo">Guardado em centavos inteiros. Sem float, sem arredondamento perdido.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Transferências</dt>
              <dd className="t-corpo">Movem saldo entre contas e nunca contam como receita ou despesa.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Recorrências</dt>
              <dd className="t-corpo">Materializadas ao abrir o painel, uma vez por vencimento.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Separação</dt>
              <dd className="t-corpo">Pessoal e empresa dividem as tabelas, separados pelo contexto de cada lançamento.</dd>
            </div>
          </div>
        </Painel>

        {/* "Estou olhando a versão certa?" — tudo aqui vem do repo em build
            (vite.config.ts `define`), nada é consultado ao vivo. */}
        <Painel titulo="Sistema">
          <div className="ficha">
            <div>
              <dt className="etiqueta-mini">Domínio</dt>
              <dd className="t-corpo">{window.location.hostname}</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Painel</dt>
              <dd className="t-corpo">fonte <code>{__VERSAO__.fonte}</code> — confira com <code>npm run release:check</code></dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Migração mais recente no repositório</dt>
              <dd className="t-corpo">{__VERSAO__.migracao ?? '—'} · aplicação no banco não é verificada aqui</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Edge functions · último deploy registrado</dt>
              <dd className="t-corpo">
                <ul className="lista">
                  {Object.entries(__EDGES__).map(([fn, d]) => (
                    <li key={fn} className="lista-item">
                      <span className="celula"><span className="t-ui">{fn}</span></span>
                      <span className="t-meta"><code>{d.commit}</code> · {d.em}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        </Painel>
      </Carga>

      {folha?.tipo === 'categoria' && (
        <FolhaCategoria contextoInicial={folha.contexto}
          aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </div>
  )
}

function FolhaCategoria({ contextoInicial, aoFechar, aoSalvar }: {
  contextoInicial?: Contexto
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [nome, setNome] = useState('')
  const [contexto, setContexto] = useState<Contexto>(contextoInicial ?? 'empresa')
  const [tipo, setTipo] = useState<TipoMov>('saida')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErro('Dê um nome à categoria')
    setSalvando(true)
    try {
      const nova: Partial<Categoria> = { nome: nome.trim(), contexto, tipo }
      await financas.salvarCategoria(nova)
      aoSalvar('Categoria criada')
      aoFechar()
    } catch (err) {
      // O índice único (lower(nome), contexto, tipo) barra duplicata no banco.
      const msg = (err as Error).message
      setErro(/duplicate|unique/i.test(msg) ? 'Já existe uma categoria com esse nome' : msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha titulo="Nova categoria" aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <Campo rotulo="Nome" value={nome} erro={erro}
          onChange={(e) => { setNome(e.target.value); setErro('') }} placeholder="Equipamentos" />
        <div className="linha">
          <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
          <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
        </div>
        <div className="linha">
          <Pilula ativa={tipo === 'saida'} onClick={() => setTipo('saida')}>Despesa</Pilula>
          <Pilula ativa={tipo === 'entrada'} onClick={() => setTipo('entrada')}>Receita</Pilula>
        </div>
      </div>
    </Folha>
  )
}
