import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { formatCents, formatDate } from '../lib/format'
import { Layout, States, useFetch, useToast } from '../ui'
import type { Caixa, MovimentoFinanceiro } from '../types/domain'

export default function Financeiro() {
  const caixasQ = useFetch<{ caixas?: Caixa[] } | Caixa[]>(() => api.fin.caixasList())
  const movsQ = useFetch<{ movimentos?: MovimentoFinanceiro[] } | MovimentoFinanceiro[]>(() => api.fin.movimentosList())
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const caixas: Caixa[] = Array.isArray(caixasQ.data) ? caixasQ.data : caixasQ.data?.caixas ?? []
  const movimentos: MovimentoFinanceiro[] = Array.isArray(movsQ.data) ? movsQ.data : movsQ.data?.movimentos ?? []

  async function novoMovimento(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const valor = Math.round(parseFloat(String(f.get('valor') || '0').replace(',', '.')) * 100)
    if (!valor || valor <= 0) { toast('Valor inválido', true); return }
    setSaving(true)
    try {
      await api.fin.movimentosUpsert({
        caixa_id: f.get('caixa_id'),
        tipo: f.get('tipo'),
        descricao: f.get('descricao'),
        valor_cents: valor,
        data: f.get('data') || undefined,
      })
      toast('Movimento registrado.')
      ;(e.target as HTMLFormElement).reset?.()
      movsQ.reload()
      caixasQ.reload()
    } catch (err: any) {
      toast(err.message || 'Erro ao salvar', true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Financeiro">
      <div className="section-title">Caixas</div>
      <States loading={caixasQ.loading} error={caixasQ.error} empty={!caixasQ.loading && !caixasQ.error && caixas.length === 0} emptyMsg="Nenhuma caixa." />
      {caixas.length > 0 && (
        <div className="cards">
          {caixas.map(c => (
            <div className="card" key={c.id}>
              <div className="label">{c.nome}</div>
              <div className="value">{formatCents(c.saldo_cents)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Novo movimento</div>
      <form className="form-row" onSubmit={novoMovimento}>
        <label>Caixa
          <select name="caixa_id" required>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label>Tipo
          <select name="tipo" required>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </label>
        <label>Descrição
          <input name="descricao" required placeholder="Descrição" />
        </label>
        <label>Valor (R$)
          <input name="valor" required inputMode="decimal" placeholder="0,00" />
        </label>
        <label>Data
          <input name="data" type="date" />
        </label>
        <button type="submit" disabled={saving || caixas.length === 0}>{saving ? 'Salvando…' : 'Registrar'}</button>
      </form>

      <div className="section-title">Movimentos</div>
      <States loading={movsQ.loading} error={movsQ.error} empty={!movsQ.loading && !movsQ.error && movimentos.length === 0} emptyMsg="Nenhum movimento." />
      {movimentos.length > 0 && (
        <table>
          <thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Data</th></tr></thead>
          <tbody>
            {movimentos.map(m => (
              <tr key={m.id}>
                <td>{m.descricao}</td>
                <td><span className="badge">{m.tipo}</span></td>
                <td>{formatCents(m.valor_cents)}</td>
                <td>{formatDate(m.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
