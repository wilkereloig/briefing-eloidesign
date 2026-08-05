# Gestão ELOI — `/admin`

Controle financeiro pessoal e do ELOI Studio, clientes e projetos, num produto só.
React 19 · TypeScript · Vite · react-router 7 · CSS próprio. **Sem Tailwind, sem biblioteca de
componentes, sem biblioteca de ícones.** Nenhuma dependência nova sem motivo técnico real.

## Rodar

```bash
npm --prefix app install && npm --prefix app run dev
```

Abre em `http://localhost:5207/admin` (porta reservada no `PORTAS.md`). O `vite.config.ts` usa
`base: '/app/dist/'` porque em produção o `vercel.json` reescreve `/admin/*` para
`app/dist/index.html`; um plugin dev-only faz o mesmo rewrite localmente.

| Comando | O quê |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | `tsc -b && vite build` → `app/dist` (**commitado**: a Vercel não builda) |
| `npm test` | vitest (domínio, API e regras financeiras) |
| `npm run lint` | oxlint |

Sem variável de ambiente: a URL do Supabase e a publishable key vivem em `src/lib/api.ts`, e todo
acesso a dado passa por edge function autenticada. **Nenhum segredo no cliente.**

## Estrutura

```
src/
├── main.tsx          rotas (todas lazy) sob <RequireAdmin>
├── app.css           reset, escala tipográfica, shell, trilho/barra, faixas responsivas
├── auth/             guarda única do perímetro /admin/*
├── lib/
│   ├── api.ts        client das edge functions (allowlist de funções)
│   ├── tipos.ts      espelha o schema real do banco
│   ├── dinheiro.ts   formatação e parse — único lugar que formata moeda
│   └── financas-store.tsx  carga única compartilhada por todas as telas
├── domain/           REGRAS. financeiro.ts · projeto.ts · decisoes.ts (+ testes)
├── ui/
│   ├── tokens.css    tokens do KV aprovado
│   ├── tokens.ts     valores que precisam existir em JS (chips, cores de cliente)
│   ├── componentes.tsx  primitivos visuais, sem conhecer domínio
│   ├── painel.tsx    componentes que conhecem o domínio (Cabeçalho, Carga, Dinheiro…)
│   └── formato.ts    rótulos e formatação compartilhados
└── routes/admin/     Shell, Sidebar, folhas e telas/
```

## Regras que o código inteiro depende

1. **Dinheiro é cents inteiros.** Exceção herdada: `orcamentos.valor_total` (reais).
2. **Transferência não é receita nem despesa.** Uma linha só, com origem e destino; move saldo e é
   neutra no resultado. Pró-labore, aporte e pagamento de fatura são transferências.
3. **Todo cálculo sai de `domain/financeiro.ts`.** Se um número aparece na tela, saiu de lá.
4. **Competência ≠ liquidação.** Resultado usa competência; saldo usa liquidação.
5. **Nenhum hex solto em `.tsx`.** Cor vem de `ui/tokens.css` ou `ui/tokens.ts`.

## O que fica no servidor

`edge-functions/eloi-financas.ts` arbitra o que não pode depender do cliente:

- **parcelamento** — quem divide o valor é o servidor, senão dois clientes arredondam diferente e
  a soma das parcelas deixa de bater com o total;
- **liquidação** — `recebido_cents` nunca passa de `valor_cents`, e o status deriva do valor;
- **geração de recorrência** — idempotente por vencimento;
- **validações** de transferência, cartão e nota fiscal.

Leitura agregada (saldo, resultado, previsão) roda no cliente: são funções puras sobre dados já
carregados, cobertas por teste.

## Criar uma tela nova

1. Ler `eloi-handoff/prompts/CLAUDE_CODE_CONTEXT.md` e o `COMPONENT_INVENTORY.md`.
2. Reusar primitivo existente antes de criar outro. Um componente só existe se aparecer duas vezes.
3. Registrar a rota em `main.tsx` e o destino em `routes/admin/nav.ts` (máximo 7 na primária).
4. Envolver o conteúdo em `<Carga>` — garante esqueleto e estado de erro sem esquecimento.
5. Prever vazio, erro e carregando. Empty state orienta o próximo passo, não só informa.
6. Fechar pelo `eloi-handoff/prompts/VISUAL_REVIEW_CHECKLIST.md`.
7. Documentar a rota no `SITEMAP.md`.

## Testes

`npm test` cobre formatação de dinheiro, contratos da API, etapa do projeto, decisões e as regras
financeiras — incluindo os casos que quebram sistemas assim: transferência contada como receita,
centavo perdido no parcelamento, dia 31 vazando para o mês seguinte, pagamento de fatura de cartão
virando despesa em dobro e divisão por zero na margem.
