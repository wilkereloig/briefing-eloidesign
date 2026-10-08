# Instruções para o Claude Code — ELOI Studio

Escrito em 2026-08-28. Substitui a versão de 07/08, cujos comandos represados já
foram executados e cujo "Item 7" já foi implementado (commit `d8f9499`).

Este é o documento que o Claude Code deve ler primeiro ao abrir o repositório.

---

## 1. Leitura obrigatória, nesta ordem, antes de escrever qualquer código

1. `CLAUDE.md` — regras do projeto: dinheiro em cents, nomenclatura, interface,
   deploy, o que nunca fazer.
2. `docs/ROTEIRO-SISTEMA-2026-08-28.md` — **o mapa geral**: auditoria completa de
   28/08 em 4 horizontes, ~90 achados com arquivo, linha e esforço.
3. `docs/PLANO-OPERACAO-2026-08-28.md` — o Horizonte 1 detalhado fase a fase
   (sub-clientes, nota fiscal 1:N, portal da F2, fechamento).
4. `docs/GLOSSARY.md` — antes de nomear qualquer coisa nova.
5. `docs/DECISIONS.md` — antes de "melhorar" algo que parece estranho: pode ser
   decisão consciente, com o motivo escrito.

Não comece a codar antes de ter lido 1, 2 e 3.

## 2. Onde o sistema está hoje

- `HEAD` = `d8f9499` — "feat(portal): cliente sugere valor de serviço pendente,
  dono aprova". A migração `2026-08-28-servicos-valor-sugerido.sql` **já está
  aplicada** no banco de produção.
- **Primeira coisa a conferir:** as edges `portal-cliente` e `eloi-gestao` foram
  mesmo deployadas depois desse commit? Migração aplicada com function velha faz
  o portal gravar em coluna que a function não conhece. Se houver dúvida,
  redeploy das duas (é idempotente).
- Dados reais: 59 serviços, 2 clientes (F2 EXPERIENCE e Georgia Andrade),
  9 sub-clientes em texto livre, 43 serviços com `nf_numero`, 11 com valor zero,
  16 sem competência. `eloi_notas_fiscais`, `eloi_contas`, `eloi_transacoes`,
  `eloi_arquivos` e `eloi_materiais` estão **vazias**.
- O negócio: o dono presta serviço para a **F2 Experience**; a F2 atende outras
  marcas (PLANO&PLANO, VIBRA, ASUS, CONSTEL, SWEET & COFFEE WEEK, MRV, TRISUL,
  LIGENCE) e **é a F2 quem define o valor de cada serviço**.

## 3. A ordem do trabalho

```
Horizonte 0  → docs/ROTEIRO-SISTEMA-2026-08-28.md, seção "Horizonte 0"
Horizonte 1  → docs/PLANO-OPERACAO-2026-08-28.md, fases 0 a 5
Horizonte 2  → ROTEIRO, seção "Horizonte 2"
Horizonte 4a → ROTEIRO, "Horizonte 4 · Segurança" (junto com o 2)
Horizonte 3  → ROTEIRO, seção "Horizonte 3"
Horizonte 4b → ROTEIRO, o resto do Horizonte 4
```

**Comece pelo item 0.1.** Ele não é melhoria, é indisponibilidade com data
marcada: `app/src/lib/financas-store.tsx:89` monta `2027-09-31`, que não existe,
e a partir de 2026-09-01 **nenhuma tela do `/admin` abre**.

## 4. Ciclo de trabalho — vale para todo item

1. Ler o item no ROTEIRO ou no PLANO. Abrir os arquivos citados e **confirmar o
   diagnóstico no código** antes de mudar. Se o achado estiver errado, dizer e
   não implementar.
2. Escrever o conserto ou a funcionalidade.
3. Teste onde toca dinheiro ou acesso: `app/src/domain/*.test.ts` (58 testes) e
   `edge-functions/_tests/` (16). Regra nova de valor, status, parcela ou posse
   **entra com teste**.
4. `npm run verify` (lint + typecheck + vitest + build + `deno check` + `deno test`).
   Atenção: `npm run typecheck` isolado **não checa nada** (`tsconfig`
   solution-style); quem pega erro de tipo é o `build`, que roda `tsc -b`.
5. `npm run build` sempre que tocar `app/src/` — `app/dist/` é commitado e a
   Vercel não builda. Esquecer publica a versão anterior sem nenhum erro.
6. Migração de banco: arquivo em `database/migrations/AAAA-MM-DD-assunto.sql`,
   idempotente (`if not exists` / `on conflict do nothing`), RLS ligado e sem
   policy para `anon`. **Aplicar no SQL editor do Supabase ANTES** do deploy da
   edge correspondente. Projeto: `nlamznxoocmygfvnqcns`.
7. Deploy de edge **só** por `npm run edges:deploy -- <nome>`. Pelo dashboard,
   nunca — já fez produção divergir do repositório uma vez (2026-07-27) e um
   diagnóstico inteiro saiu errado por causa disso. Precisa de
   `SUPABASE_ACCESS_TOKEN`.
8. Commit em português, no formato do repositório:
   `feat(admin): …` · `fix(security): …` · `docs: …` · `chore: …`.
   Um item ou uma fase por commit — nada de commit que faz três coisas.
9. Documentação no mesmo commit, quando a mudança for de arquitetura, dado ou
   interface: `CHANGELOG.md`, `docs/ROUTE_MAP.md`, `docs/FEATURE_MAP.md`,
   `docs/DATA_MODEL.md`, `docs/DECISIONS.md`.

## 5. Regras que não se quebram

1. **Dinheiro é inteiro em cents.** Exceção única e herdada:
   `orcamentos.valor_total`, que é `numeric` em reais.
2. **Validação no servidor, sempre.** O corpo da requisição nunca decide de quem
   é o dado — no portal, quem decide é `session.cliente_id`.
3. **Status de transação é derivado no servidor**, nunca escolhido pela tela.
4. **Todo cálculo de dinheiro sai de `app/src/domain/financeiro.ts`.** Tela não
   recalcula.
5. **Nenhum hex solto** em `.tsx`/`.css` de tela: cor vem de `ui/tokens.css` /
   `ui/tokens.ts`. **Cor nunca informa sozinha** — sempre com rótulo ou forma.
6. **Alvo de toque ≥ 44 px.** Vale no portal, que é usado no celular.
7. **Pílula: máximo 4**; acima disso vira menu. **Navegação primária: máximo 7**
   destinos.
8. **A logo nunca é centralizada** — sempre à esquerda, em qualquer contexto.
   (Se `COMPONENT_INVENTORY.md` disser o contrário, o inventário está errado;
   corrigir o documento no mesmo commit.)
9. **Ícone é do sprite autoral** (`eloi-icons.svg`), nunca biblioteca externa,
   nunca emoji.
10. **Código em português.** Componente/tipo `PascalCase`, função/variável
    `camelCase`, constante de módulo `MAIÚSCULA_`.
11. **`domain/` é código puro** — sem React, sem fetch. É o que sustenta os
    testes rodando em Node sem DOM.
12. **Nome proibido em arquivo versionado:** `novo`, `final`, `v2`, `copia`,
    `temp`, `teste`, `backup`, `old`.
13. **Não tocar** nas tabelas do outro produto que divide o mesmo Supabase:
    `transactions`, `cards`, `categories`, `category_rules`, `recurrences`,
    `budgets`, `monthly_goals`, `clients`, `services`, `invites`, `workspaces*`,
    `shared_*`, `push_subscriptions`, `app_secrets` — nem as edges
    `recurrences`, `reminders`, `categorize`.
14. **Rota nova entra em `app/src/main.tsx`**, onde vive o `createBrowserRouter`.
    Mexer só em `nav.ts` deixa a rota caindo no `NaoEncontrado`.

## 6. Quando parar e perguntar

Pare e pergunte ao Wilke antes de:

- qualquer `git push`, deploy de edge ou aplicação de migração em produção;
- apagar arquivo, tabela ou coluna; `git reset --hard`; `--force` de qualquer tipo;
- mexer em segredo, variável de ambiente ou `ADMIN_PASSWORD`;
- mudar uma decisão registrada em `docs/DECISIONS.md`;
- qualquer coisa que altere valor de serviço, nota fiscal ou dado de cliente em
  produção fora de uma migração revisada.

Não pare para perguntar coisas que o ROTEIRO e o PLANO já respondem — eles foram
escritos para isso.

## 7. Definição de pronto

Um item só está pronto quando: o comportamento errado descrito no ROTEIRO não
acontece mais (verificado, não presumido); `npm run verify` passa; `app/dist`
está buildado se `app/src` mudou; a documentação afetada foi atualizada no mesmo
commit; e o commit explica **por que**, não só o quê.

## 8. Pendências de higiene do repositório

- Existem dois arquivos vazios órfãos em `.git/` (`index.lock.orfao-cowork` e
  `lock-orfao-cowork-2`), deixados por uma ferramenta sem permissão de apagar.
  Podem ser removidos.
- Três arquivos na raiz nunca foram commitados e são de trabalho, não de
  produto: `RELATORIO-SISTEMA-PARA-REVISAO-IA.md` e
  `contexto-compactado-eloi-studio.md`. Decidir com o Wilke se entram no
  repositório, vão para `docs/historico/` ou saem.
