import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ErroAcesso, onSessaoExpirada } from '../lib/api'
import { Botao, Icone, Marca } from '../ui/componentes'

// Guard ÚNICO do perímetro /admin/* (D4): telas novas nascem protegidas
// porque o router as coloca DENTRO de <RequireAdmin> — não porque alguém
// lembrou de checar sessão nelas.
const Ctx = createContext<{
  logado: boolean
  expirou: boolean
  entrar: (pw: string, manter: boolean) => Promise<void>
  sair: () => void
}>(null!)
export const useAdmin = () => useContext(Ctx)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [logado, setLogado] = useState(api.temSessao())
  // Sessão derrubada por 401 no meio do trabalho é diferente de "nunca entrou":
  // a tela precisa dizer o que aconteceu em vez de aparecer do nada.
  const [expirou, setExpirou] = useState(false)

  useEffect(() => onSessaoExpirada(() => { setLogado(false); setExpirou(true) }), [])

  return (
    <Ctx.Provider value={{
      logado,
      expirou,
      entrar: async (pw, manter) => {
        await api.login(pw, manter)
        setExpirou(false)
        setLogado(true)
      },
      sair: () => { api.logout(); setExpirou(false); setLogado(false) },
    }}>{children}</Ctx.Provider>
  )
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { logado } = useAdmin()
  if (!logado) return <TelaAcesso />
  return <>{children}</>
}

/**
 * Tela de acesso. Desktop divide em duas: identidade à esquerda (o painel
 * precisa se apresentar como produto do ELOI Studio, não como caixa de senha
 * genérica) e o formulário à direita. No toque a identidade encolhe para a
 * assinatura e o formulário sobe, porque o teclado virtual come metade da tela.
 */
function TelaAcesso() {
  const { entrar, expirou } = useAdmin()
  const [pw, setPw] = useState('')
  const [visivel, setVisivel] = useState(false)
  const [manter, setManter] = useState(true)
  const [erro, setErro] = useState<{ texto: string; motivo: string } | null>(null)
  const [capsLock, setCapsLock] = useState(false)
  const [indo, setIndo] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // Foco no campo, mas só no desktop: no celular o autoFocus abre o teclado por
  // cima do conteúdo antes de a pessoa ver onde chegou.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) campo.current?.focus()
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (indo) return // trava o duplo envio antes de qualquer rede
    if (!pw) {
      setErro({ texto: 'Digite a senha de acesso.', motivo: 'senha' })
      campo.current?.focus()
      return
    }
    setIndo(true)
    setErro(null)
    try {
      await entrar(pw, manter)
    } catch (err) {
      const motivo = err instanceof ErroAcesso ? err.motivo : 'servidor'
      setErro({ texto: (err as Error).message, motivo })
      setPw('')
      campo.current?.focus()
    } finally {
      setIndo(false)
    }
  }

  return (
    <main className="acesso">
      <section className="acesso-identidade">
        {/* grafismo do KV: blocos de cor da marca, sem imagem externa */}
        <span className="acesso-grafismo" aria-hidden>
          <i /><i /><i /><i />
        </span>
        <div className="acesso-identidade-corpo">
          <Marca />
          <p className="acesso-conceito">
            Gestão — clientes, projetos e dinheiro
            <br />no mesmo lugar.
          </p>
        </div>
        <p className="acesso-rodape t-legenda">
          Área interna do estúdio. Todo acesso é registrado.
        </p>
      </section>

      <section className="acesso-painel">
        <div className="acesso-caixa">
          <div className="acesso-marca-toque"><Marca /></div>

          <span className="etiqueta etiqueta-acento">Acesso restrito</span>
          <h1 className="t-h2 acesso-titulo">Entrar no painel</h1>
          <p className="t-sec">Use a senha de administração do estúdio.</p>

          {expirou && !erro && (
            <p className="acesso-nota" role="status">
              <Icone nome="info" tamanho={16} />
              Sua sessão expirou por inatividade. Entre de novo para continuar.
            </p>
          )}

          <form onSubmit={enviar} noValidate>
            <div className="campo" data-erro={erro ? 'true' : undefined}>
              <label htmlFor="senha-admin">Senha</label>
              <div className="acesso-senha">
                <input
                  id="senha-admin"
                  ref={campo}
                  className="campo-caixa"
                  type={visivel ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setErro(null) }}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                  autoComplete="current-password"
                  name="password"
                  enterKeyHint="go"
                  aria-invalid={!!erro}
                  aria-describedby={erro ? 'acesso-erro' : undefined}
                  disabled={indo}
                  placeholder="••••••••"
                />
                {/* Rótulo escrito em vez de ícone: o sprite autoral não tem
                    glifo de olho, e inventar um símbolo ambíguo é pior do que
                    dizer a palavra. */}
                <button type="button" className="acesso-olho"
                  onClick={() => { setVisivel((v) => !v); campo.current?.focus() }}
                  aria-pressed={visivel}>
                  {visivel ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {capsLock && (
                <span className="t-legenda" role="status">Caps Lock está ligado.</span>
              )}
            </div>

            <label className="acesso-manter" htmlFor="manter-sessao">
              <input id="manter-sessao" type="checkbox" className="caixa-marcar" checked={manter}
                onChange={(e) => setManter(e.target.checked)} />
              <span className="t-ui">Manter conectado neste dispositivo</span>
            </label>

            {/* A mensagem não diz se a senha existe nem quantas tentativas
                restam: erro de autenticação não é lugar de dar pista. */}
            {erro && (
              <p className="acesso-erro" id="acesso-erro" role="alert">
                <Icone nome="erro" tamanho={16} />{erro.texto}
              </p>
            )}

            <Botao type="submit" variante="destaque" disabled={indo} carregando={indo}
              className="acesso-enviar">
              {indo ? 'Verificando…' : 'Entrar'}
            </Botao>
          </form>

          <button type="button" className="acesso-link" onClick={() => setAjuda((a) => !a)}
            aria-expanded={ajuda}>
            Esqueci a senha
          </button>
          {ajuda && (
            <div className="acesso-ajuda">
              <p className="t-sec">
                O painel tem uma senha só, guardada como variável de ambiente
                <span className="acesso-cod"> ADMIN_PASSWORD </span>
                no projeto Supabase. Para trocar, edite a variável nas configurações do
                projeto e faça o redeploy da function <span className="acesso-cod">admin-auth</span>.
                Não existe e-mail de recuperação — é intencional: não há caixa de entrada
                que possa virar porta de entrada.
              </p>
              <p className="t-sec">
                Depois de 5 tentativas erradas o acesso trava por 15 minutos.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
