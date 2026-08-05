# Responsividade

Sete faixas oficiais. O painel não é o desktop encolhido: entre 767 e 768 px a interface troca de estrutura, não de escala.

| Faixa | Largura | Layout |
| --- | --- | --- |
| Celular pequeno | 320–359 | uma coluna, margem 12, barra inferior |
| Celular padrão | 360–429 | uma coluna, margem 16, barra inferior |
| Celular grande | 430–767 | uma coluna, margem 16, cards de indicador em 2 colunas |
| Tablet | 768–1023 | trilho recolhido (72 px), conteúdo em 2 colunas, tabela volta com colunas reduzidas |
| Notebook | 1024–1279 | trilho completo (236 px), tabela completa, cards em 3 colunas |
| Desktop | 1280–1599 | conteúdo até 1240, cards em 4 colunas |
| Ampla | ≥1600 | conteúdo centralizado em 1240, margens crescem; nada estica |

## O que muda em cada faixa

**Navegação.** ≤767: barra inferior de 74 px com 5 destinos e botão central de criação; menu lateral em folha, aberto pelo botão de menu. 768–1023: trilho recolhido, só ícone. ≥1024: trilho completo com rótulos, criação rápida e Sair.

**Colunas.** Indicadores: 1 (≤359) · 2 (360–767) · 3 (768–1279) · 4 (≥1280). Cards de cliente: `auto-fill` com mínimo de 300. Painel de gráfico + ranking: empilhado até 1023, `1.5fr / 1fr` acima.

**Margens.** 12 · 16 · 16 · 24 · 32 · 36 · 36. Padding de card: 16 até 767, 26 acima. Gap de grade: 12 até 767, 16 acima.

**Tipografia.** Título de página 27 → 32 em 768. Valor grande 24 → 30 em 768 → 34 em 1280. Corpo 15 → 16 em 768. Etiquetas não mudam.

**Cards.** No mobile perdem 10 px de padding e ganham hierarquia vertical: rótulo, valor, nota. O card dominante em Roxo continua sendo um só.

**Tabelas.** ≤767 não existe tabela: cada linha vira um card com título, valor, chips e data. 768–1023: colunas de execução e pagamento viram um chip só, com o segundo estado em texto de 11 px. ≥1024: tabela completa, agrupamento por sub-cliente visível.

**Gráficos.** ≤767: altura 140, rótulo do total só na coluna do mês corrente. ≥768: altura 180, rótulo em todas.

**Modais.** ≤767: folha inferior de largura total, alça, altura máxima 86%. ≥768: modal centralizado de até 520 px.

**Formulários.** ≤767: uma coluna, campos de 48 px, teclado numérico em campo de valor (`inputMode="decimal"`). ≥768: pares de campos em 2 colunas, campos de 44 px.

**Menus.** ≤767: folha. ≥768: dropdown ancorado.

**Densidade.** O mobile mostra menos: a home de toque traz resumo, decisões, execução e atalhos — não os quatro indicadores, o gráfico, o ranking e a lista de orçamentos do desktop. Menos informação por tela é decisão de projeto, não limitação.

## Regras de escrita

- Consulte as faixas por `min-width` a partir do mobile. O CSS base é o mobile.
- Nada de largura fixa em componente: `min-width: 0` em item de grade e `overflow: hidden` + `text-overflow: ellipsis` em texto de uma linha.
- `env(safe-area-inset-bottom)` na barra inferior e `env(safe-area-inset-top)` quando houver cabeçalho fixo em tela cheia.
- Alvo de toque de 44 px vale em todas as faixas, inclusive no desktop.
- Rolagem horizontal só para carrossel de caixas e trilha de filtros — nunca para tabela.
- Teste em 360 × 640, 390 × 844, 430 × 932, 768 × 1024, 1280 × 800 e 1600 × 900.
