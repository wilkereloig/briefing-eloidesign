# ELOI Studio — versão de toque

Referência: `references/Gestao Eloi Mobile.dc.html`. Abra e navegue: a barra inferior, o menu, as folhas, a busca e os filtros funcionam.

Web responsiva com comportamento de aplicativo. Não é app nativo e não deve virar um agora.

---

## Estrutura

Tela de referência: 390 × 844.

```
┌─────────────────────────────┐
│ status do sistema        44 │
│ menu · ELOI Studio · ago 26 │ 54
├─────────────────────────────┤
│                             │
│ conteúdo — rolagem vertical │
│ padding 18/16, base 118     │
│                             │
├─────────────────────────────┤
│ Início Serviços (+) Cli Din │ 74 + safe area
└─────────────────────────────┘
```

**Cabeçalho** 54 px: botão de menu (44 × 44), assinatura em 17 px no centro, chip de mês à direita. Não cresce, não some na rolagem.

**Barra inferior** 74 px + `env(safe-area-inset-bottom)`: Início · Serviços · **+** · Clientes · Dinheiro. O botão central de 56 × 56 em Roxo, raio 16, borda de 4 px na cor da página, elevado 16 px — abre a folha "Criar".

**Menu lateral** em folha de 278 px, entra por `translateX(-100%) → 0` em 260 ms: os quatro destinos, depois Orçamentos, Briefings, Entregas de marca, Estados da interface, e Sair no pé. É onde vivem os destinos que não cabem na barra.

---

## Telas

### Início
Resumo do mês, na ordem: saudação · card dominante em Roxo com o faturado · dois cards de 104 px (a receber em Lima, sem NF em Coral) · **Precisa de você** · **Em execução** com barra de progresso e prazo · **Atalhos**.

"Precisa de você" é a lista de decisões: NF pendente, pagamento atrasado, orçamento enviado sem resposta. Cada item leva ao lugar onde a ação acontece — o de NF abre Serviços já filtrado por Sem NF. Não é notificação; é fila de trabalho.

Fora da home: o gráfico de seis meses, o ranking por cliente e a lista de orçamentos. Esses ficam no desktop e nas telas específicas.

### Serviços
Busca · trilha horizontal de filtros (Todos, Em execução, A receber, Sem NF) · contagem e soma do resultado · serviços agrupados por cliente, com barra de cor e total no cabeçalho do grupo.

Cada serviço é um cartão: título, sub-cliente em etiqueta, valor em Archivo, chips de execução e pagamento, marca de NF e competência. Toque abre a **folha de status**.

Sem resultado: painel tracejado com título, instrução e botão Limpar filtro.

### Clientes
Cartões com barra de cor, nome, Total e A receber lado a lado, e chips de portal, marcas e quantidade de serviços. Toque abre a ficha.

### Dinheiro
Carrossel horizontal de caixas (cards de 200 px com nome, ponto de cor, saldo e nota) e lista de movimentos. Cada movimento tem ícone em quadrado de 34 (seta para cima em Lima na entrada, para baixo em Coral na saída), título, caixa e data, valor assinado e chip de situação.

### Estados
Tela de referência, acessível pelo menu: esqueleto de carregamento, vazio, erro sem conexão, aviso de confirmação e confirmação de exclusão. Serve de espelho para implementar os estados nas telas reais.

---

## Folhas

Todas com raio 22 no topo, alça de 46 × 4, fundo `--chao`, altura máxima 86%, entrada por `translateY(102%) → 0` em 280 ms com `cubic-bezier(.32,0,.24,1)`. Véu `rgba(8,1,26,.72)` com `blur(5px)` em 220 ms. Fecham por toque no véu, por botão e por arraste para baixo.

**Criar** — três opções de 64 px com ícone em quadrado colorido: Serviço (Roxo), Orçamento (Lima), Cliente (Azul).

**Novo serviço** — cliente como trilha de pílulas (não select), título, valor e competência em duas colunas, sub-cliente opcional com a nota de que agrupa marcas sem criar portal, e o par Cancelar / Salvar no pé com proporção 1 : 2.

**Atualizar status** — cabeçalho com cliente, título e valor; execução em três pílulas (na fila, em execução, concluído); dois interruptores, Pagamento recebido e Nota fiscal emitida; no pé, botão de excluir em ícone e Salvar em Lima. É o caminho mais curto para as duas ações mais frequentes do mês.

**Excluir** — ícone em quadrado com fundo Coral a 14%, pergunta em Archivo 600 21, consequência escrita ("a movimentação financeira ligada a ele também sai do mês"), Manter em contorno e Excluir em Coral. Destrutivo nunca é o botão de maior peso visual.

---

## Comportamento

- **Uma mão.** Ação principal na metade inferior. O que é destrutivo fica longe do polegar e sempre pede confirmação.
- **Toque.** `:active` troca o fundo um passo na escada de tom em 140 ms. Sem `ripple`, sem escala.
- **Alvo.** 44 px mínimo, inclusive chip de filtro e item de menu.
- **Rolagem.** Vertical no conteúdo; horizontal só em filtros e caixas. Nada de rolagem aninhada.
- **Teclado virtual.** Campo em folha rola para ficar visível; o botão de salvar acompanha o fim do conteúdo, não fica fixo sob o teclado. `inputMode="decimal"` em valor, `type="date"` nativo em data.
- **Gestos.** Só arraste para baixo para fechar folha. Sem swipe lateral entre abas, sem swipe para excluir.
- **Áreas seguras.** `env(safe-area-inset-*)` na barra inferior e no cabeçalho.
- **Conexão lenta.** Esqueleto na primeira carga, dado em cache depois; erro de rede mostra o painel de erro com a nota de que os dados são do último acesso.
- **Aviso.** Toast 16 px acima da barra inferior, 2,6 s, Lima com texto Tinta.

## Aparência de aplicativo

O repositório já tem `manifest.json` e `apple-touch-icon.png`. Para o painel:

- `display: standalone`, `theme_color: #08011A`, `background_color: #08011A`.
- Ícone de app: a assinatura na variação compacta (ELOI + inicial), Rosa papel sobre Tinta, sem borda.
- Tela de abertura: chão `#08011A` com a assinatura centralizada; sem barra de progresso.
- `<meta name="theme-color" content="#08011A">`.
- Sem seleção de texto acidental em elementos de interface (`user-select: none` em barra e trilho).
- Rotação: retrato apenas no painel. Paisagem não é prevista.

Não empacote como app nativo, não adicione dependência de PWA além do manifest que já existe.
