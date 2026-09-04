import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AdminAuthProvider } from './auth/AdminAuth'
import { router } from './router'
import './app.css'

// Só a montagem. Rotas e componentes vivem em router.tsx (ver comentário lá).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
)
