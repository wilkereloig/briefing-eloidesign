import { api } from '../lib/api'
import { formatCents, formatDate } from '../lib/format'
import { Layout, States, useFetch } from '../ui'
import type { Servico } from '../types/domain'

export default function Servicos() {
  const { data, loading, error } = useFetch<{ servicos?: Servico[] } | Servico[]>(() => api.servicos.list())
  const servicos: Servico[] = Array.isArray(data) ? data : data?.servicos ?? []
  return (
    <Layout title="Serviços">
      <States loading={loading} error={error} empty={!loading && !error && servicos.length === 0} emptyMsg="Nenhum serviço." />
      {servicos.length > 0 && (
        <table>
          <thead><tr><th>Título</th><th>Sub-cliente</th><th>Status</th><th>Valor</th><th>Origem</th><th>Criado</th></tr></thead>
          <tbody>
            {servicos.map(s => (
              <tr key={s.id}>
                <td>{s.titulo}</td>
                <td>{s.sub_cliente || '—'}</td>
                <td><span className="badge">{s.status || '—'}</span></td>
                <td>{formatCents(s.valor_cents)}</td>
                <td>{s.orcamento_id ? <span className="badge ok">via orçamento</span> : '—'}</td>
                <td>{formatDate(s.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
