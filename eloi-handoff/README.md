# Handoff: ELOI Studio — sistema visual e painel de gestão

## O que é este pacote

O sistema visual aprovado da **ELOI Studio**, documentado para ser implementado no código do painel interno (`app/`, rotas `/admin/*`) e no site.

Reúne os tokens, a iconografia, o inventário de componentes, as regras de responsividade, a versão mobile do painel e os arquivos de contexto para o Claude Code.

## Sobre os arquivos de design

Os arquivos em `references/` são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, não código de produção para copiar.

A tarefa é **recriar esses designs no ambiente que já existe no repositório**: React 19 + TypeScript + Vite + react-router, com CSS próprio em `app/src/ui/`. Não troque a stack, não adicione biblioteca de componentes, não introduza Tailwind. Os valores exatos que a implementação precisa estão em `design-tokens/`.

## Fidelidade

**Alta fidelidade.** Cores, tipografia, espaçamentos, raios, estados e movimento são finais e foram aprovados. Reproduza os valores como estão em `design-tokens/design-tokens.json`. Onde o design e o código atual divergem, o design ganha — exceto em comportamento de dados, onde o código ganha.

## Referências oficiais

| Arquivo | O que é | Papel no handoff |
| --- | --- | --- |
| `references/Eloi KV Completo.dc.html` | Guia da marca em 10 seções | Referência de identidade: assinatura, paleta, tipografia, ícones, grafismos, componentes |
| `references/Gestao Eloi.dc.html` | Painel desktop | Referência funcional e visual do `/admin` |
| `references/Gestao Eloi Mobile.dc.html` | Painel mobile com comportamento de aplicativo | Referência da experiência de toque, folhas, barra inferior e estados |
| `references/Site Eloi 2026.dc.html` | Site institucional de uma página | Referência de linguagem editorial, composição e aplicação da marca |

Abra qualquer um deles direto no navegador — `support.js` acompanha a pasta. Versões antigas do KV, do site e do painel foram removidas do projeto e não devem ser usadas como referência.

## Estrutura

```
eloi-handoff/
├── README.md                      este arquivo
├── ELOI_DESIGN_SYSTEM.md          o sistema completo: marca, cor, tipografia, forma, movimento
├── IMPLEMENTATION_GUIDE.md        como aplicar no código atual, em ordem
├── COMPONENT_INVENTORY.md         cada componente, anatomia, estados e quando não usar
├── ICON_GUIDELINES.md             as 59 iconografias e as regras de desenho
├── RESPONSIVE_GUIDELINES.md       breakpoints e o que muda em cada um
├── MOBILE_APP_GUIDELINES.md       a versão de toque do painel
├── CHANGELOG.md                   o que mudou nesta entrega
├── design-tokens/
│   ├── design-tokens.json         fonte principal de valores
│   ├── variables.css              pronto para substituir app/src/ui/tokens.css
│   └── tokens.ts                  valores que precisam existir em JS
├── assets/
│   ├── logos/                     assinatura e símbolo em cada cor + logotipos originais
│   └── icons/                     sprite + 59 SVGs em 10 pastas por função
├── references/                    os 4 protótipos HTML aprovados
└── prompts/
    ├── CLAUDE_CODE_CONTEXT.md     instrução permanente — leia primeiro
    ├── NEW_PAGE_INSTRUCTIONS.md   checklist de nova página
    ├── NEW_COMPONENT_INSTRUCTIONS.md
    └── VISUAL_REVIEW_CHECKLIST.md revisão antes de considerar pronto
```

Não há `tailwind-theme.js`: o projeto não usa Tailwind.

## Por onde começar

1. Leia `prompts/CLAUDE_CODE_CONTEXT.md`.
2. Substitua `app/src/ui/tokens.css` por `design-tokens/variables.css` e ajuste `app/src/app.css` conforme `IMPLEMENTATION_GUIDE.md`.
3. Migre tela por tela, na ordem sugerida no guia de implementação.
4. Antes de fechar cada tela, passe pelo `VISUAL_REVIEW_CHECKLIST.md`.

## Dados e domínio

O vocabulário do domínio está em `CONTEXT.md` na raiz do repositório e continua valendo: Cliente, Sub-cliente, Projeto (orçamento + serviço), Etapa, Decisão, Caixa, Movimento. Dinheiro é sempre inteiro em cents, com a exceção conhecida de `orcamentos.valor_total`. Nada disso muda com este handoff — a mudança é de superfície.

## Assets

Os SVGs em `assets/logos/` são derivados dos logotipos originais enviados pelo cliente (`logotipo-original-1…4.svg`, 1080×1080). Os ícones em `assets/icons/` foram desenhados para este sistema: 40 no KV aprovado e 19 acrescentados nesta entrega para cobrir finanças, estados de sistema, ações de registro e configuração. Nenhuma biblioteca externa de ícones é usada, e não deve ser.

Não há fotografia no pacote. Onde o site pede foto, há um marcador dizendo o que entra.
