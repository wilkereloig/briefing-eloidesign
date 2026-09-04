import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAdmin } from '../../auth/AdminAuth'
import { CRIAR, NAV_FERRAMENTAS, NAV_PRIMARIA, type ChaveCriar } from './nav'
import { Aviso, Botao, Esqueleto, Folha, Icone, Marca } from '../../ui/componentes'
import { FinancasProvider, useFinancas } from '../../lib/financas-store'
import { FolhaTransacao } from './FolhaTransacao'
import { FolhaTarefa } from './folhas'
import { Busca } from './Busca'

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
  const [busca, setBusca] = useState(false)
  const fechar = () => setFolha(null)

  // Dois atalhos globais, só. Ctrl/Cmd+K abre a busca de qualquer tela; Esc
  // fecha a camada de cima. Uma tabela de vinte combinações não se memoriza e
  // cada uma é um jeito novo de disparar coisa sem querer.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setBusca((v) => !v)
        return
      }
      if (e.key !== 'Escape') return
      // Ordem de fechamento = ordem visual. A folha do shell fica por cima da
      // busca; fechar as duas de uma vez faria o Esc parecer aleatório.
      if (folha) setFolha(null)
      else if (busca) setBusca(false)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [folha, busca])

  // A barra inferior só comporta 4 destinos: o resto vive no menu de toque.
  const foraDaBarra = [...NAV_PRIMARIA.filter((i) => !i.barra), ...NAV_FERRAMENTAS]

  // Trilha da barra do topo (§9): "Painel / Seção". Quem decide o nome da seção
  // é o nav.ts — a barra não inventa rótulo.
  const { pathname } = useLocation()
  const secao = [...NAV_PRIMARIA, ...NAV_FERRAMENTAS].find((i) =>
    i.path === '/admin' ? pathname === '/admin' : pathname.startsWith(i.path))

  return (
    <div className="app-shell">
      <Sidebar aoCriar={() => setFolha('criar')} />

      <header className="barra-topo">
        <Botao variante="icone" className="barra-topo-menu" onClick={() => setFolha('menu')} aria-label="Abrir menu">
          <Icone nome="menu" />
        </Botao>
        <Marca />
        <nav className="barra-topo-trilha" aria-label="Trilha">
          <NavLink to="/admin">Painel</NavLink>
          {secao && secao.path !== '/admin' && <><span aria-hidden>/</span><b aria-current="page">{secao.label}</b></>}
        </nav>
        <button type="button" className="barra-topo-busca" onClick={() => setBusca(true)}>
          <Icone nome="pesquisa" tamanho={16} />Buscar<kbd>Ctrl K</kbd>
        </button>
        <div className="barra-topo-acoes">
          <Botao variante="icone" className="barra-topo-menu" onClick={() => setBusca(true)} aria-label="Buscar">
            <Icone nome="pesquisa" />
          </Botao>
          <Botao variante="fantasma" compacto onClick={sair} aria-label="Sair" className="col-desktop">
            <Icone nome="sair" tamanho={16} />Sair
          </Botao>
        </div>
      </header>

      {/* Suspense aqui e não no main.tsx: lá em cima o fallback trocaria o
          Shell inteiro (trilho, barra, cabeçalho) por uma linha de texto a cada
          navegação. Aqui só a área de conteúdo pisca. */}
      <main className="app-main">
        <Suspense fallback={<Esqueleto linhas={5} altura={64} />}>
          <Outlet />
        </Suspense>
      </main>

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
            style={{ marginTop: 'var(--espaco-05)', width: '100%' }}>
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

      <Busca aberta={busca} aoFechar={() => setBusca(false)} aoCriar={setTipoNovo} />

      {tipoNovo === 'tarefa' && (
        <FolhaTarefa aoFechar={() => setTipoNovo(null)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {tipoNovo && tipoNovo !== 'tarefa' && (
        <FolhaTransacao inicial={{ tipo: tipoNovo }} aoFechar={() => setTipoNovo(null)}
          aoSalvar={async (msg) => { setAviso(msg); await recarregar() }} />
      )}
      {aviso && <Aviso texto={aviso} aoSumir={() => setAviso(null)} />}
    </div>
  )
}
