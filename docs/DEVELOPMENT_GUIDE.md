# Guia de Desenvolvimento — ELOI Studio

Como continuar sem reabrir buraco já fechado.

---

## Antes de escrever qualquer linha

1. [GLOSSARY.md](GLOSSARY.md) — o nome certo do que você vai mexer.
2. [DECISIONS.md](DECISIONS.md) — se a ideia já foi avaliada e recusada.
3. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — se o componente/cor/espaço já existe.

## Ciclo padrão

```bash
cd app && npm run dev          # http://localhost:5207/admin
# … edita …
npm run lint && npm run typecheck && npm test
npm run build                  # OBRIGATÓRIO: dist/ é o que a Vercel serve
cd .. && git add -A && git commit && git push origin master
```

Ou, da raiz, tudo de uma vez: `npm run verify`.

**A armadilha número um deste repositório:** editar `app/src/`, commitar sem
`npm run build` e publicar a versão anterior. Nada acusa — a Vercel serve o
`dist/` commitado. Se o painel em produção não mudou, é isto.

---

## Adicionar uma tela ao painel

1. `app/src/routes/admin/telas/MinhaTela.tsx` — copie a tela mais parecida.
2. Rota lazy em `app/src/main.tsx`.
3. Destino em `app/src/routes/admin/nav.ts` (**fonte única** — não hardcode em
   lugar nenhum). Máximo 7 na primária; 4 na barra do celular.
4. Ícone: id do sprite `app/public/eloi-icons.svg` sem o prefixo `eloi-`.
   Não existe? Rótulo escrito, ou desenhe seguindo `ICON_GUIDELINES.md`.
5. Documente em [ROUTE_MAP.md](ROUTE_MAP.md) e [FEATURE_MAP.md](FEATURE_MAP.md).

**Cálculo de dinheiro na tela nova? Não.** Chame `app/src/domain/financeiro.ts`.
Se a conta não existe lá, crie lá, com teste.

## Adicionar um briefing direcionado

Padrão já validado duas vezes (Solarium, Guia Viver Bem):

1. Copie `briefing-solarium/` (e-commerce) ou `briefing-guia-viver-bem/` (redesign).
2. Nova pasta `briefing-<cliente>/index.html`.
3. No `<script>` do formulário:
   - token da URL `?t=` → `POST {SUPA_URL}/functions/v1/briefing-submit` com
     `{ token, raw: obj }` → grava em `briefing_links` → aparece no painel;
   - **backup Formspree `xpqeraow` sempre** — é o que salva a resposta se o
     Supabase estiver pausado;
   - `?mode=admin` pula a validação, para preview;
   - sucesso mostra confirmação; falha mostra erro, nunca silêncio.
4. Registre o tipo em `painel-briefings/index.html`: `<option>` em `#newTipo`
   + entradas em `TIPO_LABEL` e `TIPO_PATH`.
5. Documente em [ROUTE_MAP.md](ROUTE_MAP.md).
6. Commit **só** dos arquivos do briefing.

## Adicionar ou alterar uma edge function

1. Edite/crie `edge-functions/<nome>.ts`. Compartilhado vai em `_shared/`.
2. Forma da função: `POST` com `{ action, ...payload }`, `--no-verify-jwt`,
   CORS só `content-type`. Sessão validada por `_shared/auth.ts`.
3. **Valide toda entrada no servidor.** O filtro `or` do PostgREST é montado por
   concatenação de string — um `conta_id` sem validação vira injeção de filtro.
   Já aconteceu; hoje `ehUuid`/`ehData` barram.
4. Se for chamada pelo painel, adicione o nome à lista `Fn` em `app/src/lib/api.ts`.
5. `npm run edges:check && npm run edges:test`
6. `npm run edges:deploy -- <nome>` (precisa de `SUPABASE_ACCESS_TOKEN`).
   **Nunca pelo dashboard.**

## Alterar o banco

1. Novo arquivo `database/migrations/AAAA-MM-DD-assunto.sql`.
2. Toda tabela nova nasce com `alter table ... enable row level security;` e
   **sem policy para `anon`**. Quem acessa é a edge com `service_role`.
3. Aplique pelo SQL editor do Supabase.
4. Atualize `app/src/lib/tipos.ts` e [DATA_MODEL.md](DATA_MODEL.md).

Não apague tabela ou coluna só porque não aparece no front — confira consultas,
edges, relatórios, portal e migrações antes.

## Mexer no visual

- Valor novo entra em `app/src/ui/tokens.css`; se for consumido por TS, também em
  `tokens.ts`. Espelhe em `eloi-handoff/design-tokens/` — o teste cobra.
- **Nenhum hex solto em `.tsx`.**
- Componente novo só depois de checar `eloi-handoff/COMPONENT_INVENTORY.md` e
  `app/src/ui/componentes.tsx`.
- Alvo de toque ≥ 44 px.
- Cor nunca informa sozinha: sempre com rótulo ou forma.

## Testes

Vitest roda em ambiente `node`, sem DOM — o que é testado é lógica, não pixel.

Escreva teste quando: mexer em cálculo de dinheiro, em etapa de projeto, na fila
de decisões, no contrato do client de API, ou corrigir bug (o teste reproduz o
bug primeiro).

Não escreva teste para: montagem de JSX, formatação trivial, cor.

```bash
cd app && npm test
cd app && npx vitest run src/domain/financeiro.test.ts   # um arquivo
```

## Checklist de revisão

- [ ] `npm run verify` passa
- [ ] `npm run build` rodado e `app/dist/` commitado
- [ ] Nenhum hex solto em `.tsx`
- [ ] Nenhum cálculo de dinheiro fora de `domain/financeiro.ts`
- [ ] Entrada validada no **servidor**, não só no formulário
- [ ] Sem rolagem horizontal em 320 px
- [ ] Alvos de toque ≥ 44 px
- [ ] Estado de carregando, vazio e erro tratados
- [ ] Rota documentada no `ROUTE_MAP.md`
- [ ] Comportamento novo no `CHANGELOG.md`
- [ ] Só os arquivos da tarefa no commit

## Antes de apagar qualquer arquivo

Nome não é prova. Confirme que não há:

- import estático **nem dinâmico**;
- nome montado em runtime (`` `icone-${x}.svg` ``);
- referência em CSS (`url()`, `@font-face`), em `manifest.json`, em `vercel.json`;
- carregamento por convenção (tudo de uma pasta);
- uso pelas páginas estáticas — elas não passam pelo bundler e o TypeScript não
  enxerga nada delas.

Na dúvida, `git grep` pelo **nome do arquivo sem extensão** em todo o repositório.
Removeu? Registre em [CLEANUP_REPORT.md](CLEANUP_REPORT.md).

## Quando a coisa quebra

| Sintoma | Causa provável |
|---|---|
| Painel em produção não mudou | Faltou `npm run build` antes do commit |
| `/admin` 404 no `npm run dev` | O rewrite de dev do `vite.config.ts` |
| Edge devolve 401 | Sessão expirada (12 h) ou token no storage errado |
| Edge devolve 429 | 5 erros de senha; espera 15 min ou zera `admin_login_seguranca` |
| Painel lê zero de tudo | Projeto Supabase pausado (plano free) |
| Briefing não aparece no painel | Supabase pausado — a resposta está no e-mail Formspree |
| `removeChild` no console | Só no dev server. No build de produção não acontece |
| Produção diverge do repo numa edge | Alguém deployou pelo dashboard |
