# ELOI DESIGN SYSTEM — IMPLEMENTATION RULES

Arquivo único de instruções para implementação em código.
Fonte de verdade visual: `Eloi DS 01 Brand.dc.html` (marca) e `Eloi DS 02 UI System.dc.html` (produto).
Valores legíveis por máquina: `sistema/tokens.json`. Folha pronta: `sistema/eloi.css`. Ícones: `sistema/icones/eloi-icons.svg`.

Este arquivo substitui decisões ad-hoc. Se um valor não está aqui, ele é **derivado** dos Foundations — nunca inventado.

> **Neste repositório** (nota de implementação, não faz parte da spec original):
> os arquivos citados acima vivem em `eloi-handoff/references/` (os dois `.dc.html`),
> `eloi-handoff/sistema/` (`tokens.json`, `eloi.css`, `icones/icones.md`) e o sprite que
> **roda** é `app/public/eloi-icons.svg`. Os tokens que rodam são `app/src/ui/tokens.css`,
> nomeados em **português com 4 segmentos** (`--cor-fundo-primario` = `--color-background-primary`)
> — decisão registrada em `DESIGN_SYSTEM.md`. A tabela de equivalência é 1:1 por posição.
> Em `docs/DESIGN_SYSTEM.md` está o que já foi implementado e onde cada parte vive.

---

## 0. O princípio

```
IDENTIDADE → TOKEN → COMPONENTE → PADRÃO → TELA
```

Nunca `TELA → ESTILO NOVO`.

Quando uma tela nova for necessária, ela é montada com componentes existentes. Quando um componente novo for necessário, ele é montado com tokens existentes. Quando um token novo for realmente necessário, ele é derivado de um token existente, documentado neste arquivo e adicionado a `sistema/tokens.json` antes de ser usado.

**Regras de execução para quem escreve o código:**

1. Não escolher cor, raio, duração, tamanho de fonte ou espaçamento fora das listas deste arquivo.
2. Não introduzir biblioteca de UI com estilo próprio (Material, Ant, shadcn com tema default, Chakra). Componentes são escritos sobre os tokens.
3. Não introduzir biblioteca de ícones (Lucide, Feather, Heroicons, FontAwesome). Só `eloi-icons.svg`.
4. Não usar sombra. Elevação é diferença de tom.
5. Não usar degradê. Em nenhuma superfície.
6. Só duas famílias tipográficas: Archivo e Manrope.

---

## 1. As três camadas e as três densidades

| Camada | O que é | Onde vive |
| --- | --- | --- |
| 01 Brand System | Assinatura, grafismos, iconografia, personalidade | `Eloi DS 01 Brand.dc.html` |
| 02 UI Design System | Tokens, componentes, estados | `Eloi DS 02 UI System.dc.html` |
| 03 Application Patterns | Telas montadas com 02 | em construção |

Toda interface declara **uma densidade**. A densidade não muda cor, família tipográfica nem semântica — muda respiro, corpo de texto e altura de linha.

| Densidade | Usar em | Teto tipográfico | Linha de tabela | Padding de célula | Espaço entre blocos | Grafismo (arco/quadrante) |
| --- | --- | --- | --- | --- | --- | --- |
| `expressive` | Site, portfólio, proposta, capa de relatório, login | `type.display-xl` | — | — | 120px | Sim |
| `standard` | Dashboard, cliente, projeto, tarefas, configurações | `type.h1` | 44px | 14px 20px | 32px | Só estado vazio e carregamento |
| `dense` | Financeiro, contas, conciliação, tabela longa, lote | `type.h2` | 32px | 8px 14px | 24px | **Não** |

> Em `dense` a identidade vem do grid de 1px, da cor semântica e do número tabular. Nenhum arco, nenhum quadrante, nenhuma barra decorativa. Isso é regra, não preferência: em interface densa o grafismo compete com a informação.

Implementação sugerida: atributo na raiz da aplicação/rota, `data-density="standard"`, e os tokens de espaço/linha lidos a partir dele.

---

## 2. Tokens — bloco CSS pronto

```css
:root {
  /* ---------- BACKGROUND ---------- */
  --color-background-primary:   #08011A; /* chão de toda página */
  --color-background-secondary: #0D0225; /* sidebar, topbar, faixa estrutural */
  --color-background-elevated:  #170B33; /* modal, drawer, popover */
  --color-background-inverse:   #FDD5D3; /* documento, contrato, e-mail, impressão */

  /* ---------- SURFACE ---------- */
  --color-surface-default:  #0D0225;
  --color-surface-raised:   #170B33;
  --color-surface-hover:    #20114A;
  --color-surface-selected: rgba(125, 42, 232, .22);
  --color-surface-disabled: rgba(253, 213, 211, .06);

  /* ---------- BORDER (sempre 1px) ---------- */
  --color-border-subtle:  rgba(253, 213, 211, .08); /* divisor de linha/lista */
  --color-border-default: rgba(253, 213, 211, .16); /* card, campo, painel */
  --color-border-strong:  rgba(253, 213, 211, .28); /* botão secundário */
  --color-border-active:  #9184D9;                  /* hover/cursor dentro */
  --color-border-focus:   #DFF806;                  /* foco de teclado */

  /* ---------- TEXT ---------- */
  --color-text-primary:   #FDD5D3;
  --color-text-secondary: rgba(253, 213, 211, .68);
  --color-text-muted:     rgba(253, 213, 211, .45); /* mínimo 12px */
  --color-text-accent:    #DFF806;
  --color-text-inverse:   #1B0647;                  /* sobre rosa/lima/lilás */
  --color-text-on-accent: #FFFFFF;                  /* único uso do branco puro */

  /* ---------- ACCENT ---------- */
  --color-accent-primary:        #7D2AE8;
  --color-accent-primary-hover:  #6A1FD0;
  --color-accent-primary-active: #5A17B0;
  --color-accent-signal:         #DFF806; /* Lima — ver seção 3 */
  --color-accent-soft:           #EEB4E7;

  /* ---------- FEEDBACK ---------- */
  --color-feedback-success: #DFF806;
  --color-feedback-warning: #F5A300; /* âmbar derivado — só status */
  --color-feedback-error:   #FD4400;
  --color-feedback-info:    #5B7CFD;
  --color-feedback-neutral: rgba(253, 213, 211, .14);

  /* ---------- ESPAÇO ---------- */
  --space-01: 4px;   --space-02: 8px;   --space-03: 12px;  --space-04: 16px;
  --space-05: 24px;  --space-06: 32px;  --space-07: 40px;  --space-08: 48px;
  --space-09: 64px;  --space-10: 80px;  --space-11: 96px;  --space-12: 120px;

  /* ---------- RAIO ---------- */
  --radius-xs:   6px;   /* checkbox, amostra, etiqueta quadrada */
  --radius-sm:  10px;   /* todo controle: botão, campo, select */
  --radius-md:  14px;   /* card */
  --radius-lg:  16px;   /* painel, modal, drawer */
  --radius-xl:  18px;   /* bloco institucional */
  --radius-full: 999px; /* tag, avatar, contador, ponto */
  --radius-arc: 100% 0 0 0; /* arco da marca — camada expressive */

  /* ---------- GRID ---------- */
  --grid-max-width: 1440px;
  --grid-columns-desktop: 12;  --grid-gutter-desktop: 24px;  --grid-margin-desktop: 48px;
  --grid-columns-tablet:   8;  --grid-gutter-tablet:  20px;  --grid-margin-tablet:  32px;
  --grid-columns-mobile:   4;  --grid-gutter-mobile:  16px;  --grid-margin-mobile:  20px;
  --grid-sidebar-open:    248px;
  --grid-sidebar-compact:  72px;
  --grid-topbar-height:    64px;
  --grid-form-max:        720px; /* formulário e documento em coluna única */
  --grid-split-list:       38%;  /* painel dividido */

  /* ---------- MOVIMENTO ---------- */
  --motion-fast:         140ms;
  --motion-default:      240ms;
  --motion-slow:         420ms;
  --motion-presentation: 670ms; /* só a assinatura da marca */
  --motion-ease-standard:  cubic-bezier(.3, 0, .2, 1);
  --motion-ease-enter:     cubic-bezier(.16, 1, .3, 1);
  --motion-ease-exit:      cubic-bezier(.5, 0, .75, 0);
  --motion-ease-signature: cubic-bezier(.72, 0, .16, 1);
  --motion-shift-sm: 4px;   /* hover de card */
  --motion-shift-md: 12px;  /* entrada de bloco */
  --motion-stagger:  40ms;  /* máx. 6 itens */
}
```

Breakpoints: `sm 480` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1600`.

**Nomenclatura.** `categoria.grupo.função.estado`, no máximo quatro segmentos. Proibido: `cor-card-financeiro`, `verde-tela-cliente`, `roxo2`, `azulEscuroBotao`. Nome descreve função, nunca a tela onde nasceu.

---

## 3. A regra do Lima

Lima `#DFF806` é o que faz alguém reconhecer o sistema. Só continua funcionando se aparecer pouco.

**No máximo um Lima por bloco visível.**

| Usar Lima em | Não usar Lima em |
| --- | --- |
| Ação principal da tela (uma) | Fundo de card ou de seção |
| Ponto de sinal, contador, badge numérico | Texto corrido de qualquer tamanho |
| Barra de 2px de estado ativo em navegação | Fundo de item de menu ativo |
| Contorno de foco de teclado | Mais de uma série no mesmo gráfico |
| Valor em foco em dashboard (um por bloco) | Sobre Roxo ELOI `#7D2AE8` — proibido em qualquer tamanho |
| Status "concluído / aprovado / pago" | Área grande com leitura por cima |

Estado ativo de navegação: `border-left: 2px solid var(--color-accent-signal)` + `background: rgba(223,248,6,.06)`. O preenchimento sólido de seleção é **Roxo** (`--color-surface-selected`), não Lima.

---

## 4. Tipografia

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Manrope:wght@300..800&display=swap">
```

Archivo desenha o que se anuncia (marca, título, número grande). Manrope carrega o que se lê e se opera (corpo, campo, tabela, botão).

| Token | Família | Peso | Desktop | Mobile | Tracking | Uso |
| --- | --- | --- | --- | --- | --- | --- |
| `type.display-xl` | Archivo | 700 | 96 / 1.00 | 56 | -.04em | Capa, hero. Só expressive |
| `type.display` | Archivo | 700 | 72 / 1.05 | 40 | -.03em | Abertura de página institucional |
| `type.h1` | Archivo | 600 | 44 / 1.10 | 28 | -.02em | Título de página. Um por tela |
| `type.h2` | Archivo | 600 | 28 / 1.20 | 22 | -.02em | Seção, título de modal |
| `type.h3` | Archivo | 600 | 22 / 1.25 | 19 | -.01em | Bloco, card grande |
| `type.h4` | Archivo | 600 | 18 / 1.30 | 18 | -.01em | Grupo de formulário, painel |
| `type.title` | Manrope | 600 | 16 / 1.35 | 16 | 0 | Card comum, nome em linha |
| `type.subtitle` | Manrope | 500 | 20 / 1.45 | 17 | 0 | Apoio de h1/display |
| `type.body-lg` | Manrope | 400 | 18 / 1.60 | 17 | 0 | Página institucional, proposta |
| `type.body` | Manrope | 400 | 16 / 1.65 | 15 | 0 | Corpo padrão |
| `type.body-sm` | Manrope | 400 | 14 / 1.55 | 14 | 0 | Interface: célula, campo, botão |
| `type.caption` | Manrope | 400 | 13 / 1.50 | 13 | 0 | Legenda, auxiliar de campo |
| `type.label` | Manrope | 700 | 11 | 11 | .20em, caixa-alta | Etiqueta curta. Nunca frase |
| `type.mark` | Archivo | 700 `wdth 72` | — | — | -.02em | **Só** a assinatura |

Archivo em título usa `font-variation-settings: 'wght' 600, 'wdth' 100`. `wdth 72` é exclusivo da assinatura.

**Limites.** Nada abaixo de 11px, e 11px só em etiqueta. Corpo com medida de 60–75 caracteres, alinhado à esquerda, nunca justificado. Nunca dois pesos altos concorrendo na mesma linha. Distância entre título e apoio: 12–24px.

### Números

`font-variant-numeric: tabular-nums` **sempre** ligado em valor, percentual, data e prazo.

| Token | Especificação | Uso |
| --- | --- | --- |
| `type.data.xl` | Archivo 600 · 44 · -.03em · tabular | KPI único de dashboard |
| `type.data.lg` | Archivo 600 · 28 · -.02em · tabular | Card de métrica |
| `type.data.md` | Manrope 600 · 18 · tabular | Total de coluna, subtotal |
| `type.data.sm` | Manrope 500 · 14 · tabular | Célula de tabela |

Formato monetário: `R$ 42.800,00` — prefixo separado por espaço, milhar com ponto, decimal com vírgula.

| Natureza do valor | Cor | Marcação extra |
| --- | --- | --- |
| Positivo, recebido | `--color-feedback-success` | — |
| Negativo, despesa | `--color-feedback-error` | Sinal `−` antes do prefixo |
| Pendente | `--color-text-primary` | — |
| Previsto | `--color-text-muted` | `border-bottom: 1px dashed` |
| Sem valor definido | `--color-text-muted` a 35% | Texto "a definir", nunca `R$ 0,00` |

Variação percentual: seta + sinal + cor, os três juntos. Direção nunca depende só de cor.
Prazo: relativo até 7 dias (`em 2 dias`, `4 dias atrás`), absoluto depois (`14 mar 2026`). Prazo no limite usa `warning`; vencido usa `error`.

---

## 5. Espaçamento

Base 4, doze passos. Sem valores intermediários: se parece precisar de 18px, é 16 ou 24.

**Dentro do componente**

| Elemento | Padding |
| --- | --- |
| Botão | 12px 22px (`sm` 8px 14px, `lg` 16px 28px) |
| Campo | 12px 16px |
| Card | 24px ou 32px |
| Painel | 32px |
| Modal | 32px, rodapé 24px |
| Célula de tabela | conforme densidade (seção 1) |
| Rótulo → campo | gap 8px |

**Entre componentes**

Cards no grid 24 · campos de formulário 24 · grupos de formulário 40 · blocos de dashboard 32 · botões lado a lado 12 · etiquetas em linha 8.

**Entre seções**

Página de produto 64 · seção institucional 120 · topo até h1 48 · h1 até conteúdo 40 · rodapé 96.

Usar sempre `display:flex`/`grid` + `gap`. Nunca margens por elemento nem espaçamento por whitespace de código.

---

## 6. Grid e arquétipos de layout

| Faixa | Colunas | Gutter | Margem |
| --- | --- | --- | --- |
| Desktop ≥1280 | 12 | 24 | 48 |
| Tablet 768–1279 | 8 | 20 | 32 |
| Mobile <768 | 4 | 16 | 20 |

Conteúdo máximo 1440. Acima de 1600 a página não cresce — cresce a margem.

| Arquétipo | Estrutura | Onde |
| --- | --- | --- |
| Aplicação | Sidebar 248/72 + topbar 64 + conteúdo livre | Todo o sistema |
| Painel dividido | Lista 38% / detalhe 62% | Cliente, projeto, lançamento |
| Tabela larga | Largura total, cabeçalho fixo, 1ª coluna fixa | Financeiro, contas, gestão |
| Formulário / documento | Coluna única máx. 720 | Orçamento, proposta, contrato, configurações |
| Institucional | Faixas de largura total, conteúdo em 1440 | Site, case, portfólio |

**Reorganização responsiva — regras, não redução proporcional.**

- Sidebar: `≥1280` aberta · `768–1279` compacta (72px, só ícone) · `<768` fora da tela, volta como folha inferior.
- Grid de 4 cards: `4 → 2 → 1`.
- Painel dividido: `<1024` a lista vira página e o detalhe vira navegação.
- Tabela: `<768` cada linha vira cartão — nome no topo, valor à direita, status como tag, resto em pares rótulo/valor.
- Topbar: `<768` mantém busca e perfil; breadcrumb some, ações vão para menu.
- Formulário de duas colunas: `<1024` vira uma coluna, ordem de leitura preservada.
- Modal: `<768` vira folha de altura total.

---

## 7. Geometria

Canto controlado, não canto redondo. O arco de um quarto (`--radius-arc`, traço 4px) é gesto de marca da camada **expressive**.

Onde o arco pode aparecer em produto: carregamento, estado vazio, marcador de gráfico, canto de faixa institucional, abertura de relatório.
Onde nunca aparece: card de métrica, célula, campo, linha de tabela, qualquer tela `dense`.

Descaracteriza o sistema: card com raio ≥24, campo em cápsula, tudo arredondado por igual.

---

## 8. Movimento

| Token | Duração | Aplicar em |
| --- | --- | --- |
| `motion.fast` | 140ms | Hover, foco, checkbox, troca de cor |
| `motion.default` | 240ms | Dropdown, tooltip, tab, expansão de linha, toast |
| `motion.slow` | 420ms | Modal, drawer, sidebar, entrada de página, gráfico, contagem de número |
| `motion.presentation` | 670ms | Só a assinatura ELOI Studio ↔ Design (ciclo 5,6s) |

Entrada desacelera (`ease-enter`), saída acelera (`ease-exit`). Nada com overshoot, nada balançando, nada girando.

| Situação | Movimento |
| --- | --- |
| Entrada de página | opacidade 0→1 + `translateY(12px)`, `slow`, `ease-enter` |
| Entrada de blocos | mesma, com `stagger` 40ms, máximo 6 itens |
| Hover de card | `translateY(-4px)` + troca de tom, `default` |
| Hover de linha de tabela | só troca de tom, `fast`, sem deslocamento |
| Botão | cor em `fast`; pressionado `scale(.97)` |
| Modal | opacidade + `scale(.98→1)`, `slow` |
| Drawer / sidebar | deslize no eixo, `slow` |
| Dropdown | opacidade + `translateY(-6px→0)`, `default` |
| Número / KPI | contagem sobe até o valor, `slow`, uma vez ao entrar em tela |
| Barra de progresso | cresce da esquerda, `slow`, uma vez |
| Mudança de status | tag faz cross-fade de cor em `fast`; sem pulso, sem brilho |
| Gráfico | linha desenha da esquerda, barra cresce da base, `slow` |

`@media (prefers-reduced-motion: reduce)`: deslocamento vira 0, contagem vira valor final, desenho de gráfico vira estado final. Opacidade pode permanecer.

---

## 9. Componentes

Todo componente é escrito sobre os tokens. Estados obrigatórios: `default`, `hover`, `active/pressed`, `focus-visible`, `disabled`, e `loading` onde houver ação assíncrona.

### Botões

Raio `--radius-sm`. Manrope. Padding 12px 22px. Altura mínima de área clicável 44px em mobile.

| Variante | Fundo | Texto | Borda | Hover | Pressed |
| --- | --- | --- | --- | --- | --- |
| `primary` | `accent-primary` | `text-on-accent` (600) | — | `accent-primary-hover` | `accent-primary-active` + `scale(.97)` |
| `signal` | `accent-signal` | `text-inverse` (700) | — | `#C9E005` | `#B4C904` |
| `secondary` | transparente | `text-primary` (600) | 1px `border-strong` | borda e texto → `accent-signal` | fundo `surface-hover` |
| `tertiary` | `surface-default` | `text-primary` (600) | 1px `border-default` | fundo `surface-hover` | `surface-raised` |
| `ghost` | transparente | `text-secondary` (600) | — | fundo `surface-hover`, texto `text-primary` | `surface-raised` |
| `destructive` | transparente | `feedback-error` (600) | 1px `rgba(253,68,0,.4)` | fundo `rgba(253,68,0,.10)` | `rgba(253,68,0,.18)` |
| `icon` | transparente | `text-secondary` | — | fundo `surface-hover` | `surface-raised` |

`disabled`: fundo `surface-disabled`, texto `text-muted`, sem hover, sem cursor de ação, `aria-disabled`.
`loading`: largura travada, rótulo permanece, indicador de 14px substitui o ícone. Botão fica não clicável mas não muda de cor.
`focus-visible`: `outline: 2px solid var(--color-border-focus); outline-offset: 2px` — em todas as variantes, nunca removido.

`icon` tem 40×40 no desktop e 44×44 em mobile. Botão só de ícone exige `aria-label`.

**Uma ação primária por tela.** Duas ações lado a lado: primária à direita, secundária à esquerda, gap 12px. Ação destrutiva nunca fica adjacente à primária sem separação.

### Campos

Raio `--radius-sm`. Fundo `surface-default`. Borda 1px `border-default`. Padding 12px 16px. Texto `body-sm`. Rótulo `label` acima, gap 8px. Texto auxiliar `caption` abaixo, gap 8px.

| Estado | Tratamento |
| --- | --- |
| `default` | borda `border-default` |
| `hover` | borda `border-active` |
| `focus` | borda `border-active` + `outline 2px border-focus, offset 2px` |
| `filled` | igual ao default; o que muda é o texto (`text-primary`) |
| `error` | borda `feedback-error` + mensagem com ícone abaixo |
| `success` | borda `feedback-success` + ícone à direita dentro do campo |
| `disabled` | fundo `surface-disabled`, texto `text-muted`, borda `border-subtle` |
| `readonly` | sem borda, fundo transparente, texto `text-primary` |

Tipos a implementar, todos com a mesma anatomia: `text`, `textarea` (min 96px, redimensionável na vertical), `number` (tabular, passo explícito), `currency` (prefixo R$ fixo à esquerda, valor tabular alinhado à direita), `percentage` (sufixo % fixo), `date`, `date-range` (dois campos ligados por um traço), `search` (ícone à esquerda, limpar à direita), `password` (alternador de visibilidade), `select`, `multi-select` (seleções como tag removível dentro do campo), `checkbox` (18px, `radius-xs`, marca Lima sobre Roxo), `radio` (18px, ponto Roxo), `switch` (36×20, `radius-full`, ligado = Roxo), `slider` (trilha 4px, alça 16px), `file-upload` (área com borda 1px tracejada `border-strong`, arco no canto na camada expressive).

Erro de formulário: mensagem no campo, sempre com ícone. Resumo no topo só quando houver mais de três erros. Nunca só cor.

### Cards

Não existe um card único. O card só existe quando o conteúdo precisa de limite clicável ou de agrupamento real. Conteúdo de página fica na página.

| Variante | Anatomia | Fundo |
| --- | --- | --- |
| `information` | etiqueta + `h3` + corpo | `surface-default` |
| `metric` | etiqueta + `data.lg` + variação | `surface-default` |
| `financial` | etiqueta + `data.lg` colorido por natureza + linha de apoio | `surface-default` |
| `project` | tag de status + nome + cliente + prazo + progresso | `surface-default`, hover `surface-hover` |
| `client` | inicial ou logo + nome + contagem de projetos + valor em aberto | `surface-default`, hover `surface-hover` |
| `notification` | ícone de tipo + texto + tempo relativo + ponto de não lido | `surface-default`, não lido `surface-raised` |
| `action` | ícone + rótulo + descrição curta, todo o card é o alvo | `surface-default`, hover `surface-hover` |
| `summary` | título + lista de pares rótulo/valor com divisor `border-subtle` | `surface-default` |
| `status` | tag grande + contagem + rótulo | `surface-default`, borda esquerda 2px na cor do status |

Raio `--radius-md`. Borda 1px `border-default`. Sem sombra. Card clicável sobe 4px no hover; card estático não se move.

**Evitar interface feita de dezenas de caixas.** Preferir divisor de 1px e agrupamento por espaço.

### Status

Sistema semântico independente de tela: **cor + ícone + texto**, sempre os três.

| Status | Cor | Contexto |
| --- | --- | --- |
| Novo | `feedback-neutral` (contorno) | Qualquer entidade recém-criada |
| Rascunho | `feedback-neutral` (contorno) | Orçamento, proposta, contrato |
| Em andamento | `feedback-info` | Projeto, tarefa |
| Aguardando | `feedback-warning` | Terceiro, cliente, NF |
| Em revisão | `feedback-info` | Entrega, arte |
| Aprovado | `feedback-success` | Orçamento, entrega |
| Concluído | `feedback-success` | Projeto, tarefa |
| Cancelado | `feedback-neutral` (texto riscado) | Qualquer |
| Atrasado | `feedback-error` | Prazo, tarefa |
| Pago | `feedback-success` | Financeiro |
| Pendente | `text-primary` | Financeiro |
| Parcial | `feedback-warning` | Financeiro |
| Vencido | `feedback-error` | Financeiro |

Forma da tag: `radius-full`, padding 7px 14px, Manrope 600 12px, fundo a 14% da cor + texto na cor cheia. Exceção: `success` e `signal` usam fundo cheio com `text-inverse`, porque Lima a 14% não se lê.

Em tabela, o status aparece como ponto de 7px + texto — a tag cheia é grande demais para linha `dense`.

### Tabelas

O componente mais crítico do sistema.

Anatomia: barra de ferramentas (busca, filtros, densidade, ações em lote) → cabeçalho → corpo → rodapé (paginação e total).

- Cabeçalho: `label` (11px, .20em, `text-muted`), fundo `background-primary`, borda inferior 1px `border-default`, fixo no scroll.
- Linha: borda inferior 1px `border-subtle`, hover `surface-hover` em `fast`, selecionada `surface-selected`.
- Coluna de texto alinha à esquerda; valor, percentual e data alinham à direita; status ao centro da própria coluna.
- Primeira coluna fixa em tabela larga.
- Checkbox de seleção na primeira coluna, 18px, com "selecionar todos" no cabeçalho.
- Ordenação: seta de 10px ao lado do rótulo, só na coluna ativa.
- Menu contextual: botão de ícone de três pontos na última coluna, aparece no hover da linha e sempre em foco de teclado.
- Expansão de linha: seta à esquerda, conteúdo expandido em `background-secondary` com padding 24px.
- Agrupamento: linha de grupo com fundo `background-secondary`, nome em `title` e contagem em `text-muted`.
- Ações em lote: ao ter seleção, a barra de ferramentas troca de conteúdo — contagem à esquerda, ações à direita. Não usar barra flutuante.
- Paginação: contagem à esquerda (`1–25 de 184`), controles à direita, seletor de itens por página.
- Edição em linha: célula vira campo no lugar, sem modal, confirmação por Enter e reversão por Esc.

Densidades conforme seção 1. A densidade é escolha do usuário e persiste por tabela.

Estado vazio dentro da tabela: cabeçalho permanece, corpo recebe o bloco de estado vazio (seção 12).

### Navegação

**Sidebar.** Largura 248 aberta, 72 compacta. Fundo `background-secondary`, borda direita 1px `border-subtle`. Assinatura no topo, com 24px de padding. Item: 40px de altura, ícone 20px + rótulo `body-sm`, padding 11px 16px, `radius-sm`. Ativo: `border-left 2px accent-signal` + fundo `rgba(223,248,6,.06)` + rótulo `text-primary`. Hover: fundo `surface-hover`. Submenu: recuo de 20px, sem ícone, linha vertical de 1px `border-subtle` à esquerda. No modo compacto o rótulo vira tooltip à direita, `default`.

**Topbar.** Altura 64, fundo `background-secondary`, borda inferior 1px `border-subtle`. Da esquerda para a direita: alternador da sidebar, breadcrumb, busca (largura flexível, máx. 420), ações da página, notificações com ponto Lima, perfil. Breadcrumb: `caption`, separador `/` em `text-muted`, último item em `text-primary` sem link.

**Contextual.** Tabs: rótulo `body-sm` 600, padding 12px 4px, gap 28px, ativo com borda inferior 2px `accent-primary` e texto `text-primary`; inativo `text-secondary`. Segmented control: contêiner `surface-default` com `radius-sm`, item selecionado `surface-raised` — usar com 2 a 4 opções curtas. Pagination e previous/next conforme tabela.

### Feedback

| Componente | Onde aparece | Duração | Regra |
| --- | --- | --- | --- |
| `toast` | Canto inferior direito | 5s, ou até fechar | Confirmação de ação. Máximo 3 na pilha |
| `alert` | Dentro do bloco afetado | Persistente | Erro ou aviso de contexto local |
| `banner` | Topo da página, largura total | Persistente | Aviso de sistema ou de conta |
| `notification` | Painel da topbar | Persistente | Evento assíncrono |
| `tooltip` | Ancorado ao alvo | Ao hover/foco | Só rótulo. Nunca informação essencial |
| `popover` | Ancorado ao alvo | Até clicar fora | Detalhe, filtro, seletor pequeno |
| `dialog` | Centro, `background-elevated` | Até resolver | Decisão que interrompe |
| `confirmation` | Dialog de 480px | Até resolver | Ação destrutiva. Verbo explícito no botão, não "OK" |

Toast, alert e banner: ícone + texto + ação opcional, na cor do `feedback` correspondente, fundo a 10% da cor, borda esquerda 2px na cor cheia.

`skeleton`: bloco `surface-raised` com `radius-xs`, pulso de opacidade .5→.8 em 1.2s. Usar com a forma real do conteúdo, nunca um retângulo genérico. Acima de 3 segundos, trocar por indicador de progresso.

### Modais, drawers e páginas

| Usar | Quando |
| --- | --- |
| `popover` | Uma escolha, sem digitação — filtro, data, seletor |
| `modal` | Uma decisão ou até 3 campos. Máximo 560px de largura |
| `drawer` lateral | Detalhe ou edição sem perder o contexto da lista. 480–640px |
| Página completa | Formulário longo, orçamento, proposta, contrato, qualquer coisa com mais de 6 campos |

Não transformar todo processo em modal. Modal aninhado é proibido: se um modal precisa abrir outro, o fluxo é uma página.

---

## 10. Dashboards

Não é template SaaS. Regras da linguagem:

- Um KPI dominante por bloco, em `data.xl`, com variação ao lado em `caption`.
- Grid de métricas: 4 no desktop, 2 no tablet, 1 no mobile, gap 24.
- Comparação temporal explícita em texto (`vs. mês anterior`), nunca só uma seta.
- Progresso: barra de 6px, `radius-full`, trilha `rgba(253,213,211,.10)`.
- Timeline vertical com linha de 1px `border-subtle` e ponto de 7px na cor do status.
- Ranking: lista numerada com valor à direita e barra proporcional de fundo a 12%.
- Distribuição: barra segmentada horizontal única, não donut, quando as fatias forem mais de 4.
- Sem widget decorativo. Todo bloco responde a uma pergunta que o usuário faria.

## 11. Data visualization

Lima **não** é a cor padrão de série. Ordem de séries:

1. `#7D2AE8` Roxo ELOI
2. `#5B7CFD` Azul
3. `#EEB4E7` Lilás
4. `#9184D9` Roxo claro
5. `#0A0A60` Marinho

`#DFF806` Lima entra apenas para **uma** série em destaque, ou para o ponto/valor em foco. `#FD4400` Coral só para série negativa (despesa, perda).

- Eixos e grade: 1px `border-subtle`. Sem grade vertical em gráfico de barras.
- Rótulo de eixo: `caption` em `text-muted`, tabular.
- Line chart: traço 2px, terminação quadrada, sem ponto em cada dado — ponto só no valor sob o cursor.
- Bar chart: barra com `radius-xs` no topo, gap de 8px, largura máxima 48px.
- Area chart: preenchimento a 18% da cor da linha. Sem degradê.
- Donut: espessura 12px, máximo 4 fatias + "outros", valor central em `data.lg`.
- Sparkline: 2px, altura 32px, sem eixo, sem rótulo.
- Legenda acima do gráfico, alinhada à esquerda, com ponto de 7px. Nunca à direita em coluna.
- Tooltip de gráfico: `background-elevated`, `radius-sm`, valor tabular, nome da série com o ponto de cor.
- Série vazia: linha tracejada em `text-muted` com rótulo "sem dados".

## 12. Estados vazios

Personalidade sem ilustração inventada. Anatomia: arco ou quadrante da marca em 96px (camada expressive/standard) ou apenas um ícone de 40px em `text-muted` (dense) + `h3` + uma linha de corpo + uma ação primária.

| Situação | Título | Ação |
| --- | --- | --- |
| Nenhum cliente | "Nenhum cliente ainda" | Cadastrar cliente |
| Nenhum projeto | "Nenhum projeto neste cliente" | Criar projeto |
| Nenhum orçamento | "Nenhum orçamento emitido" | Novo orçamento |
| Nenhuma transação | "Sem movimento no período" | Alterar período |
| Busca sem resultado | "Nada encontrado para *termo*" | Limpar busca |
| Nenhuma notificação | "Tudo em dia" | — |
| Erro de carregamento | "Não foi possível carregar" | Tentar novamente |

Estado vazio por filtro sempre oferece limpar o filtro, não cadastrar.

---

## 13. Iconografia

Fonte única: `sistema/icones/eloi-icons.svg`. Nenhuma biblioteca externa. Nenhum ícone desenhado fora da grade.

```html
<svg width="20" height="20" aria-hidden="true"><use href="/sistema/icones/eloi-icons.svg#eloi-cliente"></use></svg>
```

Regras de desenho: grade 24, traço 2, `stroke-linejoin: miter`, terminação quadrada, cantos retos de 90° ou quarto de arco, preenchimento **apenas** no ponto de sinal (Lima). Tamanhos permitidos: 20 (interface), 24 (padrão), 40 (destaque e estado vazio). Cor herdada por `currentColor`.

Famílias existentes: A processo da marca · B institucional e conteúdo · C serviço, contato e público · D interface e navegação.

Famílias a completar quando o sistema exigir, sempre dentro das mesmas regras: navegação (home, menu, voltar, avançar, expandir, recolher, abrir, fechar) · clientes (cliente, empresa, contato, equipe, adicionar) · projetos (projeto, pasta, arquivo, briefing, entrega, revisão, aprovação) · financeiro (dinheiro, receita, despesa, pagamento, cartão, banco, nota fiscal, orçamento, saldo, gráfico) · sistema (configurações, usuário, segurança, busca, filtro, ordenar, editar, excluir, copiar, adicionar, download, upload) · comunicação (comentário, mensagem, e-mail, alerta, notificação) · status (concluído, pendente, atrasado, bloqueado, em andamento, aprovado, rejeitado).

Ícone novo entra no sprite antes de ser usado em código.

---

## 14. Acessibilidade

Não negociável.

- Contraste: `text-primary`, `text-secondary` e `accent-signal` sobre `background-primary` passam para corpo. `text-muted` só a partir de 12px. Coral como texto sobre escuro **só a partir de 24px**. Branco puro apenas sobre Roxo ELOI. Lima sobre Roxo ELOI é proibido.
- Texto mínimo: 11px, e apenas em `type.label`.
- Área clicável: 44×44 em mobile, 32×32 no desktop com espaçamento de 8px entre alvos.
- `focus-visible` sempre visível: `outline 2px solid #DFF806`, `outline-offset 2px`. Nunca `outline: none` sem substituto equivalente.
- Ordem de tabulação segue a ordem visual. Modal e drawer prendem o foco e devolvem ao elemento de origem ao fechar. `Esc` fecha.
- Tabela navegável por teclado: setas entre linhas, `Enter` abre, `Espaço` seleciona.
- Nenhuma informação exclusivamente por cor: status leva ícone e texto, variação leva sinal e seta, erro leva mensagem.
- `prefers-reduced-motion` respeitado conforme seção 8.
- Todo botão de ícone tem `aria-label`. Todo campo tem `<label>` associado, não só placeholder.
- Marcação semântica: `<table>` para tabela, `<button>` para ação, `<a>` para navegação, landmarks (`nav`, `main`, `aside`) na estrutura da aplicação.

---

## 15. Documentação exigida por componente novo

Ao criar um componente que não está aqui, documentar antes de usar: **anatomia · variações · estados · comportamento · quando usar · quando não usar · responsivo · movimento · tokens utilizados**. Sem estilo novo: só composição dos tokens da seção 2.

## 16. Faça / Não faça

| Faça | Não faça |
| --- | --- |
| Elevar por tom: primary → secondary → elevated | Sombra para separar camadas |
| Cor cheia | Degradê em qualquer superfície |
| Duas cores dominantes por tela | Cinco cores competindo |
| Um Lima por bloco | Lima como cor de fundo ou de série padrão |
| Status com cor + ícone + texto | Status só por cor |
| `tabular-nums` em todo número | Número proporcional em coluna |
| Espaço da escala de 12 passos | 18px, 30px, 50px |
| Divisor de 1px e agrupamento por espaço | Dezenas de caixas independentes |
| Raio 10 em controle, 14 em card | Tudo em cápsula ou raio ≥24 |
| Arco só em expressive | Arco em célula de tabela |
| Archivo em título, Manrope em interface | Terceira família, ou Archivo em corpo |
| Uma ação primária por tela | Três botões roxos lado a lado |
| Página completa para formulário longo | Modal para tudo |
| Gráfico com legenda acima e eixo de 1px | Grade densa, 3D, degradê, donut de 9 fatias |

---

## 17. Arquivos

```
Eloi DS 01 Brand.dc.html      marca: assinatura, grafismos, ícones, animação
Eloi DS 02 UI System.dc.html  este documento em forma visual
sistema/tokens.json           todos os valores, legível por máquina
sistema/eloi.css              variáveis CSS + classes prontas
sistema/icones/eloi-icons.svg sprite oficial (fonte única de ícones)
sistema/icones/icones.md      lista e regras de desenho
marca/                        logotipos e assinaturas aprovadas em SVG
Site Eloi 2026.dc.html        referência de camada expressive
Gestao Eloi.dc.html           referência de camada standard/dense
Gestao Eloi Mobile.dc.html    referência de reorganização mobile
```

Ordem de leitura para implementar: **este arquivo → `sistema/tokens.json` → `Eloi DS 02 UI System.dc.html` → a referência da tela equivalente.**

## 18. Instrução final ao Claude Code

Ao construir qualquer funcionalidade neste sistema:

1. Declare a densidade da tela antes de escolher qualquer medida.
2. Monte a tela com o arquétipo de layout correspondente (seção 6).
3. Use apenas os componentes da seção 9. Se faltar um, derive-o dos tokens e documente conforme a seção 15.
4. Nenhum valor literal de cor, raio, duração, espaçamento ou tamanho de fonte no código de componente — só variáveis da seção 2.
5. Nenhum ícone fora do sprite. Nenhuma fonte além de Archivo e Manrope. Nenhuma sombra. Nenhum degradê.
6. Antes de entregar, verifique: contraste, foco visível, área clicável, informação não dependente de cor, e comportamento em 1440 / 1024 / 768 / 375.

Se uma decisão visual não estiver coberta aqui, ela não deve ser tomada em código — deve ser levantada como pergunta.
