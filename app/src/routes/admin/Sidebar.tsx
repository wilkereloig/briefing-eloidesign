import { NavLink, useLocation } from 'react-router-dom'
import { NAV_DINHEIRO, NAV_GRUPOS, NAV_ITENS, type ItemNav } from './nav'
import { Icone, Marca } from '../../ui/componentes'

// Mesmo componente serve trilho lateral (≥768) e barra inferior (≤767): o que
// muda é CSS, não árvore. Os itens fora da barra (data-barra ausente) somem no
// mobile e vivem no menu "Mais" do Shell.
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
 *  barra do topo (§9 Topbar) — aqui só navegação e criação. Grupos por tarefa;
 *  dentro de Dinheiro, as sub-páginas aparecem aninhadas no trilho aberto
 *  (≥1280) e a fileira de pílulas da área some — no celular ela continua. */
export function Sidebar({ aoCriar }: { aoCriar: () => void }) {
  const naBarra = NAV_ITENS.filter((i) => i.barra)
  const emDinheiro = useLocation().pathname.startsWith('/admin/dinheiro')
  return (
    <aside className="trilho">
      <div className="trilho-marca"><Marca /></div>

      {NAV_GRUPOS.map((g, n) => (
        <div key={g.titulo ?? `g${n}`} className="trilho-grupo">
          {g.titulo && <span className="trilho-rotulo etiqueta-mini">{g.titulo}</span>}
          <nav aria-label={g.titulo ?? (n === 0 ? 'Início' : 'Sistema')}>
            {g.itens.map((item) => (
              <div key={item.path} className="trilho-entrada">
                <Item item={item} ordem={item.barra ? naBarra.indexOf(item) + 1 : undefined} />
                {item.path === '/admin/dinheiro' && emDinheiro && (
                  <div className="trilho-sub">
                    {NAV_DINHEIRO.map((s) => (
                      <NavLink key={s.path} to={s.path} end={s.fim}
                        className={({ isActive }) => 'trilho-subitem' + (isActive ? ' ativo' : '')}>{s.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      ))}
      <button type="button" className="trilho-criar" onClick={aoCriar} aria-label="Criar">
        <Icone nome="adicionar" tamanho={22} />
        <span className="rotulo-longo">Criar</span>
      </button>
    </aside>
  )
}
