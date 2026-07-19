import { api } from '../lib/api'
import { formatCents } from '../lib/format'
import { Layout, States, useFetch } from '../ui'

function Cards({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="cards">
      {Object.entries(stats).map(([k, v]) => (
        <div className="card" key={k}>
          <div className="label">{k.replace(/_/g, ' ')}</div>
          <div className="value">
            {typeof v === 'number' && /cents|_mes|receber|saldo|total/.test(k) ? formatCents(v) : String(v ?? '—')}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const fin = useFetch(() => api.fin.stats())
  const ges = useFetch(() => api.dashboard.stats())
  return (
    <Layout title="Dashboard">
      <div className="section-title">Financeiro</div>
      <States loading={fin.loading} error={fin.error} />
      {fin.data && <Cards stats={fin.data.stats ?? fin.data} />}
      <div className="section-title">Gestão</div>
      <States loading={ges.loading} error={ges.error} />
      {ges.data && <Cards stats={ges.data.stats ?? ges.data} />}
    </Layout>
  )
}
