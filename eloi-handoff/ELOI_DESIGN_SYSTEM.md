# ELOI DESIGN SYSTEM

Sistema visual da **ELOI Studio**, extraído do KV Completo aprovado em 04/08/2026. Valores legíveis por máquina em `design-tokens/design-tokens.json`. Este documento explica o porquê e o como.

---

## 1. Essência

**Conceito.** A ELOI resolve marca com decisão, não com volume. O sistema mostra o trabalho por dentro: nomeia etapas, expõe medidas, assume a operação. A assinatura muda de complemento — *Studio* quando fala de marca, *Design* quando fala de produto e serviço — e essa troca é a ideia central: uma casa, duas frentes.

**Personalidade.** Criativa, curiosa, organizada. Fala direto, sem jargão de agência. Afirma em frases curtas.

**Atributos.** Iniciativa · inteligência · organização · personalidade · clareza.

**Princípios de composição.**
- Alinhamento à esquerda e assimetria. Texto encosta na margem; o campo de cor ocupa a direita.
- Uma ideia dominante por tela. O resto apoia.
- Cor cheia e aresta definida. Nada de vidro, brilho, névoa ou degradê.
- Hierarquia por tamanho, tom e espaço — nunca por mais peso tipográfico.
- Número concreto sempre que existir: `11 semanas`, `2 dias úteis`, `59 glifos`.

**O que deve transmitir.** Que existe um sistema por trás, e que ele é operado por alguém que sabe o que está fazendo.

**O que torna a ELOI reconhecível.** A assinatura em duas cores com a mesma largura de fonte. O roxo com o lima. O chão quase preto arroxeado. O quarto de arco derivado do E. Etiquetas em caixa-alta espaçada. Números em Archivo.

**Preservar sempre.** As oito regras da seção 2. A escala tipográfica. O par de famílias. O acento lima como sinal de interface. A elevação por tom.

**Evitar.** Degradê. Sombra difusa. Vidro fosco. Cinza neutro. Vermelho de erro (o erro é coral) e verde de sucesso (o sucesso é lima). Ícone de biblioteca genérica. Emoji na interface. Card branco. Dashboard de template com quatro caixas iguais em fila. Roxo em tudo — o roxo é acento de marca, não fundo padrão.

---

## 2. As oito regras que não se quebram

1. **ELOI é fixo.** *Studio* e *Design* são complementos intercambiáveis. Nunca os dois juntos.
2. **ELOI e o complemento nunca na mesma cor.** Sempre dois tons da paleta.
3. **Mesma largura de fonte nas duas palavras:** Archivo `wdth 72`, peso 700.
4. **Sem degradê.** Em nenhuma superfície.
5. **Só Archivo e Manrope.**
6. **Duas cores dominantes por peça**, no máximo.
7. **Caixa-alta só em etiqueta curta**, com `letter-spacing: .20em`.
8. **Sem sombra.** Elevação é diferença de tom.

---

## 3. Uso do nome

Nome oficial: **ELOI Studio**. No painel e no produto, a assinatura usada é **ELOI Studio**.

**Assinatura principal.** ELOI em Rosa papel `#FDD5D3`, complemento em Lilás `#EEB4E7` (Studio) ou Lima `#DFF806` (Design). Archivo `wdth 72`, peso 700, `line-height: 1.24`. Tracking: −.02em em ELOI, 0 no complemento. As duas palavras se tocam, sem espaço.

```html
<span class="marca">
  <b>ELOI</b><i>Design</i>
</span>
```

**Variações.**

| Variação | Quando | Como |
| --- | --- | --- |
| Horizontal | padrão | ELOI + complemento na mesma linha |
| Empilhada | espaço estreito e alto | complemento sob ELOI, `line-height: 1.05` |
| Compacta | favicon, avatar, ícone de app | ELOI + inicial do complemento |
| Positiva | fundo claro (Rosa papel, Lima, Lilás) | ELOI em Tinta, complemento em Roxo |
| Negativa | fundo escuro | o padrão |
| Monocromática | impressão de uma cor, marca d'água | uma cor só, e aí a diferenciação é por opacidade: 100% e 60% |

**Área de proteção.** X = altura da caixa-alta do E, em todos os lados. Nada entra nessa faixa.

**Tamanho mínimo.** 14 px de corpo. Abaixo disso, use a variação compacta.

**Usos incorretos.** Mesmo tom nas duas palavras · pesos diferentes entre elas · larguras diferentes · entreletra alterada · distorção de proporção · contorno · sombra · rotação · duas palavras separadas por espaço · complemento acima de ELOI.

**Animação.** ELOI fica; o complemento rola verticalmente dentro de uma máscara da altura da linha e troca de cor. Ciclo 5,6 s, transição 670 ms, `cubic-bezier(.72,0,.16,1)`, deslocamento de uma linha. Loop automático no KV, hover no desktop, toque no mobile. Com `prefers-reduced-motion: reduce` a rolagem desliga e as duas assinaturas aparecem estáticas.

---

## 4. Cor

Referência completa com RGB, HSL e uso em `design-tokens/design-tokens.json` → `colors`.

### Papéis

| Papel | Token | Hex | Onde entra |
| --- | --- | --- | --- |
| Principal | `--roxo` | `#7D2AE8` | marca, botão primário, bloco de cor, série paga |
| Principal escura | `--tinta` | `#1B0647` | texto sobre claro, chão do site, texto sobre Lima |
| Acento / sinal | `--lima` | `#DFF806` | rótulo de seção, valor a receber, foco, confirmação |
| Alerta | `--coral` | `#FD4400` | erro, atraso, sem NF, saída de dinheiro |
| Informação | `--azul` | `#5B7CFD` | em execução, enviado, progresso |
| Complemento | `--lilas` | `#EEB4E7` | assinatura Studio, terceiro identificador |
| Texto | `--rosa` | `#FDD5D3` | corpo e título sobre chão escuro |
| Borda de foco | `--roxo-claro` | `#9184D9` | campo em foco |
| Chão alternativo | `--marinho` | `#0A0A60` | peça de marca, nunca interface |

### Chão e superfícies

| Token | Hex | Uso |
| --- | --- | --- |
| `--pagina` | `#08011A` | fundo da página, cabeçalho de tabela, trilho de barra |
| `--chao` | `#0D0225` | painel, trilho lateral, campo, card com borda |
| `--chao-2` | `#170B33` | card sem borda, chip inativo, botão de mês |
| `--chao-3` | `#20114A` | hover de card |
| `--faixa-grupo` | `#0A0132` | faixa de sub-cliente na tabela |
| `--linha-hover` | `#150733` | hover de linha de tabela |

Elevação é essa escada de tom. Não existe sombra de card.

### Texto

`--texto` `#FDD5D3` para corpo e título · `--texto-2` 72% para item inativo e apoio · `--texto-3` 55% para legenda · `--texto-4` 45% para cabeçalho de coluna · `--texto-off` 35% para desabilitado e placeholder.

### Bordas

`--linha` `rgba(253,213,211,.12)` em painel e card · `--linha-fraca` `.07` em divisor de tabela · `--linha-forte` `.28` em botão secundário · `--linha-campo` `.16` em campo.

### Estados de dado

Um par [fundo, texto] por estado. Nunca invente um sexto.

| Estado | Fundo | Texto | Cobre |
| --- | --- | --- | --- |
| Sucesso | `#DFF806` | `#1B0647` | pago, realizado, concluído, aprovado, NF emitida |
| Em andamento | `#5B7CFD` | `#FFFFFF` | em execução, enviado, em revisão |
| Atenção | `#FD4400` | `#FFFFFF` | atrasado, sem NF, exclusão |
| Neutro | `rgba(253,213,211,.12)` | `#FDD5D3` | na fila, aberto, previsto, rascunho |

### Interação

- **Hover em preenchido:** Roxo → `#6A1FD0`. Ativo: `#5A17B0`.
- **Hover em superfície:** um passo na escada de tom (`#170B33` → `#20114A`).
- **Hover em contorno:** borda e texto passam a Lima. Nunca mude opacidade.
- **Foco:** `outline: 2px solid #DFF806; outline-offset: 2px` em tudo que recebe teclado.
- **Selecionado:** fundo Lima, texto Tinta.
- **Desabilitado:** fundo `rgba(253,213,211,.08)`, texto `rgba(253,213,211,.35)`, cursor default.

### Gráficos

Série paga `#7D2AE8` · série em aberto `#170B33` com borda `rgba(253,213,211,.22)` · progresso `#5B7CFD` · trilho `#08011A`. Identificador de cliente, nesta ordem: Roxo, Lima, Azul, Lilás, Coral — uma barra de 8–10 px, nunca um avatar redondo com inicial.

### Combinações e contraste

Pares aprovados: Tinta + Lima · Roxo + Rosa papel · Marinho + Azul · Lilás + Roxo · Rosa papel + Coral.

Serve para corpo e título: Rosa papel sobre Tinta · Lima sobre Tinta · Tinta sobre Lima ou Lilás · branco sobre Roxo.
Só a partir de 24 px: Coral sobre Tinta.
Proibido: Lima sobre Roxo · texto rebaixado a 55% sobre Roxo · Roxo `#7D2AE8` como cor de texto sobre chão escuro (2,4:1 — use Rosa papel ou Lilás).

**Presença.** A tela não é branca nem cinza: o chão é escuro e a cor entra em bloco cheio. Mas o roxo não vai em tudo. Por tela: um bloco de cor dominante (o indicador principal), o acento lima nos rótulos e no que exige ação, o resto em escada de tom. As áreas de descanso são obrigatórias.

---

## 5. Tipografia

Duas famílias variáveis, do Google Fonts. Sem terceira, sem substituto.

| Família | Papel | Pesos | Eixos |
| --- | --- | --- | --- |
| **Archivo** | marca, títulos, números e dinheiro | 500 · 600 · 700 | `wdth 62..125`, `wght 100..900` |
| **Manrope** | subtítulo, corpo, legenda, interface | 400 · 500 · 600 · 700 | `wght 300..800` |

Fallback: `system-ui, sans-serif`. `wdth 72` só na assinatura; títulos usam `wdth 100`.

### Escala

| Nível | Família | Peso | Desktop | Mobile | Tracking | Onde |
| --- | --- | --- | --- | --- | --- | --- |
| Display | Archivo | 700 | 72 / 1.05 | 40 | −.03em | capa de KV |
| Hero | Archivo | 700 | 54 / 1.06 | 34 | −.03em | hero do site |
| H1 | Archivo | 600 | 44 / 1.10 | 28 | −.02em | título de seção |
| Título de página | Archivo | 600 | 32 / 1.10 | 27 | −.02em | cabeçalho do painel |
| H2 | Archivo | 600 | 28 / 1.20 | 22 | −.01em | subtítulo de bloco |
| Título de card | Archivo | 600 | 20 / 1.25 | 18 | −.01em | nome de cliente |
| Subtítulo | Manrope | 500 | 20 / 1.45 | 17 | 0 | linha de apoio do hero |
| Corpo | Manrope | 400 | 16 / 1.65 | 15 | 0 | texto corrido, 60–75 caracteres |
| Corpo de interface | Manrope | 600 | 14 / 1.4 | 14 | 0 | menu, linha de tabela, botão |
| Texto secundário | Manrope | 400 | 13 / 1.5 | 13 | 0 | apoio de card |
| Legenda | Manrope | 400 | 12 / 1.5 | 12 | 0 | nota, data, meta |
| Etiqueta | Manrope | 700 | 11 | 11 | .20em, caixa-alta | rótulo de seção |
| Etiqueta mini | Manrope | 700 | 10 | 10 | .16em, caixa-alta | cabeçalho de coluna |
| Valor grande | Archivo | 700 | 34 / 1 | 24 | −.03em | indicador financeiro |
| Valor | Archivo | 600 | 17 / 1.2 | 16 | 0 | dinheiro em lista |
| Chip | Manrope | 600 | 11 | 11 | 0 | etiqueta de estado |
| Mensagem | Manrope | 600 | 13 / 1.5 | 13 | 0 | aviso, erro de campo, toast |

### Regras

- Dinheiro sempre em Archivo. Em Manrope, nunca.
- Distância entre título e texto de apoio: 12 a 24 px.
- Nunca dois pesos altos concorrendo na mesma linha.
- Texto alinhado à esquerda. Nunca justificado, nunca centralizado em bloco longo.
- Números tabulares em coluna de valor (`font-variant-numeric: tabular-nums`).

---

## 6. Espaço, forma e grade

**Escala de espaço** (px): 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 26 · 32 · 40 · 56. Gap de grade e de lista: 12 a 20. Padding de card: 16 no mobile, 26 no desktop. Margem de conteúdo: 16 no mobile, 36 no desktop.

**Raios.** Controle 10 · chip 8 · card 14 · painel 16 · bloco 18 · folha 22 (topo) · etiqueta 999. Bloco de cor e barra de identificação: 0.

**Grade.** Painel: trilho de 236 px + conteúdo fluido, máximo 1240 px. Cards de indicador: `repeat(auto-fit, minmax(210px, 1fr))`. Cards de cliente: `repeat(auto-fill, minmax(300px, 1fr))`. Tabela: grade explícita por coluna, com a coluna de título em `minmax(120px, 1fr)`.

**Grafismos.** Quarto de arco do E · quadrante · barra segmentada de cinco campos · barra de troca em três pesos · malha modular 6 × 3. Todos em cor cheia. Bloco de cor nunca entra atrás de texto.

---

## 7. Movimento

| Papel | Duração | Curva |
| --- | --- | --- |
| Micro-estado (hover, foco, chip) | 140 ms | `cubic-bezier(.4,0,.2,1)` |
| Transição de componente | 260 ms | `cubic-bezier(.4,0,.2,1)` |
| Folha inferior | 280 ms | `cubic-bezier(.32,0,.24,1)` |
| Véu de folha e modal | 220 ms | linear na opacidade |
| Aviso (toast) | 240 ms na entrada, sai em 2,6 s | `cubic-bezier(.4,0,.2,1)` |
| Assinatura | ciclo 5,6 s, troca 670 ms | `cubic-bezier(.72,0,.16,1)` |

Padrões: folha entra por `translateY(102%) → 0`; menu por `translateX(-100%) → 0`; véu por opacidade com `blur(5px)`; esqueleto pulsa `.35 → .7 → .35` em 1,4 s com defasagem de 200 ms por linha; troca de aba não tem animação de conteúdo.

`prefers-reduced-motion: reduce` desliga animação e transição em tudo. Já está no `variables.css`.

Não existe: rebote, escala em hover, parallax, `ripple`, entrada em cascata de lista, número que conta subindo.

---

## 8. Acessibilidade

- Contraste: corpo apenas nos pares aprovados da seção 4. Coral e Roxo não servem para texto pequeno.
- Foco visível em tudo: anel lima de 2 px com offset de 2 px. Nunca `outline: none` sem substituto.
- Estado nunca só por cor: todo chip tem rótulo escrito, e NF usa ícone além da cor.
- Alvo de toque: 44 px mínimo, sempre. No mobile isso vale para chip de filtro, item de menu e botão de ícone.
- Formulário: `label` visível acima do campo, mensagem de erro em texto abaixo (Coral, 13 px, `role="alert"`), nunca só borda vermelha.
- Semântica: `button` para ação, `a` para navegação, `nav`/`main`/`aside`, `table` para tabela de verdade. No protótipo há `span` clicável por limitação da ferramenta de design — no código use o elemento correto.
- Leitor de tela: valor monetário com `aria-label` legível (`R$ 4.800,00`), ícone decorativo com `aria-hidden="true"`.
- Redução de movimento respeitada.

---

## 9. Arquivos deste sistema

- `design-tokens/design-tokens.json` — fonte principal.
- `design-tokens/variables.css` — o que o CSS consome.
- `design-tokens/tokens.ts` — o que o JS consome (chips, cores de cliente, durações).
- `assets/icons/` — sprite + SVGs por função.
- `assets/logos/` — assinatura, símbolo e logotipos originais.
- `references/` — os quatro protótipos aprovados.
