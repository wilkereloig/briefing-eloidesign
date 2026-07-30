import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

// Shell monta sidebar + área de conteúdo; cada rota filha (telas/) cuida do
// próprio cabeçalho, porque o design varia por tela (seletor de mês em Hoje,
// filtros em Projetos etc.) — ver design-assets/painel-kv3/README.md.
export default function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  )
}
