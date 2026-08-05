# Guia de implementação

Como aplicar o sistema visual no código que já existe, sem reconstruir o projeto.

---

## 1. A stack encontrada

| Onde | O que é | Situação |
| --- | --- | --- |
| `app/` | React 19.2 · TypeScript 6 · Vite 8 · react-router-dom 7 · oxlint · vitest | **É aqui que se trabalha.** Painel admin em `/admin/*` |
| `app/src/ui/tokens.css` | variáveis CSS em português | Substituir pelo `variables.css` deste pacote |
| `app/src/app.css` | reset + classes do shell, trilho e login | Refatorar sobre os tokens novos |
| `app/src/routes/admin/` | `Shell.tsx`, `Sidebar.tsx`, `Silhueta.tsx`, `nav.ts`, `telas/*.tsx` | Refatorar visual, preservar rotas e dados |
| `app/src/lib/`, `app/src/domain/` | `api.ts`, `dinheiro.ts`, `tipos.ts`, regras de projeto e decisões | **Não mexer.** Lógica testada |
| `admin-app/` | React 18 · Vite 5, painel anterior | Legado. Não migrar; ver seção 6 |
| `gestao/`, `painel/`, `painel-*`, `novo-visual/` | páginas HTML estáticas na raiz | Legado servido pela Vercel; ver seção 6 |
| `edge-functions/` | `eloi-gestao.ts`, `orcamentos.ts`, `eloi-financeiro.ts`, `portal-cliente.ts` | Fonte de dados. Não mexer |

Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes. O sistema é entregue como CSS de tokens + classes próprias, que é o que o projeto já faz.

---

## 2. O que muda de fato

O código atual carrega o **direcionamento anterior**, que foi substituído:

| Hoje no código | Passa a ser | Por quê |
| --- | --- | --- |
| `--pagina: #120432` | `#08011A` | chão aprovado é mais escuro e menos roxo |
| `--chao: #1B0647`, `--chao-2: #24085C` | `--chao: #0D0225`, `--chao-2: #170B33`, `--chao-3: #20114A` | escada de tom de quatro passos, que é como a elevação funciona |
| `--font: 'carbona-variable'` | `--fonte-titulo: Archivo` + `--fonte-corpo: Manrope` | duas famílias com papéis distintos |
| `border-radius: 0` em tudo | 10 controle · 14 card · 16 painel · 999 etiqueta | aresta viva era do direcionamento antigo |
| Fundo de malha 202 px em `.app-shell` | fundo chapado | a malha não faz parte do KV aprovado |
| `--laranja` | `--coral` (mesmo hex `#FD4400`) | nome de papel, não de cor |
| `--tinta-forte/media/fraca` | `--texto`, `--texto-2`, `--texto-3`, `--texto-4` | escala de opacidade explícita |
| `--roxo-texto: #C0A0FA` | `--rosa` para texto; Roxo nunca é cor de texto | mantida a mesma conclusão de contraste que o comentário do arquivo já registrava |
| Glifos `quadrado/circulo/arco` no `nav.ts` | ícones do sistema (`assets/icons/`) | a família de glifos era do direcionamento antigo |
| `--malha: 202px` | `--trilho-largura: 236px` | largura do trilho aprovada no painel |

O que **não** muda: rotas, nomes de tela, vocabulário de domínio, formato de dinheiro em cents, contratos das edge functions, testes.

---

## 3. Ordem de implementação

Cada passo fecha sozinho e pode ir para produção.

**Passo 1 — tokens.** Copie `design-tokens/variables.css` sobre `app/src/ui/tokens.css`. Mantenha o `@import './ui/tokens.css'` do `app.css`. Rode e olhe: a tela vai ficar quase certa e feia em alguns pontos — normal, o passo 2 resolve. Se algum nome antigo (`--tinta-forte`, `--linha`, `--trilho`) estiver em uso, faça o de-para em busca global antes de apagar o arquivo velho.

**Passo 2 — base e shell.** Em `app.css`: aplique `--fonte-corpo` no `body`, remova o `background-image` da malha em `.app-shell`, troque `grid-template-columns` para `var(--trilho-largura) minmax(0,1fr)`, e leve os raios para os valores da tabela. Refaça `.trilho-item` com a marca ativa de 3 px em Lima à esquerda, `border-radius: var(--raio-controle)` e altura mínima de 44 px.

**Passo 3 — tipografia.** Carregue as duas famílias (o `@import` já vem no `variables.css`; se preferir `<link>`, use o `index.html` e remova o import). Crie as classes de nível conforme a escala da seção 5 do design system — ou aplique os valores direto nos componentes, mantendo os mesmos números.

**Passo 4 — primitivos.** Nesta ordem, porque cada um é usado pelo seguinte: `Botao` → `Etiqueta`/`Chip` → `Campo` → `Card` → `Painel` → `Tabela`. Anatomia e estados em `COMPONENT_INVENTORY.md`. Coloque-os em `app/src/ui/` ao lado dos tokens.

**Passo 5 — ícones.** Copie `assets/icons/eloi-icons.svg` para `app/public/` e consuma com `<svg><use href="/eloi-icons.svg#eloi-dinheiro" /></svg>`, ou gere um componente `<Icone nome="dinheiro" />` que faz o mesmo. Substitua os glifos de `nav.ts` pelos ids dos ícones. Regras em `ICON_GUIDELINES.md`.

**Passo 6 — telas, uma por vez.** Ordem sugerida, da mais vista para a menos: `Hoje` → `Projetos` → `Dinheiro` → `Clientes` → `ClienteFicha` → `Briefings` → `Entregas`. Em cada uma: primeiro os cards de indicador, depois a lista/tabela, depois estados de vazio, carregando e erro.

**Passo 7 — mobile.** `MOBILE_APP_GUIDELINES.md`. O trilho já vira barra inferior em ≤899 px no CSS atual; o trabalho é ajustar para os breakpoints oficiais, subir a altura para 74 px com `env(safe-area-inset-bottom)`, acrescentar o botão central de criação e virar tabela em cartão.

**Passo 8 — folhas e modais.** Folha inferior no mobile, modal centralizado no desktop, mesmo conteúdo. Véu com `rgba(8,1,26,.72)` e `blur(5px)`.

---

## 4. Integração dos tokens no TypeScript

`tokens.ts` existe para o que precisa de valor em JS: cor de chip por estado, cor identificadora de cliente, duração de transição. Importe de lá em vez de repetir literais:

```ts
import { chip, corCliente } from '../ui/tokens'
const [fundo, texto] = chip[etapa]
```

Regra: se o valor aparece em CSS, ele mora em `variables.css`. Se aparece em JS, mora em `tokens.ts`. Nenhum valor de cor deve aparecer solto em um `.tsx`.

---

## 5. Cuidados

- Não altere assinatura de função em `lib/` e `domain/` para acomodar estilo.
- `dinheiro.ts` continua sendo o único lugar que formata moeda. A tipografia muda; a formatação não.
- Rode `npm test` (vitest) depois de cada passo. Os testes cobrem domínio e API, então uma quebra ali significa que algo além do visual foi tocado.
- `npm run lint` (oxlint) antes de fechar cada passo.
- Não introduza dependência nova. Nem de ícone, nem de componente, nem de animação.
- Verifique `prefers-reduced-motion` de verdade, ativando a preferência no sistema.

---

## 6. Legado

Não apague nada desta lista sem verificar uso; documente e siga.

| Item | Situação | Recomendação |
| --- | --- | --- |
| `admin-app/` | painel anterior em React 18, substituído por `app/` | Congelar. Não aplicar o sistema visual. Remover quando `app/` cobrir todas as telas |
| `gestao/index.html`, `painel/`, `painel-briefings/`, `painel-ecommerce/`, `painel-orcamentos/`, `orcamento*/`, `novo-visual/` | páginas estáticas em produção na Vercel | Manter no ar até a rota equivalente existir em `app/`. Ao migrar, redirecionar em `vercel.json` |
| `assets/eloi-admin/admin.css`, `nav.js` | estilo do painel estático | Não evoluir. Substituído pelos tokens |
| `marca/index.html` | página de marca antiga | Substituída pelo KV Completo; avaliar remoção |

Motivo de manter: essas páginas atendem cliente hoje e não têm equivalente pronto em `app/`. Retire cada uma no momento em que a tela nova entrar.
