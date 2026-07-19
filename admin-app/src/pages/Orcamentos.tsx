import { useState } from 'react'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { Layout, States, useFetch, useToast } from '../ui'
import type { Orcamento } from '../types/domain'

export default function Orcamentos() {
  const { data, loading, error, reload } = useFetch<{ orcamentos?: Orcamento[] } | Orcamento[]>(() => api.orcamentos.list())
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const orcamentos: Orcamento[] = Array.isArray(data) ? data : data?.orcamentos ?? []

  async function criarServico(id: string) {
    setBusy(id)
    try {
      await api.servicos.fromOrcamento(id)
      toast('Serviço criado a partir do orçamento.')
      reload()
    } catch (e: any) {
      toast(e.message || 'Erro ao criar serviço', true)
    } finally {
      setBusy('')
    }
  }

  return (
    <Layout title="Orçamentos">
      <States loading={loading} error={error} empty={!loading && !error && orcamentos.length === 0} emptyMsg="Nenhum orçamento." />
      {orcamentos.length > 0 && (
        <table>
          <thead><tr><th>Cliente / Título</th><th>Status</th><th>Valor</th><th>Criado</th><th></th></tr></thead>
          <tbody>
            {orcamentos.map(o => (
              <tr key={o.id}>
                <td>{o.cliente_nome || o.titulo || o.id}</td>
                <td>
                  <span className="badge">{o.status}</span>{' '}
                  {o.servico_id != null && <span className="badge ok">Serviço criado</span>}
                </td>
                <td>{(o.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>{formatDate(o.criado_em)}</td>
                <td>
                  {o.status === 'aprovado' && !o.servico_id && (
                    <button disabled={busy === o.id} onClick={() => criarServico(o.id)}>
                      {busy === o.id ? 'Criando…' : 'Criar serviço'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
