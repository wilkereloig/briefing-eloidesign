# Sistema Visual — ELOI Studio

KV aprovado (KV Completo, 04/08/2026), refinado pela especificação ELOI DESIGN
SYSTEM — Implementation Rules (04/09/2026), que formaliza densidade
(`expressive`/`standard`/`dense`), a escala de espaço de 12 passos, a camada
tipográfica completa e o vocabulário de token por categoria-grupo-função. A
paleta de cor **não mudou** — mesmo hex de sempre — só a estrutura por trás
dela. **Única referência visual ativa.** Antes de criar cor, componente,
espaçamento, card ou padrão, procure aqui: quase sempre já existe.

## Migração para a spec nova — status

Trabalho em 6 fases (auditoria completa: 12 agentes, 148 gaps, ver
`CHANGELOG.md` 2026-09-04). **Fase 1 concluída** — as demais ainda usam
padrões antigos em componentes/telas até chegar a vez de cada uma.

| Fase | Objetivo | Status |
|---|---|---|
| 1. Fundação de tokens | `tokens.css`/`.ts` na nomenclatura e escala novas | ✅ |
| 2. Componentes core | Botão, Campo, Card, Chip nos estados/anatomia da spec | ✅ |
| 3. Tabela densa (financeiro) | `data-density="dense"` em Dinheiro/Notas/Relatórios/FolhasExtrato | Pendente |
| 4. Telas de gestão (standard) | Vazio/Chip/Erro corrigidos nas ~12 telas restantes | Pendente |
| 5. Shell, navegação, responsivo | Topbar, breakpoint da sidebar, modal aninhado→página | Pendente |
| 6. Ícones e acessibilidade fina | Famílias de ícone faltando, `:focus-visible`, pisos de fonte | Pendente |

Decisões já batidas (não reabrir sem motivo novo): nomenclatura de token em
**português com 4 segmentos** (`--cor-fundo-primario`, não `--color-background-primary`
nem `--pagina`); densidade `dense` só nas telas financeiras por ora; os dois
modais aninhados (`folhas.tsx` `FolhaServico`→`FolhaSubCliente` e
`FolhaOrcamento`→`FolhaCatalogo`) vão virar página completa na Fase 5; o
grafismo da tela de acesso (4 blocos) **fica como está** — não vira o arco de
marca, decisão explícita do Wilke.

---

## Onde cada parte vive

| Parte | Arquivo que **roda** | Espelho de handoff |
|---|---|---|
| Tokens CSS (cor, tipo, espaço, forma, camada, movimento) | `app/src/ui/tokens.css` | `eloi-handoff/design-tokens/variables.css` |
| Tokens em TypeScript | `app/src/ui/tokens.ts` | `eloi-handoff/design-tokens/tokens.ts` |
| Primitivos (Botão, Campo, Chip, Ícone, Folha, Marca, Aviso) | `app/src/ui/componentes.tsx` + `.css` | — |
| Cor e ícone de cada estado de chip | `app/src/ui/tokens.ts` (`chip`, `chipIcone`) | `eloi-handoff/design-tokens/tokens.ts` |
| Blocos de painel (Bloco, Indicador, ListaItem, Esqueleto, Vazio) | `app/src/ui/painel.tsx` | — |
| Formatação de rótulo | `app/src/ui/formato.ts` | — |
| Layout do shell, trilho, cabeçalho, acesso | `app/src/app.css` | — |
| Ícones autorais | `app/public/eloi-icons.svg` (sprite) | `eloi-handoff/assets/icons/` (45 avulsos) |
| Logos e assinaturas | `app/public/assinatura.svg`, `icone-app.svg` | `eloi-handoff/assets/logos/` |
| Wordmark das páginas estáticas | `assets/eloi-admin/wordmark.svg` | — |
| Guias escritas | — | `eloi-handoff/*.md` |

**`app/src/ui/tokens.css` é a fonte.** A cópia em `eloi-handoff/` existe porque o
handoff é um pacote entregável, que precisa funcionar sozinho fora do app (por
isso ela traz o `@import` das fontes, que o painel carrega por `<link>`).
`app/src/ui/tokens.test.ts` falha se as duas divergirem — foi assim que se
descobriu que três tokens de margem existiam só de um lado.

## Guias do handoff

| Arquivo | Assunto |
|---|---|
| `eloi-handoff/ELOI_DESIGN_SYSTEM.md` | Fundamentos: cor, tipo, ritmo, voz |
| `eloi-handoff/COMPONENT_INVENTORY.md` | Anatomia e limite de uso de cada componente |
| `eloi-handoff/ICON_GUIDELINES.md` | Como um ícone autoral é construído |
| `eloi-handoff/RESPONSIVE_GUIDELINES.md` | Faixas e o que muda em cada uma |
| `eloi-handoff/MOBILE_APP_GUIDELINES.md` | Versão de toque |
| `eloi-handoff/IMPLEMENTATION_GUIDE.md` | Como aplicar em tela nova |
| `eloi-handoff/prompts/` | Instruções permanentes para trabalho assistido por IA |
| `eloi-handoff/references/*.dc.html` | Peças aprovadas — referência visual, não código a copiar |

## Regras que não se negociam

1. **Nenhum hex solto em `.tsx` ou `.ts`.** Cor vem de `ui/tokens.css` (via `var()`)
   ou de `ui/tokens.ts`. Verificável: `git grep -nE "#[0-9a-fA-F]{3,8}" -- 'app/src/**/*.tsx'`
   não deve achar nada fora de `ui/tokens.*`.
2. **Cor nunca informa sozinha.** Todo estado tem rótulo escrito ou forma própria —
   chip com texto, ponto por tipo, contorno quando liquidado.
3. **Elevação é tom, não sombra.** `--chao`, `--chao-2`, `--chao-3`.
4. **Alvo de toque ≥ 44 px** em qualquer controle de interação.
   Exceção conhecida e deliberada: `.btn-compacto` (36 px), valor de ação
   secundária definido no `COMPONENT_INVENTORY`.
5. **A logo nunca é centralizada.** Sempre à esquerda, em qualquer contexto.
6. **Ícone é do sprite autoral.** Não importar biblioteca de ícones; se o glifo
   não existe, ou se usa um rótulo escrito ou se desenha seguindo o `ICON_GUIDELINES`.
7. Tela nova segue o KV. Não criar interface genérica de dashboard.

## Marca

- Nome oficial: **ELOI Studio**.
- No painel, a assinatura é o componente `<Marca />` — `ELOI` + `Studio` em duas
  cores, nunca as duas palavras na mesma cor. Sem parâmetro de configuração: um
  nome só, escrito de um jeito só.
- ⚠️ **O wordmark desenhado (`assets/eloi-admin/wordmark.svg`) ainda letra
  "ELOI Design Studio".** O nome mudou em 2026-08-05; re-letrar são curvas, não
  código. Todo texto (`alt`, `aria-label`, títulos, manifest) já diz "ELOI Studio".

## Tipografia

Archivo (títulos, eixo `wdth` variável) e Manrope (corpo). Entram por `<link>`
com `preconnect` no `index.html`, não por `@import`: `@import` encadeia o
download depois do CSS; `<link>` baixa em paralelo.

## Acessibilidade embutida nos tokens

`:focus-visible` com contorno Lima de 2 px e `prefers-reduced-motion` que zera
animação e transição estão em `tokens.css` — valem para o app inteiro sem
ninguém precisar lembrar, e é por isso que nenhum componente redefine foco.
Se um componente precisar suprimir esse contorno, precisa colocar outro no
lugar: `outline:none` sozinho não passa.

## Variantes de botão

`primario` (Roxo) · `destaque` (Lima, a ação principal da tela) · `secundario`
(contorno) · `terciario` (opaco, com borda) · `fantasma` (sem fundo nem borda)
· `destrutivo` · `icone`. Uma ação primária por tela; duas ações lado a lado
põem a primária à direita.

## Nomenclatura de token (fase 1)

`categoria-grupo-função`, em português: `--cor-fundo-primario`,
`--cor-texto-secundario`, `--espaco-05`, `--raio-cartao`, `--movimento-lento`.
Cor de marca crua (`--roxo`, `--lima`, `--coral`...) é **paleta** — nunca usada
direto num componente, só pelo token semântico que aponta pra ela
(`--cor-acento-primario: var(--roxo)`). Token com nome antigo (`--e-7`,
`--texto-3`, `--chao-2`) não existe mais em `tokens.css`; se aparecer em algum
`.tsx`/`.css` fora desses dois arquivos é sobra de antes da Fase 1 — corrija
para o nome novo, não recrie o antigo.

Alguns tokens ficam **legado, valor mantido, papel ainda não separado por
consumidor**: `--raio-chip` (8px, usado por chip/avatar/botão-ícone/skeleton/
busca ao mesmo tempo) e `--t-folha`/`--curva-folha` (tempo/curva próprios da
folha/drawer). Fase 2 e Fase 5 resolvem cada um — não usar esses dois em
código novo.
