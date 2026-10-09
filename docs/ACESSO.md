# Acesso, auditoria e automação (Etapa 8)

Estado conferido em produção em 2026-10-09. Este documento é o mapa: quem entra,
o que vê, o que fica registrado e o que roda sozinho. Nada de credencial aqui.

## 1. Como é hoje

| Porta | Quem | Como entra | Sessão |
|---|---|---|---|
| Painel `/admin` | o dono (uma senha só) | edge `admin-auth` › `login` com `ADMIN_PASSWORD` (variável do projeto Supabase) | `admin_sessions`: desliza 12 h a cada uso, teto absoluto de 30 dias; 5 erros travam 15 min **por rede** (`admin_login_ip_attempts`), com um teto global contra ataque distribuído; `logout_all` derruba todas |
| Portal `/portal` | cada cliente | edge `portal-cliente` › `login` com a senha do cliente | `portal_sessions` — **tabela separada**: token de cliente nunca vale como admin (por schema) |
| Briefing público | qualquer pessoa com o link | edge `briefing-submit` — com token grava no link (`briefing_links`); sem token (`formulario`) grava em `briefings`/`ecommerce_briefings` — + backup Formspree | sem sessão; limite por IP (`briefing_submit_ip_attempts`) nos dois caminhos |
| Banco direto (REST/anon) | ninguém | RLS nega `anon`/`authenticated` em toda tabela `eloi_*`; RPCs financeiras só `service_role`. `briefings`/`ecommerce_briefings`: sem privilégio para `anon`/`authenticated` e políticas de insert com `check (false)` desde 2026-10-09 (antes as páginas gravavam direto pelo REST, sem limite) | — |

Autorização é **na edge**: toda ação de `eloi-financas`, `eloi-gestao`, `orcamentos`,
`get-briefings` etc. chama `requireAdmin` (`edge-functions/_shared/auth.ts`) antes de
qualquer leitura. Conferido em 2026-10-09: sem token, todas respondem **401**;
`eloi-financeiro` (legada) responde **410**; `categorize`, `reminders` e
`recurrences` (app Financeiro antigo) respondem **401/410** e seus crons estão
desligados.

**Limite conhecido:** uma senha = uma pessoa. Quem tiver a senha vê tudo, inclusive
o financeiro **pessoal**. Não compartilhe a senha do painel com colaborador.

## 2. Matriz de acesso (alvo das identidades individuais)

| Recurso | Proprietário | Administrador | Operador | Contador / consulta | Visualizador |
|---|---|---|---|---|---|
| Financeiro **pessoal** (lente Pessoal, contas pessoais) | ver e editar | — | — | — | — |
| Financeiro **empresa** — lançar, liquidar, importar | sim | sim | sim | — | — |
| Financeiro empresa — estornar, desfazer importação, saldo inicial, conferência com ajuste | sim | sim | — | — | — |
| Financeiro empresa — relatórios e exportação | sim | sim | sim | sim (só leitura) | — |
| Clientes, projetos, serviços, tarefas | sim | sim | sim | ler | ler |
| Orçamentos e briefings | sim | sim | sim | ler | ler |
| Notas fiscais e documentos | sim | sim | sim | ler e baixar | — |
| Contas, cartões, categorias (estrutura) | sim | sim | — | — | — |
| Auditoria (`eloi_auditoria`) | ler | ler | — | ler (empresa) | — |
| Usuários, papéis, sessões | sim | — | — | — | — |
| Portal do cliente (prévia como cliente) | sim | sim | sim | — | — |

Regras que a matriz assume:
- **Contexto pessoal é do proprietário.** Colaborador da empresa nunca recebe acesso
  ao pessoal por compartilhar o painel — o filtro é no servidor (ação a ação), não a
  lente da tela.
- Lente (Tudo/Empresa/Pessoal) continua sendo **filtro de interface**; permissão é
  outra coisa e mora na edge.

## 3. Plano para identidades individuais (não implementado)

Ordem proposta, cada passo publicável sozinho:

1. **Tabela `eloi_usuarios`** (id, nome, e-mail, papel, ativo, criado_em) e
   `admin_sessions.usuario_id`. O dono vira o primeiro usuário `proprietario`.
2. **`_shared/permissoes.ts`**: a matriz acima como dado (`pode(papel, acao, contexto)`),
   com teste de tabela inteira. `requireAdmin` passa a devolver o usuário; cada ação
   de edge declara o que exige. Sem isso nenhum outro papel é criado.
3. **Filtro de contexto no servidor**: `transacoes.list`, `bootstrap`, relatórios e
   RPCs recebem o contexto permitido do usuário (pessoal só para o proprietário).
4. **`eloi_auditoria.autor`** = usuário (hoje grava `admin`).
5. **Entrada**: senha por usuário (hash forte, mesmo limitador por IP) ou Supabase
   Auth; **MFA TOTP** obrigatório para proprietário e administrador.
6. **Recuperação**: o proprietário mantém a `ADMIN_PASSWORD` como chave de emergência
   (só ela recria o proprietário); demais usuários são redefinidos pelo proprietário.
   Não há recuperação por e-mail — mesma decisão de hoje.
7. **Revogação**: desativar usuário derruba as sessões dele; "sair de todos" por
   usuário e global (hoje `logout_all` é global).

O portal do cliente continua como está (senha por cliente, tabela própria).

## 4. Auditoria — o que fica registrado

`eloi_auditoria` (só a edge/RPC grava; sem acesso `anon`): `acao`, `tabela`,
`registro_id`, `antes`, `depois`, `motivo`, `autor`, `em`.

| Ação | Onde |
|---|---|
| liquidar, reverter liquidação | `eloi_liquidar`, `eloi_reverter_liquidacao` |
| pagar fatura, **estornar pagamento de fatura** (com motivo) | `eloi_pagar_fatura`, `eloi_estornar_pagamento_fatura` |
| importar lote, **desfazer importação** (cada linha inteira, com motivo) | `eloi_importar`, `eloi_reverter_importacao` |
| criar empréstimo | `eloi_criar_emprestimo` |
| conferência de saldo (com ajuste e justificativa) | `eloi_registrar_conferencia` |
| remover lançamento (linha inteira) | edge `transacoes.remover` |
| mudar estrutura de conta (saldo inicial com motivo, arquivar, tipo/limite) | edge `contas.upsert` |

Cada pagamento também fica em `eloi_liquidacoes` (data, conta, forma, chave), com
reversão como linha negativa — nada é sobrescrito.

## 5. Automação — o que roda sozinho

| Rotina | Quando | O que faz | Idempotência | Em falha |
|---|---|---|---|---|
| `eloi-rotina-diaria` (pg_cron → `eloi_rotina_diaria()`) | 06:05 de Brasília | gera contas fixas até 10 dias à frente; marca "vencido" pela data | ocorrência única por `(recorrencia_id, ocorrencia)`; trava consultiva contra execução simultânea; reexecutar não duplica | erro de uma recorrência não para as outras: vai para `eloi_recorrencias.ultimo_erro`; histórico em `cron.job_run_details`; o painel mostra "não carregou: contas fixas" |
| Abrir o painel | cada sessão | mesma geração (`recorrencias.gerar`), uma vez por sessão | mesma regra | aviso parcial na tela, o resto carrega |

**Não automatizado de propósito:** cobrança, WhatsApp e e-mail não são enviados
sozinhos (o briefing exige autorização). Alertas aparecem no painel (Hoje, Visão
geral › Próximos 7 dias, Precisa de revisão).

**IA:** nenhuma no fluxo do Studio. A edge `categorize` (app Financeiro, usava chave
de IA) está desativada. Descrições financeiras não saem para terceiros.

## 6. Navegador e documentos

- Logout limpa buscas recentes e posição de listas (`limparDadosLocais`); tema e
  "ocultar valores" ficam (não são dado do estúdio).
- Painel em preview ou `localhost` **não grava em produção** (`escritaBloqueada`).
- Documentos (notas, arquivos, entregas) em bucket privado; leitura por URL assinada
  de 10 minutos.
- Conteúdo vindo de cliente/banco nas páginas públicas passa por `esc()` antes de
  `innerHTML` (portal, orçamento, marca); o que entra sem escape são valores internos
  (cores, caminhos de arquivo, datas formatadas).
- **PWA:** há manifesto (instalar na tela inicial), mas **não há modo offline nem
  sincronização** — não anunciar como app offline.

## 7. Pendências de segurança (registradas, não alteradas)

- Advisor do Supabase: `accept_my_invites`, `is_member`, `is_owner` (app Financeiro)
  executáveis por `anon`. App desligado; revogar ao decidir o destino dele.
- `pg_net` no schema `public` (padrão antigo do projeto).
- "Leaked password protection" do Supabase Auth desligado (o Studio não usa Supabase
  Auth; vale para o app Financeiro).
