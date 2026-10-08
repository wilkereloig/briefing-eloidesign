import { useState } from 'react'
import { financas } from '../../../../lib/api'
import { useFinancas } from '../../../../lib/financas-store'
import type { Categoria, Contexto, TipoMov } from '../../../../lib/tipos'
import { Aviso, Botao, Campo, Etiqueta, Folha, Icone, Painel, Pilula, Vazio } from '../../../../ui/componentes'
import { corCliente } from '../../../../ui/tokens'

const CONTEXTOS: { chave: Contexto; label: string }[] = [
  { chave: 'empresa', label: 'Empresa' }, { chave: 'pessoal', label: 'Pessoal' },
]
const TIPOS: { chave: TipoMov; label: string }[] = [
  { chave: 'saida', label: 'Despesas' }, { chave: 'entrada', label: 'Receitas' },
]
const corDoTipo = (c: Categoria) => c.cor || (c.tipo === 'entrada' ? 'var(--acento)' : 'var(--coral)')

/** Categorias por contexto × tipo. Desativar, nunca apagar: lançamentos antigos
 *  continuam apontando para ela. Morava em Configurações até 2026-10-08. */
export function Categorias() {
  const { categoriasTodas, contexto, recarregar } = useFinancas()
  const [folha, setFolha] = useState<{ c?: Categoria } | null>(null)
  const [verInativas, setVerInativas] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; tipo?: 'ok' | 'erro' } | null>(null)
  const apos = async (msg: string) => { setAviso({ texto: msg }); await recarregar() }

  const alternar = async (c: Categoria) => {
    const ativa = c.ativa === false
    try {
      await financas.salvarCategoria({ id: c.id, nome: c.nome, contexto: c.contexto, tipo: c.tipo, ativa })
      await apos(ativa ? 'Categoria reativada' : 'Categoria desativada')
    } catch (e) { setAviso({ texto: (e as Error).message, tipo: 'erro' }) }
  }

  const visiveis = categoriasTodas.filter((c) => !contexto || c.contexto === contexto)
  const ativas = visiveis.filter((c) => c.ativa !== false)
  const inativas = visiveis.filter((c) => c.ativa === false)

  const item = (c: Categoria) => (
    <li key={c.id} className="lista-item" data-cancelado={c.ativa === false ? 'true' : undefined}>
      <span className="marca-cor" aria-hidden style={{ background: corDoTipo(c) }} />
      <span className="celula">
        <span className="t-ui espremer">{c.nome}</span>
        {c.ativa === false && (
          <span className="t-legenda">
            {CONTEXTOS.find((x) => x.chave === c.contexto)?.label} · {c.tipo === 'entrada' ? 'receita' : 'despesa'} · inativa
          </span>
        )}
      </span>
      <Botao variante="icone" aria-label={`Editar ${c.nome}`} onClick={() => setFolha({ c })}>
        <Icone nome="editar" tamanho={16} />
      </Botao>
      <Botao variante="icone" aria-label={c.ativa === false ? `Reativar ${c.nome}` : `Desativar ${c.nome}`}
        onClick={() => void alternar(c)}>
        <Icone nome={c.ativa === false ? 'iteracao' : 'excluir'} tamanho={16} />
      </Botao>
    </li>
  )

  return (
    <>
      <Painel titulo="Categorias"
        acao={<Botao compacto onClick={() => setFolha({})}>
          <Icone nome="adicionar" tamanho={14} />Nova
        </Botao>}>
        <p className="t-sec" style={{ marginBottom: 'var(--espaco-04)' }}>
          {ativas.length} ativas. Classificam despesas e receitas nos relatórios e nos limites de gasto.
          Desativar tira dos seletores e mantém o nome no histórico.
        </p>
        {ativas.length === 0 ? (
          <Vazio icone="documentos" titulo="Nenhuma categoria ativa"
            instrucao="Crie categorias para separar despesas e receitas nos relatórios."
            acao={<Botao variante="primario" onClick={() => setFolha({})}>Criar categoria</Botao>} />
        ) : (
          <div className="pilha">
            {CONTEXTOS.filter((x) => !contexto || x.chave === contexto).map((ctx) => (
              <section key={ctx.chave} className="pilha" aria-label={ctx.label}>
                <Etiqueta acento>{ctx.label}</Etiqueta>
                <div className="grade-dupla">
                  {TIPOS.map((t) => {
                    const lista = ativas.filter((c) => c.contexto === ctx.chave && c.tipo === t.chave)
                    return (
                      <div key={t.chave}>
                        <Etiqueta mini>{t.label} · {lista.length}</Etiqueta>
                        {lista.length === 0
                          ? <p className="t-legenda">Nenhuma.</p>
                          : <ul className="lista">{lista.map(item)}</ul>}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {inativas.length > 0 && (
          <div style={{ marginTop: 'var(--espaco-04)' }}>
            <Botao variante="fantasma" compacto aria-expanded={verInativas}
              onClick={() => setVerInativas(!verInativas)}>
              {verInativas ? 'Ocultar' : 'Mostrar'} {inativas.length} {inativas.length === 1 ? 'inativa' : 'inativas'}
            </Botao>
            {verInativas && <ul className="lista">{inativas.map(item)}</ul>}
          </div>
        )}
      </Painel>

      {folha && <FolhaCategoria inicial={folha.c} contextoInicial={contexto}
        aoFechar={() => setFolha(null)} aoSalvar={apos} />}
      {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} aoSumir={() => setAviso(null)} />}
    </>
  )
}

function FolhaCategoria({ inicial, contextoInicial, aoFechar, aoSalvar }: {
  inicial?: Categoria
  contextoInicial?: Contexto
  aoFechar: () => void
  aoSalvar: (msg: string) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [contexto, setContexto] = useState<Contexto>(inicial?.contexto ?? contextoInicial ?? 'empresa')
  const [tipo, setTipo] = useState<TipoMov>(inicial?.tipo ?? 'saida')
  // null = sem cor própria: a lista usa a cor do tipo.
  const [cor, setCor] = useState<string | null>(inicial?.cor ?? null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErro('Dê um nome à categoria')
    setSalvando(true)
    try {
      await financas.salvarCategoria({ id: inicial?.id, nome: nome.trim(), contexto, tipo, cor })
      aoSalvar(inicial ? 'Categoria atualizada' : 'Categoria criada')
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
    <Folha titulo={inicial ? 'Editar categoria' : 'Nova categoria'} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="destaque" onClick={() => void salvar()} carregando={salvando}
          style={{ flex: 2 }}>Salvar</Botao>
      </>}>
      <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
        <Campo rotulo="Nome" value={nome} erro={erro}
          onChange={(e) => { setNome(e.target.value); setErro('') }} placeholder="Equipamentos" />
        {inicial ? (
          // Contexto e tipo não mudam: os lançamentos já classificados dependem
          // deles. A edge recusa a troca também.
          <div>
            <Etiqueta>Contexto e tipo</Etiqueta>
            <p className="t-corpo">
              {CONTEXTOS.find((x) => x.chave === contexto)?.label} · {tipo === 'entrada' ? 'Receita' : 'Despesa'}
            </p>
            <p className="t-legenda">Não mudam depois de criada. Para outro lado, crie uma categoria nova.</p>
          </div>
        ) : (
          <>
            <div className="linha">
              <Pilula ativa={contexto === 'empresa'} onClick={() => setContexto('empresa')}>Empresa</Pilula>
              <Pilula ativa={contexto === 'pessoal'} onClick={() => setContexto('pessoal')}>Pessoal</Pilula>
            </div>
            <div className="linha">
              <Pilula ativa={tipo === 'saida'} onClick={() => setTipo('saida')}>Despesa</Pilula>
              <Pilula ativa={tipo === 'entrada'} onClick={() => setTipo('entrada')}>Receita</Pilula>
            </div>
          </>
        )}
        <div className="campo">
          <label htmlFor="cor-categoria">Cor de identificação</label>
          <input id="cor-categoria" type="color" className="campo-cor" value={cor ?? corCliente[0]}
            onChange={(e) => setCor(e.target.value)} />
          {cor
            ? <Botao variante="fantasma" compacto onClick={() => setCor(null)}>Usar a cor do tipo</Botao>
            : <span className="t-legenda">Sem cor própria: usa a cor do tipo.</span>}
        </div>
      </div>
    </Folha>
  )
}
