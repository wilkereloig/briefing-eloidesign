import { createContext, useContext, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

// Guard ÚNICO do perímetro /admin/* (D4): telas novas nascem protegidas
// porque o router as coloca DENTRO de <RequireAdmin> — não porque alguém
// lembrou de checar sessão nelas.
const Ctx = createContext<{ logado: boolean; entrar: (pw: string) => Promise<void>; sair: () => void }>(null!)
export const useAdmin = () => useContext(Ctx)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [logado, setLogado] = useState(api.temSessao())
  return (
    <Ctx.Provider value={{
      logado,
      entrar: async (pw) => { await api.login(pw); setLogado(true) },
      sair: () => { api.logout(); setLogado(false) },
    }}>{children}</Ctx.Provider>
  )
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { logado } = useAdmin()
  if (!logado) return <LoginGate />
  return <>{children}</>
}

function LoginGate() {
  const { entrar } = useAdmin()
  const [pw, setPw] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)
  return (
    <form className="login" onSubmit={async (e) => {
      e.preventDefault(); setIndo(true); setErro('')
      try { await entrar(pw) } catch (err) { setErro((err as Error).message) } finally { setIndo(false) }
    }}>
      <h1>Área do Wilke</h1>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="Senha de acesso" autoComplete="current-password" autoFocus />
      <button disabled={indo}>{indo ? 'Verificando…' : 'Entrar'}</button>
      <div className="err">{erro}</div>
    </form>
  )
}
