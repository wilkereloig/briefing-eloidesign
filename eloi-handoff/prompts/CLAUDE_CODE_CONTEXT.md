# Contexto permanente — ELOI Studio

Leia antes de tocar em qualquer interface deste repositório. Vale para toda sessão, indefinidamente.

---

## Duas regras acima de todas

> **Antes de criar qualquer estilo, cor, espaçamento, componente ou padrão de interface, verifique se já existe token ou componente equivalente no sistema.** `design-tokens/design-tokens.json` e `COMPONENT_INVENTORY.md` são a primeira consulta, não a última.

> **Não crie páginas genéricas, dashboards padronizados ou interfaces com aparência de template.** Toda tela nova preserva a identidade, a hierarquia e a personalidade definidas no ELOI Design System.

---

## O que é a ELOI Studio

Estúdio de marca, campanha e produto digital. O painel é a operação interna: clientes, projetos, orçamentos e dinheiro do mês.

O visual é escuro, de cor cheia e aresta definida. Fala direto, mostra números concretos, nomeia etapas. Não é corporativo, não é frio, não é um dashboard comprado. A personalidade está na assinatura em duas cores, no roxo com o lima, nas etiquetas em caixa-alta espaçada e nos números em Archivo.

## Referências aprovadas

`references/Eloi KV Completo.dc.html` (identidade) · `references/Gestao Eloi.dc.html` (painel desktop) · `references/Gestao Eloi Mobile.dc.html` (toque) · `references/Site Eloi 2026.dc.html` (institucional).

São protótipos HTML de referência. Recrie o que eles mostram em React + TypeScript, com o CSS do projeto. Não copie o HTML, não use versões antigas de nada.

## Stack — não trocar

React 19 · TypeScript · Vite · react-router-dom 7 · CSS próprio com variáveis em `app/src/ui/`. Sem Tailwind, sem biblioteca de componentes, sem biblioteca de ícones, sem CSS-in-JS. Nenhuma dependência nova sem justificativa técnica real.

## Cor

Tokens em `variables.css`. Nunca escreva um hex direto num `.tsx` ou `.css` de componente.

- Chão: `--pagina` `#08011A` → `--chao` `#0D0225` → `--chao-2` `#170B33` → `--chao-3` `#20114A`. **Elevação é essa escada de tom. Não existe sombra de card.**
- Marca: `--roxo` `#7D2AE8` em botão primário e no indicador dominante. Um bloco roxo por tela — não é fundo padrão.
- Acento: `--lima` `#DFF806` em rótulo de seção, valor a receber, foco, confirmação.
- Estado: Lima sucesso · Azul em andamento · Coral atenção · neutro `rgba(253,213,211,.12)`. Quatro pares, nunca um quinto.
- Texto: `--texto` `#FDD5D3`; apoio em 72%, 55%, 45%; desabilitado em 35%.
- Proibido: degradê · sombra difusa · vidro fosco · cinza neutro · vermelho de erro · verde de sucesso · Roxo como cor de texto · Lima sobre Roxo.

## Tipografia

Archivo (títulos, marca, dinheiro) + Manrope (corpo, interface). Só essas duas. Escala completa na seção 5 do `ELOI_DESIGN_SYSTEM.md`.

Dinheiro é sempre Archivo. Caixa-alta só em etiqueta curta com `letter-spacing: .20em`. Hierarquia por tamanho e espaço, nunca por peso acima de 700.

## Assinatura

ELOI + complemento (*Studio* na marca, *Design* no produto), Archivo `wdth 72` peso 700, **cores diferentes nas duas palavras**, sem espaço entre elas, mínimo de 14 px. Nunca as duas com o mesmo tratamento, nunca as duas juntas. Não recomponha em tipo onde houver SVG disponível em `assets/logos/`.

## Ícones

Só o sprite `assets/icons/eloi-icons.svg` — 59 glifos autorais. Grade 24, traço 2, `miter`, terminação quadrada, canto reto ou quarto de arco, um único ponto de sinal em Lima. Faltando um, desenhe pelas regras de `ICON_GUIDELINES.md` e registre no sprite e na lista. Nunca instale biblioteca de ícones. Nunca use emoji como ícone.

## Componentes existentes

Trilho e barra inferior · cabeçalho · abas em pílula · busca · seletor de período · botões (primário, destaque, secundário, terciário, destrutivo, ícone) · chip de estado · campo, rótulo, select, checkbox, radio, switch, upload · card de indicador, de cliente, de serviço, de caixa · painel · tabela com agrupamento · lista · barra de progresso e de ranking · gráfico de colunas empilhadas · vazio · erro · esqueleto · folha · modal · toast.

Anatomia e estados em `COMPONENT_INVENTORY.md`. Reutilize antes de criar.

## Novo componente

`NEW_COMPONENT_INSTRUCTIONS.md`. Em resumo: só existe se aparecer duas vezes; usa apenas tokens; nasce com hover, foco, ativo, desabilitado, carregando e vazio; entra no inventário no mesmo commit.

## Mobile

`MOBILE_APP_GUIDELINES.md` e `RESPONSIVE_GUIDELINES.md`. O mobile não é o desktop encolhido: barra inferior com botão central de criação, menu em folha, tabela virada em cartão, modal virado em folha, menos informação por tela. Alvo de toque de 44 px em qualquer faixa.

## Não altere

- `app/src/lib/` e `app/src/domain/` — lógica testada. Estilo não justifica mexer em assinatura de função.
- Formatação de dinheiro (`dinheiro.ts`). Dinheiro é cents inteiros, exceto `orcamentos.valor_total`, que é numeric em reais.
- Rotas, nomes de tela e vocabulário do domínio (`docs/GLOSSARY.md`): Cliente, Sub-cliente, Projeto, Etapa, Decisão, Caixa, Movimento, Convite.
- Contratos das edge functions.
- `admin-app/` e as páginas HTML estáticas da raiz — legado congelado (ver seção 6 do guia de implementação).

## Como validar uma tela nova

1. Toda cor vem de token? Nenhum hex solto?
2. A escala tipográfica é a do sistema, e o dinheiro está em Archivo?
3. Um único bloco de cor dominante, com áreas de descanso?
4. Elevação por tom, sem nenhuma sombra?
5. Todo estado tem rótulo escrito, e não só cor?
6. Hover, foco (anel lima de 2 px), ativo, desabilitado, carregando, vazio e erro existem?
7. Alvos de 44 px?
8. Funciona em 360, 390, 768 e 1280?
9. Com `prefers-reduced-motion` ativo, nada se move?
10. Passa lado a lado com a referência aprovada sem parecer de outro produto?

Falhou em qualquer uma: não está pronta. `VISUAL_REVIEW_CHECKLIST.md` tem a versão longa.
