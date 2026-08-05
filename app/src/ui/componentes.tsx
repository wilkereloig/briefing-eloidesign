// ELOI Studio — primitivos da interface. Estilo em componentes.css, valores em
// tokens.css/tokens.ts. Regra do handoff: nenhum hex solto num .tsx.
// Anatomia e limites de uso: eloi-handoff/COMPONENT_INVENTORY.md.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useEffect, useId } from 'react'
import { chip as chipCores, type EstadoChip } from './tokens'

const SPRITE = import.meta.env.BASE_URL + 'eloi-icons.svg'

/** Glifo do sprite autoral. `rotulo` ausente = decorativo (aria-hidden). */
export function Icone({ nome, tamanho = 18, rotulo }: { nome: string; tamanho?: number; rotulo?: string }) {
  return (
    <svg className="eloi-icon" width={tamanho} height={tamanho} role={rotulo ? 'img' : undefined}
      aria-label={rotulo} aria-hidden={rotulo ? undefined : true}>
      <use href={`${SPRITE}#eloi-${nome}`} />
    </svg>
  )
}

/** Assinatura ELOI + complemento. Nunca as duas palavras na mesma cor. */
export function Marca({ complemento = 'Design' }: { complemento?: 'Design' | 'Studio' }) {
  return <span className="marca"><b>ELOI</b><i>{complemento}</i></span>
}

type Variante = 'primario' | 'destaque' | 'secundario' | 'terciario' | 'destrutivo' | 'icone'

export function Botao({ variante = 'secundario', compacto, carregando, children, className = '', ...resto }:
  { variante?: Variante; compacto?: boolean; carregando?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" data-carregando={carregando ? 'true' : undefined}
      className={`btn btn-${variante}${compacto ? ' btn-compacto' : ''}${className ? ' ' + className : ''}`} {...resto}>
      {children}
      {carregando && <span className="btn-pulso" aria-hidden><i /><i /><i /></span>}
    </button>
  )
}

/** Estado de dado. O rótulo escrito é obrigatório — cor nunca informa sozinha. */
export function Chip({ estado, children }: { estado: EstadoChip; children: ReactNode }) {
  const [fundo, texto] = chipCores[estado]
  return <span className="chip" style={{ background: fundo, color: texto }}>{children}</span>
}

export function Etiqueta({ mini, acento, children }: { mini?: boolean; acento?: boolean; children: ReactNode }) {
  return <span className={`${mini ? 'etiqueta-mini' : 'etiqueta'}${acento ? ' etiqueta-acento' : ''}`}>{children}</span>
}

export function Pilula({ ativa, children, ...resto }:
  { ativa?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-pressed={ativa} className={`pilula${ativa ? ' ativa' : ''}`} {...resto}>{children}</button>
}

type CampoBase = { rotulo: string; erro?: string }

export function Campo({ rotulo, erro, ...resto }: CampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="campo" data-erro={erro ? 'true' : undefined}>
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} className="campo-caixa" aria-invalid={!!erro}
        aria-describedby={erro ? id + '-e' : undefined} {...resto} />
      {erro && <span className="campo-erro" id={id + '-e'} role="alert">{erro}</span>}
    </div>
  )
}

export function CampoTexto({ rotulo, erro, ...resto }: CampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className="campo" data-erro={erro ? 'true' : undefined}>
      <label htmlFor={id}>{rotulo}</label>
      <textarea id={id} className="campo-caixa" aria-invalid={!!erro}
        aria-describedby={erro ? id + '-e' : undefined} {...resto} />
      {erro && <span className="campo-erro" id={id + '-e'} role="alert">{erro}</span>}
    </div>
  )
}

export function Card({ dominante, hover, className = '', children, ...resto }:
  { dominante?: boolean; hover?: boolean; className?: string; children: ReactNode }
  & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card${dominante ? ' card-dominante' : ''}${hover ? ' card-hover' : ''}${className ? ' ' + className : ''}`} {...resto}>{children}</div>
}

/** Card de indicador: etiqueta → valor grande → nota. Um só pode ser dominante. */
export function Indicador({ rotulo, valor, nota, cor, dominante }:
  { rotulo: string; valor: string; nota?: string; cor?: 'acento' | 'coral'; dominante?: boolean }) {
  return (
    <Card dominante={dominante} className="indicador">
      <Etiqueta mini>{rotulo}</Etiqueta>
      <span className="valor t-valor-g dinheiro" aria-label={valor}
        style={cor ? { color: `var(--${cor === 'acento' ? 'acento' : 'coral'})` } : undefined}>{valor}</span>
      {nota && <span className="t-legenda" style={{ marginTop: 'var(--e-3)' }}>{nota}</span>}
    </Card>
  )
}

export function Painel({ titulo, acao, erro, children }:
  { titulo?: ReactNode; acao?: ReactNode; erro?: boolean; children: ReactNode }) {
  return (
    <section className={`painel${erro ? ' painel-erro' : ''}`}>
      {(titulo || acao) && (
        <header>
          {typeof titulo === 'string' ? <Etiqueta acento>{titulo}</Etiqueta> : titulo}
          {acao}
        </header>
      )}
      {children}
    </section>
  )
}

export function Progresso({ pct, rotulo }: { pct: number; rotulo: string }) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="progresso" role="progressbar" aria-valuenow={v} aria-valuemin={0}
      aria-valuemax={100} aria-label={rotulo}>
      <span style={{ width: v + '%' }} />
    </div>
  )
}

export function Vazio({ icone = 'info', titulo, instrucao, acao }:
  { icone?: string; titulo: string; instrucao: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tamanho={30} />
      <div>
        <p className="t-card">{titulo}</p>
        <p className="t-sec">{instrucao}</p>
      </div>
      {acao}
    </div>
  )
}

export function Erro({ causa, aoTentar, offline }:
  { causa: string; aoTentar?: () => void; offline?: boolean }) {
  return (
    <Painel erro titulo={<Etiqueta acento>Erro</Etiqueta>}>
      <p className="t-msg" role="alert" style={{ color: 'var(--coral)' }}>{causa}</p>
      {offline && <p className="t-sec">Os dados na tela são do último acesso.</p>}
      {aoTentar && <Botao onClick={aoTentar} className="btn-espaco"
        style={{ marginTop: 'var(--e-7)' }}>Tentar de novo</Botao>}
    </Painel>
  )
}

/** Esqueleto de carga. Reproduz a forma do conteúdo real, não um retângulo. */
export function Esqueleto({ linhas = 3, altura = 18 }: { linhas?: number; altura?: number }) {
  return (
    <div className="pilha" aria-hidden style={{ gap: 'var(--e-5)' }}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto"
          style={{ height: altura, width: `${100 - i * 12}%`, animationDelay: `${i * 200}ms` }} />
      ))}
    </div>
  )
}

/** Folha no toque, modal centralizado no desktop — mesmo conteúdo. */
export function Folha({ titulo, aoFechar, children, rodape }:
  { titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', esc)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [aoFechar])
  return (
    <div className="veu" onClick={aoFechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo}
        onClick={(e) => e.stopPropagation()}>
        <div className="folha-alca" aria-hidden />
        <header className="linha" style={{ justifyContent: 'space-between' }}>
          <h2 className="t-h2">{titulo}</h2>
          <Botao variante="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></Botao>
        </header>
        {children}
        {rodape && <div className="linha" style={{ marginTop: 'var(--e-9)', justifyContent: 'flex-end' }}>{rodape}</div>}
      </div>
    </div>
  )
}

/** Toast. Sai sozinho em 2,6 s; sucesso em Lima, erro em Coral. */
export function Aviso({ texto, tipo = 'ok', aoSumir }:
  { texto: string; tipo?: 'ok' | 'erro'; aoSumir: () => void }) {
  useEffect(() => {
    const t = setTimeout(aoSumir, 2600)
    return () => clearTimeout(t)
  }, [aoSumir])
  return (
    <div className={`aviso${tipo === 'erro' ? ' aviso-erro' : ''}`} role="status">
      <Icone nome={tipo === 'ok' ? 'ok' : 'erro'} tamanho={16} />
      {texto}
    </div>
  )
}
