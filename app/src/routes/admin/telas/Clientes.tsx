import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtBRL } from '../../../lib/dinheiro'
import { useFinancas } from '../../../lib/financas-store'
import { estaEmAberto, saldoAberto, valorLiquidado } from '../../../domain/financeiro'
import { corCliente } from '../../../ui/tokens'
import { Aviso, Botao, Chip, Etiqueta, Icone, Indicador, Painel, Vazio } from '../../../ui/componentes'
import { Cabecalho, Carga, Dinheiro } from '../../../ui/painel'
import { FolhaCliente } from '../folhas'

export default function Clientes() {
  const { clientes, servicos, transacoes, recarregar } = useFinancas()
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Faturado, recebido e a receber por cliente, numa passada só. Fazer isso
  // dentro do .map() do card seria O(clientes × transações).
  const porCliente = useMemo(() => {
    const mapa = new Map<string, { faturado: number; recebido: number; aReceber: number }>()
    const dado = (id: string) => {
      const atual = mapa.get(id) ?? { faturado: 0, recebido: 0, aReceber: 0 }
      mapa.set(id, atual)
      return atual
    }
    for (const s of servicos) {
      if (!s.cliente_id) continue
      dado(s.cliente_id).faturado += s.valor_cents
    }
    for (const t of transacoes) {
      if (!t.cliente_id || t.tipo !== 'entrada') continue
      const d = dado(t.cliente_id)
      d.recebido += valorLiquidado(t)
      if (estaEmAberto(t)) d.aReceber += saldoAberto(t)
    }
    return mapa
  }, [servicos, transacoes])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .sort((a, b) => (porCliente.get(b.id)?.faturado ?? 0) - (porCliente.get(a.id)?.faturado ?? 0))
  }, [clientes, busca, porCliente])

  const totalFaturado = [...porCliente.values()].reduce((s, d) => s + d.faturado, 0)
  const totalAReceber = [...porCliente.values()].reduce((s, d) => s + d.aReceber, 0)

  return (
    <div className="tela pilha">
      <Cabecalho secao="Carteira" titulo="Clientes">
        <Botao variante="primario" onClick={() => setNovo(true)}>
          <Icone nome="adicionar" tamanho={16} />Novo cliente
        </Botao>
      </Cabecalho>

      <Carga linhas={4}>
        {clientes.length === 0 ? (
          <Vazio icone="cliente" titulo="Nenhum cliente cadastrado"
            instrucao="Cadastre o primeiro cliente para começar a ligar propostas, projetos e cobranças a ele."
            acao={<Botao variante="primario" onClick={() => setNovo(true)}>Cadastrar cliente</Botao>} />
        ) : (
          <>
            <div className="grade-indicadores">
              <Indicador dominante rotulo="Clientes ativos" valor={String(clientes.length)}
                nota={`${servicos.length} serviços registrados`} />
              <Indicador rotulo="Total faturado" valor={fmtBRL(totalFaturado)}
                nota="Soma dos serviços" />
              <Indicador rotulo="A receber" valor={fmtBRL(totalAReceber)} cor="acento"
                nota="Lançamentos em aberto" />
              <Indicador rotulo="Com portal"
                valor={String(clientes.filter((c) => c.portal_ativo).length)}
                nota="Acesso do cliente liberado" />
            </div>

            <div className="busca">
              <Icone nome="pesquisa" tamanho={17} />
              <input className="campo-caixa" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente" aria-label="Buscar cliente" />
              {busca && (
                <Botao variante="icone" onClick={() => setBusca('')} aria-label="Limpar busca">
                  <Icone nome="fechar" tamanho={14} />
                </Botao>
              )}
            </div>

            <Painel titulo={`${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}`}>
              {lista.length === 0 ? (
                <Vazio icone="pesquisa" titulo="Nenhum resultado"
                  instrucao="Nenhum cliente com esse nome."
                  acao={<Botao onClick={() => setBusca('')}>Limpar busca</Botao>} />
              ) : (
                <div className="grade-clientes">
                  {lista.map((c, i) => {
                    const d = porCliente.get(c.id) ?? { faturado: 0, recebido: 0, aReceber: 0 }
                    const qtd = servicos.filter((s) => s.cliente_id === c.id).length
                    return (
                      <Link key={c.id} to={`/admin/clientes/${c.id}`} className="card card-hover cliente-card">
                        <span className="linha" style={{ gap: 'var(--e-5)', alignItems: 'flex-start' }}>
                          {/* barra de cor, nunca avatar redondo com inicial */}
                          <span className="marca-cor" aria-hidden
                            style={{ background: c.cor || corCliente[i % corCliente.length] }} />
                          <span className="celula">
                            <span className="t-card espremer">{c.nome}</span>
                            {c.contato && <span className="t-legenda espremer">{c.contato}</span>}
                          </span>
                        </span>

                        <div className="cliente-numeros">
                          <span>
                            <Etiqueta mini>Faturado</Etiqueta>
                            <Dinheiro cents={d.faturado} className="t-valor" />
                          </span>
                          <span>
                            <Etiqueta mini>A receber</Etiqueta>
                            <Dinheiro cents={d.aReceber} className="t-valor" />
                          </span>
                          <span>
                            <Etiqueta mini>Serviços</Etiqueta>
                            <span className="t-valor dinheiro">{qtd}</span>
                          </span>
                        </div>

                        <span className="linha" style={{ marginTop: 'var(--e-5)' }}>
                          {c.portal_ativo
                            ? <Chip estado="pago">Portal ativo</Chip>
                            : <Chip estado="rascunho">Sem portal</Chip>}
                          {c.marca_publicada && <Chip estado="execucao">Marca publicada</Chip>}
                          {d.aReceber > 0 && <Chip estado="aberto">Tem pendência</Chip>}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Painel>
          </>
        )}
      </Carga>

      {novo && (
        <FolhaCliente aoFechar={() => setNovo(false)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
