# Mapa de Funcionalidades — ELOI Studio

Estado real, não estado pretendido. Uma tela existir não faz a funcionalidade
estar concluída: só conta como **Concluído** se o fluxo completa e o dado persiste.

Estados usados: `Concluído` · `Funcional com ajustes` · `Em desenvolvimento` ·
`Planejado` · `Legado` · `Descontinuado`.

Atualizado: 2026-08-07.

---

## Painel interno (`/admin`)

### Visão geral (Hoje)
- **Objetivo:** responder "como estou hoje" em uma tela e apontar o que precisa de ação.
- **Estado:** Concluído
- **Tela:** `app/src/routes/admin/telas/Hoje.tsx`
- **Componentes:** `ui/painel.tsx` (Bloco, Indicador, ListaItem), `ui/componentes.tsx`
- **Endpoints:** `eloi-financas` (`bootstrap`), `eloi-gestao`, `orcamentos`
- **Tabelas:** `eloi_contas`, `eloi_transacoes`, `eloi_notas_fiscais`, `eloi_servicos`, `orcamentos`
- **Permissão:** admin
- **Depende de:** store único, `domain/financeiro.ts`, `domain/decisoes.ts`
- **Pendência:** nenhuma
- **Testes:** `domain/decisoes.test.ts`, `domain/financeiro.test.ts`

### Dinheiro
- **Objetivo:** lançar, liquidar, parcelar, estornar e acompanhar todo movimento.
- **Estado:** Concluído
- **Telas:** `telas/Dinheiro.tsx` (5 abas), `FolhaTransacao.tsx`, `folhas.tsx`
- **Endpoints:** `eloi-financas` — `transacoes.upsert/list/liquidar/cancelar/parcelar/remover`, `contas.*`, `recorrencias.*`
- **Tabelas:** `eloi_transacoes`, `eloi_contas`, `eloi_categorias`, `eloi_recorrencias`
- **Permissão:** admin
- **Fluxos:** receita · despesa · transferência · parcelamento · pagamento parcial · estorno · pagar fatura de cartão · recorrência (pausar/retomar/encerrar)
- **Pendência:** conciliação de saldo; importação CSV/XLSX
- **Testes:** `domain/financeiro.test.ts` (incluindo estorno e a invariante liquidado+aberto=combinado)

### Projetos
- **Objetivo:** funil do orçamento à cobrança, agrupado por cliente e marca.
- **Estado:** Funcional com ajustes
- **Tela:** `telas/Projetos.tsx`
- **Endpoints:** `eloi-gestao` (`servicos.*`, `subclientes.*`), `orcamentos`
- **Tabelas:** `eloi_servicos` + `eloi_sub_clientes` + `orcamentos` (Projeto é a leitura combinada)
- **Permissão:** admin
- **Cobre:** filtro por cliente, marca e etapa (`<select>`) · pendências sem valor / sem nota / entregue e não pago (pílula) · filtro de mês **opcional**, desligado por padrão · agrupamento cliente → marca · valor editável na linha (serviço não pago) · excluir serviço
- **Pendência:** **criar e editar a proposta ainda é em `/painel-orcamentos`** — aqui só dá para aprovar. Etapas de projeto com pagamento por etapa não existem.
- **Testes:** `domain/projeto.test.ts`

### Marcas (sub-clientes)
- **Objetivo:** separar o trabalho que o cliente intermedia (F2 → Vibra, ASUS) sem inventar cliente novo.
- **Estado:** Concluído
- **Telas:** `folhas.tsx` (`FolhaSubCliente`), painel "Marcas atendidas" em `telas/ClienteFicha.tsx`, filtro e agrupamento em `telas/Projetos.tsx`
- **Endpoints:** `eloi-gestao` (`subclientes.list/upsert/delete`)
- **Tabelas:** `eloi_sub_clientes`, `eloi_servicos.sub_cliente_id`
- **Permissão:** admin
- **Regras:** marca pertence a um cliente e o banco recusa vínculo cruzado (trigger) · excluir marca com serviço é 409, o caminho é desativar · `eloi_servicos.sub_cliente` é espelho por trigger, ninguém escreve nele (D-18)

### Clientes e ficha
- **Objetivo:** carteira com faturado/a receber e a ficha consolidada do cliente.
- **Estado:** Concluído
- **Telas:** `telas/Clientes.tsx`, `telas/ClienteFicha.tsx`
- **Endpoints:** `eloi-gestao` (`clientes.list/upsert/detail/gerar_senha_portal`)
- **Tabelas:** `eloi_clientes`
- **Permissão:** admin
- **Fluxos:** cadastro · ficha consolidada · **gerar senha do portal** (2026-08-07) · **enviar material para o cliente** (2026-08-07)
- **Pendência:** cliente-filho real (`parent_id`) segue adiado; hoje só existe `sub_cliente` como rótulo

### Notas fiscais
- **Objetivo:** acompanhar status da nota e ligá-la ao recebimento.
- **Estado:** Concluído
- **Tela:** `telas/Notas.tsx`
- **Endpoints:** `eloi-financas` (`nf.*`)
- **Tabelas:** `eloi_notas_fiscais` + `eloi_servicos.nota_fiscal_id` (1 nota : N serviços)
- **Permissão:** admin
- **Regra:** nota `emitida`/`enviada` exige número — validado no servidor; número é único por emissor
- **Cobre (2026-09-03):** uma nota cobre vários serviços, escolhidos na folha · filtro de mês opcional · lista mostra os serviços de cada nota · "concluídos sem nota" lê `nota_fiscal_id`
- **Anexo (2026-08-07):** o PDF da nota já emitida sobe pelo painel (`arquivos.upload_url` → `arquivo_path`). O painel **não emite** nota: guarda a que foi emitida fora dele.
- **Portal (2026-09-03):** o cliente baixa o PDF pela nota vinculada ao serviço dele (`nota_fiscal_id` → `arquivo_path`). A coluna antiga `eloi_servicos.nf_arquivo_url` está nula em toda linha e não é mais lida.

### Relatórios
- **Objetivo:** resultado de 12 meses, ranking, previsão e metas.
- **Estado:** Funcional com ajustes
- **Tela:** `telas/Relatorios.tsx`
- **Endpoints:** `eloi-financas` (`metas.*`)
- **Tabelas:** `eloi_metas`, `eloi_transacoes`
- **Permissão:** admin
- **Pendência:** **sem exportação nem impressão**

### Calendário
- **Objetivo:** ver vencimentos do mês numa grade.
- **Estado:** Concluído · **Tela:** `telas/Calendario.tsx` · **Permissão:** admin
- Estado nunca só por cor: ponto por tipo, contorno quando liquidado.

### Arquivos
- **Objetivo:** acervo com upload real e vínculo ao que o arquivo documenta.
- **Estado:** Concluído
- **Tela:** `telas/Arquivos.tsx`
- **Endpoints:** `eloi-financas` (`arquivos.*`), `eloi-gestao` (URL assinada)
- **Tabelas:** `eloi_arquivos` · **Storage:** `eloi-notas`
- **Permissão:** admin

### Configurações
- **Objetivo:** contas, cartões e categorias por contexto.
- **Estado:** Concluído · **Tela:** `telas/Config.tsx` · **Permissão:** admin
- Conta se desativa, não se exclui: a FK de transação é `on delete restrict`.

### Entregas — área do cliente
- **Objetivo:** publicar no portal o material que o cliente vai baixar.
- **Estado:** Concluído (2026-08-07)
- **Tela:** `telas/Entregas.tsx`, `folhas.tsx` (`FolhaEntrega`)
- **Endpoints:** `eloi-gestao` — `materiais.list/upsert/delete`, `entregas.upload_url`, `entregas.view_url`
- **Tabelas:** `eloi_materiais` + bucket privado `eloi-entregas`
- **Permissão:** admin
- **Fluxos:** enviar arquivo · publicar/despublicar da própria lista · editar metadados · excluir
- **Regra:** o binário sobe **antes** do registro. Invertido, uma falha de rede deixaria card no portal do cliente com download quebrado; nesta ordem o pior caso é um órfão no Storage.

### Briefings (dentro do painel)
- **Objetivo:** leitura dos convites de briefing e vínculo com cliente.
- **Estado:** Funcional com ajustes — **só leitura e vínculo**; gerar convite e **ler as respostas** ainda é em `/painel-briefings`
- **Tela:** `telas/Briefings.tsx`
- **Endpoints:** `briefing-links`, `get-briefings`, `get-ecommerce-briefings`

### Acesso
- **Objetivo:** entrar no painel e tratar bem todo jeito de não conseguir.
- **Estado:** Concluído
- **Tela:** `app/src/auth/AdminAuth.tsx`
- **Endpoint:** `admin-auth`
- **Tabelas:** `admin_sessions`, `admin_login_seguranca`
- **Cobre:** senha errada · sessão expirada · bloqueio por tentativas (429) · erro de servidor · manter conectado · mostrar/ocultar senha · Caps Lock · trava de envio duplo
- **Não cobre:** recuperação de senha por e-mail (não existe, por design), segundo fator, múltiplos usuários
- **Testes:** `lib/api.test.ts`

---

## Cliente

### Briefing de identidade visual — `/briefing/`
Concluído. Grava em `briefings` + e-mail Formspree. Público.

### Briefing de e-commerce — `/briefing-ecommerce/`
Concluído. Base genérica de 5 etapas, grava em `ecommerce_briefings`. Público.

### Briefings direcionados — `/briefing-solarium/`, `/briefing-guia-viver-bem/`
Concluído. Token `?t=` → `briefing-submit` → `briefing_links`; backup Formspree.
Guia Viver Bem tem identidade própria de saúde, não a marca ELOI. Público com token.

### Orçamento do cliente — `/orcamento/?t=<token>`
Concluído. View-only por `share_token`, sem login, sem link para o admin.
Lê pela action `public_get` da edge `orcamentos`.

### Portal do cliente — `/portal/`
Concluído. Senha própria (PBKDF2), abas Marca · Arquivos · Notas · Orçamentos ·
Briefing. Sessão em `portal_sessions`.

### Entrega de marca — `/entregas-marca/<slug>/`
Concluído. Protegida pelo gate do portal. É o link que vai por WhatsApp.

---

### Site do estúdio — `/`
- **Objetivo:** apresentar o estúdio, mostrar trabalho e levar ao briefing.
- **Estado:** Funcional com ajustes (2026-08-07)
- **Arquivo:** `index.html` (uma página, sem build; CSS próprio, não o do painel)
- **Base:** comp aprovado `eloi-handoff/references/Site Eloi 2026.dc.html`
- **SEO:** `description`, Open Graph, `canonical`, JSON-LD `ProfessionalService`, `robots.txt`, `sitemap.xml`
- **Pendência:** fotos dos projetos (hoje é grafismo do KV); a copy dos cards de projeto veio do comp e **não foi conferida**; faltam os números de vitrine além dos 7 anos

## Ferramentas do estúdio

### Gerador de variações de logo — `/marca/`
Funcional com ajustes: o botão "Baixar .zip" depende de `assets/vendor/fflate.min.js`,
que **não está vendorizado**. A geração de produção é feita pelo script Node
`entregas-marca/_tools/gerar-variacoes.mjs`.

---

## Legado (congelado — no ar, sem evolução)

| Rota | Substituída por | Por que ainda existe |
|---|---|---|
| `/gestao/` | `/admin/clientes` | **Nada — substituído em 2026-08-07.** Senha do portal, envio de entrega e anexo de NF estão no painel novo. Pronto para sair. |
| `/painel-orcamentos/` | `/admin/projetos` (parcial) | **Único lugar que cria e edita proposta** |
| `/painel-briefings/` | `/admin/briefings` (leitura) | Gera convite **e** é o único lugar que mostra o que o cliente respondeu (`raw`) |
| `/painel/`, `/painel-ecommerce/` | `/admin/briefings` | Leem os briefings antigos, sem token |
| `/orcamento-inteligente/` | `/painel-orcamentos/` | Redirect; o link pode ter sido compartilhado |

## Descontinuado

| O quê | Quando | Nota |
|---|---|---|
| `/admin-app/` (SPA React 18) | 2026-08-05 | Removido. `vercel.json` redireciona 301 para `/admin` |
| `admin/index.html` (hub estático) | 2026-08-05 (anterior) | Arquivo estático vencia o rewrite de `/admin` |
| `assets/eloi-admin/periodo.js` | 2026-08-05 | Perdeu o único consumidor junto com o hub |
| edge `eloi-financeiro` | 2026-08-05 | Sem consumidor no repo. Fonte mantida porque a função **continua deployada** |
