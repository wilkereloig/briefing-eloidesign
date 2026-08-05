# Modelo de Dados — ELOI Studio

Projeto Supabase `nlamznxoocmygfvnqcns`, schema `public`.
Vocabulário do domínio em [GLOSSARY.md](GLOSSARY.md). Migrações em
`database/migrations/`, em ordem cronológica.

Atualizado: 2026-08-05.

---

## ⚠️ Duas aplicações no mesmo projeto Supabase

O projeto hospeda **também** o app Financeiro, que é outro produto. As tabelas
abaixo **não são deste repositório** e não devem ser lidas, escritas nem alteradas:

`transactions` · `cards` · `categories` · `category_rules` · `recurrences` ·
`budgets` · `monthly_goals` · `clients` · `services` · `invites` ·
`workspaces` · `workspace_members` · `shared_expenses` · `shared_participants` ·
`shared_charges` · `push_subscriptions` · `app_secrets`

As edge functions `recurrences`, `reminders` e `categorize` também são daquele
produto. Foi decisão explícita **não reusar** nada disso — o que é do ELOI Studio
tem prefixo `eloi_` (mais as tabelas herdadas listadas em §3).

---

## 1. Núcleo financeiro

Criado em `2026-08-04-gestao-eloi-financeiro.sql`. Pessoal e empresa convivem nas
mesmas tabelas, separados pela coluna `contexto` (`pessoal` | `empresa`).

### `eloi_contas`
Onde dinheiro fica: corrente, digital, poupança, dinheiro, **cartão de crédito**,
investimento, reserva, outro.
- `saldo_inicial_cents`, `limite_cents`, `dia_fechamento`, `dia_vencimento`, `cor`, `ativa`
- Cartão sem `dia_fechamento`/`dia_vencimento` é barrado por constraint: sem ciclo não existe fatura.
- Cartão **não entra no saldo disponível** — fatura é dívida, não caixa.
- Não se exclui conta: a FK de `eloi_transacoes` é `RESTRICT`. Desative.

### `eloi_categorias`
Árvore rasa (`pai_id` → ela mesma, `SET NULL`). 36 linhas de seed. Tem `contexto`.

### `eloi_transacoes`
**Toda** movimentação: receita, despesa, transferência, parcela e compra no cartão
são linhas desta tabela. O que muda é `tipo`/`contexto`/vínculo, nunca a estrutura.

| Coluna | Significado |
|---|---|
| `valor_cents` | o combinado |
| `recebido_cents` | o que efetivamente andou — pagamento parcial é normal |
| `data_competencia` | a que mês o valor pertence → usada no **resultado** |
| `data_vencimento` | quando é devido |
| `data_liquidacao` | quando o dinheiro andou → usada no **saldo** |
| `status` | derivado no servidor, nunca escolhido pela tela |
| `conta_id` / `conta_destino_id` | origem / destino (destino só em transferência) |
| `grupo_id` | liga parcelas irmãs |
| `recorrencia_id` | de que molde a linha nasceu |

Enum `eloi_status_mov`: `previsto` · `pendente` · `parcial` · `realizado` ·
`vencido` · **`cancelado`** (masculino — escrever `cancelada` no TypeScript fez
o estorno não estornar).

**Invariante:** liquidado + em aberto sempre fecha em `valor_cents`.

### `eloi_recorrencias`
Molde que gera transações. Materializado ao abrir o painel, **idempotente por
vencimento**. Pausar ou encerrar não apaga o que já foi gerado.

### `eloi_notas_fiscais`
Ligada a Cliente, Serviço e Transação (todas `SET NULL`). Status
`emitida`/`enviada` **exige número**, validado no servidor.

### `eloi_metas`
Meta e orçamento de gasto na mesma tabela, discriminados por `especie`.
Desativar preserva o histórico do planejado.

### `eloi_arquivos`
Acervo. Vínculo opcional a cliente, serviço, transação e nota — todos `CASCADE`,
porque um arquivo que documenta algo apagado não documenta mais nada.

---

## 2. Clientes, projetos e propostas

### `eloi_clientes` *(2 linhas)*
Dono de projetos, do acesso ao portal e de sub-clientes.
`portal_senha_hash` (PBKDF2), `marca_slug`, `marca_publicada`, `cor`.

### `eloi_servicos` *(50 linhas)*
Trabalho contratado. `cliente_id` é `RESTRICT` — cliente com serviço não some.
`orcamento_id` liga à proposta, **no máximo 1:1**, garantido por índice único parcial.
`sub_cliente` é texto livre: agrupa marcas dentro de um cliente (VIBRA/ASUS/MRV
dentro de F2 EXPERIENCE). É rótulo visual, **não é cliente próprio** — não tem
portal, senha nem orçamento.

### `orcamentos`
Proposta. `share_token` dá o link view-only do cliente.
⚠️ **`valor_total` é `numeric` em reais** — o único campo monetário fora da
convenção de cents em todo o sistema. Precisa de `centsDeReais()` para exibir ou comparar.

Dois gatilhos sustentam o vínculo:
- `trg_eloi_orcamento_aprovado` — aprovar cria o serviço automaticamente, idempotente.
- `trg_eloi_orcamento_guard` — bloqueia enviar/aprovar sem `cliente_id`.

Orçamento aprovado com serviço fica travado para título/valor/cliente: edite o serviço.

### `catalogo_servicos`
Itens reutilizáveis do calculador de orçamento.

---

## 3. Briefings

| Tabela | O que guarda |
|---|---|
| `briefing_links` | Convite com token + a resposta (`raw` JSON). É o caminho atual. |
| `briefings` | Briefings de identidade visual enviados **sem** token (legado) |
| `ecommerce_briefings` | Briefings de e-commerce enviados **sem** token (legado) |

As duas legadas ganharam `cliente_id` em `2026-07-30-briefings-legado-cliente-id.sql`
para poderem ser adotadas por um cliente depois do fato.

---

## 4. Sessões e segurança

| Tabela | Para quê |
|---|---|
| `admin_sessions` | Sessão do admin, 12 h deslizante |
| `admin_login_seguranca` | Contador de tentativas; 5 erros travam 15 min |
| `portal_sessions` | Sessão do cliente no portal (`CASCADE` do cliente) |
| `portal_login_ip_attempts` | Throttle por IP no portal |

**RLS está ligado em toda tabela e não há policy para `anon`.** Só a edge function,
com `service_role`, lê e escreve. Ver [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 5. Legado congelado (vazio, não remover ainda)

| Tabela | Nota |
|---|---|
| `eloi_caixas` | Conta do painel `/gestao`; substituída por `eloi_contas` |
| `eloi_movimentos_financeiros` | Movimento do `/gestao`; substituído por `eloi_transacoes` |
| `eloi_materiais` | Metadados de entrega; lido por `/portal` e `/admin/entregas` |

`eloi_caixas` e `eloi_movimentos_financeiros` estão vazias e sem consumidor no
painel novo, mas a edge `eloi-financeiro` **continua deployada** apontando para
elas. Só remover depois de retirar a função do Supabase.

---

## 6. Storage

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `eloi-notas` | PDFs de nota fiscal e arquivos do acervo | Privado, URL assinada |
| `eloi-entregas` | Entregas de marca, `<cliente_id>/marca/...` | Privado, URL assinada |

---

## 7. Matriz de relacionamentos

Vínculos reais, como estão no banco hoje:

```
Cliente (eloi_clientes)
├── Orçamentos ......... orcamentos.cliente_id
├── Serviços ........... eloi_servicos.cliente_id          RESTRICT
├── Transações ......... eloi_transacoes.cliente_id        SET NULL
├── Notas fiscais ...... eloi_notas_fiscais.cliente_id     SET NULL
├── Arquivos ........... eloi_arquivos.cliente_id          CASCADE
├── Materiais .......... eloi_materiais.cliente_id
├── Briefings .......... briefing_links / briefings / ecommerce_briefings
└── Sessão do portal ... portal_sessions.cliente_id        CASCADE

Projeto  =  1 orcamentos  +  0..1 eloi_servicos  (por orcamento_id, único)
├── Cliente ............ obrigatório dos dois lados
├── Transações ......... eloi_transacoes.servico_id        SET NULL
├── Nota fiscal ........ eloi_notas_fiscais.servico_id     SET NULL
├── Arquivos ........... eloi_arquivos.servico_id          CASCADE
└── Materiais .......... eloi_materiais.servico_id

Conta (eloi_contas)
├── Transações ......... conta_id / conta_destino_id       RESTRICT
├── Recorrências ....... eloi_recorrencias.conta_id        SET NULL
└── Metas .............. eloi_metas.conta_id               CASCADE

Transação (eloi_transacoes)
├── Categoria .......... categoria_id                      SET NULL
├── Recorrência ........ recorrencia_id                    SET NULL
├── Parcelas irmãs ..... grupo_id (sem FK — é agrupamento)
├── Nota fiscal ........ eloi_notas_fiscais.transacao_id   SET NULL
└── Arquivos ........... eloi_arquivos.transacao_id        CASCADE
```

**Vínculos que não existem** (e a decisão sobre cada um):
- Cliente → cliente-filho (`parent_id`): adiado. Hoje só `sub_cliente` como rótulo.
- Projeto → etapas com pagamento por etapa: precisaria de tabela nova. Não planejado.
- `grupo_id` sem FK: proposital — parcelas se referenciam entre si, não a um pai.

---

## 8. Regras que o código inteiro assume

1. Dinheiro é sempre inteiro em cents. Exceção única: `orcamentos.valor_total`.
2. Transferência é **uma linha só**, neutra no resultado.
3. Status de transação é derivado no servidor.
4. Todo cálculo sai de `app/src/domain/financeiro.ts`.
5. RLS nega `anon`; autorização acontece na edge function.

## 9. Riscos e cuidados

- **Não exclua tabela ou coluna só porque não aparece no front.** `eloi_materiais`
  é lida pelo portal do cliente; `catalogo_servicos` é lida pelo painel de orçamentos.
- Alterar `orcamentos.valor_total` para cents seria correto, mas exige migração
  de dado + mudança em `orcamentos.ts`, `/painel-orcamentos`, `/orcamento` e
  `centsDeReais()`. Não fazer pela metade.
- As tabelas do núcleo financeiro estão **vazias**: qualquer constraint nova ainda
  é barata de aplicar. Depois do primeiro lançamento, não é mais.
