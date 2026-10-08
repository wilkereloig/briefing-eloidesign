import { Suspense } from 'react'
import { Navigate, NavLink, Outlet, useSearchParams } from 'react-router-dom'
import { NAV_DINHEIRO } from '../../nav'
import { Esqueleto, Vazio } from '../../../../ui/componentes'
import { Cabecalho, SeletorLente } from '../../../../ui/painel'

// Links antigos `/admin/dinheiro?aba=<x>` (favoritos, histórico) → sub-página.
const ABA_ANTIGA = new Map([
  ['movimentos', 'lancamentos'], ['receber', 'agenda'], ['pagar', 'agenda'],
  ['contas', 'contas'], ['recorrencias', 'planejamento'],
])

/** Moldura da área Dinheiro: título, lente e a barra das sub-páginas. A lente
 *  mora no store (useFinancas), então vale em todas as sub-páginas. */
export default function DinheiroLayout() {
  const [params] = useSearchParams()
  const antiga = ABA_ANTIGA.get(params.get('aba') ?? '')
  if (antiga) return <Navigate to={`/admin/dinheiro/${antiga}`} replace />

  return (
    <div className="tela pilha">
      <Cabecalho secao="Financeiro" titulo="Dinheiro">
        <SeletorLente />
      </Cabecalho>
      {/* Links, não abas: cada item é um endereço. `nav` + aria-current (que o
          NavLink já põe) é a semântica certa — tablist pediria setas no teclado. */}
      <nav className="abas" aria-label="Seções do dinheiro">
        {NAV_DINHEIRO.map((i) => (
          <NavLink key={i.path} to={i.path} end={i.fim}
            className={({ isActive }) => `pilula${isActive ? ' ativa' : ''}`}>{i.label}</NavLink>
        ))}
      </nav>
      {/* Suspense próprio: sem ele, carregar uma sub-página trocava a moldura
          inteira (título + barra) pelo esqueleto do Shell. */}
      <Suspense fallback={<Esqueleto linhas={5} altura={64} />}>
        <Outlet />
      </Suspense>
    </div>
  )
}

/** Sub-página ainda não construída. ponytail: some quando a fase dela chegar. */
export function EmBreve({ titulo }: { titulo: string }) {
  return <Vazio icone="info" titulo={titulo} instrucao="Esta parte do Dinheiro ainda está sendo construída." />
}
