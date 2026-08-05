# Sistema Visual — ELOI Studio

KV aprovado (KV Completo, 04/08/2026). **Única referência visual ativa.**
Antes de criar cor, componente, espaçamento, card ou padrão, procure aqui: quase
sempre já existe.

---

## Onde cada parte vive

| Parte | Arquivo que **roda** | Espelho de handoff |
|---|---|---|
| Tokens CSS (cor, tipo, espaço, forma, camada, movimento) | `app/src/ui/tokens.css` | `eloi-handoff/design-tokens/variables.css` |
| Tokens em TypeScript | `app/src/ui/tokens.ts` | `eloi-handoff/design-tokens/tokens.ts` |
| Primitivos (Botão, Campo, Chip, Ícone, Folha, Marca, Aviso) | `app/src/ui/componentes.tsx` + `.css` | — |
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
animação e transição já estão em `tokens.css` — valem para o app inteiro sem
ninguém precisar lembrar.
