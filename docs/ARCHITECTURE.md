# Arquitetura — ELOI Studio

Como as camadas se ligam e **por que cada uma é assim**. Decisões pontuais com
alternativa avaliada estão em [DECISIONS.md](DECISIONS.md).

## O desenho em uma frase

Arquivos estáticos na Vercel, uma SPA em `/admin`, e todo acesso a dado passando
por edge functions que rodam com `service_role` — porque o RLS nega tudo para
`anon` e nenhum cliente fala direto com o banco.

```
┌─ navegador ────────────────────────────────────────────────┐
│  páginas HTML          SPA React (/admin)                  │
│  briefing · portal     app/dist                            │
│  orçamento · gestão                                        │
└───────────┬──────────────────────┬─────────────────────────┘
            │  fetch POST          │  fetch POST
            │  {action, ...}       │  {token, action, ...}
            ▼                      ▼
┌─ Supabase Edge Functions (Deno) ───────────────────────────┐
│  admin-auth  eloi-financas  eloi-gestao  orcamentos        │
│  portal-cliente  briefing-links  briefing-submit           │
│  get-briefings  get-ecommerce-briefings  eloi-financeiro   │
│                                                            │
│  valida sessão ▸ valida entrada ▸ usa service_role         │
└───────────┬────────────────────────────────────────────────┘
            ▼
┌─ Postgres ─────────────────────────────────────────────────┐
│  RLS ligado em toda tabela, sem policy para anon           │
│  Storage: eloi-notas, eloi-entregas (privados)             │
└────────────────────────────────────────────────────────────┘
```

## Por que não Supabase direto do front

A chave publicável está no HTML de cada página — é pública por definição. Se as
policies permitissem leitura anônima, qualquer pessoa leria a base inteira com
essa chave. Então: **RLS nega tudo para `anon`**, e a autorização de verdade
acontece dentro da edge function, que checa a sessão antes de usar `service_role`.
Consequência prática: uma tabela nova nasce inacessível, e é assim que deve ser.

## Autenticação

Duas áreas, dois mecanismos, sem cruzamento:

**Admin (o Wilke).** Senha única na variável `ADMIN_PASSWORD`, comparada dentro
de `admin-auth`. Sucesso grava uma linha em `admin_sessions` e devolve um token
opaco; validade de 12 h deslizante. O token vai para `localStorage` quando
"Manter conectado" está ligado e para `sessionStorage` quando não está. Cinco
tentativas erradas travam o login por 15 min (`admin_login_seguranca`).
Não existe recuperação por e-mail — trocar a senha é editar a variável e
redeployar `admin-auth`.

**Cliente (portal).** Senha própria por cliente, hash PBKDF2 em
`eloi_clientes.portal_senha_hash`, sessão em `portal_sessions`. Gerada pelo
admin em `/gestao`.

O token do admin é o mesmo (`eloi_admin_token`) para o painel novo e os painéis
estáticos, de propósito: enquanto os dois convivem, um login só serve para tudo.

## Camadas do painel (`app/src/`)

```
main.tsx            rotas (createBrowserRouter) + lazy de cada tela
auth/               tela de acesso e contexto de sessão
routes/admin/
  Shell.tsx         moldura: trilho, cabeçalho, Suspense
  Sidebar.tsx       trilho lateral (≥768) e barra inferior (≤767) — mesmo componente
  nav.ts            fonte única dos destinos
  telas/            uma tela por rota
  folhas.tsx        formulários em folha (modais)
domain/             REGRA DE NEGÓCIO — sem React, sem fetch
lib/                tipos, client de API, store, formatação de dinheiro
ui/                 sistema visual: tokens, primitivos, blocos de painel
```

A regra que sustenta o resto: **`domain/` não importa nada de `routes/` nem de
`ui/`.** É código puro, testável sem DOM, e é por isso que os testes de dinheiro
rodam em ambiente `node`.

## Dinheiro: uma fonte de cálculo

Todo saldo, resultado, pendência, fatura e previsão sai de
`app/src/domain/financeiro.ts`. **Tela nunca recalcula.** Duas telas com contas
próprias é exatamente como um sistema passa a mostrar dois valores para a mesma
coisa — e num painel financeiro isso não é um bug de exibição, é uma decisão
tomada com número errado.

Três invariantes que o código inteiro assume:

1. **Dinheiro é sempre inteiro em cents.** Única exceção herdada:
   `orcamentos.valor_total`, que é `numeric` em reais e precisa de `centsDeReais()`.
2. **Transferência não é receita nem despesa.** Uma linha só, com `conta_id` e
   `conta_destino_id`. Pró-labore, aporte, reembolso e pagamento de fatura de
   cartão são transferências. Duas linhas espelhadas inflariam o faturamento.
3. **Competência ≠ liquidação.** Resultado usa `data_competencia`; saldo usa
   `data_liquidacao`. Misturar os dois faz o mês fechar diferente do extrato.

## Estado no cliente

Um store só (`lib/financas-store.tsx`), com janela de −11/+12 meses. Ele carrega
contas, categorias, transações, recorrências, notas, clientes, serviços e
orçamentos numa passada e todas as telas leem dali. Não há cache por tela, não há
fetch duplicado, e trocar a lente (Tudo · Empresa · Pessoal) ou o mês não vai ao
servidor de novo.

## Edge functions

Um arquivo por função em `edge-functions/`, código compartilhado em `_shared/`.
Todas seguem a mesma forma: `POST` com `{ action, ...payload }`, `--no-verify-jwt`
(a autenticação é o token de sessão no corpo, não um JWT), CORS só para
`content-type`.

Deploy **só** por `npm run edges:deploy -- <fn>`, que remonta o layout que o CLI
do Supabase espera e reescreve os imports de `./_shared/` para `../_shared/`.
Deployar pelo dashboard já fez produção divergir do repositório uma vez; o
diagnóstico feito em cima do repo saiu inteiro errado.

## Build e publicação

A Vercel **não builda**. `app/dist/` é commitado e o `vercel.json` reescreve
`/admin/*` para `app/dist/index.html`. O `base` do Vite é `/app/dist/` porque os
assets são arquivos estáticos de verdade nesse caminho, sem rewrite.

O preço: quem edita `app/src/` e não roda `npm run build` publica a versão
anterior, e nada acusa. O ganho: zero configuração de build na hospedagem e
deploy idêntico ao que foi testado localmente.

## Responsividade

Um só componente serve trilho lateral e barra inferior — o que muda é CSS, não
árvore. Faixas: ≤767 barra inferior · ≥768 trilho de 72 px só com ícone ·
≥1024 trilho de 236 px com rótulo.

## O que NÃO existe (e é bom saber)

- Sem servidor Node próprio, sem Docker, sem fila.
- Sem service worker — o manifest instala, mas **não há modo offline**.
- Sem multiusuário: o admin é uma pessoa e uma senha.
- Sem tabela de parcelas: parcelas são transações irmãs ligadas por `grupo_id`.
- Sem tabela de projeto: Projeto é a leitura combinada de `orcamentos` +
  `eloi_servicos` (ver [adr/0001](adr/0001-projeto-e-view-nao-tabela.md)).
