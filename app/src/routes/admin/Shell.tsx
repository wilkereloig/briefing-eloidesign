import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAdmin } from '../../auth/AdminAuth'
import { CRIAR, NAV_FERRAMENTAS, NAV_PRIMARIA, type ChaveCriar } from './nav'
import { Aviso, Botao, Folha, Icone, Marca } from '../../ui/componentes'
import { FinancasProvider, useFinancas } from '../../lib/financas-store'
import { FolhaTransacao } from './FolhaTransacao'

// Shell monta trilho/barra + área de conteúdo; cada rota filha (telas/) cuida do
// próprio cabeçalho, porque o design varia por tela (seletor de mês em Hoje,
// filtros em Projetos). O que é do shell mora aqui: cabeçalho de toque, menu em
// folha e a folha "Criar" do botão central da barra.
export default function Shell() {
  // Provider dentro do Shell (e não no main): só quem passou pelo RequireAdmin
  // dispara a carga financeira. Antes de logar não há token para a edge.
  return <FinancasProvider><ShellInterno /></FinancasProvider>
}

function ShellInterno() {
  const { sair } = useAdmin()
  const { recarregar } = useFinancas()
  const [folha, setFolha] = useState<'menu' | 'criar' | null>(null)
  // Lançamento rápido vive no shell: é acessível de qualquer tela, inclusive
  // das que não têm formulário próprio (calendário, relatórios).
  const [tipoNovo, setTipoNovo] = useState<ChaveCriar | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fechar = () => setFolha(null)

  // A barra inferior só comporta 4 destinos: o resto vive no menu de toque.
  const foraDaBarra = [...NAV_PRIMARIA.filter((i) => !i.barra), ...NAV_FERRAMENTAS]

  return (
    <div className="app-shell">
      <Sidebar aoCriar={() => setFolha('criar')} />

      <header className="cabecalho-toque">
        <Botao variante="icone" onClick={() => setFolha('menu')} aria-label="Abrir menu">
          <Icone nome="menu" />
        </Botao>
        <Marca />
        <span aria-hidden />
      </header>

      <div className="app-main">
        <Outlet />
      </div>

      {folha === 'menu' && (
        <Folha titulo="Menu" aoFechar={fechar}>
          <nav className="lista" aria-label="Mais destinos">
            {foraDaBarra.map((item) => (
              <NavLink key={item.path} to={item.path} onClick={fechar} className="lista-item">
                <Icone nome={item.icone} tamanho={20} />
                <span className="t-ui">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <Botao variante="secundario" onClick={sair}
            style={{ marginTop: 'var(--e-8)', width: '100%' }}>
            <Icone nome="sair" tamanho={16} />Sair
          </Botao>
        </Folha>
      )}

      {folha === 'criar' && (
        <Folha titulo="Criar" aoFechar={fechar}>
          <div className="lista">
            {CRIAR.map((o) => (
              <button key={o.chave} type="button" className="lista-item criar-opcao"
                onClick={() => { setTipoNovo(o.chave); setFolha(null) }}>
                <span className="criar-icone" aria-hidden
                  style={{ background: o.cor, '--eloi-signal': o.sinal } as React.CSSProperties}>
                  <Icone nome={o.icone} tamanho={18} />
                </span>
                <span className="celula">
                  <span className="t-ui espremer">{o.label}</span>
                  <span className="t-legenda espremer">{o.descricao}</span>
                </span>
                <Icone nome="avancar" tamanho={16} />
              </button>
            ))}
          </div>
        </Folha>
      )}

      {tipoNovo && (
        <FolhaTransacao inicial={{ tipo: tipoNovo }} aoFechar={() => setTipoNovo(null)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
