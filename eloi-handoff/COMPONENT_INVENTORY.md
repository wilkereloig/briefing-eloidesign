# Inventário de componentes

Cada componente com anatomia, valores, estados e limite de uso. Referência visual: `references/Gestao Eloi.dc.html` (desktop), `references/Gestao Eloi Mobile.dc.html` (toque), `references/Site Eloi 2026.dc.html` (institucional).

Convenção: valores em px; cores por token de `variables.css`.

---

## Navegação

### Trilho lateral (desktop)
Largura 236 · fundo `--chao` · borda direita `--linha` · `position: sticky` · padding 26/14/18.
Marca no topo (20 px, margem inferior 26), grupo primário, rótulo "Ferramentas" em etiqueta mini, grupo secundário, espaçador, três botões de criação rápida, botão Sair.
**Item:** altura mínima 44 · padding 11/12 · raio 10 · Manrope 600 14 · texto `--texto-2` · ícone 18 à esquerda com gap 11.
**Ativo:** barra de 3 px em Lima colada na aresta esquerda, texto `--texto`, sem fundo.
**Hover:** fundo `--chao-2`, texto `--texto`.
Não use para mais de 7 destinos; acima disso, agrupe.

### Trilho recolhido
Largura 72 · só ícone centralizado · rótulo aparece em tooltip após 400 ms. Marca vira a variação compacta.

### Barra inferior (mobile)
Altura 74 + `env(safe-area-inset-bottom)` · fundo `--chao` · borda superior `--linha` · 5 colunas iguais.
Item: ícone 21 + rótulo 10/700 · cor `--texto-3`, ativo em `--acento`. Coluna central é o botão de criação: 56 × 56, raio 16, Roxo, borda de 4 px na cor da página, `translateY(-16px)`.
Nunca mais de 5 colunas. Nunca esconder rótulo.

### Cabeçalho
**Desktop:** padding 26/36 · borda inferior `--linha` · à esquerda etiqueta da seção (11/700/.20em em Lima) + título de página (Archivo 600 32); à direita seletor de período e ação primária.
**Mobile:** altura 54 · botão de menu 44 à esquerda, assinatura no centro, chip de mês à direita.

### Abas
Pílula: padding 10/18 · raio 999 · Manrope 700 13. Inativa: transparente com borda `--linha-forte` e texto `--texto-2`. Ativa: fundo `--acento`, texto `--acento-texto`, sem borda. Máximo 4; acima disso vira menu.

### Busca global
Campo de 300 px no desktop, largura total no mobile · ícone de lupa 17 a 14 px da borda esquerda · padding esquerdo 42 · placeholder `--texto-off`.

### Seletor de período
Chip com fundo `--chao-2`, raio 10, altura 44, ícone de calendário em Lima, rótulo `ago 26` no mobile e `Agosto 2026` no desktop.

### Menu contextual e dropdown
Fundo `--chao`, borda `--linha`, raio 14, item de 44 px, hover `--chao-2`. Abre alinhado à borda do disparador, 8 px de folga, sem animação de escala — só opacidade em 140 ms.

### Breadcrumbs
Manrope 400 13 · `--texto-3` · separador `·` · último item em `--texto`. Só em ficha de cliente e detalhe de projeto.

---

## Ações

| Variante | Fundo | Texto | Borda | Uso |
| --- | --- | --- | --- | --- |
| Primário | `--roxo` | `#FFF` | — | ação principal da tela, uma por tela |
| Destaque | `--acento` (Lima) | `--tinta` | — | confirmação dentro de folha e modal |
| Secundário | transparente | `--texto` | `--linha-forte` | ação alternativa; hover leva borda e texto a Lima |
| Terciário / ghost | transparente | `--texto-2` | — | ação de baixa relevância em linha de tabela |
| Destrutivo | transparente | `--coral` | `rgba(253,68,0,.5)` | excluir; confirmação sempre em folha |
| Ícone | `--chao-2` ou transparente | `--texto` | opcional | 36 × 36 no desktop, 44 × 44 no toque |

Comuns: altura mínima 44 (36 na variante compacta de tabela) · padding 12/22 · raio 10 · Manrope 600 14 · `min-height` em vez de altura fixa.
**Hover:** Roxo → `#6A1FD0`; contorno → Lima. **Ativo:** Roxo → `#5A17B0`, ou `translateY(1px)` no contorno.
**Carregando:** rótulo permanece, ícone vira três quadrados de 4 px pulsando em 1,4 s; botão fica `pointer-events: none`.
**Desabilitado:** fundo `rgba(253,213,211,.08)`, texto `--texto-off`.
Nunca dois primários lado a lado. Nunca botão só com ícone para ação destrutiva sem confirmação.

### Botão de criação rápida
No trilho: três contornos em linha, `flex: 1 1 auto`, 12 px, raio 8. No mobile: o botão central da barra abre a folha "Criar" com Serviço, Orçamento e Cliente.

---

## Conteúdo

### Card de indicador
Raio 16 · padding 26 (16 no mobile) · altura mínima 150 · fundo `--chao-2`; **um** por tela pode ser Roxo cheio (o indicador dominante).
Anatomia: etiqueta mini em caixa-alta → espaçador → valor grande (Archivo 700 34, Lima quando é dinheiro a receber, Coral quando é pendência) → nota em 12 px.
Grade: `repeat(auto-fit, minmax(210px, 1fr))`, gap 16.
Nunca quatro cards visualmente idênticos: o dominante muda de fundo.

### Card de cliente
Raio 16 · fundo `--chao-2` · hover `--chao-3` · padding 26.
Barra identificadora de 10 × 26 na cor do cliente + nome em Archivo 600 20 · três pares rótulo/valor · chips de portal e de marcas no pé.

### Card de projeto / serviço (mobile)
Raio 14 · fundo `--chao-2` · padding 15 · título 15/600, sub-cliente em etiqueta 11/.14em na cor de acento, valor em Archivo 600 17 à direita, linha de chips embaixo com data alinhada à direita.
É a forma que a tabela assume abaixo de 768 px.

### Card financeiro (caixa)
Raio 16 · fundo `--chao-2` · nome em etiqueta mini + ponto de 8 px na cor do caixa · saldo em Archivo 700 30 (24 no mobile) · nota em 12. No mobile, carrossel horizontal de cards de 200 px.

### Painel
Raio 16 · fundo `--chao` · borda `--linha` · padding 28. Contém título em etiqueta Lima + conteúdo. É o contêiner de gráfico, ranking e tabela.

### Tabela
Cabeçalho: fundo `--pagina`, etiqueta mini `--texto-4`, padding 12/26.
Linha: padding 15/26 · divisor `--linha-fraca` · hover `--linha-hover` · grade explícita (ex.: `minmax(120px,1fr) 96px 104px 104px 40px`).
Faixa de agrupamento (sub-cliente): fundo `--faixa-grupo`, rótulo 11/.14em em Lima com marca de 6 px, subtotal à direita.
Coluna de valor alinhada à direita, Archivo 600, `tabular-nums`. Coluna de NF centralizada com ícone: Lima quando emitida, Coral quando não.
Abaixo de 768 px a tabela deixa de existir e vira lista de cards.

### Lista
Linha de 66 px mínimo · fundo `--chao` com borda `--linha` (ou divisor em lista densa) · ícone ou marca de cor à esquerda · duas linhas de texto · valor e chip à direita · seta de avanço quando navega.

### Indicadores e métricas
Barra de progresso: trilho 6–8 px em `--pagina`, preenchimento Azul, raio 0.
Barra de ranking: trilho `--chao-2`, preenchimento Roxo, largura em %.
Nunca gráfico de rosca, nunca porcentagem sem o valor absoluto ao lado.

### Gráficos
Colunas empilhadas: pago em Roxo, aberto em `--chao-2` com borda `rgba(253,213,211,.22)`. Rótulo do total acima da coluna em Archivo 600 12, mês abaixo em etiqueta mini. Altura útil 180. Sem eixo Y, sem linha de grade, sem tooltip animado.

### Timeline
Coluna de 2 px em `--linha` com marcas de 10 × 10; etapa concluída em Lima, atual em Azul, futura em `--linha-forte`. Rótulo à direita.

### Calendário
Grade 7 × n, célula de 40, número em Manrope 600 13, dia com serviço recebe ponto de 6 px na cor do cliente; hoje tem borda de 1 px em Lima.

### Avisos e empty states
Vazio: painel com borda tracejada `1px dashed rgba(253,213,211,.2)`, ícone 30 em `--texto-4`, título Archivo 600 17, uma linha de instrução em 13, e — quando houver saída — um botão. Nunca ilustração.
Aviso inline: fundo `--chao`, borda de 1 px na cor do estado, ícone à esquerda, texto 14/600 e uma ação em contorno.

### Tooltip
Fundo `--chao-3`, texto 12, raio 8, padding 8/10, sem seta, aparece em 140 ms após 400 ms de intenção. Só no desktop.

---

## Formulários

**Campo de texto:** altura mínima 48 · padding 13/15 · raio 10 · fundo `--pagina` dentro de folha e `--chao` em página · borda `--linha-campo` · texto 14 · placeholder `--texto-off`. Foco: borda `--roxo-claro` mais o anel de foco padrão.
**Rótulo:** etiqueta 11/700/.14em em caixa-alta, `--texto-3`, acima do campo, gap 7.
**Textarea:** mesmo tratamento, altura mínima 120, `resize: vertical`.
**Select:** mesma caixa do campo, chevron de 13 px em Lima à direita. Com até 4 opções curtas, use grupo de pílulas em vez de select.
**Autocomplete:** campo + lista em painel de raio 14, item de 44, trecho digitado em Lima.
**Checkbox:** 20 × 20, raio 0, borda `--linha-forte`; marcado vira Lima com o traço em Tinta. Nunca arredondado.
**Radio:** 20 × 20 circular, borda `--linha-forte`, ponto interno de 10 em Lima.
**Switch:** trilho 50 × 28 raio 999, bola 22; desligado com trilho `rgba(253,213,211,.16)` e bola `--rosa`; ligado com trilho `--acento` e bola `--tinta`; transição 180 ms.
**Upload:** área tracejada, ícone `upload`, texto "Arraste ou toque para enviar", lista de arquivos com nome, tamanho e botão de remover.
**Data:** campo com máscara `dd/mm/aaaa`. No mobile, `input type="date"` nativo.
**Valor:** Archivo 600 15, prefixo `R$` fixo à esquerda, entrada em cents.
**Filtros:** pílulas de 8/14, raio 8, inativa em `--chao-2`, ativa em `--acento`. No mobile, rolagem horizontal com 44 px de altura.
**Validação:** valida ao sair do campo, não a cada tecla. Erro: borda Coral, mensagem em 13/600 Coral abaixo, `role="alert"`. Nunca só a borda.

---

## Feedback

**Aviso (toast):** flutuante 16 px acima da barra inferior · fundo `--acento` · texto Tinta 13/700 · ícone de confirmação · entra em 240 ms, sai em 2,6 s. Erro usa Coral com texto branco.
**Notificação em lista:** item com ícone `notificacao`, título 14/600, tempo relativo em 12.
**Modal (desktop):** largura máxima 520, raio 18, fundo `--chao`, padding 28; véu `rgba(8,1,26,.72)` com `blur(5px)`. Ações no pé, alinhadas à direita.
**Folha (mobile):** raio 22 no topo, alça de 46 × 4, altura máxima 86%, entra por `translateY(102%) → 0` em 280 ms. Fecha por toque no véu, por botão de fechar e por arraste.
**Confirmação de exclusão:** ícone em quadrado de 44 com fundo `rgba(253,68,0,.14)`, pergunta em Archivo 600 21, consequência em 14, dois botões — Manter em contorno, Excluir em Coral cheio. A ação destrutiva nunca é a primária visual.
**Progresso:** barra de 6 px, Azul; sem porcentagem quando indeterminado.
**Esqueleto:** blocos em `rgba(253,213,211,.14)` pulsando `.35 → .7` em 1,4 s, defasagem de 200 ms. Reproduz a forma do conteúdo real, não um retângulo genérico.
**Carregando de página:** esqueleto, não spinner.
**Sucesso:** toast em Lima. Nunca tela inteira de sucesso.
**Erro:** painel com borda Coral, causa em uma frase e um botão "Tentar de novo".
**Sem conexão:** mesmo painel de erro com a nota de que os dados são do último acesso.

---

## Ordem de construção

`Botao` → `Chip`/`Etiqueta` → `Campo` (+ `Rotulo`) → `Card` → `Painel` → `Tabela` → `Lista` → `Folha`/`Modal` → `Aviso` → `Esqueleto`.

Cada um depende só dos anteriores. Ao criar um novo, atualize este arquivo.
