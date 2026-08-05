# Revisão visual — checklist

Passe por aqui antes de considerar qualquer tela pronta. Uma falha basta para voltar.

## Marca

- [ ] Assinatura com ELOI e o complemento em **cores diferentes**, mesma largura (`wdth 72`) e mesmo peso (700).
- [ ] Nunca *Studio* e *Design* juntos.
- [ ] Assinatura acima de 14 px, com área de proteção livre.

## Cor

- [ ] Nenhum hex escrito à mão no código.
- [ ] Nenhum degradê, em nenhuma superfície.
- [ ] Nenhuma sombra de card — elevação é `#08011A` → `#0D0225` → `#170B33` → `#20114A`.
- [ ] Um bloco de cor dominante por tela, com áreas de descanso.
- [ ] Roxo não está em tudo; Lima é sinal, não decoração.
- [ ] Estados nos quatro pares aprovados: Lima, Azul, Coral, neutro.
- [ ] Nenhum cinza neutro, vermelho de erro ou verde de sucesso.
- [ ] Roxo não é cor de texto. Lima não está sobre Roxo.

## Tipografia

- [ ] Só Archivo e Manrope.
- [ ] Dinheiro em Archivo, com números tabulares em coluna.
- [ ] Tamanhos da escala oficial, com o valor mobile correspondente.
- [ ] Caixa-alta só em etiqueta curta com `.20em`.
- [ ] Nenhum peso acima de 700; nenhum par de pesos altos na mesma linha.
- [ ] Texto à esquerda, corpo entre 60 e 75 caracteres.

## Forma e espaço

- [ ] Raios do sistema: 10 controle, 8 chip, 14 card, 16 painel, 999 etiqueta.
- [ ] Espaço na escala de 4 a 56.
- [ ] Bordas nas quatro opacidades definidas.
- [ ] Bloco de cor não está atrás de texto.

## Ícones

- [ ] Todos do sprite ELOI; nenhum de biblioteca externa; nenhum emoji.
- [ ] Traço 2, terminação quadrada, no máximo um ponto de sinal em Lima.
- [ ] Tamanho da tabela de uso; nada abaixo de 16 px.

## Estados

- [ ] Carregando com esqueleto na forma do conteúdo.
- [ ] Vazio com título, instrução e saída.
- [ ] Erro com causa e "Tentar de novo".
- [ ] Hover, ativo, desabilitado e foco em tudo que é interativo.
- [ ] Nenhum estado comunicado só por cor.

## Movimento

- [ ] Durações e curvas do sistema.
- [ ] Folha em 280 ms, menu em 260 ms, micro-estado em 140 ms.
- [ ] Nada de rebote, escala em hover, parallax ou número que conta subindo.
- [ ] Com `prefers-reduced-motion` ativo, nada se move.

## Responsivo

- [ ] 360, 390, 768 e 1280 verificados.
- [ ] Abaixo de 768: barra inferior, tabela em cartão, modal em folha.
- [ ] Alvos de 44 px em todas as faixas.
- [ ] Nada estica acima de 1240; nada quebra em 320.
- [ ] `safe-area` respeitada.

## Acessibilidade

- [ ] Elemento semântico correto em cada papel.
- [ ] Percurso completo por teclado, com foco sempre visível.
- [ ] Rótulo em todo campo; erro em texto.
- [ ] Contraste nos pares aprovados.

## Código

- [ ] `npm test` e `npm run lint` passando.
- [ ] Nenhuma dependência nova.
- [ ] Nada copiado de outra tela sem extrair componente.
- [ ] `lib/` e `domain/` intactos.
- [ ] Inventário atualizado, se algo novo nasceu.

## Teste final

- [ ] Lado a lado com a referência aprovada, parece o mesmo produto?
- [ ] Sem a assinatura na tela, ainda dá para saber que é ELOI?

Se a resposta da segunda for não, a tela virou template. Volte à hierarquia de cor e à tipografia.
