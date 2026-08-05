import { NavLink } from 'react-router-dom'
import { useAdmin } from '../../auth/AdminAuth'
import { NAV_PRIMARIA, NAV_FERRAMENTAS, type ItemNav } from './nav'
import { Botao, Icone, Marca } from '../../ui/componentes'

// Mesmo componente serve trilho lateral (≥768) e barra inferior (≤767): o que
// muda é CSS, não árvore. Os itens fora da barra (data-barra ausente) somem no
// mobile e vivem no menu em folha do Shell.
function Item({ item, ordem }: { item: ItemNav; ordem?: number }) {
  return (
    <NavLink to={item.path} end={item.path === '/admin'} data-barra={ordem}
      className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
      <span className="marca-ativa" aria-hidden />
      <Icone nome={item.icone} tamanho={18} />
      <span className="rotulo-longo">{item.label}</span>
      <span className="rotulo-curto" aria-hidden>{item.label}</span>
    </NavLink>
  )
}

export function Sidebar({ aoCriar }: { aoCriar: () => void }) {
  const { sair } = useAdmin()
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
      <div className="trilho-rodape">
        {/* No trilho de 72 px a palavra não cabe (o botão media 80): o rótulo
            usa a mesma regra dos itens de navegação e só volta a partir de
            1024, quando o trilho abre para 236. */}
        <Botao variante="terciario" compacto onClick={sair} aria-label="Sair">
          <Icone nome="sair" tamanho={16} />
          <span className="rotulo-longo">Sair</span>
        </Botao>
      </div>
    </aside>
  )
}
