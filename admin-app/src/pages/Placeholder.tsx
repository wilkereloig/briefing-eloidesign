import { Layout } from '../ui'

export function Briefings() {
  return (
    <Layout title="Briefings">
      <div className="notice">
        Esta área ainda não migrou pro app novo. Use o painel legado:{' '}
        <a href="/painel-briefings/">/painel-briefings</a>
      </div>
    </Layout>
  )
}

export function Entregas() {
  return (
    <Layout title="Entregas">
      <div className="notice">
        Esta área ainda não migrou pro app novo. Use o painel legado:{' '}
        <a href="/gestao/">/gestao</a>
      </div>
    </Layout>
  )
}
