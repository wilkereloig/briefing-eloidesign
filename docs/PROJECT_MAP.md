# ELOI Studio — Mapa Geral

Ponto de entrada da documentação. Diz **o que existe, onde está e em que estado**.
Detalhe de cada assunto está nos arquivos apontados.

Atualizado: 2026-08-05.

---

## 1. Visão do produto

Um repositório serve duas audiências ao mesmo tempo:

- **Cliente** — formulários de briefing, orçamento com link próprio, portal com
  senha, página de entrega de marca.
- **Estúdio (só o Wilke)** — painel `/admin` com clientes, projetos, dinheiro
  pessoal e da empresa, notas fiscais, arquivos e relatórios.

O ciclo de trabalho que o repositório existe para atender é sempre o mesmo:
**estudo do site/marca → plano → briefing direcionado → registro no painel → orçamento → execução → entrega → cobrança.**

## 2. Arquitetura

Estático + SPA + funções de borda. Sem servidor próprio, sem build na hospedagem.
Ver [ARCHITECTURE.md](ARCHITECTURE.md).

```
navegador ──► Vercel (arquivos estáticos + rewrites)
                 │
                 ├─ páginas HTML (briefing, portal, orçamento, painéis legados)
                 └─ /admin ──► app/dist (SPA React)
                                  │
                                  ▼
                        Supabase Edge Functions (Deno, service_role)
                                  │
                                  ▼
                        Postgres com RLS negando anon + Storage privado
```

## 3. Sistemas existentes

| Sistema | Onde | Estado |
|---|---|---|
| Painel interno `/admin` | `app/` | **Ativo — é o produto** |
| Formulários de briefing | `briefing*/` | Ativo |
| Orçamento view-only do cliente | `orcamento/` | Ativo |
| Portal do cliente | `portal/` | Ativo |
| Entrega de marca | `entregas-marca/` | Ativo |
| Painéis estáticos antigos | `gestao/`, `painel*/` | **Congelados** — ver §15 |
| Gerador de variações de logo | `marca/`, `entregas-marca/_tools/` | Ativo, uso local |

## 4. Módulos

O painel é organizado por tela, não por pacote. Cada tela em
`app/src/routes/admin/telas/` é um módulo; o cálculo compartilhado vive em
`app/src/domain/` e o acesso a dados em `app/src/lib/`.

## 5. Funcionalidades

Inventário completo, com estado real de cada uma: [FEATURE_MAP.md](FEATURE_MAP.md).

## 6. Rotas

Tabela de rotas, arquivos e nível de acesso: [ROUTE_MAP.md](ROUTE_MAP.md).

## 7. Banco de dados

Tabelas, vínculos, regras e o que é de outro produto: [DATA_MODEL.md](DATA_MODEL.md).

## 8. Integrações

| Integração | Para quê | Arquivos | Variáveis | Estado |
|---|---|---|---|---|
| Supabase Postgres | Todo o dado | `edge-functions/*`, `database/migrations/*` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (só no servidor) | Ativo |
| Supabase Edge Functions | Toda leitura/escrita | `edge-functions/` | `ADMIN_PASSWORD` | Ativo, 10 funções |
| Supabase Storage | Notas fiscais (`eloi-notas`), entregas (`eloi-entregas`) | `edge-functions/eloi-gestao.ts`, `portal-cliente.ts` | — | Ativo, buckets privados com URL assinada |
| Formspree `xpqeraow` | Backup por e-mail de todo briefing | `briefing*/index.html` | — | Ativo — é o que salva o briefing se o Supabase estiver pausado |
| Vercel | Hospedagem + deploy | `vercel.json` | — | Ativo, push em `master` publica |
| GitHub Actions | lint, tipos, testes, build, `deno check` | `.github/workflows/ci.yml` | — | Ativo |
| Google Fonts | Archivo + Manrope | `<link>` nos HTML | — | Ativo |
| PWA | Instalar o painel no celular | `app/public/manifest.webmanifest`, `manifest.json` | — | Parcial — sem service worker, então **não funciona offline** |

Nenhum segredo aparece nesta documentação. Ver [`.env.example`](../.env.example).

## 9. Sistema visual

KV aprovado do ELOI Studio, um lugar só: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 10. Componentes compartilhados

`app/src/ui/componentes.tsx` (primitivos) e `app/src/ui/painel.tsx` (blocos de
tela). Anatomia e limites de uso em `eloi-handoff/COMPONENT_INVENTORY.md`.
As páginas estáticas compartilham `assets/eloi-admin/` — outro conjunto, mais
antigo, ver §15.

## 11. Assets

| Pasta | Conteúdo |
|---|---|
| `eloi-handoff/assets/logos/` | Assinaturas e símbolos por cor — **origem oficial** |
| `eloi-handoff/assets/icons/` | 45 ícones autorais, um SVG cada + o sprite `eloi-icons.svg` |
| `app/public/` | O que o painel serve: sprite, favicon, ícone do app, assinatura |
| `assets/eloi-admin/` | CSS/JS/wordmark das páginas estáticas |
| `assets/icons/` | Ícones PWA do site público (192/512) |
| `entregas-marca/<cliente>/` | Entregas já feitas — artefato de cliente, congelado |

## 12. Testes

76 testes em `app/` (Vitest) + 2 arquivos de teste das edges (Deno).
Cobrem cálculo de dinheiro, etapa de projeto, fila de decisões, formatação,
contrato do client de API e sincronia dos tokens. CI roda tudo em cada push.

## 13. Deploy

Push em `master` publica o site. Edge function só pelo script
(`npm run edges:deploy -- <fn>`). Migração de banco é manual, pelo SQL editor.

## 14. Estado atual

- Painel completo e verificado em produção; **as tabelas financeiras estão vazias**
  porque nunca houve lançamento — não é defeito, é sistema novo.
- Clientes (2) e serviços (50) já têm dado real, herdado do painel `/gestao`.
- `/admin-app/` foi removido; os painéis estáticos continuam no ar, congelados.

## 15. Pendências

| Pendência | Onde | Nota |
|---|---|---|
| Cadastrar as contas reais | `/admin/config` | Sem conta cadastrada, todo indicador mostra zero |
| Aposentar `/gestao` e `/painel-*` | raiz | Só depois que `/admin` cobrir o que eles fazem; ao migrar, redirecionar no `vercel.json` |
| Editor de propostas dentro de `/admin` | — | Hoje só em `/painel-orcamentos` |
| Importação CSV/XLSX | — | Nunca começada |
| Exportação/impressão de relatórios | — | Nunca começada |
| Service worker (offline real) | `app/` | O manifest existe, o worker não |
| Etapas de projeto com pagamento por etapa | — | Precisaria de tabela nova |
| Wordmark re-letrado para "ELOI Studio" | `assets/eloi-admin/wordmark.svg` | O desenho ainda diz "ELOI Design Studio" |
| `fflate.min.js` vendorizado | `marca/` | Botão "Baixar .zip" depende dele |

## 16. Riscos

| Risco | Consequência | Mitigação atual |
|---|---|---|
| Esquecer `npm run build` antes do commit | Painel publicado desatualizado sem erro nenhum | CI builda, mas não compara com o `dist/` commitado |
| Supabase free pausa o projeto | Painel para de ler; briefing só chega por e-mail | Formspree é backup em todo formulário |
| Senha admin única | Não há segundo fator nem recuperação | Trava de 15 min após 5 erros |
| Deploy de edge pelo dashboard | Produção diverge do repo silenciosamente | Regra: só `npm run edges:deploy` |
| Dois produtos no mesmo Supabase | Mexer em tabela errada | Prefixo `eloi_` + lista explícita em [DATA_MODEL.md](DATA_MODEL.md) |

## 17. Próximas etapas

1. Cadastrar contas e categorias reais em `/admin/config` e começar a lançar.
2. Trazer o editor de propostas para `/admin/projetos`.
3. Redirecionar `/gestao` e `/painel-*` quando as telas equivalentes estiverem provadas em uso.
4. Re-letrar o wordmark (trabalho de design).
