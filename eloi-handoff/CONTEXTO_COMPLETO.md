# ELOI Studio — contexto completo para o Claude Code

Um arquivo só, com tudo: marca, paleta, tipografia, movimento/animação e iconografia. Se só puder ler um documento antes de tocar no código, é este. Os outros arquivos do pacote (`ELOI_DESIGN_SYSTEM.md`, `COMPONENT_INVENTORY.md`, `ICON_GUIDELINES.md`, `RESPONSIVE_GUIDELINES.md`, `MOBILE_APP_GUIDELINES.md`, `IMPLEMENTATION_GUIDE.md`) aprofundam pontos específicos — este arquivo é autossuficiente para o dia a dia.

## Índice

1. [O que é a ELOI](#1-o-que-é-a-eloi)
2. [As oito regras que não se quebram](#2-as-oito-regras-que-não-se-quebram)
3. [Marca e assinatura](#3-marca-e-assinatura)
4. [Paleta](#4-paleta)
5. [Tipografia](#5-tipografia)
6. [Espaço, forma e grade](#6-espaço-forma-e-grade)
7. [Movimento e animação](#7-movimento-e-animação)
8. [Iconografia — 59 glifos](#8-iconografia--59-glifos)
9. [Componentes](#9-componentes)
10. [Acessibilidade](#10-acessibilidade)
11. [Stack, arquivos e o que não alterar](#11-stack-arquivos-e-o-que-não-alterar)
12. [Checklist antes de considerar uma tela pronta](#12-checklist-antes-de-considerar-uma-tela-pronta)

---

## 1. O que é a ELOI

Estúdio de marca, campanha e produto digital. O painel interno é a operação: clientes, projetos, orçamentos e dinheiro do mês. A assinatura muda de complemento — **Studio** quando fala de marca, **Design** quando fala de produto e serviço. Uma casa, duas frentes.

**Personalidade.** Criativa, curiosa, organizada. Fala direto, sem jargão de agência, em frases curtas. Nomeia etapas, expõe medidas, assume a operação. Número concreto sempre que existir: `11 semanas`, `2 dias úteis`, `59 glifos`.

**Composição.** Alinhamento à esquerda e assimetria — texto encosta na margem, o campo de cor ocupa a direita. Uma ideia dominante por tela, o resto apoia. Cor cheia e aresta definida, nada de vidro, brilho, névoa ou degradê. Hierarquia por tamanho, tom e espaço — nunca por mais peso tipográfico.

**O que torna a ELOI reconhecível.** Assinatura em duas cores com a mesma largura de fonte. Roxo com lima. Chão quase preto arroxeado. Quarto de arco derivado do E. Etiquetas em caixa-alta espaçada. Números em Archivo.

**Evitar sempre.** Degradê · sombra difusa · vidro fosco · cinza neutro · vermelho de erro (o erro é coral) · verde de sucesso (o sucesso é lima) · ícone de biblioteca genérica · emoji na interface · card branco · dashboard de template com quatro caixas iguais em fila · roxo em tudo (é acento de marca, não fundo padrão) · não é corporativo, frio, nem parecido com dashboard comprado.

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

## 3. Marca e assinatura

Nome oficial: **ELOI Studio**. No painel e no produto, a assinatura usada é **ELOI Design**.

**Assinatura principal.** ELOI em Rosa papel `#FDD5D3`, complemento em Lilás `#EEB4E7` (Studio) ou Lima `#DFF806` (Design). Archivo `wdth 72`, peso 700, `line-height: 1.24`. Tracking: `-.02em` em ELOI, `0` no complemento. As duas palavras se tocam, sem espaço.

```html
<span class="marca"><b>ELOI</b><i>Design</i></span>
```

**Variações**

| Variação | Quando | Como |
| --- | --- | --- |
| Horizontal | padrão | ELOI + complemento na mesma linha |
| Empilhada | espaço estreito e alto | complemento sob ELOI, `line-height: 1.05` |
| Compacta | favicon, avatar, ícone de app | ELOI + inicial do complemento |
| Positiva | fundo claro (Rosa papel, Lima, Lilás) | ELOI em Tinta, complemento em Roxo |
| Negativa | fundo escuro | o padrão |
| Monocromática | impressão de uma cor, marca d'água | uma cor só; diferenciação por opacidade 100% e 60% |

**Área de proteção.** X = altura da caixa-alta do E, em todos os lados. **Tamanho mínimo:** 14 px de corpo — abaixo disso, use a variação compacta.

**Usos incorretos.** Mesmo tom nas duas palavras · pesos diferentes entre elas · larguras diferentes · entreletra alterada · distorção de proporção · contorno · sombra · rotação · duas palavras separadas por espaço · complemento acima de ELOI.

Não recomponha em tipo onde houver SVG disponível em `assets/logos/`.

### Arquivos de marca (`assets/logos/`)

| Arquivo | Variação |
| --- | --- |
| `assinatura.svg` | assinatura padrão (negativa, fundo escuro) |
| `assinatura-tinta.svg` | assinatura positiva, ELOI em Tinta — para fundo claro |
| `assinatura-clara.svg` | assinatura clara alternativa |
| `assinatura-lima.svg` | complemento em Lima — contexto "Design" |
| `assinatura-lilas.svg` | complemento em Lilás — contexto "Studio" |
| `assinatura-rosa.svg` | assinatura em Rosa papel |
| `assinatura-roxa.svg` | assinatura em Roxo |
| `simbolo-lima.svg` | símbolo isolado (quarto de arco do E), Lima |
| `simbolo-roxo.svg` | símbolo isolado, Roxo |
| `simbolo-tinta.svg` | símbolo isolado, Tinta |
| `logotipo-original-1..4.svg` | logotipos originais enviados pelo cliente (1080×1080) — fonte de onde a assinatura foi derivada; não usar direto na interface |
| `paleta-referencia.png` | imagem de referência da paleta enviada pelo cliente |

---

## 4. Paleta

Nunca escrever um hex direto num `.tsx` ou `.css` de componente — sempre pelo token. Fonte machine-readable completa (hex + rgb + hsl + uso) em `design-tokens/design-tokens.json` → `colors`.

### Papéis de marca

| Token | Hex | RGB | HSL | Uso |
| --- | --- | --- | --- | --- |
| `--roxo` | `#7D2AE8` | 125 42 232 | 265 81% 54% | marca, botão primário, bloco de cor, série paga |
| `--tinta` | `#1B0647` | 27 6 71 | 258 84% 15% | texto sobre claro, chão do site, texto sobre Lima |
| `--lima` (acento) | `#DFF806` | 223 248 6 | 65 95% 50% | rótulo de seção, valor a receber, foco, confirmação |
| `--coral` | `#FD4400` | 253 68 0 | 16 100% 50% | erro, atraso, sem NF, saída de dinheiro |
| `--azul` | `#5B7CFD` | 91 124 253 | 228 97% 67% | em execução, informação, progresso |
| `--lilas` | `#EEB4E7` | 238 180 231 | 306 60% 82% | complemento "Studio" da assinatura |
| `--rosa` (texto) | `#FDD5D3` | 253 213 211 | 2 88% 91% | texto principal sobre chão escuro |
| `--roxo-claro` | `#9184D9` | 145 132 217 | 249 51% 68% | borda de campo em foco |
| `--marinho` | `#0A0A60` | 10 10 96 | 240 81% 21% | chão alternativo em peça de marca — nunca em interface |

### Chão e superfícies (elevação por tom — não existe sombra de card)

| Token | Hex | Uso |
| --- | --- | --- |
| `--pagina` | `#08011A` | fundo da página, cabeçalho de tabela, trilho de barra |
| `--chao` | `#0D0225` | painel, trilho lateral, campo, card com borda |
| `--chao-2` | `#170B33` | card sem borda, chip inativo, botão de mês |
| `--chao-3` | `#20114A` | hover de card |
| `--linha-tabela` | `#150733` | hover de linha de tabela |
| `--faixa-grupo` | `#0A0132` | faixa de sub-cliente dentro da tabela |

### Texto e bordas

`--texto` `#FDD5D3` corpo/título · `--texto-2` `rgba(253,213,211,.72)` apoio e item inativo · `--texto-3` `.55` legenda · `--texto-4` `.45` rótulo de coluna · `--texto-off` `.35` desabilitado/placeholder.

`--linha` `.12` borda de painel/card · `--linha-fraca` `.07` divisor de tabela · `--linha-forte` `.28` borda de botão secundário · `--linha-campo` `.16` borda de campo.

### Estados de dado — um par [fundo, texto], nunca um quinto

| Estado | Fundo | Texto | Cobre |
| --- | --- | --- | --- |
| Sucesso | `#DFF806` | `#1B0647` | pago, realizado, concluído, aprovado, NF emitida |
| Em andamento | `#5B7CFD` | `#FFFFFF` | em execução, enviado, em revisão |
| Atenção | `#FD4400` | `#FFFFFF` | atrasado, sem NF, exclusão |
| Neutro | `rgba(253,213,211,.12)` | `#FDD5D3` | na fila, aberto, previsto, rascunho |

### Interação

Hover em preenchido: Roxo → `#6A1FD0`. Ativo: `#5A17B0`. Hover em superfície: um passo na escada de tom. Hover em contorno: borda e texto passam a Lima — nunca mude opacidade. Foco: `outline: 2px solid #DFF806; outline-offset: 2px` em tudo que recebe teclado. Selecionado: fundo Lima, texto Tinta. Desabilitado: fundo `rgba(253,213,211,.08)`, texto `rgba(253,213,211,.35)`.

### Gráficos

Série paga `#7D2AE8` · série em aberto `#170B33` com borda `rgba(253,213,211,.22)` · progresso `#5B7CFD` · trilho `#08011A`. Identificador de cliente, nesta ordem: `#7D2AE8`, `#DFF806`, `#5B7CFD`, `#EEB4E7`, `#FD4400` — barra de 8–10 px, nunca avatar redondo com inicial.

### Contraste

Aprovados: Tinta + Lima · Roxo + Rosa papel · Marinho + Azul · Lilás + Roxo · Rosa papel + Coral. Serve para corpo/título: Rosa papel sobre Tinta · Lima sobre Tinta · Tinta sobre Lima ou Lilás · branco sobre Roxo. Só a partir de 24 px: Coral sobre Tinta.

**Proibido:** Lima sobre Roxo · texto a 55% sobre Roxo · `#7D2AE8` como cor de texto sobre chão escuro (contraste 2,4:1 — use Rosa papel ou Lilás).

**Presença por tela:** um bloco de cor dominante (o indicador principal) + acento lima nos rótulos e no que exige ação + resto em escada de tom. Áreas de descanso são obrigatórias. Máximo duas cores dominantes por peça.

---

## 5. Tipografia

Duas famílias variáveis do Google Fonts, sem terceira e sem substituto. Fallback: `system-ui, sans-serif`.

| Família | Papel | Pesos | Eixos | Import |
| --- | --- | --- | --- | --- |
| **Archivo** | marca, títulos, números, dinheiro | 500 · 600 · 700 | `wdth 62..125`, `wght 100..900` | `fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900` |
| **Manrope** | subtítulo, corpo, legenda, interface | 400 · 500 · 600 · 700 | `wght 300..800` | `fonts.googleapis.com/css2?family=Manrope:wght@300..800` |

`wdth 72` só na assinatura; títulos usam `wdth 100`.

### Escala completa

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

**Regras.** Dinheiro sempre em Archivo, nunca em Manrope. Distância entre título e apoio: 12–24 px. Nunca dois pesos altos concorrendo na mesma linha. Texto alinhado à esquerda, nunca justificado nem centralizado em bloco longo. Números tabulares em coluna de valor (`font-variant-numeric: tabular-nums`).

---

## 6. Espaço, forma e grade

**Espaço (px):** 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 26 · 32 · 40 · 56. Gap de grade/lista: 12–20. Padding de card: 16 mobile, 26 desktop. Margem de conteúdo: 16 mobile, 36 desktop.

**Raios (px):** controle 10 · chip 8 · card 14 · painel 16 · bloco 18 · folha 22 (topo) · etiqueta 999 · bloco de cor e barra de identificação: 0.

**Grade.** Painel: trilho de 236 px + conteúdo fluido, máximo 1240 px. Cards de indicador: `repeat(auto-fit, minmax(210px, 1fr))`. Cards de cliente: `repeat(auto-fill, minmax(300px, 1fr))`. Tabela: grade explícita por coluna, título em `minmax(120px, 1fr)`.

**Tamanhos fixos:** alvo de toque mínimo 44 · altura de controle 44 (36 compacto) · trilho desktop 236 · barra mobile 74 · cabeçalho desktop 88, mobile 54 · largura de conteúdo máx. 1240 · largura de texto máx. 68ch.

**Breakpoints (px):** 360 (cel. pequeno) · 390 (cel. padrão) · 430 (cel. grande) · 768 (tablet) · 1024 (notebook) · 1280 (desktop) · 1600 (ampla).

**Grafismos.** Quarto de arco do E · quadrante · barra segmentada de cinco campos · barra de troca em três pesos · malha modular 6×3. Todos em cor cheia. Bloco de cor nunca entra atrás de texto.

---

## 7. Movimento e animação

| Papel | Duração | Curva |
| --- | --- | --- |
| Micro-estado (hover, foco, chip) | 140 ms | `cubic-bezier(.4,0,.2,1)` |
| Transição de componente | 260 ms | `cubic-bezier(.4,0,.2,1)` |
| Folha inferior (sheet) | 280 ms | `cubic-bezier(.32,0,.24,1)` |
| Véu de folha e modal | 220 ms | linear, na opacidade |
| Aviso (toast) | 240 ms na entrada · sai em 2,6 s | `cubic-bezier(.4,0,.2,1)` |
| Assinatura (rolagem do complemento) | ciclo 5,6 s · troca 670 ms | `cubic-bezier(.72,0,.16,1)` |

**Não existe:** rebote, escala em hover, parallax, `ripple`, entrada em cascata de lista, número que conta subindo. Troca de aba não anima o conteúdo.

`prefers-reduced-motion: reduce` desliga animação e transição em tudo — já implementado em `variables.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

### Assinatura — o complemento rola

ELOI fica fixo; o complemento (*Studio*/*Design*) rola verticalmente dentro de uma máscara da altura de uma linha e troca de cor. Loop automático no KV, hover no desktop, toque no mobile.

```css
@keyframes eloi-roll {
  0%, 38%  { transform: translateY(0); }
  50%, 88% { transform: translateY(-50%); }
  100%     { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-anim] { animation: none !important; }
}
```

```html
<span class="marca">
  <b>ELOI</b>
  <span style="display:block; height:1.24em; overflow:hidden">
    <span data-anim style="display:flex; flex-direction:column;
      animation: eloi-roll 5.6s cubic-bezier(.72,0,.16,1) infinite">
      <span style="height:1.24em; line-height:1.24em; color:var(--lilas)">Studio</span>
      <span style="height:1.24em; line-height:1.24em; color:var(--lima)">Design</span>
    </span>
  </span>
</span>
```

No KV completo, ELOI também respira levemente com a troca (`eloi-squeeze`) e uma barra de progresso acompanha o ciclo (`eloi-bar`) — opcional fora das peças de marca:

```css
@keyframes eloi-squeeze {
  0%, 36%  { transform: scaleX(1); }
  44%      { transform: scaleX(1.06); }
  50%, 86% { transform: scaleX(1); }
  94%      { transform: scaleX(1.06); }
  100%     { transform: scaleX(1); }
}
@keyframes eloi-bar {
  0%, 38%  { transform: scaleX(1); }
  44%      { transform: scaleX(.12); }
  50%, 88% { transform: scaleX(1); }
  94%      { transform: scaleX(.12); }
  100%     { transform: scaleX(1); }
}
```

Fora do KV — em hover de desktop ou toque de mobile — troque o `infinite` por uma transição de estado disparada por evento: `transition: transform 500ms cubic-bezier(.72,0,.16,1); transform: translateY(-50%)` quando `:hover`/ativo.

### Folha (sheet, mobile)

```css
.folha {
  transform: translateY(102%);
  transition: transform 280ms cubic-bezier(.32,0,.24,1);
  border-radius: 22px 22px 0 0;
}
.folha[data-aberta] { transform: translateY(0); }
```

### Véu (modal e folha)

```css
.veu {
  opacity: 0;
  pointer-events: none;
  background: rgba(8,1,26,.72);
  backdrop-filter: blur(5px);
  transition: opacity 220ms linear;
}
.veu[data-aberto] { opacity: 1; pointer-events: auto; }
```

### Menu lateral (mobile)

```css
.menu-lateral {
  transform: translateX(-100%);
  transition: transform 260ms cubic-bezier(.4,0,.2,1);
}
.menu-lateral[data-aberto] { transform: translateX(0); }
```

### Aviso (toast)

```css
.aviso {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 240ms cubic-bezier(.4,0,.2,1), transform 240ms cubic-bezier(.4,0,.2,1);
}
.aviso[data-visivel] { opacity: 1; transform: translateY(0); }
/* remova data-visivel após 2.6s para sair */
```

### Esqueleto

Pulsa `.35 → .7 → .35` em 1,4 s, com defasagem de 200 ms por linha. Reproduz a forma do conteúdo real — nunca um retângulo genérico.

```css
@keyframes eloi-skel { 0% { opacity: .35; } 50% { opacity: .7; } 100% { opacity: .35; } }
.skel { background: rgba(253,213,211,.14); animation: eloi-skel 1.4s ease-in-out infinite; }
```

```html
<span class="skel" style="width:70%; height:11px"></span>
<span class="skel" style="width:45%; height:9px; animation-delay:.2s"></span>
```

---

## 8. Iconografia — 59 glifos

Sprite único: `assets/icons/eloi-icons.svg` — um `<symbol>` por ícone. Nenhuma biblioteca externa (Phosphor, Lucide, Material e afins ficam fora do projeto). Nunca emoji como ícone.

```html
<svg class="icone" aria-hidden="true"><use href="/eloi-icons.svg#eloi-dinheiro"></use></svg>
```

```css
.icone {
  width: 20px; height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: miter;
  stroke-linecap: square;
}
```

O traço herda `currentColor` — a cor vem do texto ao redor. O **ponto de sinal** (um único elemento por ícone) usa `var(--eloi-signal, #DFF806)`. Ícone com significado próprio: `role="img"` + `aria-label`. Ao lado de rótulo escrito: `aria-hidden="true"`.

### Regras de desenho (para qualquer glifo novo)

Grade 24×24, folga mínima 2 px · traço 2 px, `fill: none`, `stroke-linejoin: miter`, terminação quadrada · cantos retos de 90° ou quarto de arco, nunca arredondado suave · preenchimento só no ponto de sinal, em Lima · sem sombra, contorno duplo, degradê, rotação ou perspectiva · formas primárias: quadrado, círculo, quarto de arco, linha reta, diagonal a 45° · peso óptico constante entre vizinhos na mesma barra.

Se faltar um ícone: confira a tabela abaixo primeiro. Se realmente faltar, desenhe pelas regras, acrescente o `<symbol>` ao sprite, salve o SVG individual na pasta da função e registre em `assets/icons/README.md`. Um ícone sem entrada na lista não existe.

### Tamanhos

| Tamanho (px) | Onde |
| --- | --- |
| 16–17 | dentro de botão e chip |
| 18 | item de trilho |
| 20 | ação em linha de tabela, campo |
| 21 | barra inferior mobile |
| 24 | padrão de conteúdo |
| 30–34 | estado vazio |
| 40 | destaque em card de marca |

Abaixo de 16 px o traço de 2 px fecha o desenho — não use.

### Cor e estados

Padrão `currentColor` · inativo `--texto-3` (55%) · ativo/selecionado `--lima` · hover para `--texto` ou Lima conforme o componente · sobre fundo escuro Rosa papel ou Lima · sobre fundo claro (Lima/Rosa/Lilás) Tinta · sobre Roxo cheio branco · estado de dado acompanha a cor do estado (Lima ok, Azul andamento, Coral atenção). Nunca reduzir opacidade para indicar inatividade dentro de botão desabilitado — o botão inteiro já cai para o tratamento de desabilitado.

### Inventário completo — por pasta (`assets/icons/<pasta>/`)

**brand** (6) — processo da marca
`eloi-estrategia` estratégia · `eloi-direcao` direção · `eloi-execucao` execução · `eloi-entrega` entrega · `eloi-iteracao` iteração · `eloi-aprovacao` aprovação

**projects** (5) — projetos e prazos
`eloi-projetos` projetos · `eloi-cronograma` cronograma · `eloi-calendario` calendário · `eloi-campanha` campanha · `eloi-briefing` briefing

**clients** (8) — cliente e público
`eloi-cliente` cliente · `eloi-atendimento` atendimento · `eloi-contato` contato · `eloi-telefone` telefone · `eloi-redes-sociais` redes sociais · `eloi-localizacao` localização · `eloi-populacao` população · `eloi-acessibilidade` acessibilidade

**finance** (6) — dinheiro
`eloi-dinheiro` dinheiro · `eloi-nota-fiscal` nota fiscal · `eloi-caixa` caixa · `eloi-pagamento` pagamento · `eloi-grafico` gráfico · `eloi-resultados` resultados

**status** (6) — estado de sistema
`eloi-ok` sucesso · `eloi-alerta` atenção · `eloi-erro` erro · `eloi-info` informação · `eloi-pendente` pendente · `eloi-notificacao` notificação

**actions** (9) — ações de registro
`eloi-adicionar` adicionar · `eloi-filtro` filtro · `eloi-pesquisa` pesquisa · `eloi-editar` editar · `eloi-excluir` excluir · `eloi-salvar` salvar · `eloi-upload` enviar arquivo · `eloi-baixar` baixar · `eloi-compartilhar` compartilhar

**navigation** (7) — interface e navegação
`eloi-menu` menu · `eloi-avancar` avançar · `eloi-voltar` voltar · `eloi-expandir` expandir · `eloi-fechar` fechar · `eloi-navegacao` navegação · `eloi-link-externo` link externo

**files** (3) — documentos e conteúdo
`eloi-documentos` documentos · `eloi-noticias` notícias · `eloi-comunicacao` comunicação

**settings** (3) — configuração
`eloi-configuracoes` configurações · `eloi-sair` sair · `eloi-usuario` usuário

**tematicos** (6) — institucional
`eloi-institucional` institucional · `eloi-educacao` educação · `eloi-cultura` cultura · `eloi-saude` saúde · `eloi-bem-estar` bem-estar · `eloi-servicos` serviços

### Inventário por contexto de uso

| Contexto | Ícone |
| --- | --- |
| Trilho: Hoje / Painel | `eloi-estrategia` |
| Trilho: Projetos / Serviços | `eloi-projetos` |
| Trilho: Clientes | `eloi-cliente` |
| Trilho: Dinheiro | `eloi-dinheiro` |
| Trilho: Briefings | `eloi-briefing` |
| Trilho: Entregas | `eloi-entrega` |
| Trilho: Orçamentos | `eloi-documentos` |
| Sair | `eloi-sair` |
| Nova entidade | `eloi-adicionar` |
| Buscar / Filtrar | `eloi-pesquisa` / `eloi-filtro` |
| Período | `eloi-calendario` |
| NF emitida / sem NF | `eloi-ok` / `eloi-erro` |
| Pagamento / Caixa / Faturamento | `eloi-pagamento` / `eloi-caixa` / `eloi-grafico` |
| Prazo previsto | `eloi-pendente` |
| Erro de carregamento / Aviso informativo | `eloi-alerta` / `eloi-info` |
| Notificações | `eloi-notificacao` |
| Editar / Excluir / Salvar | `eloi-editar` / `eloi-excluir` / `eloi-salvar` |
| Enviar / Baixar arquivo | `eloi-upload` / `eloi-baixar` |
| Abrir externo | `eloi-link-externo` |
| Voltar / Avançar / Expandir / Fechar | `eloi-voltar` / `eloi-avancar` / `eloi-expandir` / `eloi-fechar` |

---

## 9. Componentes

Anatomia completa, valores e estados em `COMPONENT_INVENTORY.md`. Resumo por família — reutilize antes de criar algo novo.

**Navegação.** Trilho lateral desktop (236 px, item 44 px, ativo com barra de 3 px em Lima na aresta) · trilho recolhido (72 px, só ícone) · barra inferior mobile (74 px + safe-area, 5 colunas, botão central de criação 56×56 elevado) · cabeçalho (desktop 88 px com etiqueta+título+período+ação; mobile 54 px com menu+assinatura+chip de mês) · abas em pílula (máx. 4) · busca global · seletor de período · menu contextual/dropdown (raio 14, sem animação de escala) · breadcrumbs (só em ficha de cliente/detalhe de projeto).

**Ações.** Botões primário (Roxo) · destaque (Lima, dentro de folha/modal) · secundário (contorno) · terciário/ghost · destrutivo (Coral, sempre com confirmação em folha) · ícone (36 desktop / 44 toque). Altura mínima 44 (36 compacto), raio 10. Nunca dois primários lado a lado.

**Conteúdo.** Card de indicador (raio 16, um por tela pode ser Roxo cheio) · card de cliente (barra identificadora de cor) · card de projeto/serviço mobile (é a tabela abaixo de 768 px) · card financeiro/caixa (carrossel no mobile) · painel · tabela (grupo por sub-cliente, valor alinhado à direita em Archivo tabular) · lista · barra de progresso/ranking (nunca rosca, nunca % sem valor absoluto) · gráfico de colunas empilhadas (pago em Roxo, aberto em `--chao-2`) · timeline · calendário · vazio (borda tracejada, nunca ilustração) · tooltip (só desktop).

**Formulários.** Campo (altura mín. 48, raio 10) · rótulo (etiqueta 11/700/.14em) · textarea · select (pílulas se ≤4 opções curtas) · autocomplete · checkbox/radio (20×20, quadrado reto/circular) · switch (trilho 50×28) · upload (área tracejada) · data (`dd/mm/aaaa`, nativo no mobile) · valor (Archivo, `R$` fixo, cents) · filtros (pílulas, rolagem horizontal no mobile) · validação ao sair do campo, erro em Coral com `role="alert"`.

**Feedback.** Toast (Lima sucesso / Coral erro, 240 ms entrada, sai 2,6 s) · modal desktop (máx. 520 px, raio 18) · folha mobile (raio 22 topo, alça 46×4, máx. 86% da altura) · confirmação de exclusão (Manter em contorno, Excluir em Coral — nunca a ação destrutiva como primária visual) · progresso (Azul) · esqueleto (reproduz a forma real) · erro (painel com borda Coral + "Tentar de novo") · sem conexão (mesmo painel de erro, com nota de dados do último acesso).

**Ordem de construção:** `Botao` → `Chip`/`Etiqueta` → `Campo` (+`Rotulo`) → `Card` → `Painel` → `Tabela` → `Lista` → `Folha`/`Modal` → `Aviso` → `Esqueleto`. Componente novo só existe se aparecer duas vezes, usa só tokens, nasce com hover/foco/ativo/desabilitado/carregando/vazio, e entra no `COMPONENT_INVENTORY.md` no mesmo commit.

---

## 10. Acessibilidade

Contraste apenas nos pares aprovados da seção 4 — Coral e Roxo não servem para texto pequeno. Foco visível em tudo: anel Lima de 2 px, offset 2 px, nunca `outline: none` sem substituto. Estado nunca só por cor: todo chip tem rótulo escrito; NF usa ícone além da cor. Alvo de toque 44 px mínimo sempre, incluindo chip de filtro, item de menu e botão de ícone. Formulário: `label` visível acima do campo, erro em texto abaixo (Coral, 13 px, `role="alert"`), nunca só borda vermelha. Semântica correta: `button` para ação, `a` para navegação, `nav`/`main`/`aside`, `table` de verdade. Valor monetário com `aria-label` legível (`R$ 4.800,00`); ícone decorativo com `aria-hidden="true"`. `prefers-reduced-motion` sempre respeitado.

---

## 11. Stack, arquivos e o que não alterar

**Stack — não trocar.** React 19 · TypeScript · Vite · react-router-dom 7 · CSS próprio com variáveis em `app/src/ui/`. Sem Tailwind, sem biblioteca de componentes, sem biblioteca de ícones, sem CSS-in-JS novo. Nenhuma dependência nova sem justificativa técnica real.

**Onde as coisas vivem neste pacote.**
- `design-tokens/design-tokens.json` — fonte principal de valores (machine-readable).
- `design-tokens/variables.css` — pronto para substituir `app/src/ui/tokens.css`.
- `design-tokens/tokens.ts` — os mesmos valores tipados para uso em JS (chips, cor de cliente, durações).
- `assets/icons/eloi-icons.svg` — sprite; `assets/icons/<pasta>/*.svg` — individuais.
- `assets/logos/` — assinatura, símbolo e logotipos originais.
- `references/*.dc.html` — os quatro protótipos aprovados; abra direto no navegador. Recrie o que mostram em React/TS — não copie o HTML.

**Referências aprovadas.** `references/Eloi KV Completo.dc.html` (identidade) · `references/Gestao Eloi.dc.html` (painel desktop) · `references/Gestao Eloi Mobile.dc.html` (toque) · `references/Site Eloi 2026.dc.html` (institucional).

**Não altere.**
- `app/src/lib/` e `app/src/domain/` — lógica testada. Estilo não justifica mexer em assinatura de função.
- Formatação de dinheiro (`dinheiro.ts`). Dinheiro é cents inteiros, exceto `orcamentos.valor_total`, que é numeric em reais.
- Rotas, nomes de tela e vocabulário do domínio (`CONTEXT.md` da raiz): Cliente, Sub-cliente, Projeto, Etapa, Decisão, Caixa, Movimento, Convite.
- Contratos das edge functions.
- `admin-app/` e páginas HTML estáticas da raiz — legado congelado.

**Mobile não é o desktop encolhido.** Barra inferior com botão central de criação, menu em folha, tabela virada em cartão, modal virado em folha, menos informação por tela. Detalhes em `MOBILE_APP_GUIDELINES.md` e `RESPONSIVE_GUIDELINES.md`.

**Telas sem referência aprovada:** Relatórios, Arquivos e Configurações não existem no painel aprovado — não têm design ainda. Não invente a interface; peça a referência antes de construir.

---

## 12. Checklist antes de considerar uma tela pronta

1. Toda cor vem de token? Nenhum hex solto?
2. A escala tipográfica é a do sistema, e o dinheiro está em Archivo?
3. Um único bloco de cor dominante, com áreas de descanso?
4. Elevação por tom, sem nenhuma sombra?
5. Todo estado tem rótulo escrito, e não só cor?
6. Hover, foco (anel Lima de 2 px), ativo, desabilitado, carregando, vazio e erro existem?
7. Alvos de 44 px?
8. Funciona em 360, 390, 768 e 1280?
9. Com `prefers-reduced-motion` ativo, nada se move?
10. Passa lado a lado com a referência aprovada sem parecer de outro produto?

Falhou em qualquer uma: não está pronta. Versão longa em `prompts/VISUAL_REVIEW_CHECKLIST.md`.
