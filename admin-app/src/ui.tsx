import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

// ---- Toasts ----
type Toast = { id: number; msg: string; error?: boolean }
const ToastCtx = createContext<(msg: string, error?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, error?: boolean) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, error }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map(t => <div key={t.id} className={'toast' + (t.error ? ' error' : '')}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

// ---- Data fetch hook ----
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fn().then(setData).catch(e => setError(e.message || 'Erro')).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(load, [load])
  return { data, loading, error, reload: load }
}

export function States({ loading, error, empty, emptyMsg }: { loading: boolean; error: string; empty?: boolean; emptyMsg?: string }) {
  if (loading) return <div className="state">Carregando…</div>
  if (error) return <div className="state error">Erro: {error}</div>
  if (empty) return <div className="state">{emptyMsg || 'Nada por aqui ainda.'}</div>
  return null
}

// ---- Layout ----
const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clientes', label: 'Clientes' },
  { to: '/orcamentos', label: 'Orçamentos' },
  { to: '/servicos', label: 'Serviços' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/briefings', label: 'Briefings' },
  { to: '/entregas', label: 'Entregas' },
]

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <img src="/assets/eloi-admin/wordmark.svg" alt="ELOI Design Studio" />
        </div>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}>
            {n.label}
          </NavLink>
        ))}
      </aside>
      <div className="main">
        <header className="header"><h1>{title}</h1></header>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
