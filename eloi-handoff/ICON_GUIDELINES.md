# Iconografia ELOI

59 glifos autorais. Nenhuma biblioteca externa é usada, e não deve ser: Phosphor, Lucide, Material e afins ficam fora do projeto.

## Arquivos

```
assets/icons/
├── eloi-icons.svg          sprite: um <symbol> por ícone — fonte única
├── README.md               lista completa com id, rótulo e família
├── brand/        6         estratégia, direção, execução, entrega, iteração, aprovação
├── projects/     5         projetos, cronograma, calendário, campanha, briefing
├── clients/      8         cliente, atendimento, contato, telefone, redes sociais, localização, população, acessibilidade
├── finance/      6         dinheiro, nota fiscal, caixa, pagamento, gráfico, resultados
├── status/       6         ok, alerta, erro, info, pendente, notificação
├── actions/      9         adicionar, filtro, pesquisa, editar, excluir, salvar, upload, baixar, compartilhar
├── navigation/   7         menu, avançar, voltar, expandir, fechar, navegação, link externo
├── files/        3         documentos, notícias, comunicação
├── settings/     3         configurações, sair, usuário
└── tematicos/    6         institucional, educação, cultura, saúde, bem-estar, serviços
```

Os SVGs individuais são para quando um ícone precisa viajar sozinho (e-mail, favicon, exportação). **Na aplicação, use o sprite** — uma requisição, cache único, cor herdada.

## Como usar

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

O traço herda `currentColor` — a cor vem do texto ao redor. O **ponto de sinal** usa `var(--eloi-signal, #DFF806)`: para trocar o acento de um contexto, redefina essa variável no contêiner.

Ícone com significado próprio recebe `role="img"` e `aria-label`. Ícone ao lado de um rótulo escrito é decorativo: `aria-hidden="true"`.

## Regras de desenho

Obrigatórias para qualquer glifo novo.

- Grade 24 × 24, folga mínima de 2 px em todos os lados.
- Traço 2 px, `fill: none`, `stroke-linejoin: miter`, terminação quadrada.
- Cantos retos de 90° ou quarto de arco. Nunca canto arredondado suave.
- Preenchimento **apenas** no ponto de sinal: um único elemento, em Lima.
- Sem sombra, contorno duplo, degradê, rotação ou perspectiva.
- Formas geométricas primárias: quadrado, círculo, quarto de arco, linha reta, diagonal a 45°.
- Peso óptico constante: um ícone não pode ter mais massa que os vizinhos na mesma barra.

## Tamanhos

| Tamanho | Onde |
| --- | --- |
| 16–17 | dentro de botão e chip |
| 18 | item de trilho |
| 20 | ação em linha de tabela, campo |
| 21 | barra inferior mobile |
| 24 | padrão de conteúdo |
| 30–34 | estado vazio |
| 40 | destaque em card de marca |

Abaixo de 16 px o traço de 2 px fecha o desenho: não use.

## Cor e estados

| Estado | Tratamento |
| --- | --- |
| Padrão | `currentColor` — herda o texto |
| Inativo | `--texto-3` (55%) |
| Ativo / selecionado | `--acento` (Lima) |
| Hover | passa a `--texto` ou a Lima, conforme o componente |
| Sobre fundo escuro | Rosa papel ou Lima |
| Sobre fundo claro (Lima, Rosa papel, Lilás) | Tinta |
| Sobre Roxo cheio | branco |
| Estado de dado | ícone acompanha a cor do estado: Lima ok, Azul em andamento, Coral atenção |

Nunca reduza opacidade para indicar inatividade em ícone dentro de botão desabilitado — o botão inteiro já cai para o tratamento de desabilitado.

## Inventário por contexto

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
| Buscar | `eloi-pesquisa` |
| Filtrar | `eloi-filtro` |
| Período | `eloi-calendario` |
| NF emitida | `eloi-ok` · sem NF | `eloi-erro` |
| Pagamento | `eloi-pagamento` |
| Caixa | `eloi-caixa` |
| Faturamento | `eloi-grafico` |
| Prazo / previsto | `eloi-pendente` |
| Erro de carregamento | `eloi-alerta` |
| Aviso informativo | `eloi-info` |
| Notificações | `eloi-notificacao` |
| Editar / excluir / salvar | `eloi-editar` · `eloi-excluir` · `eloi-salvar` |
| Enviar / baixar arquivo | `eloi-upload` · `eloi-baixar` |
| Abrir externo | `eloi-link-externo` |
| Voltar / avançar / expandir / fechar | `eloi-voltar` · `eloi-avancar` · `eloi-expandir` · `eloi-fechar` |

## Ícone novo

Quando faltar um: procure primeiro na tabela acima e no `README.md` da pasta — a maioria das necessidades já está coberta. Se realmente faltar, desenhe sobre as regras, acrescente o `<symbol>` ao sprite, salve o SVG individual na pasta da função e registre em `assets/icons/README.md`. Um ícone novo sem entrada na lista não existe.

Não use emoji como ícone. Em nenhuma superfície.
