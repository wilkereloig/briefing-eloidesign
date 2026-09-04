import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { agrupar, buscar, ROTULO_TIPO, type Resultado } from '../../domain/busca'
import { fmtBRL } from '../../lib/dinheiro'
import { useFinancas } from '../../lib/financas-store'
import { Icone } from '../../ui/componentes'
import type { ChaveCriar } from './nav'

// Uma caixa que alcança tudo. Ctrl/Cmd+K abre de qualquer tela; digitar filtra;
// seta escolhe; Enter vai. É o atalho que substitui "ir ao módulo, achar o
// filtro, filtrar" — três passos que se repetiam o dia inteiro.
//
// Só dois atalhos globais existem (Ctrl+K e Esc). Uma tabela de vinte combinações
// não se memoriza, e cada uma é um jeito novo de disparar coisa sem querer.

const RECENTES_CHAVE = 'eloi_busca_recentes'
const MAX_RECENTES = 5

/** Guardado por navegador, não no banco: é conveniência de quem está sentado
 *  aqui, não dado do estúdio. `localStorage` pode falhar (aba privada) — some
 *  a lista, não a busca. */
function lerRecentes(): Resultado[] {
  try {
    const cru = localStorage.getItem(RECENTES_CHAVE)
    const lista = cru ? JSON.parse(cru) : []
    return Array.isArray(lista) ? lista.slice(0, MAX_RECENTES) : []
  } catch {
    return []
  }
}

function gravarRecente(r: Resultado) {
  if (r.tipo === 'comando') return // comando não é lugar: guardar não ajuda a voltar
  try {
    const atual = lerRecentes().filter((x) => x.id !== r.id)
    localStorage.setItem(RECENTES_CHAVE, JSON.stringify([r, ...atual].slice(0, MAX_RECENTES)))
  } catch { /* sem recentes é aceitável */ }
}

export function Busca({ aberta, aoFechar, aoCriar }: {
  aberta: boolean
  aoFechar: () => void
  /** Comando de lançamento reaproveita a folha do shell em vez de abrir outra. */
  aoCriar: (tipo: ChaveCriar) => void
}) {
  const navegar = useNavigate()
  const { clientes, subClientes, servicos, orcamentos, notas, transacoes } = useFinancas()
  const [termo, setTermo] = useState('')
  const [cursor, setCursor] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const nomeCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome])), [clientes])

  const comandos = useMemo(() => [
    { id: 'cmd:cliente', titulo: 'Novo cliente', detalhe: 'Cadastrar', destino: '/admin/clientes?novo=1' },
    { id: 'cmd:servico', titulo: 'Novo serviço', detalhe: 'Registrar trabalho', destino: '/admin/projetos?novo=1' },
    { id: 'cmd:orcamento', titulo: 'Nova proposta', detalhe: 'Montar orçamento', destino: '/admin/orcamentos?novo=1' },
    { id: 'cmd:briefing', titulo: 'Novo convite de briefing', detalhe: 'Gerar link', destino: '/admin/briefings?novo=1' },
    { id: 'cmd:nota', titulo: 'Anexar nota fiscal', detalhe: 'Registrar NF emitida fora do painel', destino: '/admin/notas?novo=1' },
    { id: 'cmd:entrada', titulo: 'Lançar receita', detalhe: 'Dinheiro entrando' },
    { id: 'cmd:saida', titulo: 'Lançar despesa', detalhe: 'Dinheiro saindo' },
    { id: 'cmd:tarefa', titulo: 'Nova tarefa', detalhe: 'Lembrete com prazo' },
    { id: 'cmd:receber', titulo: 'Ver contas a receber', destino: '/admin/dinheiro' },
    { id: 'cmd:relatorios', titulo: 'Ver relatórios', destino: '/admin/relatorios' },
  ], [])

  const resultados = useMemo(() => buscar({
    clientes, subClientes, servicos, orcamentos, notas, transacoes, comandos,
    nomeCliente: (id) => (id ? nomeCliente.get(id) ?? '' : ''),
    formatarValor: fmtBRL,
  }, termo), [clientes, subClientes, servicos, orcamentos, notas, transacoes, comandos, nomeCliente, termo])

  const recentes = useMemo(() => (termo.trim() ? [] : lerRecentes()), [termo])
  const grupos = useMemo(() => {
    const base = agrupar(resultados)
    return recentes.length
      ? [{ tipo: 'recente' as const, itens: recentes }, ...base]
      : base
  }, [resultados, recentes])
  const planos = useMemo(() => grupos.flatMap((g) => g.itens), [grupos])

  useEffect(() => { setCursor(0) }, [termo])
  useEffect(() => {
    if (aberta) {
      setTermo('')
      // Depois da montagem: focar antes do elemento existir não faz nada.
      requestAnimationFrame(() => campo.current?.focus())
    }
  }, [aberta])

  if (!aberta) return null

  const escolher = (r: Resultado) => {
    gravarRecente(r)
    aoFechar()
    if (r.id === 'cmd:entrada') return aoCriar('entrada')
    if (r.id === 'cmd:saida') return aoCriar('saida')
    if (r.id === 'cmd:tarefa') return aoCriar('tarefa')
    if (r.destino) navegar(r.destino)
  }

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, planos.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && planos[cursor]) { e.preventDefault(); escolher(planos[cursor]) }
  }

  let indice = -1
  return (
    // Esc é tratado no shell, junto com o das folhas: um lugar só decide o que
    // fechar quando há duas camadas abertas.
    <div className="busca-fundo" onClick={aoFechar} role="presentation">
      <div className="busca-caixa" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Buscar no painel">
        <div className="busca-campo">
          <Icone nome="pesquisa" tamanho={18} />
          <input ref={campo} className="campo-caixa" value={termo} onKeyDown={teclado}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar cliente, projeto, proposta — ou digitar uma ação"
            aria-label="Buscar" aria-controls="busca-resultados" />
          <kbd className="t-legenda">Esc</kbd>
        </div>

        <div className="busca-resultados" id="busca-resultados" role="listbox">
          {planos.length === 0 ? (
            <p className="t-sec" style={{ padding: 'var(--e-6)' }}>
              {termo.trim().length < 2
                ? 'Digite pelo menos duas letras.'
                : `Nada encontrado para "${termo.trim()}".`}
            </p>
          ) : grupos.map((g) => (
            <div key={g.tipo}>
              <span className="etiqueta-mini busca-grupo">
                {g.tipo === 'recente' ? 'Recentes' : ROTULO_TIPO[g.tipo]}
              </span>
              {g.itens.map((r) => {
                indice += 1
                const meu = indice
                return (
                  <button key={`${r.tipo}:${r.id}`} type="button" role="option"
                    aria-selected={cursor === meu}
                    className={`busca-item${cursor === meu ? ' ativo' : ''}`}
                    onMouseEnter={() => setCursor(meu)}
                    onClick={() => escolher(r)}>
                    <span className="celula">
                      <span className="t-ui espremer">{r.titulo}</span>
                      {r.detalhe && <span className="t-legenda espremer">{r.detalhe}</span>}
                    </span>
                    <Icone nome="avancar" tamanho={16} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
