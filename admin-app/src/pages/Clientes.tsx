import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { Layout, States, useFetch } from '../ui'
import type { Cliente } from '../types/domain'

export default function Clientes() {
  const { data, loading, error } = useFetch<{ clientes?: Cliente[] } | Cliente[]>(() => api.clientes.list())
  const clientes: Cliente[] = Array.isArray(data) ? data : data?.clientes ?? []
  return (
    <Layout title="Clientes">
      <States loading={loading} error={error} empty={!loading && !error && clientes.length === 0} emptyMsg="Nenhum cliente cadastrado." />
      {clientes.length > 0 && (
        <table>
          <thead><tr><th>Nome</th><th>Empresa</th><th>E-mail</th><th>Criado em</th></tr></thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id}>
                <td><Link to={`/clientes/${c.id}`}>{c.nome}</Link></td>
                <td>{c.empresa || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{formatDate(c.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
