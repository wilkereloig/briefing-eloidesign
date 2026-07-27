import { useAdmin } from '../../auth/AdminAuth'

// Shell VAZIO de propósito: a Fundação termina aqui. As telas de negócio
// (clientes, orçamentos, financeiro) entram no sub-projeto 2.
export default function Shell() {
  const { sair } = useAdmin()
  return (
    <div className="shell">
      <header className="shell-top">
        <strong>ELOI Design Studio</strong>
        <button className="btn-ghost" onClick={sair}>Sair</button>
      </header>
      <main className="shell-main">
        <h1>Painel novo</h1>
        <p>Fundação instalada. As telas chegam no próximo sub-projeto.</p>
        <p><a href="/admin/">← voltar pro painel atual</a></p>
      </main>
    </div>
  )
}
