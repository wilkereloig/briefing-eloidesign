# Handoff: Painel + Site ELOI — KV v3

## Visão geral

Reconstrução completa do painel administrativo e do site da **ELOI Design Studio**, ancorada no KV v3 (o key visual aprovado: chão roxo profundo, malha de 202 px, quatro silhuetas modulares, paleta de seis cores com o roxo predominante).

Não é um reskin. O painel antigo (`/gestao/`, `/painel-briefings/`, `/painel-orcamentos/`, `/painel/`, `/painel-ecommerce/`, `/admin-app/`) foi refeito com **nova arquitetura de informação** — a seção "Decisões de produto" abaixo é parte obrigatória da implementação, não sugestão.

Repositório de destino: `wilkereloig/briefing-eloidesign` (HTML estático + Vite/React em `admin-app/`, Supabase edge functions).

## Sobre os arquivos de design

Os arquivos em `design/` são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar esses designs no ambiente que já existe no repo**: as páginas estáticas em HTML/CSS puro e a SPA em React+TS de `admin-app/`, seguindo os padrões já estabelecidos (edge functions, `eloi_admin_token`, nomes de classe que o JS legado consome).

`design/support.js` é só o runtime que faz os `.dc.html` abrirem no navegador. Ignore-o na implementação.

## Fidelidade

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, estados e movimento são finais. Recrie fielmente. Os valores exatos estão em "Design tokens".

---

## Decisões de produto (aplicar junto com o visual)

A estrutura antiga tinha redundâncias reais. Foram resolvidas assim:

| Antes | Depois | Por quê |
|---|---|---|
| `/painel-briefings/` + `/painel/` + `/painel-ecommerce/` | **uma** lista "Briefings" | Três telas para a mesma entidade. Formulários sem token entram na mesma lista com selo `legado` e ação "Vincular cliente". |
| `/painel-orcamentos/` + Serviços (em `/gestao/`) | **Projetos** | O banco já une os dois (trigger `trg_eloi_orcamento_aprovado` cria o serviço ao aprovar). Um projeto atravessa `orçamento → aprovado → execução → entregue → pago`. Some a confusão dos campos travados e do `servicos.from_orcamento` como "ferramenta de reparação". |
| Item de menu "Portal do Cliente" (que abria `/gestao/#clientes`) | **estado dentro da ficha do cliente** | O próprio `nav.js` documenta a incoerência. Portal é atributo do cliente (`portal_senha_hash`), não área do sistema. |
| `/marca/` como página do menu | **ação dentro de Entregas** | Gerar variações de logo é passo da entrega, não destino de navegação. |
| `/gestao/` (dashboard + clientes + serviços numa página) | dissolvida em **Hoje**, **Clientes**, **Projetos**, **Dinheiro** | Uma página com três objetivos não tem hierarquia possível. |
| `/orcamento-inteligente/` | apenas o redirect | Rota aposentada; nada a construir. |
| Dois painéis vivos (estático `/gestao/` + SPA `admin-app/`) | **um** | A migração progressiva virou duplicação permanente. Escolha a SPA como destino único. |

**Menu final — cinco áreas + Ferramentas:**

1. **Hoje** — o que exige decisão agora
2. **Projetos** — o ciclo do dinheiro, em etapas
3. **Clientes** — ficha única por cliente
4. **Dinheiro** — caixas, movimentos, previsto × realizado
5. **Briefings** — convites e respostas
   Ferramentas: **Entregas**

Cada área responde a uma pergunta só. Nada de atalhos duplicados ("+ Serviço / + Orçamento / + Cliente" saíram: a ação vive na área dela).

---

## Design tokens

### Cores

| Token | Hex | Papel |
|---|---|---|
| `--pagina` | `#120432` | Fundo da aplicação |
| `--chao` | `#1B0647` | Superfície (linhas, cards, trilho ativo) |
| `--chao-2` | `#24085C` | Hover de superfície |
| `--trilho` | `#0C0220` | Fundo do menu lateral |
| `--roxo` | `#7D2AE8` | **O roxo oficial** (substitui o antigo `#7B2CBF`) |
| `--roxo-claro` | `#9457F0` | Segundo degrau; estado "orçamento", contorno de previsto |
| `--lima` | `#DFF806` | Sinal: ação primária, foco, "pago", acento do KV |
| `--laranja` | `#FD4400` | Energia/urgência: atraso, "em execução", NF pendente |
| `--lilas` | `#EEB4E7` | "Entregue", terceiro acento |
| `--azul` | `#5B7CFD` | Quarto acento (serviços/sistemas) |
| `--rosa` | `#FDD5D3` | Tinta padrão (corpo de texto) |
| `--tinta-forte` | `#FFF1F0` | Títulos e números |
| `--tinta-media` | `#B79FC4` | Texto secundário |
| `--tinta-fraca` | `#8E77A6` | Rótulos, unidades, metadados |
| `--linha` | `rgba(253,213,211,.14)` | Divisórias |
| `--linha-forte` | `rgba(253,213,211,.28)` | Borda de botão fantasma e de campo |

**Regras de contraste (não negociáveis):**
- `#7D2AE8` sobre o chão dá ~2,4:1 → **nunca carrega texto**. Texto de acento roxo usa `#C0A0FA`.
- `#DFF806` e `#FD4400` são fundo de botão com tinta escura (`#120432`) ou clara (`#FFF1F0`) — nunca texto pequeno sobre o chão em tamanho de corpo.
- Foco de teclado: `outline: 2px solid #DFF806; outline-offset: 2px` em tudo que é interativo.

### Tipografia

- Família única: **`carbona-variable`** (Typekit, já em uso: `https://use.typekit.net/ngx4uek.css`), fallback `system-ui, -apple-system, sans-serif`.
- Peso por `font-variation-settings: 'wght' N` — 400 corpo, 620 títulos/ênfase, 640 botões.
- Escala aplicada: h1 de tela **38px / line-height 1 / letter-spacing −.035em**; número grande 30px/−.03em; h2 15px/'wght' 640; corpo 13,5–15px; rótulo 10–11px com `letter-spacing .18–.22em` e `text-transform: uppercase`.
- Todo número de dinheiro usa `font-variant-numeric: tabular-nums`.

### Espaço, forma, sombra

- **Malha de 202 px** é a constante do sistema: trilho lateral = 202px; gráfico com 202px de altura; fundo desenhado com `repeating-linear-gradient` de passo 202px (`rgba(253,213,211,.05)` nas verticais, `.03` nas horizontais).
- Padding de conteúdo 30px 34px; cabeçalho 24px 34px 20px; linhas de lista 18px 20px.
- **Raio zero** em todo container. A única curva do sistema são as silhuetas (círculo/arco).
- **Sem sombra.** Elevação é aresta + troca de fundo. Divisórias de 1px; separação de grupo por `gap:1px` sobre fundo `--linha`.
- Ênfase de linha = `border-left: 3px solid <cor de estado>`; ênfase de card = `border-top: 3px solid <cor de estado>`.

### As quatro silhuetas (glifos de estado)

Substituem ícones genéricos. Quadrado (`border-radius:0`), círculo (`50%`), quarto de arco (`0 0 100% 0`), contorno (`background:transparent; border:2px solid`). Tamanhos usados: 14px no menu, 22–26px nas listas, 62px nos blocos do site.

| Etapa / estado | Forma | Cor |
|---|---|---|
| Orçamento | quadrado | `#9457F0` |
| Aprovado | quadrado | `#7D2AE8` |
| Execução | quarto de arco (**girando**) | `#FD4400` |
| Entregue | círculo | `#EEB4E7` |
| Pago | círculo | `#DFF806` |
| Sem cliente / legado | contorno | `#8E77A6` |

---

## Telas — Painel (`design/Painel Eloi.dc.html`)

Shell: `grid-template-columns: 202px minmax(0,1fr)`.

### Trilho lateral (202px, `#0C0220`, borda direita `--linha`)
Wordmark clara 52px de altura (`padding: 0 22px 26px`). Cinco itens: glifo 14px + rótulo 13,5px + contagem à direita. Item ativo: fundo `#1B0647`, `border-left: 3px solid <acento>`, glifo na cor do acento, rótulo `#FFF1F0` em 'wght' 620. Hover: fundo `#1B0647`. Abaixo, rótulo "FERRAMENTAS" (10px, `.22em`, filete acima) + item Entregas. Rodapé: "Malha 202" / usuário.

### Cabeçalho (sticky, `rgba(18,4,50,.88)` + `blur(14px)`)
Marcador lima 22×3px + contexto em caixa alta lima; h1 38px; subtítulo 14px `#B79FC4` (máx 62ch). À direita, altura fixa **46px**: seletor de mês (3 botões numa borda `--linha-forte`; ativo com fundo `#7D2AE8`) + botão "+ Novo projeto" (`#DFF806` sobre `#120432`).

### 1. Hoje
- **"Precisa de você"** — lista de decisões. Grid `44px minmax(0,1fr) 140px 168px`, gap 20px, padding 18px 20px, fundo `#1B0647`, `border-left:3px` na cor do estado. Colunas: glifo 24px · título 15px + detalhe 12,5px · valor 15px alinhado à direita · botão. **Todos os botões têm 100% da coluna e 44px de altura** (lima = ação principal, laranja = urgente, fantasma = secundária).
- **"O mês em números"** — 4 células num grid `auto-fit minmax(180px,1fr)` com `gap:1px` sobre `--linha`. Cada célula: filete 20×3px na cor do papel, rótulo 10px, número 30px, nota 12px. Sem card, sem raio.
- **"Onde os projetos estão"** — 5 botões-etapa (`flex 1 1 130px`) com `border-top:3px`, glifo, rótulo, contagem 26px e soma. Clicar leva a Projetos já filtrado por aquela etapa.
- **"Prazos"** — linhas com distância em dias (`3d atraso` em `#FD4400`, `em 1d` em `#DFF806`, resto `#B79FC4`), título e cliente.

### 2. Projetos
Filtros como pílulas retas (ativo: fundo lima, tinta escura). Grade `auto-fill minmax(280px,1fr)`, gap 12px. Card: `border-top:3px` na cor da etapa, glifo + etapa em caixa alta, origem (marca/sub-cliente) 10px, título 16px, filete e então valor 16px + prazo.

### 3. Clientes
Lista de linhas (`gap:1px` sobre `--linha`), grid `1.6fr 1fr 1fr auto`: nome 19px + marcas 11,5px · "No mês" · "Em aberto" (laranja quando > 0) · selo de portal (lima "portal ativo" / cinza "sem senha"). Linha inteira é botão → ficha.

### 4. Ficha do cliente
4 números em `gap:1px`; lista de projetos do cliente (mesmo padrão de linha com glifo); rodapé de ações: "Abrir portal do cliente" (roxo cheio), "Gerar senha" e "Publicar entrega" (fantasma), com o estado do acesso à direita. **Sub-clientes (VIBRA/ASUS/MRV) aparecem como origem do projeto — agrupam e somam, nunca viram cliente próprio.**

### 5. Dinheiro
Gráfico de 202px de altura: por mês, um par de barras alinhadas pela base — realizado chapado lima, previsto em contorno `#9457F0` — rótulo do mês 10px abaixo, legenda em seguida. Altura = `valor / teto * 100%`. Depois, lista de movimentos: data 12px · descrição · selo `realizado`/`previsto` · valor com sinal `+`/`−` e `tabular-nums`, alinhado à direita em coluna de 110px.

### 6. Briefings
Mesmo grid da lista de decisões (`44px 1fr 140px 168px`): glifo, cliente + tipo, selo de estado centralizado, botão de ação.

### 7. Entregas
Grade `auto-fill minmax(240px,1fr)`: `border-top:3px`, glifo 26px, cliente, conteúdo, selo (`rascunho` laranja / `publicado` lima / `arquivado` cinza).

---

## Telas — Site (`design/Site Eloi.dc.html`)

Largura máxima 1416px (7 × 202), padding lateral 34px.

1. **Cabeçalho** sticky com wordmark 44px, três links 13,5px e CTA lima.
2. **Hero** `grid: minmax(0,1fr) minmax(0,426px)`: marcador lima, h1 `clamp(2.6rem,6.4vw,5.2rem)` em `−.04em` ("Quatro formas. Uma decisão por vez."), parágrafo `clamp(1rem,1.5vw,1.22rem)`, CTA lima 280px mínimo + link secundário. À direita, **recorte da malha**: 2×2 módulos de 426px com gap 22px (roxo animado, contorno lima, arco laranja girando, círculo lilás com a wordmark escura dentro) e um cursor em L de 14px descendo 202px por passo.
3. **Faixa de clientes** em `#1B0647`, rótulo + cinco nomes em caixa alta `.14em`.
4. **"Cada forma é uma etapa do trabalho"** — 4 blocos (`gap:1px`) com a silhueta em 62px: Quadrado→Estratégia, Círculo→Identidade, Arco→Campanha, Contorno→Sistemas.
5. **"Como funciona"** em `#1B0647`, três etapas numeradas (01 lima, 02 laranja, 03 lilás).
6. **Faixa rosa** (`#FDD5D3`, tinta `#120432`): frase-chamada + botão escuro que fica roxo no hover. É a única quebra clara do sistema — use uma só por página.
7. **Rodapé**: wordmark 40px, e-mail com sublinhado lima 2px, serviços e link do portal.

## Interações e movimento

Movimento tem função; nada decorativo.

- **`kv-morph`** 16s `ease-in-out` infinita — o módulo passa por quadrado → círculo → arco → arco invertido → estádio. Só no hero do site.
- **`kv-turn`** 16s `ease-in-out` em passos de 90° — usada no arco de "em execução": o projeto está girando.
- **`kv-cor`** 16s `steps(1,end)` — ciclo de cor em 6 passos com o **roxo em 4 deles** (`#7D2AE8, #9457F0, #FD4400, #7D2AE8, #EEB4E7, #9457F0`).
- **`kv-cursor`** 16s `cubic-bezier(.65,0,.35,1)` — o L desce 202px por passo, marcando a malha.
- **`entra`** 0,4s `ease-out` — entrada de tela ao trocar de área (`opacity 0→1`, `translateY(10px→0)`).
- Hover de linha/card: fundo `#1B0647 → #24085C`, 0,15s. Botão lima/laranja: `filter: brightness(1.08)`.
- **`@media (prefers-reduced-motion: reduce) { *{animation:none!important} }`** — obrigatório.

## Estado

Painel (mínimo): `rota` (`hoje|projetos|clientes|ficha|dinheiro|briefings|entregas`), `filtro` (etapa), `mes` (competência), `cliente` (id da ficha). Transições: item do menu → `rota`; botão de etapa em Hoje → `rota:'projetos'` + `filtro`; linha de cliente → `rota:'ficha'` + `cliente`.

Dados (edge functions que já existem, sem mudança de contrato): `eloi-gestao` (`clientes.detail`, `materiais.*`), `eloi-financeiro` (`caixas.*`, `movimentos.*`, `financeiro.stats`), `orcamentos`, `briefing-links`, `portal-cliente`. Valores em **centavos**, formatados com `toLocaleString('pt-BR')`.

Estados que faltam desenhar e devem seguir os mesmos tokens: vazio ("nenhum projeto nesta etapa" em `#8E77A6`, 13,5px, sem ilustração), carregando (linhas fantasma em `#1B0647`, sem spinner), erro (`#FF7A8A` sobre `#1B0647`, com ação de repetir).

## Responsividade

- ≥1200px: layout como nos protótipos.
- 900–1199px: trilho continua em 202px; grades caem para 2 colunas; cabeçalho quebra e o bloco de mês/ação vai para baixo do título.
- <900px: trilho vira barra de abas fixa no rodapé (58px + `env(safe-area-inset-bottom)`) e topo de 52px com wordmark; listas viram cartões empilhados (valor e ação em linha própria, ação com 100% da largura); campos com `font-size:16px` (evita zoom no iOS); alvo mínimo de 44px.
- A malha aperta para passo de 101px abaixo de 900px.

## Acessibilidade

Foco visível lima em tudo; contraste conforme a regra acima (corpo ≥ 4,5:1, chrome ≥ 3:1); linha de lista clicável deve ser `<button>` ou `<a>`, não `<div>` com handler; selos de estado nunca comunicam só por cor (sempre têm rótulo em texto); `aria-hidden` nos glifos decorativos.

## Assets

- `design/kv-sistema/assets/eloi-admin/wordmark-kv.svg` — wordmark com `fill="#FDD5D3"` embutido, para uso em `<img>` sobre fundo escuro.
- `design/kv-sistema/assets/eloi-admin/wordmark-tinta.svg` — `fill="#1B0647"`, para placas claras (círculo lilás, faixa rosa).
- `design/kv-sistema/assets/eloi-admin/wordmark.svg` — o arquivo original do repo, **sem `fill`** (renderiza preto em `<img>`).

⚠️ **Bug do repo a corrigir:** `assets/eloi-admin/wordmark.svg` e `wordmark-light.svg` são **byte-idênticos e nenhum declara `fill`** — hoje a wordmark sai preta em toda página que a usa via `<img>`. Adote os arquivos tintados acima.

⚠️ **`nav.js`:** ele injeta um `<style>` próprio depois do `<link>` e por isso vence a folha. Ao aplicar o tema, **remova o `styleTag()`** e deixe o JS só montar markup. Aproveite dele os `d` dos ícones (arrays `PRIMARY`/`TOOLS`) e note que o trilho dele tem **236px**, enquanto o `admin.css` declarava `--sidebar-w: 248px` — os dois nunca bateram. No design novo o trilho é **202px** (a malha), e a largura deve sair de um token só.

Sem set de ícones no repo: `assets/icons/` só tem ícones de PWA e `app/public/icons.svg` é o sprite padrão do template Vite (bluesky/discord/github). Os glifos do sistema novo são as quatro silhuetas — desenhadas em CSS, sem arquivo.

Fonte `Juturu-VariableVF.woff2` está em `assets/fonts/` **sem uso**: decidir se entra ou sai.

## Arquivos

| Arquivo | O que é |
|---|---|
| `design/Painel Eloi.dc.html` | Painel completo, sete telas navegáveis (referência principal) |
| `design/Site Eloi.dc.html` | Site novo, página única |
| `design/Eloi KV v3.dc.html` | O KV v3: peça 16:9, aplicações 1:1 / 4:5 / 9:16, paleta e a lógica dos módulos |
| `design/kv-sistema/kv.css` | Folha de tema escura já escrita com a **API de classes do repo** (`.btn`, `.tabs`, `.chip`, `.login`, `.eloi-nav`…) — atalho útil para as páginas estáticas legadas enquanto a SPA não absorve tudo |
| `design/support.js` | Runtime dos protótipos. **Não implementar.** |

Abra os `.dc.html` direto no navegador para ver comportamento e movimento.
