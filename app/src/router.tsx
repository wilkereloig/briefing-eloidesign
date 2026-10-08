/* oxlint-disable react/only-export-components -- o arquivo exporta o router, não componentes; o hot-reload é justamente o que não queremos aqui */
import { Suspense, lazy } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router-dom'
import { RequireAdmin } from './auth/AdminAuth'
import { Vazio } from './ui/componentes'

// Fica fora de main.tsx de propósito: o plugin React do Vite embrulha todo
// módulo com componente (inclusive `lazy(...)`) num auto-import para o
// hot-reload. No módulo de entrada isso fazia o main.tsx rodar duas vezes
// depois de um HMR → createRoot duplicado → "removeChild ... not a child".
// main.tsx sem componente = sem embrulho = uma raiz só.

// TODAS as rotas lazy (D2): quem abre /admin não baixa código de briefing
// e vice-versa. Requisito, não otimização. Dentro de /admin, as 7 telas
// entram no MESMO chunk do Shell (ponytail: 1 operador só, code-splitting
// por sub-tela não paga o preço da complexidade extra).
const Shell = lazy(() => import('./routes/admin/Shell'))
const Hoje = lazy(() => import('./routes/admin/telas/Hoje'))
const Projetos = lazy(() => import('./routes/admin/telas/Projetos'))
const Orcamentos = lazy(() => import('./routes/admin/telas/Orcamentos'))
const Clientes = lazy(() => import('./routes/admin/telas/Clientes'))
const ClienteFicha = lazy(() => import('./routes/admin/telas/ClienteFicha'))
const Dinheiro = lazy(() => import('./routes/admin/telas/Dinheiro'))
const DinheiroLayout = lazy(() => import('./routes/admin/telas/dinheiro/Layout'))
const EmBreve = lazy(() => import('./routes/admin/telas/dinheiro/Layout').then((m) => ({ default: m.EmBreve })))
const VisaoGeral = lazy(() => import('./routes/admin/telas/dinheiro/VisaoGeral'))
const Briefings = lazy(() => import('./routes/admin/telas/Briefings'))
const Entregas = lazy(() => import('./routes/admin/telas/Entregas'))
const Notas = lazy(() => import('./routes/admin/telas/Notas'))
const Relatorios = lazy(() => import('./routes/admin/telas/Relatorios'))
const Calendario = lazy(() => import('./routes/admin/telas/Calendario'))
const Arquivos = lazy(() => import('./routes/admin/telas/Arquivos'))
const Config = lazy(() => import('./routes/admin/telas/Config'))

/** Endereço fora do mapa. Dentro do shell, para não jogar o Wilke numa página
 *  branca sem trilho nem volta. */
function NaoEncontrado() {
  return (
    <div className="tela pilha">
      <Vazio icone="erro" titulo="Página não encontrada"
        instrucao="Esse endereço não existe no painel. Talvez o link esteja velho."
        acao={<Link className="btn btn-primario" to="/admin">Ir para a visão geral</Link>} />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/admin',
    element: <RequireAdmin><Suspense fallback={<p className="carregando">Carregando…</p>}><Shell /></Suspense></RequireAdmin>,
    children: [
      { index: true, element: <Hoje /> },
      { path: 'projetos', element: <Projetos /> },
      { path: 'orcamentos', element: <Orcamentos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'clientes/:id', element: <ClienteFicha /> },
      // Dinheiro tem sub-páginas (nav.ts NAV_DINHEIRO). A tela antiga segue
      // montada nas que ainda não foram separadas; `key` força remontar ao
      // trocar de sub-página, senão a aba inicial (lida do path) não muda.
      // ponytail: contas/cartões apontam para a tela antiga (aba Contas) até
      // as Tasks 3 e 4 do plano 2026-10-08 criarem as páginas próprias.
      { path: 'dinheiro', element: <DinheiroLayout />, children: [
        { index: true, element: <VisaoGeral /> },
        { path: 'contas', element: <Dinheiro key="contas" /> },
        { path: 'contas/:id', element: <EmBreve titulo="Conta" /> },
        { path: 'cartoes', element: <Dinheiro key="cartoes" /> },
        { path: 'cartoes/:id', element: <EmBreve titulo="Cartão" /> },
        { path: 'lancamentos', element: <Dinheiro key="lancamentos" /> },
        { path: 'agenda', element: <Dinheiro key="agenda" /> },
        { path: 'emprestimos', element: <EmBreve titulo="Empréstimos" /> },
        { path: 'planejamento', element: <Dinheiro key="planejamento" /> },
      ] },
      { path: 'briefings', element: <Briefings /> },
      { path: 'entregas', element: <Entregas /> },
      { path: 'notas', element: <Notas /> },
      { path: 'relatorios', element: <Relatorios /> },
      { path: 'calendario', element: <Calendario /> },
      { path: 'arquivos', element: <Arquivos /> },
      { path: 'config', element: <Config /> },
      { path: '*', element: <NaoEncontrado /> },
    ],
  },
  // Qualquer rota fora de /admin cai no painel: o app só é servido nesse
  // prefixo (rewrite do vercel.json), então chegar aqui é link errado.
  { path: '*', element: <Navigate to="/admin" replace /> },
])
