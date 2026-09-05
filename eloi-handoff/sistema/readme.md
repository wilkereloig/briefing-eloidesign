# ELOI — Key Visual / sistema visual

Pacote de referência da identidade **ELOI**. Serve para reproduzir o KV com fidelidade, sem inventar soluções novas.

Se você é uma ferramenta de design: **leia `tokens.json` primeiro**, use `eloi.css` como única fonte de estilo e `icones/eloi-icons.svg` como única fonte de ícones. Não gere cores, fontes, raios, sombras ou grafismos fora do que está aqui.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `tokens.json` | Todos os valores do sistema em formato legível por máquina: cor, tipografia, escala, assinatura, forma, componentes. |
| `eloi.css` | Folha única: variáveis CSS + classes de assinatura, tipografia, ícones, componentes e grafismos. |
| `icones/eloi-icons.svg` | Sprite com os 40 ícones oficiais (`<symbol>` por ícone). |
| `icones/icones.md` | Lista dos 40 ícones com id, rótulo e família, mais as regras de desenho. |
| `../Eloi KV Completo.dc.html` | O guia visual completo em 10 seções, com a animação da assinatura. É a referência visual oficial — este arquivo apenas descreve por escrito o que ele mostra. |

## As oito regras que não se quebram

1. **ELOI é fixo.** *Studio* e *Design* são complementos intercambiáveis. Nunca os dois juntos.
2. **ELOI e o complemento nunca na mesma cor.** Sempre dois tons da paleta oficial.
3. **Mesma largura de fonte nas duas palavras:** Archivo `wdth 72`, peso `700`, para ELOI e para o complemento.
4. **Sem degradê.** Nenhum. Fundos, ícones, botões, cards e grafismos usam cor cheia.
5. **Só Archivo e Manrope.** Archivo na marca, títulos, chamadas e números. Manrope em subtítulo, corpo, legenda, informação técnica e interface.
6. **Duas cores dominantes por peça,** no máximo. As outras entram como destaque pontual.
7. **Caixa-alta só em etiqueta curta,** com `letter-spacing: .20em`. Nunca em frase.
8. **Sem sombra.** Elevação é diferença de tom (`#0D0225` → `#170B33` → `#20114A`).

## Assinatura

```html
<span class="eloi-mark" style="font-size:64px">
  <b>ELOI</b><i>Studio</i>
</span>
```

`<b>` é ELOI, `<i>` é o complemento — a folha já aplica largura, peso, entreletra e cores diferentes. Variantes: `.eloi-mark--stack` (empilhada), `.eloi-mark--positiva` (fundo claro), `.eloi-mark--mono` (uma cor).

- Área de proteção: **X = altura da caixa-alta do E**, em todos os lados.
- Redução mínima: **14px** de corpo.
- Proibido: mesmo tom nas duas palavras, pesos diferentes, entreletra alterada, distorção de proporção.

Animação (ELOI fixo, complemento rolando dentro de uma máscara da altura da linha):

```html
<span class="eloi-mark" style="font-size:96px">
  <b>ELOI</b>
  <span class="eloi-swap"><span><span>Studio</span><span>Design</span></span></span>
</span>
```

Ciclo 5,6s · transição 670ms · `cubic-bezier(.72,0,.16,1)` · deslocamento de 1 linha. Com `prefers-reduced-motion: reduce` a rolagem desliga sozinha.

## Cor

| Papel | Nome | Hex |
| --- | --- | --- |
| Primária | Roxo ELOI | `#7D2AE8` |
| Primária | Tinta | `#1B0647` |
| Secundária | Lima | `#DFF806` |
| Secundária | Coral | `#FD4400` |
| Secundária | Lilás | `#EEB4E7` |
| Secundária | Azul | `#5B7CFD` |
| Apoio | Rosa papel | `#FDD5D3` |
| Apoio | Roxo claro | `#9184D9` |
| Apoio | Marinho | `#0A0A60` |
| Chão | base / superfície / elevada / hover | `#08011A` / `#0D0225` / `#170B33` / `#20114A` |

Pares aprovados: Tinta + Lima · Roxo + Rosa papel · Marinho + Azul · Lilás + Roxo · Rosa papel + Coral.

Contraste: Rosa papel ou Lima sobre Tinta, Tinta sobre Lima ou Lilás, e branco sobre Roxo ELOI servem para corpo e título. Coral sobre Tinta **só a partir de 24px**. Nunca Lima sobre Roxo ELOI, nem texto rebaixado (55%) sobre Roxo ELOI.

## Tipografia

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Manrope:wght@300..800&display=swap">
```

| Nível | Família | Peso | Tamanho / entrelinha | Entreletra |
| --- | --- | --- | --- | --- |
| Display | Archivo | 700 | 72 / 1.05 | -.03em |
| Título de seção | Archivo | 600 | 44 / 1.10 | -.02em |
| Subtítulo de bloco | Archivo | 600 | 28 / 1.20 | -.01em |
| Subtítulo | Manrope | 500 | 20 / 1.45 | 0 |
| Corpo | Manrope | 400 | 16 / 1.65 | 0 |
| Legenda | Manrope | 400 | 13 / 1.50 | 0 |
| Etiqueta | Manrope | 700 | 11 | .20em, caixa-alta |

Mobile: display 40 · título 28 · subtítulo 17 · corpo 15. Medida de linha do corpo: 60–75 caracteres, alinhado à esquerda, nunca justificado. Distância entre título e texto: 12–24px.

## Ícones

```html
<svg class="eloi-icon eloi-icon--lg" style="color:var(--eloi-rosa)">
  <use href="icones/eloi-icons.svg#eloi-estrategia"></use>
</svg>
```

40 glifos em 4 famílias — A processo da marca, B institucional e conteúdo, C serviço/contato/público, D interface e navegação. Grade 24, traço 2, cantos retos ou quarto de arco, terminações quadradas, preenchimento apenas no ponto de sinal (Lima). Lista completa em `icones/icones.md`.

## Grafismos

Todos derivados da marca, todos em cor cheia: quarto de arco do E (`.eloi-arco`), quadrante (`.eloi-quadrante`), barra segmentada de cinco campos (`.eloi-barra`), barra de troca em três pesos (`.eloi-troca`), malha modular 6 × 3 com células de destaque e bloco de cor em quadrante.

**Bloco de cor nunca entra atrás de texto** — nem de rótulo rebaixado. Ele ocupa canto ou faixa livre.

## Componentes

`.eloi-btn--primario` (Roxo, texto branco) · `.eloi-btn--secundario` (contorno) · `.eloi-btn--destaque` (Lima, texto Tinta) · `.eloi-tag--marca|ok|alerta|info|rascunho` · `.eloi-campo` · `.eloi-card` · `.eloi-painel`. Raios: controle 10, card 14, painel 16, bloco 18, etiqueta 999. Foco de teclado sempre visível: contorno 2px Lima com 2px de deslocamento.

## Ao aplicar em outra marca

Ao usar a identidade ELOI dentro da apresentação de um cliente, ELOI aparece como **autoria**: assinatura no rodapé ou na capa, uma cor de destaque e a tipografia do sistema. A paleta e a marca do cliente continuam sendo as protagonistas — ELOI não compete com elas.
