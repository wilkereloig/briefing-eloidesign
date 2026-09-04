import { Link } from 'react-router-dom'
import { useFinancas } from '../../lib/financas-store'
import { passosOnboarding, precisaOnboarding } from '../../domain/onboarding'
import { Icone, Painel } from '../../ui/componentes'

// Lista de passos com estado, não um dashboard vazio. Aparece em Hoje e em
// Dinheiro enquanto faltar o essencial (conta + lançamento); some sozinha.
export function Onboarding() {
  const { contas, categorias, transacoes, carregando } = useFinancas()
  const passos = passosOnboarding(contas, categorias, transacoes)
  if (carregando || !precisaOnboarding(passos)) return null
  const feitos = passos.filter((p) => p.feito).length

  return (
    <Painel titulo="Configure seu financeiro"
      acao={<span className="t-legenda">{feitos} de {passos.length}</span>}>
      <p className="t-sec">
        Sem conta, o painel não tem onde somar. Cinco passos, na ordem — os
        indicadores começam a fazer sentido a partir do primeiro.
      </p>
      <ol className="lista passos" style={{ marginTop: 'var(--e-5)' }}>
        {passos.map((p, i) => (
          <li key={p.chave} className="lista-item" data-feito={p.feito ? 'true' : undefined}>
            <span className="passo-num" aria-hidden>
              {p.feito ? <Icone nome="ok" tamanho={14} /> : i + 1}
            </span>
            <span className="celula">
              <span className="t-ui espremer">
                {p.titulo}{p.opcional ? <span className="t-legenda"> · opcional</span> : null}
              </span>
              <span className="t-legenda espremer">{p.detalhe}</span>
            </span>
            {!p.feito && (
              <Link className="btn btn-secundario btn-compacto"
                to={p.chave === 'categorias' ? '/admin/config' : p.chave === 'lancamentos' ? '/admin/dinheiro' : '/admin/config'}>
                {p.feito ? 'Feito' : p.chave === 'lancamentos' ? 'Lançar' : 'Abrir'}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Painel>
  )
}
