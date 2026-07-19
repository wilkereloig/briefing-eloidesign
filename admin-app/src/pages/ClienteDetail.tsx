import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatCents, formatDate } from '../lib/format'
import { Layout, States, useFetch } from '../ui'

const TABS = ['Resumo', 'Orçamentos', 'Serviços', 'Financeiro', 'Briefings', 'Entregas'] as const

function Rows({ items, cols }: { items: Record<string, any>[]; cols: [string, (r: any) => any][] }) {
  if (!items?.length) return <div className="state">Nada por aqui.</div>
  return (
    <table>
      <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {items.map((r, i) => (
          <tr key={r.id ?? i}>{cols.map(([h, fn]) => <td key={h}>{fn(r)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ClienteDetail() {
  const { id } = useParams()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Resumo')
  const { data, loading, error } = useFetch<any>(() => api.clientes.detail(id!), [id])

  const cliente = data?.cliente ?? data
  const orcamentos = data?.orcamentos ?? []
  const servicos = data?.servicos ?? []
  const movimentos = data?.movimentos ?? []
  const briefings = data?.briefings ?? []
  const entregas = data?.entregas ?? []

  return (
    <Layout title={cliente?.nome ?? 'Cliente'}>
      <States loading={loading} error={error} />
      {data && (
        <>
          <div className="tabs">
            {TABS.map(t => (
              <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          {tab === 'Resumo' && (
            <div className="cards">
              <div className="card"><div className="label">E-mail</div><div className="value" style={{ fontSize: 15 }}>{cliente?.email || '—'}</div></div>
              <div className="card"><div className="label">Telefone</div><div className="value" style={{ fontSize: 15 }}>{cliente?.telefone || '—'}</div></div>
              <div className="card"><div className="label">Empresa</div><div className="value" style={{ fontSize: 15 }}>{cliente?.empresa || '—'}</div></div>
              <div className="card"><div className="label">Orçamentos</div><div className="value">{orcamentos.length}</div></div>
              <div className="card"><div className="label">Serviços</div><div className="value">{servicos.length}</div></div>
            </div>
          )}
          {tab === 'Orçamentos' && <Rows items={orcamentos} cols={[
            ['Título', r => r.titulo || '—'],
            ['Status', r => <span className="badge">{r.status}</span>],
            ['Valor', r => (r.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
            ['Criado', r => formatDate(r.criado_em)],
          ]} />}
          {tab === 'Serviços' && <Rows items={servicos} cols={[
            ['Título', r => r.titulo],
            ['Sub-cliente', r => r.sub_cliente || '—'],
            ['Status', r => <span className="badge">{r.status || '—'}</span>],
            ['Valor', r => formatCents(r.valor_cents)],
          ]} />}
          {tab === 'Financeiro' && <Rows items={movimentos} cols={[
            ['Descrição', r => r.descricao],
            ['Tipo', r => <span className="badge">{r.tipo}</span>],
            ['Valor', r => formatCents(r.valor_cents)],
            ['Data', r => formatDate(r.data)],
          ]} />}
          {tab === 'Briefings' && <Rows items={briefings} cols={[
            ['Tipo', r => r.tipo || '—'],
            ['Status', r => <span className="badge">{r.status || '—'}</span>],
            ['Criado', r => formatDate(r.criado_em ?? r.created_at)],
          ]} />}
          {tab === 'Entregas' && <Rows items={entregas} cols={[
            ['Título', r => r.titulo || '—'],
            ['Status', r => <span className="badge">{r.status || '—'}</span>],
            ['Data', r => formatDate(r.data ?? r.criado_em)],
          ]} />}
        </>
      )}
    </Layout>
  )
}
