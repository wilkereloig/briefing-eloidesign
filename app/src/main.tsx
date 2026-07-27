import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminAuthProvider, RequireAdmin } from './auth/AdminAuth'
import './app.css'

// TODAS as rotas lazy (D2): quem abre /admin não baixa código de briefing
// e vice-versa. Requisito, não otimização.
const Shell = lazy(() => import('./routes/admin/Shell'))

const router = createBrowserRouter(
  [{
    path: '/admin/*',
    element: <RequireAdmin><Suspense fallback={<p className="carregando">Carregando…</p>}><Shell /></Suspense></RequireAdmin>,
  }],
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
)
