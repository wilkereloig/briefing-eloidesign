import { useState } from 'react'
import { financas } from '../../../lib/api'
import { fmtBRL } from '../../../lib/dinheiro'
import { useFinancas } from '../../../lib/financas-store'
import { faturaAberta, saldoConta } from '../../../domain/financeiro'
import type { Categoria, Conta, Contexto, TipoMov } from '../../../lib/tipos'
import {
  Aviso, Botao, Campo, Etiqueta, Folha, Icone, Painel, Pilula, Vazio,
} from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro } from '../../../ui/painel'
import { rotuloConta } from '../../../ui/formato'
import { FolhaConta } from '../folhas'

export default function Config() {
  const { contas, categorias, transacoes, recarregar } = useFinancas()
  const [folha, setFolha] = useState<
    | { tipo: 'conta'; c?: Conta; contexto?: Contexto }
    | { tipo: 'categoria'; contexto: Contexto }
    | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const apos = async (msg: string) => { setAviso(msg); await recarregar() }

  const porContexto = (ctx: Contexto) => contas.filter((c) => c.contexto === ctx)

  // Desativar em vez de excluir: conta com histórico não pode sumir sem levar
  // junto os lançamentos que apontam pra ela (a FK é `on delete restrict`).
  const alternarConta = async (c: Conta) => {
    // nome/contexto vão junto porque a edge exige os dois em contas.upsert.
    await financas.salvarConta({ id: c.id, nome: c.nome, contexto: c.contexto, ativa: !c.ativa })
    await apos(c.ativa ? 'Conta desativada' : 'Conta reativada')
  }

  return (
    <div className="tela pilha">
      <Cabecalho secao="Sistema" titulo="Configurações" />

      <Carga linhas={4}>
        {(['empresa', 'pessoal'] as Contexto[]).map((ctx) => (
          <Painel key={ctx}
            titulo={ctx === 'empresa' ? 'Contas da empresa' : 'Contas pessoais'}
            acao={<Botao compacto onClick={() => setFolha({ tipo: 'conta', contexto: ctx })}>
              <Icone nome="adicionar" tamanho={14} />Nova
            </Botao>}>
            {porContexto(ctx).length === 0 ? (
              <Vazio icone="caixa" titulo={`Nenhuma conta ${ctx === 'empresa' ? 'da empresa' : 'pessoal'}`}
                instrucao="Cadastre contas, carteiras e cartões para o painel somar saldo."
                acao={<Botao variante="primario" onClick={() => setFolha({ tipo: 'conta', contexto: ctx })}>
                  Cadastrar conta
                </Botao>} />
            ) : (
              <ul className="lista">
                {porContexto(ctx).map((c) => (
                  <li key={c.id} className="lista-item" data-cancelado={!c.ativa ? 'true' : undefined}>
                    <span className="marca-cor" aria-hidden style={{ background: c.cor || 'var(--roxo)' }} />
                    <span className="celula">
                      <span className="t-ui espremer">
                        {c.nome}
                        {!c.ativa && <span className="t-legenda"> · inativa</span>}
                      </span>
                      <span className="t-legenda espremer">
                        {rotuloConta(c.tipo)}
                        {c.instituicao ? ` · ${c.instituicao}` : ''}
                        {c.tipo === 'cartao_credito'
                          ? ` · fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}`
                          : ''}
                      </span>
                    </span>
                    {c.tipo === 'cartao_credito' && c.limite_cents != null && (
                      <span className="col-desktop t-legenda">limite {fmtBRL(c.limite_cents)}</span>
                    )}
                    <Dinheiro className="t-valor"
                      cents={c.tipo === 'cartao_credito'
                        ? faturaAberta(c, transacoes)
                        : saldoConta(c, transacoes)} />
                    <Botao variante="icone" aria-label={`Editar ${c.nome}`}
                      onClick={() => setFolha({ tipo: 'conta', c })}>
                      <Icone nome="editar" tamanho={16} />
                    </Botao>
                    <Botao variante="icone"
                      aria-label={c.ativa ? `Desativar ${c.nome}` : `Reativar ${c.nome}`}
                      onClick={() => void alternarConta(c)}>
                      <Icone nome={c.ativa ? 'fechar' : 'iteracao'} tamanho={16} />
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        ))}

        <Painel titulo="Categorias"
          acao={<Botao compacto onClick={() => setFolha({ tipo: 'categoria', contexto: 'empresa' })}>
            <Icone nome="adicionar" tamanho={14} />Nova
          </Botao>}>
          <p className="t-sec" style={{ marginBottom: 'var(--e-7)' }}>
            {categorias.length} categorias ativas. Elas classificam despesas e receitas nos
            relatórios e nos limites de gasto.
          </p>
          <div className="grade-dupla">
            {(['empresa', 'pessoal'] as Contexto[]).map((ctx) => (
              <div key={ctx}>
                <Etiqueta acento>{ctx}</Etiqueta>
                <div className="linha" style={{ marginTop: 'var(--e-5)' }}>
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
      </Carga>

      {folha?.tipo === 'conta' && (
        <FolhaConta inicial={folha.c} contextoInicial={folha.contexto}
          aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {folha?.tipo === 'categoria' && (
        <FolhaCategoria contextoInicial={folha.contexto}
          aoFechar={() => setFolha(null)} aoSalvar={apos} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
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
      <div className="pilha" style={{ gap: 'var(--e-7)' }}>
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
