// Componentes que conhecem o domínio financeiro. Ficam separados de
// componentes.tsx (que é puramente visual e não importa store nem regras) para
// a biblioteca visual continuar reutilizável fora do painel.
import type { ReactNode } from 'react'
import { fmtBRL } from '../lib/dinheiro'
import { deslocarMes, rotuloMes, useFinancas, type Lente } from '../lib/financas-store'
import type { StatusMov, StatusNF } from '../lib/tipos'
import { Botao, Chip, Erro, Esqueleto, Etiqueta, Icone, Pilula } from './componentes'
import type { EstadoChip } from './tokens'
import { TAMANHOS, type usePaginacao } from './paginacao'

/** Cabeçalho de tela: etiqueta da seção + título + ações à direita. */
export function Cabecalho({ secao, titulo, children }:
  { secao: string; titulo: string; children?: ReactNode }) {
  return (
    <header className="cabecalho">
      <div className="cabecalho-titulo">
        <Etiqueta>{secao}</Etiqueta>
        <h1 className="t-pagina">{titulo}</h1>
      </div>
      {children && <div className="cabecalho-acoes">{children}</div>}
    </header>
  )
}

/** Navegação de mês. Rótulo curto no toque, mês por extenso no desktop. */
export function SeletorMes() {
  const { mes, setMes } = useFinancas()
  const extenso = rotuloMes(mes)
  return (
    <div className="seletor-mes">
      <Botao variante="icone" onClick={() => setMes(deslocarMes(mes, -1))} aria-label="Mês anterior">
        <Icone nome="voltar" tamanho={16} />
      </Botao>
      <span className="seletor-mes-rotulo t-ui">
        <Icone nome="calendario" tamanho={16} />
        <span className="espremer">{extenso}</span>
      </span>
      <Botao variante="icone" onClick={() => setMes(deslocarMes(mes, 1))} aria-label="Próximo mês">
        <Icone nome="avancar" tamanho={16} />
      </Botao>
    </div>
  )
}

const LENTES: { chave: Lente; label: string }[] = [
  { chave: 'tudo', label: 'Tudo' },
  { chave: 'empresa', label: 'Empresa' },
  { chave: 'pessoal', label: 'Pessoal' },
]

/** Alterna entre visão consolidada, empresa e pessoal. */
export function SeletorLente() {
  const { lente, setLente } = useFinancas()
  return (
    <div className="linha" role="group" aria-label="Contexto">
      {LENTES.map((l) => (
        <Pilula key={l.chave} ativa={lente === l.chave} onClick={() => setLente(l.chave)}>
          {l.label}
        </Pilula>
      ))}
    </div>
  )
}

/** Valor monetário: Archivo, tabular, com aria-label legível. */
export function Dinheiro({ cents, sinal, className = '' }:
  { cents: number; sinal?: boolean; className?: string }) {
  const texto = fmtBRL(Math.abs(cents))
  const prefixo = sinal ? (cents < 0 ? '−' : '+') : cents < 0 ? '−' : ''
  return (
    <span className={`dinheiro ${className}`} aria-label={`${prefixo}${texto}`}>
      {prefixo}{texto}
    </span>
  )
}

// Estado do dado → par de cores do sistema. Único lugar que faz esse mapa: uma
// tela nova não inventa a cor de "vencido".
const CHIP_MOV: Record<StatusMov, { chip: EstadoChip; label: string }> = {
  previsto: { chip: 'previsto', label: 'Previsto' },
  pendente: { chip: 'aberto', label: 'Em aberto' },
  parcial: { chip: 'parcial', label: 'Parcial' },
  realizado: { chip: 'pago', label: 'Realizado' },
  vencido: { chip: 'atrasado', label: 'Vencido' },
  cancelado: { chip: 'rascunho', label: 'Cancelado' },
}

export function ChipMovimento({ status }: { status: StatusMov }) {
  const m = CHIP_MOV[status] ?? CHIP_MOV.previsto
  return <Chip estado={m.chip}>{m.label}</Chip>
}

const CHIP_NF: Record<StatusNF, { chip: EstadoChip; label: string }> = {
  pendente: { chip: 'aberto', label: 'Pendente' },
  pronta: { chip: 'execucao', label: 'Pronta' },
  emitida: { chip: 'pago', label: 'Emitida' },
  enviada: { chip: 'pago', label: 'Enviada' },
  cancelada: { chip: 'rascunho', label: 'Cancelada' },
  substituida: { chip: 'rascunho', label: 'Substituída' },
}

export function ChipNota({ status }: { status: StatusNF }) {
  const m = CHIP_NF[status] ?? CHIP_NF.pendente
  return <Chip estado={m.chip}>{m.label}</Chip>
}

/** Rodapé de lista: contagem à esquerda, controles à direita (§9 Tabelas).
 *  Some quando tudo cabe numa página — rodapé de "1–3 de 3" é ruído. */
export function Paginacao({ pagina, paginas, porPagina, total, setPagina, setPorPagina }:
  ReturnType<typeof usePaginacao<unknown>>) {
  if (total <= TAMANHOS[0]) return null
  const de = (pagina - 1) * porPagina + 1
  const ate = Math.min(pagina * porPagina, total)
  return (
    <div className="paginacao">
      <span className="t-legenda dinheiro">{de}–{ate} de {total}</span>
      <span className="linha" style={{ gap: 'var(--espaco-02)' }}>
        <select className="campo-caixa paginacao-tamanho" value={porPagina} aria-label="Itens por página"
          onChange={(e) => setPorPagina(Number(e.target.value))}>
          {TAMANHOS.map((n) => <option key={n} value={n}>{n} por página</option>)}
        </select>
        <Botao variante="icone" aria-label="Página anterior" disabled={pagina <= 1}
          onClick={() => setPagina(pagina - 1)}><Icone nome="voltar" tamanho={16} /></Botao>
        <Botao variante="icone" aria-label="Próxima página" disabled={pagina >= paginas}
          onClick={() => setPagina(pagina + 1)}><Icone nome="avancar" tamanho={16} /></Botao>
      </span>
    </div>
  )
}

/**
 * Envelope de carga: esqueleto → erro → conteúdo. Toda tela passa por aqui,
 * então nenhuma esquece de tratar erro ou mostrar spinner no lugar de esqueleto.
 */
export function Carga({ children, linhas = 4 }: { children: ReactNode; linhas?: number }) {
  const { carregando, erro, recarregar } = useFinancas()
  if (carregando) return <Esqueleto linhas={linhas} altura={64} />
  if (erro) return <Erro causa={erro} aoTentar={() => void recarregar()} offline={/fetch|network/i.test(erro)} />
  return <>{children}</>
}
