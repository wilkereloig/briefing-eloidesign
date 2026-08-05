# Decisões — ELOI Studio

Decisões estruturais e o motivo de cada uma. Uma decisão sem motivo escrito é
desfeita pela primeira pessoa que achar estranha — inclusive você daqui a três meses.

Decisões com alternativa formalmente avaliada ficam em `adr/`.

---

## 2026-08-05 — Auditoria, limpeza e renomeação

### D-01 · Nome oficial: ELOI Studio
Público **ELOI Studio**, técnico `eloi-studio`.
Aplicado em: título, manifest, PWA, `package.json`, componente `<Marca />`,
documentação, rodapés e `alt`/`aria-label`.

**Não renomeado, de propósito:** tabelas (`eloi_*`), edge functions, buckets,
domínio, repositório GitHub, variáveis de ambiente e a pasta local
`briefing-eloidesign-repo`. São identificadores externos: renomear exige migração
e coordenação com serviços de fora, e não traz ganho nenhum de clareza.

**Limitação real:** o wordmark desenhado ainda letra "ELOI Design Studio".
São curvas de SVG, não texto. Re-letrar é trabalho de design.

### D-02 · `/admin-app/` removido
SPA React 18 substituída por `app/` (React 19). Nenhum consumidor: as únicas
referências eram os próprios rewrites do `vercel.json`. Nunca foi enviada a
ninguém de fora. Duplicava `api.ts` e `types/domain.ts` com bugs de campo já
conhecidos e corrigidos no `app/`.
`vercel.json` redireciona `/admin-app*` → `/admin` com 301 em vez de 404.

### D-03 · `db/` → `database/migrations/`
Pasta com nome de duas letras não diz se guarda schema, seed ou consulta solta.
`database/migrations/` diz. Os quatro comentários de código que apontavam para
`db/*.sql` foram atualizados junto.

### D-04 · `SITEMAP.md` → `docs/ROUTE_MAP.md`, `CONTEXT.md` → `docs/GLOSSARY.md`
Estavam na raiz por acidente histórico. Continuam sendo os mesmos documentos, com
os mesmos donos; mudou o endereço. Referências em código e em docs atualizadas.

### D-05 · `docs/` separado em atual e histórico
`docs/historico/` guarda os planos, specs e diagnósticos já executados
(`superpowers/`, `painel-admin-unificado/`, o diagnóstico de 2026-07-27).
São registro, não documentação viva. Apagar perderia o porquê de meia dúzia de
decisões; deixar misturado faz alguém seguir um plano que já foi superado.

### D-06 · `eloi-handoff/` **não** foi fundido em `app/src/ui/`
São coisas diferentes com o mesmo conteúdo: `app/src/ui/` é o que roda,
`eloi-handoff/` é o pacote que se entrega a quem vai aplicar o KV fora do painel.
Fundir tiraria o handoff de circulação; deixar solto deixaria os dois divergirem —
e já tinham divergido em três tokens de margem.

Resolvido com trava em vez de fusão: `app/src/ui/tokens.test.ts` compara os dois
arquivos e falha se divergirem. O cabeçalho de cada um agora diz explicitamente
quem é fonte e quem é espelho (antes os dois se declaravam fonte).

### D-07 · `app/src/` mantém a estrutura por camada
Não foi reorganizado para `features/<domínio>/`. A separação atual
(`domain/` puro · `lib/` acesso a dado · `ui/` visual · `routes/admin/telas/` tela)
já é clara, é a que as 76 linhas de teste assumem, e nenhum arquivo está órfão.
Mover 30 arquivos para trocar de taxonomia é risco de import quebrado sem ganho.

Reavaliar quando houver um segundo produto dentro de `app/` — aí a fronteira por
funcionalidade passa a valer mais do que a por camada.

### D-08 · `edge-functions/eloi-financeiro.ts` fica, marcada como legado
Perdeu o único consumidor junto com `/admin-app/`. **Mas a função continua
deployada no Supabase (v2).** Apagar o fonte deixaria em produção uma função sem
código versionado — exatamente o problema que o `scripts/deploy-edges.mjs` existe
para evitar. Ordem certa: retirar do Supabase primeiro, apagar o arquivo depois.

### D-09 · `assets/eloi-admin/periodo.js` e a fonte Juturu removidos
Zero referência em qualquer HTML, JS, CSS ou manifest. O `periodo.js` perdeu o
consumidor quando o hub estático `admin/index.html` saiu. A fonte
`Juturu-VariableVF.woff` não tem nenhum `@font-face` nem `<link>` apontando para ela.
Ambos recuperáveis pelo git se aparecer um uso dinâmico não previsto.

### D-10 · Entrega da Georgia Andrade não foi renomeada
`entregas-marca/georgia-andrade/` credita "ELOI Design". É um artefato **já
entregue**, acompanhado de um PDF e de um .zip que o código não consegue editar.
Renomear só o HTML dessincronizaria a página do material que o cliente baixou.
Fica como registro datado. O template que gera as **próximas** entregas
(`entregas-marca/_shared/entrega.js`) foi renomeado.

### D-11 · Painéis estáticos legados continuam no ar
`/gestao`, `/painel-orcamentos`, `/painel-briefings`, `/painel`, `/painel-ecommerce`.
Dois deles ainda são o **único** lugar de funções reais: gerar senha do portal
(`/gestao`) e criar/editar proposta (`/painel-orcamentos`). Retirar antes de
`/admin` cobrir isso tiraria capacidade do estúdio.
Condição para remover: a função equivalente existir em `/admin` e ter sido usada
em trabalho real. Ao remover, redirecionar no `vercel.json`, não deletar a rota.

### D-12 · Código em português, e continua
Domínio falado em português. Traduzir `competência`, `liquidação`, `pró-labore`
adicionaria uma camada de tradução onde erro de cálculo custa caro.

### D-13 · `deno check` consertado por config, não por edição de fonte
`jsr:@supabase/supabase-js@2` passou a puxar `npm:@supabase/realtime-js` como
dependência de tipos, e `deno check edge-functions/*.ts` — que o CI roda — quebrou
sozinho, por deriva de versão a montante.

Corrigido com `deno.json` (`nodeModulesDir: "auto"`). **Nenhum arquivo de edge
function foi tocado**: o repositório é a fonte do que está deployado, e mexer em
10 funções por um problema de ferramenta criaria divergência entre repo e produção
sem ganho nenhum. (A tentativa de remover o import não usado de
`edge-runtime.d.ts` foi revertida por esse mesmo motivo.)

### D-14 · Lint com saída zero
Duas mudanças em `app/.oxlintrc.json`:
- `ignorePatterns: ["dist/**"]` — o build commitado gerava 1091 avisos que
  escondiam qualquer aviso real.
- `react/only-export-components` desligada em `main.tsx`, `financas-store.tsx` e
  `AdminAuth.tsx`. São arquivos que por natureza misturam componente e
  não-componente (router com telas lazy, store que exporta provider + hooks,
  contexto de acesso). A regra é de Fast Refresh, não de correção. Deixá-la ligada
  ali só produzia 25 avisos que ninguém ia agir — e lint que sempre reclama
  para de ser sinal.

A saída do `npm run lint` agora é vazia. Aviso novo é aviso de verdade.

### D-15 · `vercel.json` declara o deploy estático explicitamente
O `package.json` novo na raiz fez a Vercel detectar projeto Node e tentar
`npm install && npm run build` — e falhar, porque a raiz não tem dependências e o
build mora em `app/`. O deploy do primeiro commit desta auditoria quebrou nos dois
projetos Vercel.

`vercel.json` passou a declarar `framework: null`, `installCommand` e
`buildCommand` neutros e `outputDirectory: "."`. O comportamento é o mesmo de
sempre; a diferença é que agora está escrito, em vez de depender de detecção
automática que muda quando alguém adiciona um arquivo na raiz.

---

## Anteriores (mantidas)

### Dinheiro é inteiro em cents
Float em dinheiro erra centavo, e centavo errado em fechamento vira uma hora
procurando diferença. Exceção herdada: `orcamentos.valor_total`, `numeric` em reais.

### Transferência é uma linha só
Duas linhas espelhadas (saída + entrada) inflariam faturamento e resultado.
Uma linha com `conta_id` e `conta_destino_id` move saldo e é neutra no resultado.

### Status de transação é derivado no servidor
Se a tela escolhe o status, duas telas escolhem diferente para o mesmo dado.

### Projeto é leitura combinada, não tabela
Ver [adr/0001](adr/0001-projeto-e-view-nao-tabela.md).

### Parcelas são transações irmãs por `grupo_id`
Cada parcela é uma obrigação real com data própria. Tabela de parcelas duplicaria
vencimento, status e liquidação.

### RLS nega `anon`; autorização é na edge function
A chave publicável está no HTML — é pública. Policy que permite leitura anônima
seria leitura da base inteira por qualquer um.

### Deploy de edge só pelo script
Em 2026-07-27, produção estava à frente do repositório e um diagnóstico inteiro
saiu errado. Dashboard nunca.

### `app/dist/` commitado
A Vercel não builda. Custo aceito: quem esquece `npm run build` publica a versão
anterior sem aviso.

### A logo nunca é centralizada
Sempre à esquerda, em qualquer contexto.
