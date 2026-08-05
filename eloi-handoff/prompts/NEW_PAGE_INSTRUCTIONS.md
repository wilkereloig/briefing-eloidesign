# Nova página — checklist

Siga na ordem. Nada aqui é opcional.

## Antes de escrever código

1. **Objetivo.** Qual decisão o Wilke toma nesta tela? Uma frase. Se não couber em uma frase, a tela está fazendo trabalho de duas.
2. **Dado.** De qual edge function vem, qual o formato, o que é cents e o que é reais. Sem inventar campo.
3. **Componentes existentes.** Percorra `COMPONENT_INVENTORY.md` e liste o que já resolve. Só o que sobrar é novo.
4. **Referência.** Encontre a tela mais parecida em `references/` e siga sua estrutura: cabeçalho com etiqueta + título, indicadores, conteúdo, estados.

## Estrutura

5. **Tokens.** Toda cor, espaço, raio, duração e tamanho de fonte sai de `variables.css` ou `tokens.ts`. Nenhum valor literal.
6. **Hierarquia.** Etiqueta da seção em Lima → título de página em Archivo 600 → conteúdo. Um indicador dominante, o resto em escada de tom. Áreas de descanso são obrigatórias.
7. **Desktop.** Trilho de 236, conteúdo até 1240, margem 36, gap 16.
8. **Mobile.** Uma coluna, margem 16, tabela virada em cartão, modal virado em folha, barra inferior respeitada com 118 px de base no conteúdo.

## Estados — todos, sempre

9. **Carregando.** Esqueleto na forma do conteúdo real. Nunca spinner.
10. **Vazio.** Painel tracejado com título, uma instrução e, quando houver saída, um botão.
11. **Erro.** Painel com borda Coral, a causa em uma frase e "Tentar de novo".
12. **Sem permissão.** Mensagem do que falta e a quem pedir. Nunca tela em branco, nunca redirecionamento silencioso.
13. **Parcial.** Se um bloco falha e o resto carrega, o erro fica no bloco — não derruba a página.

## Interação

14. **Ação principal.** Uma por tela, em Roxo. As outras em contorno.
15. **Destrutivo.** Sempre com confirmação em folha ou modal, com a consequência escrita.
16. **Formulário.** Rótulo visível, validação ao sair do campo, erro em texto além da borda, teclado adequado no mobile.
17. **Movimento.** Só as durações e curvas do sistema. `prefers-reduced-motion` respeitado.

## Acessibilidade

18. `button` para ação, `a` para navegação, marcos semânticos, `table` só em tabela de verdade.
19. Foco visível: anel lima de 2 px com offset 2. Nenhum `outline: none` sem substituto.
20. Alvos de 44 px. Contraste nos pares aprovados. Estado nunca só por cor.
21. Ícone decorativo com `aria-hidden`, ícone significativo com `aria-label`. Valor monetário legível por leitor de tela.

## Fechamento

22. Rode `npm test` e `npm run lint`.
23. Teste em 360, 390, 768, 1280.
24. Passe pelo `VISUAL_REVIEW_CHECKLIST.md`.
25. Nada duplicado: se copiou um bloco de outra tela, extraia o componente.
26. Atualize `COMPONENT_INVENTORY.md` se criou componente, e `assets/icons/README.md` se criou ícone.
