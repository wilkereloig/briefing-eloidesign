import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import { ToastProvider } from './ui'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import ClienteDetail from './pages/ClienteDetail'
import Orcamentos from './pages/Orcamentos'
import Servicos from './pages/Servicos'
import Financeiro from './pages/Financeiro'
import { Briefings, Entregas } from './pages/Placeholder'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin-app">
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetail />} />
          <Route path="/orcamentos" element={<Orcamentos />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/briefings" element={<Briefings />} />
          <Route path="/entregas" element={<Entregas />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
