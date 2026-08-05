# Spec P0 — Auditoria completa do Painel ELOI

**Origem:** pedido de auditoria geral do usuário (bugs, lógica de mês/dados, nomenclatura, visual) + investigação real via workflow de 10 agentes (código de todas as páginas admin + edge functions) + query direta no Supabase de produção (47 serviços, 2 clientes, 1 orçamento).
**Método:** achados de alto risco (financeiro/dados-mês/lógica-relação) passaram por uma segunda verificação cética independente — 18/18 confirmados, 0 refutados. Achados de nomenclatura/visual/dead-code foram aceitos com a evidência file:line da primeira passada (menor risco de alucinação, checáveis por grep).
**Regra seguida:** nenhum dado foi inventado. Onde não existe data real pra corrigir um mês, a correção é tornar isso visível na UI, não inventar data (conforme instrução do usuário).

Este documento é a base pra `writing-plans` → `subagent-driven-development`. Organizado em 4 ondas, cada uma podendo ser implementada e verificada antes da próxima.

---

## Achados críticos (grounding real)

Query direta em `eloi_servicos` (project `nlamznxoocmygfvnqcns`, 2026-07-17): **47 serviços reais**, quase todos com descrição em CAIXA ALTA e muitos com preço por item embutido no título (ex.: `"PLANO& PARK SANTO AMARO (PPT + CONVITES) 1650,00 | (BACKDROP GAME BIKE) 200,00"` — a soma bate com `valor_cents`). **13 registros com `data_competencia` NULL**, sendo **3 já concluídos e não pagos** (~R$3.950,00 em trabalho pronto, não cobrado, invisível em qualquer total mensal). `eloi_clientes` tem só 2 linhas: `"F2 EXPERIENCE"` (grafia errada — o próprio usuário confirmou que o certo é "F2 Experience") e `"Georgia Andrade"` (já correta).

---

## Onda 1 — Integridade financeira e lógica de mês (prioridade máxima)

Impacta diretamente números que o usuário toma decisão em cima. Tudo confirmado por verificação independente.

1. **Serviços sem `data_competencia` somem de Faturado/Recebido/A receber em qualquer mês/ano**, tanto em `admin/index.html` quanto `gestao/index.html` (mesma lógica em `periodo.js`/cópia inline). Hoje só aparecem em "NF pendente"/"A faturar" (sem filtro de período). **Fix:** não inventar data — adicionar um indicador SEMPRE visível (independente do mês selecionado) tipo "Sem competência definida: N serviços · R$X", clicável, nos dois dashboards. `noPeriodo()` continua exigindo competência pros totais mensais (correto — um serviço sem mês não pode contar num mês específico), só deixa de ser invisível.
2. **`admin` "Clientes em destaque" descarta valor recebido de cliente que não apareceu no mapa por competência** (só inicializa entrada via `noPeriodo`, não via `pagoNoPeriodo`) — corrigir pra inicializar a entrada também a partir de quem recebeu pagamento no período, mesmo sem serviço com competência nesse mês.
3. **`gestao` abre sempre no mês atual mesmo sem nenhum dado** (commit `5a282c0` removeu o fallback). Hoje (2026-07) não há nenhum registro de competência em maio nem julho — painel abre zerado sem avisar que há dado em outros meses. **Fix:** se o mês atual não tiver nenhum serviço (nem competência nem pagamento), cair automaticamente no mês mais recente com dado, com texto explícito ("mostrando Junho — mês mais recente com lançamentos").
4. **Cards "Em execução"/"NF pendente" da Gestão ignoram o filtro de mês** enquanto os outros 3 do mesmo grid mudam — rotular explicitamente como contadores globais (não mudar o cálculo, já fazem sentido como globais).
5. **Rótulo "Faturado no mês"/"Recebido no mês" não muda pra "no ano" quando a aba "Todos" está ativa**, mas o valor passa a somar o ano inteiro — rótulo dinâmico.
6. **Bug latente:** serviço com competência no período E sem NF apareceria 2x na lista (em "A faturar" e em "Faturado do mês") — hoje não se manifesta na base real, mas é bug de filtro (os dois grupos não são mutuamente exclusivos). Corrigir excluindo de "Faturado" quem já está em "A faturar".
7. **Rótulo "Data da NF (competência)" mistura dois conceitos** (data de emissão da nota vs. mês de competência contábil) — provável causa raiz dos 13 registros com competência em branco. Separar em 2 campos/rótulos visuais claros.
8. **Autocomplete de sub-cliente/marca no modal de serviço não filtra pelo cliente selecionado** — abrir serviço de "Georgia Andrade" ainda sugere ASUS/VIBRA/MRV (marcas exclusivas de F2 Experience). Filtrar pelo cliente atual do modal.
9. **`dashboard.stats` (edge function) calcula `faturado_mes` usando `data_pagamento`** (é "recebido", não "faturado" — nome mente) **e `a_receber` soma TODOS os não pagos de todos os tempos** (não é "do mês" apesar do contexto). Nenhum frontend consome os dois campos hoje (dead code) — **remover** em vez de renomear, já que ninguém usa.
10. Bônus achado junto: **cálculo de "mês corrente" no servidor usa UTC**, frontend usa hora local — diverge perto da virada do dia em horário de Brasília. Como o campo que usava isso será removido (achado 9), não precisa de fix isolado.
11. **`servicos.upsert`/`clientes.upsert` não fazem `trim()` antes de checar campo obrigatório** (aceita string só-espaço via chamada direta à API) e **`status_execucao` inválido é silenciosamente rebaixado pra `em_execucao`** em vez de rejeitado; `valor_cents` aceita negativo. Endurecer validação server-side.

## Onda 2 — Vínculo cliente_id e bugs funcionais por página

1. **`orcamento-inteligente` nunca envia `cliente_id`** — orçamento gerado ali NUNCA aparece no portal do cliente, mesmo com nome digitado idêntico ao cadastrado (`portal-cliente.ts` filtra estrito por `cliente_id`). Adicionar select "Cliente cadastrado" igual ao já existente em `painel-orcamentos`, enviar `cliente_id` no `create()`.
2. **`painel-orcamentos` mostra botão "Criar serviço" pra qualquer orçamento aprovado**, mas o backend exige `cliente_id` vinculado (campo opcional, natural ficar vazio) — sempre falha com erro genérico quando não vinculado. Condicionar exibição a `status==='aprovado' && cliente_id`.
3. **Arredondamento por item ≠ arredondamento do total** em `orcamento-inteligente` — reabrir e salvar um orçamento sem alterar nada pode trocar R$154,72 por R$154,71 silenciosamente. Derivar `valor_total` da soma dos itens já arredondados.
4. **`preco_base` do catálogo pode salvar como 0 silenciosamente** (campo vazio/inválido) — serviço passa a ser oferecido de graça até alguém notar. Validar/avisar antes de salvar.
5. Item desativado no catálogo, mas já selecionado num orçamento em andamento, **continua contando no total** sem forma de desmarcar na UI. Limpar seleção ao desativar (ou mostrar com aviso).
6. Categoria do catálogo sem normalização (`trim`) — "Web" e "Web " (espaço) viram grupos visuais duplicados.
7. `salvarCatalogo()` usa `Promise.all` — uma falha no meio **duplica linhas já salvas** numa nova tentativa. Trocar por `Promise.allSettled` + atualizar apenas quem falhou.
8. Input de quantidade não re-renderiza após corrigir valor inválido (usuário vê "0"/"-5" no campo enquanto o cálculo já usa o valor corrigido).
9. **`marca`: regex de validação de `fill:currentColor` é mais permissiva que a regex de substituição real** — um SVG "aprovado" na validação pode sair sem cor nenhuma (silenciosamente vira preto). Unificar as duas regex.
10. **`marca`: `publicar()` exclui de propósito os `.preview.png` do zip**, mas a página pública de entrega exige esses arquivos pra renderizar cada swatch — a entrega fica com imagem quebrada assim que o fflate for vendorizado. Incluir os preview no zip.
11. `assets/vendor/fflate.min.js` **ainda não existe** — botão "Baixar .zip" 100% inoperante hoje (tratado com alert, não crasha, mas não funciona). Vendorizar ou documentar workaround atual (script Node).
12. Instruções pós-publicação de `marca` nunca mencionam copiar o próprio `.zip` pra `entregas-marca/<slug>/` (a página pública depende dele existir lá). Adicionar o passo.
13. Campo de slug em `marca` é editável livremente sem reaplicar `slugify()` — pode gerar pasta/URL inválida.
14. `painel-briefings`: formulário "Gerar link" **não valida cliente** — permite criar convite "sem nome" que fica preso na lista pra sempre (não há botão de excluir na UI, embora a edge function já suporte). Adicionar validação + botão de excluir.
15. `painel-orcamentos`: `linkPublico()` sempre acrescenta `/cliente/` ao link cadastrado, mas essa subrota só existe pra 1 orçamento legado do site inteiro — quebra "Copiar link"/"WhatsApp" pra qualquer outro link colado. Parar de assumir a convenção, ou tornar explícita (checkbox "tem página própria").
16. `painel-orcamentos`: view interna não trata valor negativo (desconto) como a página pública trata (sinal/cor) — mesmo dado, formatação diferente entre as duas telas.
17. `painel-orcamentos`: `salvar()` não valida cliente/título — permite orçamento em branco.

## Onda 3 — Sistema visual, cor por cliente, consistência entre telas

Achado raiz: **cada página admin redeclara seu próprio `:root` e reimplementa `.btn`/`.badge`** em vez de reaproveitar `assets/eloi-admin/admin.css` — é a causa da maioria das pequenas divergências visuais abaixo.

1. Consolidar componentes compartilhados em `admin.css` (badges de status, botões, título de página) — reduz drift futuro.
2. **Cor do cliente (`eloi_clientes.cor`) só é aplicada em `admin` e `gestao`** — em `painel-briefings`, `painel-orcamentos` e `portal` o mesmo cliente aparece como texto puro, sem chip colorido. Aplicar o chip nas 3 telas restantes (pedido explícito do usuário: "a cor é associada ao cliente em todos os serviços, relatórios, portal e indicadores relacionados").
3. **Regra única pra cor de marca vs. cor de cliente:** quando o serviço tem `sub_cliente` preenchido, usar `corDaMarca(sub_cliente)` (hash determinístico, já existe em `periodo.js`); quando NÃO tem `sub_cliente` (serviço "direto" do cliente), usar a cor real do cliente (`corCliente`/`corDoCliente`), nunca hash. Hoje isso é inconsistente em 2 pontos reais: `admin` "Sua atenção" (mostra texto de marca com cor do cliente-pai) e `gestao` ranking (mostra "Georgia Andrade", cliente sem marca, com cor de hash em vez da cor cadastrada dela).
4. `admin` "Sua atenção": linhas de orçamento/briefing usam cor roxa fixa (hardcoded) em vez de `corCliente(cliente_id)` quando o vínculo existe.
5. Paleta semântica pago/pendente **diverge entre telas** (verde/vermelho mais saturado no Portal, mais pastel em Gestão/Briefings) — unificar num par de cores só, usado em toda parte.
6. Ampliar a paleta além do roxo puro (pedido explícito): manter roxo como cor de marca/base + fundo em tons quase-preto/azul-marinho profundo (já é a direção, só reforçar no CSS compartilhado); as "cores com intenção" para diferenciar informação já existem — cor por cliente e semântica de status (verde/âmbar/vermelho) — só faltam ser aplicadas de forma consistente (itens 2, 3, 5 acima resolvem isso; não introduzir cor nova arbitrária).
7. Hover ausente em elementos clicáveis: `.cli-row` da Gestão (linha de cliente, abre modal ao clicar, sem indicação visual), chips de filtro da aba Briefings.
8. Indicador de carregamento ausente em `gestao`/`painel-briefings` (existe em `admin`/`orcamento-inteligente`) — padronizar.
9. `.row` de `painel-briefings` sem `flex-wrap` (existe a mesma classe com o wrap em `portal`) — risco de overflow em telas estreitas com nome de cliente longo.
10. `painel-orcamentos`: grid `minmax(300px,1fr)` sem fallback — estoura em viewport <348px. Trocar por `minmax(min(300px,100%),1fr)`.
11. `orcamento-inteligente`: modal de catálogo no mobile esconde o cabeçalho de coluna e deixa checkbox/botão de excluir sem rótulo — adicionar `aria-label`.
12. `marca`: título de página (`.pagetitle`) com peso/tamanho fora do padrão das outras telas do admin — alinhar.
13. **`admin`: falha total de conexão (ex. Supabase pausado) renderiza dashboard como se estivesse tudo em dia** (catch silencioso, sem banner de erro) — o painel mentiria visualmente. Adicionar estado de erro visível.
14. **`portal`: mesmo problema** — erro de rede/servidor mostra a mesma mensagem de "nada publicado ainda" que um estado vazio real, sem diferenciar nem oferecer retry. Corrigir em `carregarDados()`, `renderMarca()`, `renderArquivos()`.
15. `portal`: nome do próprio cliente exibido cru no topbar (hoje "F2 EXPERIENCE" em caixa alta) — resolve junto com a correção do dado (onda 4) + fallback de exibição pra clientes futuros com dado bruto.
16. **`portal`: descrição do serviço (aba Notas Fiscais) mostrada crua pro cliente final** — CAIXA ALTA + preço por item embutido no texto, direto da coluna `descricao` sem tratamento. Aplicar a mesma limpeza de nomenclatura (onda 4) resolve a origem; a tela deve exibir o texto já limpo.
17. Dead CSS: badges `.em_execucao`/`.concluida` nunca aplicados em `portal` (status é só texto). Remover.
18. Dead code: `corDoCliente()` declarada e nunca chamada em `gestao` — remover, ou usar no lugar de acesso direto a `.cor` (decisão: remover, já que os acessos diretos já funcionam e criar 2 caminhos pra mesma coisa é pior).
19. Dead var `LAST_TEL` em `painel-briefings` — remover.
20. Comentário desatualizado citando `/aplicativos/` em `marca/index.html:162` — atualizar referência.
21. `H1`/título de página varia muito de peso/tamanho entre telas (`gestao` não tem nenhum) — padronizar dentro do componente compartilhado (item 1).

## Onda 4 — Padronização de nomes e descrições (dado real)

**4.1 Cliente:** `"F2 EXPERIENCE"` → `"F2 Experience"` (grafia confirmada pelo próprio usuário no pedido original).

**4.2 Descrições de serviço (47 registros):** regra — remover CAIXA ALTA, extrair preço-por-item embutido pro campo `observacoes` (existe na tabela, hoje `null` em todos), manter título curto e escaneável, preservar o sentido/projeto de cada um, manter siglas reais (PPT, NF, 3D, IA, PDF) em maiúscula, resto em capitalização normal de português. Não mexer em `valor_cents`, `data_pagamento`, `nf_numero` — só `descricao` e `observacoes`.

Exemplos reais extraídos do banco (antes → depois):

| Antes (real, hoje no banco) | Depois — descrição | Depois — observações |
|---|---|---|
| `PLANO& PARK SANTO AMARO (PPT + CONVITES) 1650,00 \| (BACKDROP GAME BIKE) 200,00 \| (CENOGRAFIA CUBOS) 500,00` | Park Santo Amaro — PPT, convites, backdrop e cenografia | PPT + convites: R$1.650,00 · Backdrop game bike: R$200,00 · Cenografia cubos: R$500,00 |
| `ASUS - brinde oscar para fastshop - Direção de Arte Caixa e Lamina e PPT` | Brinde Oscar para Fastshop — direção de arte de caixa, lâmina e PPT | — |
| `PROJETO RECEPÇÃO - ASUS AP \| ESTUDOS PLANTA BAIXA/LAYOUT 350 \| MODELAGEM 3D + MOBILIÁRIOS 1.500 \| RENDERIZAÇÃO + IMAGENS 750 \| NOVA MODELAGEM 850 \| RENDERIZAÇÃO + IMAGENS 750` | Projeto de recepção — estudos de planta, modelagem 3D e renderizações | Planta baixa/layout: R$350,00 · Modelagem 3D + mobiliário: R$1.500,00 · Renderização + imagens: R$750,00 · Nova modelagem: R$850,00 · Renderização + imagens: R$750,00 |
| `ASUS NA CONVENÇÃO MAGALU (LAYOUT JOGO TUF) 300,00 \| LAYOUT ZENBO (ASUS WEEK, PÁSCOA, COPA DO MUNDO, DIA DAS MÃES) 1100,00` | ASUS na Convenção Magalu — layout jogo TUF e campanhas Zenbo | Layout jogo TUF: R$300,00 · Layout Zenbo (Asus Week, Páscoa, Copa, Dia das Mães): R$1.100,00 |
| `CONSTEL FESTA 35 ANOS - DIREÇÃO DE ARTE (CONVITE, BRINDES, PRESSKIT, MOCKUPS, PPT) 2000,00 \| VÍDEO ANIMAÇÕES ATIVAÇÃO TELEFONE-SOMBRAS 1000,00 \| DIREÇÃO DE ARTE TÚNEL ENTRADA 1000,00` | Constel Festa 35 Anos — direção de arte, vídeo e túnel de entrada | Direção de arte (convite, brindes, presskit, mockups, PPT): R$2.000,00 · Vídeo animações telefone-sombras: R$1.000,00 · Direção de arte túnel entrada: R$1.000,00 |

Antes de rodar nas outras ~42 linhas restantes: **gerar a tabela completa de antes→depois e revisar rapidamente com o usuário** (são registros de negócio reais, ele precisa reconhecer os próprios projetos) — não é um `UPDATE` cego em massa.

**4.3 `sub_cliente` igual ao nome do cliente-pai:** os 9 registros com `sub_cliente = 'F2 EXPERIENCE'` (mesmo nome do cliente) — limpar pra `null`/vazio, tratando como serviço "direto" (resolve a duplicidade visual do achado da Onda 3, item de grupo repetido).

**4.4 Separadores:** padronizar em `·` (middle dot) em todos os textos fixos da interface (hoje mistura `•`/`—`/`·` entre telas) — não é dado, é texto da UI.

## Fora de escopo (P0)

- Parcelamento/recorrência formal como conceito de dado (`valor_recebido_cents`, pagamento parcial) — **P2**.
- `data_entrega_prevista` / bloco de prazos — **P2**.
- Ligar `orcamentos`/`briefings` a `cliente_id` de forma estrutural ampla (além do fix pontual da Onda 2) — **P3** trata como pré-requisito de perfil de cliente.
- Reformular Portal/Entregas com tabela `eloi_materiais` — **P4**.
- Novo cliente/nova cor de paleta controlada como fluxo formal de cadastro — hoje já dá pra escolher cor livre no color-picker; formalizar "paleta controlada" fica pra quando houver volume de clientes que justifique.

## Critérios de aceite (do pedido original do usuário)

- Todas as telas principais navegáveis e funcionais.
- Dados coerentes entre si (Onda 1, 2).
- Totais financeiros corretos (Onda 1).
- Serviços vinculados ao mês correto, ou visivelmente marcados como sem competência (Onda 1.1).
- Nomes/descrições padronizados (Onda 4).
- Sem texto em caixa alta sem motivo (Onda 4, exceto siglas reais).
- Sem erro visual evidente em desktop/mobile (Onda 3).
- Clientes com identificação visual consistente por cor (Onda 3.2, 3.3).
- Sem atalho/tela/função morta (Onda 3.18-3.20, `/aplicativos/` já removido no P1).
- Correções aplicadas de fato, não só listadas (este spec vira plano → implementação real).
