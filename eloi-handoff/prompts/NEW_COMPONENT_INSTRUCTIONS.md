# Novo componente — instruções

## Quando criar

Só quando as três respostas forem sim:

1. Não existe nada equivalente em `COMPONENT_INVENTORY.md`?
2. Vai ser usado em pelo menos dois lugares, ou concentra uma regra visual que não deve ser repetida?
3. Tem estado ou variação de verdade — não é só uma `div` com padding?

Se qualquer uma for não, escreva o markup na própria tela. Componente prematuro atrapalha mais que duplicação de dez linhas.

## Como construir

- Mora em `app/src/ui/`, um arquivo por componente, nome em português como o resto do projeto (`Chip.tsx`, `CampoTexto.tsx`).
- Recebe valores por prop; nunca lê dado direto de API.
- **Zero valor literal de estilo.** Cor, espaço, raio e duração vêm de `variables.css` (em CSS) ou `tokens.ts` (em JS).
- Sem estilo posicional interno: quem usa decide margem e largura. O componente controla só o próprio interior.
- Aceita `className` e repassa o resto das props ao elemento raiz (`...resto`).
- Elemento semântico correto: `button` para ação, `a` para link, `input` com `label` associado.

## Nasce com todos os estados

Nenhum componente entra sem: **padrão · hover · ativo · foco visível · desabilitado · carregando** (se dispara ação) · **erro** (se recebe entrada) · **vazio** (se lista).

Valores em `ELOI_DESIGN_SYSTEM.md` seção 4. Resumo: hover troca papel de cor, nunca clareia a mesma cor; ativo é um passo além do hover; foco é o anel lima de 2 px com offset 2; desabilitado é fundo `rgba(253,213,211,.08)` com texto em 35%.

## Variações

Use uma prop de variante com nomes de papel, não de aparência: `variante="primario" | "destaque" | "secundario" | "terciario" | "destrutivo"`. Nunca `variante="roxo"`. Nunca uma prop booleana por variação.

## Tamanho

No máximo duas alturas: padrão (44) e compacta (36, só dentro de linha de tabela). Não crie `size="xs"`.

## Antes de considerar pronto

- [ ] Renderiza igual à referência em `references/`, lado a lado.
- [ ] Nenhum hex, px de espaço ou duração escrito à mão.
- [ ] Todos os estados existem e são alcançáveis por teclado.
- [ ] Alvo de 44 px onde há toque.
- [ ] Funciona em 360 e em 1280.
- [ ] Com `prefers-reduced-motion`, não se move.
- [ ] Entrada nova em `COMPONENT_INVENTORY.md`, com anatomia, estados e "quando não usar".
- [ ] Nenhuma dependência nova instalada.
