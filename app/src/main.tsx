import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminAuthProvider, RequireAdmin } from './auth/AdminAuth'
import './app.css'

// TODAS as rotas lazy (D2): quem abre /admin não baixa código de briefing
// e vice-versa. Requisito, não otimização. Dentro de /admin, as 7 telas
// entram no MESMO chunk do Shell (ponytail: 1 operador só, code-splitting
// por sub-tela não paga o preço da complexidade extra).
const Shell = lazy(() => import('./routes/admin/Shell'))
const Hoje = lazy(() => import('./routes/admin/telas/Hoje'))
const Projetos = lazy(() => import('./routes/admin/telas/Projetos'))
const Clientes = lazy(() => import('./routes/admin/telas/Clientes'))
const ClienteFicha = lazy(() => import('./routes/admin/telas/ClienteFicha'))
const Dinheiro = lazy(() => import('./routes/admin/telas/Dinheiro'))
const Briefings = lazy(() => import('./routes/admin/telas/Briefings'))
const Entregas = lazy(() => import('./routes/admin/telas/Entregas'))

const router = createBrowserRouter([
  {
    path: '/admin',
    element: <RequireAdmin><Suspense fallback={<p className="carregando">Carregando…</p>}><Shell /></Suspense></RequireAdmin>,
    children: [
      { index: true, element: <Hoje /> },
      { path: 'projetos', element: <Projetos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'clientes/:id', element: <ClienteFicha /> },
      { path: 'dinheiro', element: <Dinheiro /> },
      { path: 'briefings', element: <Briefings /> },
      { path: 'entregas', element: <Entregas /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
)
