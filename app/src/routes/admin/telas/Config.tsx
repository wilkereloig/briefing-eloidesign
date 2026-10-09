import { Link } from 'react-router-dom'
import { definirPreferencias, usePreferencias, type Tema } from '../../../lib/preferencias'
import { Painel, Pilula } from '../../../ui/componentes'
import { Cabecalho, Carga } from '../../../ui/painel'

const TEMAS: { chave: Tema; label: string }[] = [
  { chave: 'sistema', label: 'Do sistema' }, { chave: 'claro', label: 'Claro' }, { chave: 'escuro', label: 'Escuro' },
]

export default function Config() {
  const pref = usePreferencias()
  return (
    <div className="tela pilha">
      <Cabecalho secao="Sistema" titulo="Configurações" />

      <Carga linhas={4}>
        {/* Preferência deste navegador: não vai ao servidor nem sai no logout. */}
        <Painel titulo="Aparência">
          <div className="pilha" style={{ gap: 'var(--espaco-04)' }}>
            <div>
              <p className="t-ui" id="rotulo-tema">Tema</p>
              <div className="linha" role="group" aria-labelledby="rotulo-tema" style={{ marginTop: 'var(--espaco-02)' }}>
                {TEMAS.map((t) => (
                  <Pilula key={t.chave} ativa={pref.tema === t.chave}
                    onClick={() => definirPreferencias({ tema: t.chave })}>{t.label}</Pilula>
                ))}
              </div>
            </div>
            <label className="linha" style={{ gap: 'var(--espaco-03)', minHeight: 'var(--alvo-toque)', cursor: 'pointer' }}>
              <input type="checkbox" className="caixa-marcar" checked={pref.ocultarValores}
                onChange={(e) => definirPreferencias({ ocultarValores: e.target.checked })} />
              <span className="celula">
                <span className="t-ui">Ocultar valores</span>
                <span className="t-legenda">Desfoca os números de dinheiro na tela. Atalho no botão R$ da barra do topo.</span>
              </span>
            </label>
          </div>
        </Painel>

        {/* Contas moram em Dinheiro → Contas (página por conta, extrato,
            arquivar). Aqui fica só o atalho, para não haver dois cadastros. */}
        <Painel titulo="Contas e cartões">
          <p className="t-sec" style={{ marginBottom: 'var(--espaco-04)' }}>
            Cadastro, edição, limite e arquivamento de contas e cartões ficam na área Dinheiro.
          </p>
          <Link className="btn btn-secundario" to="/admin/dinheiro/contas">Gerenciar contas e cartões</Link>
        </Painel>

        {/* Categorias moram em Dinheiro › Planejamento desde 2026-10-08. */}
        <Painel titulo="Categorias">
          <p className="t-sec" style={{ marginBottom: 'var(--espaco-04)' }}>
            Categorias estão em Dinheiro › Planejamento: criar, renomear, cor e desativar.
          </p>
          <Link className="btn btn-secundario" to="/admin/dinheiro/planejamento?aba=categorias">Gerenciar categorias</Link>
        </Painel>

        <Painel titulo="Sobre os dados">
          <div className="ficha">
            <div>
              <dt className="etiqueta-mini">Dinheiro</dt>
              <dd className="t-corpo">Guardado em centavos inteiros. Sem float, sem arredondamento perdido.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Transferências</dt>
              <dd className="t-corpo">Movem saldo entre contas e nunca contam como receita ou despesa.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Recorrências</dt>
              <dd className="t-corpo">Materializadas ao abrir o painel, uma vez por vencimento.</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Separação</dt>
              <dd className="t-corpo">Pessoal e empresa dividem as tabelas, separados pelo contexto de cada lançamento.</dd>
            </div>
          </div>
        </Painel>

        {/* "Estou olhando a versão certa?" — tudo aqui vem do repo em build
            (vite.config.ts `define`), nada é consultado ao vivo. */}
        <Painel titulo="Sistema">
          <div className="ficha">
            <div>
              <dt className="etiqueta-mini">Domínio</dt>
              <dd className="t-corpo">{window.location.hostname}</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Painel</dt>
              <dd className="t-corpo">fonte <code>{__VERSAO__.fonte}</code> — confira com <code>npm run release:check</code></dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Migração mais recente no repositório</dt>
              <dd className="t-corpo">{__VERSAO__.migracao ?? '—'} · aplicação no banco não é verificada aqui</dd>
            </div>
            <div>
              <dt className="etiqueta-mini">Edge functions · último deploy registrado</dt>
              <dd className="t-corpo">
                <ul className="lista">
                  {Object.entries(__EDGES__).map(([fn, d]) => (
                    <li key={fn} className="lista-item">
                      <span className="celula"><span className="t-ui">{fn}</span></span>
                      <span className="t-meta"><code>{d.commit}</code> · {d.em}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        </Painel>
      </Carga>
    </div>
  )
}
