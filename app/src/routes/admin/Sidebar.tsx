import { NavLink } from 'react-router-dom'
import { NAV_PRIMARIA, NAV_FERRAMENTAS, type ItemNav } from './nav'
import { Icone, Marca } from '../../ui/componentes'

// Mesmo componente serve trilho lateral (≥768) e barra inferior (≤767): o que
// muda é CSS, não árvore. Os itens fora da barra (data-barra ausente) somem no
// mobile e vivem no menu em folha do Shell.
function Item({ item, ordem }: { item: ItemNav; ordem?: number }) {
  return (
    <NavLink to={item.path} end={item.path === '/admin'} data-barra={ordem} data-label={item.label}
      className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
      <span className="marca-ativa" aria-hidden />
      <Icone nome={item.icone} tamanho={20} />
      <span className="rotulo-longo">{item.label}</span>
      <span className="rotulo-curto" aria-hidden>{item.label}</span>
    </NavLink>
  )
}

/** Trilho lateral (≥768) e barra inferior (≤767). Busca e Sair vivem na
 *  barra do topo (§9 Topbar) — aqui só navegação e criação. */
export function Sidebar({ aoCriar }: { aoCriar: () => void }) {
  const naBarra = NAV_PRIMARIA.filter((i) => i.barra)
  return (
    <aside className="trilho">
      <div className="trilho-marca"><Marca /></div>

      <nav aria-label="Seções">
        {NAV_PRIMARIA.map((item) => (
          <Item key={item.path} item={item}
            ordem={item.barra ? naBarra.indexOf(item) + 1 : undefined} />
        ))}
      </nav>
      <div className="trilho-ferramentas">
        <span className="trilho-rotulo etiqueta-mini">Ferramentas</span>
        <nav aria-label="Ferramentas">
          {NAV_FERRAMENTAS.map((item) => <Item key={item.path} item={item} />)}
        </nav>
      </div>
      <button type="button" className="trilho-criar" onClick={aoCriar} aria-label="Criar">
        <Icone nome="adicionar" tamanho={22} />
        <span className="rotulo-longo">Criar</span>
      </button>
    </aside>
  )
}
