import { NavLink } from 'react-router-dom'
import { useAdmin } from '../../auth/AdminAuth'
import { NAV_PRIMARIA, NAV_FERRAMENTAS } from './nav'
import { Silhueta } from './Silhueta'

export function Sidebar() {
  const { sair } = useAdmin()
  return (
    <aside className="trilho">
      <div className="trilho-marca">
        <img src={import.meta.env.BASE_URL + 'wordmark-kv.svg'} alt="ELOI Design Studio" height={52} />
      </div>
      <nav>
        {NAV_PRIMARIA.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/admin'}
            className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
            <Silhueta forma={item.glifo} cor="currentColor" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="trilho-ferramentas">
        <span className="trilho-rotulo">Ferramentas</span>
        {NAV_FERRAMENTAS.map((item) => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => 'trilho-item' + (isActive ? ' ativo' : '')}>
            <Silhueta forma={item.glifo} cor="currentColor" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="trilho-rodape">
        <span>Malha 202</span>
        <button className="btn-ghost" onClick={sair}>Sair</button>
      </div>
    </aside>
  )
}
