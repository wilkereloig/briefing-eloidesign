# ELOI Studio — contexto permanente

Nome público **ELOI Studio**, técnico `eloi-studio`. Repositório único: vitrine
para cliente + painel interno do estúdio. Dono: Wilke Eloi.

Produção <https://briefing-eloidesign.vercel.app> · painel `/admin` ·
GitHub `wilkereloig/briefing-eloidesign` · Vercel publica no push para `master`.

## Antes de qualquer tarefa

Leia, nesta ordem, o que for do assunto:

| Preciso de… | Arquivo |
|---|---|
| Visão geral e estado real | `docs/PROJECT_MAP.md` |
| Como as camadas se ligam | `docs/ARCHITECTURE.md` |
| Rota, arquivo, permissão | `docs/ROUTE_MAP.md` |
| Nome certo de um conceito | `docs/GLOSSARY.md` |
| Tabela, coluna, vínculo | `docs/DATA_MODEL.md` |
| Cor, componente, espaço | `docs/DESIGN_SYSTEM.md` |
| Como adicionar tela/briefing/edge | `docs/DEVELOPMENT_GUIDE.md` |
| Por que algo está assim | `docs/DECISIONS.md` |

**Não re-investigue do zero e não diga "não sei como funciona".** O mapa está aqui.

## Arquitetura em 5 linhas

- Páginas públicas: HTML estático, sem build, uma pasta por rota.
- Painel `/admin`: SPA React 19 + Vite + TS em `app/`. **`app/dist/` é commitado —
  a Vercel não builda.** Esqueceu `npm run build`? Publicou a versão anterior.
- Backend: edge functions Deno em `edge-functions/`, `service_role`.
- Postgres com **RLS negando `anon` em toda tabela**. Autorização é na edge.
- Deploy de edge **só** por `npm run edges:deploy -- <fn>`. Dashboard nunca.

## Três regras de dinheiro que o código inteiro assume

1. **Cents inteiros, sempre.** Exceção herdada: `orcamentos.valor_total` (reais).
2. **Transferência não é receita nem despesa** — uma linha só, com `conta_id` e
   `conta_destino_id`. Pró-labore, aporte e pagamento de fatura são transferências.
3. **Todo cálculo sai de `app/src/domain/financeiro.ts`.** Tela nunca recalcula
   saldo, resultado nem pendência.

E mais duas: competência decide o resultado, liquidação decide o saldo; status de
transação é derivado no servidor, nunca escolhido pela tela.

## Regras de interface

- Antes de criar cor, componente, espaçamento, card ou padrão, **veja se já
  existe**: `eloi-handoff/design-tokens/`, `eloi-handoff/COMPONENT_INVENTORY.md`,
  `app/src/ui/componentes.tsx`, `app/src/ui/painel.tsx`.
- **Nenhum hex solto em `.tsx`.** Cor vem de `ui/tokens.css` ou `ui/tokens.ts`.
- Cor nunca informa sozinha. Alvo de toque ≥ 44 px. Elevação é tom, não sombra.
- **A logo nunca é centralizada** — sempre à esquerda, em qualquer contexto.
- Tela nova segue o KV aprovado. Nada de dashboard genérico.

## Critérios para coisa nova

**Componente novo** só se: não existe equivalente, vai ser usado em mais de um
lugar, e cabe no `COMPONENT_INVENTORY`. Variação de um existente é `prop`, não
arquivo novo.

**Funcionalidade nova** precisa de: rota em `nav.ts` (fonte única), estado de
carregando/vazio/erro, validação **no servidor**, entrada em `ROUTE_MAP.md` e
`FEATURE_MAP.md`, e teste se tocar dinheiro.

**Arquivo apagado** só depois de provar que não há import dinâmico, nome montado
em runtime, referência em CSS/manifest/vercel.json, nem uso pelas páginas
estáticas (que não passam pelo bundler). Registre em `docs/CLEANUP_REPORT.md`.

## Limpeza

Proibido em nome de arquivo versionado: `novo`, `final`, `v2`, `copia`, `temp`,
`teste`, `backup`, `old`. Se precisa do sufixo para distinguir, o antigo já
devia ter saído.

Código morto sai no mesmo commit que o substitui. Legado que precisa ficar ganha
comentário dizendo por quê e qual a condição de saída — hoje isso vale para
`edge-functions/eloi-financeiro.ts` e os painéis estáticos `/gestao` e `/painel-*`.

## Cuidados que já custaram caro

- **Dois produtos no mesmo Supabase.** `transactions`, `cards`, `categories`,
  `recurrences`, `budgets`, `monthly_goals`, `clients`, `services`, `workspaces*`,
  `shared_*` são do **app Financeiro** — não tocar. O nosso tem prefixo `eloi_`.
- **Backup Formspree em todo briefing.** É o que salva a resposta quando o
  Supabase free pausa.
- **Não commite WIP alheio.** O repositório costuma ter trabalho local em
  andamento; commit só o que é da tarefa.
- **Ações destrutivas** (apagar arquivo, reset/force-push, mexer em segredo,
  deploy) só com confirmação.

## Convenção

Código em **português** — o domínio é falado em português e traduzir só adiciona
erro. `PascalCase` para componente e tipo, `camelCase` para função e variável,
`MAIÚSCULA_` para constante de módulo, `kebab-case` para classe e token CSS,
`AAAA-MM-DD-assunto.sql` para migração.

## Regra de ouro

Arquitetura mudou? Atualize este arquivo, `docs/ROUTE_MAP.md` e o `CHANGELOG.md`
no mesmo commit. Documentação que atrasa um commit já está errada.
