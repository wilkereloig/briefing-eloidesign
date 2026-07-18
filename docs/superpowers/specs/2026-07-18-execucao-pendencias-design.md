# Execução das pendências — Design

**Data:** 2026-07-18
**Escopo:** sequenciar e executar o que ficou pendente dos planos `2026-07-18-orcamentos-unificado.md` e `2026-07-17-p0-auditoria.md`.

Este documento não cria trabalho novo. Ele resolve conflitos entre os dois planos existentes e define a ordem de execução.

---

## Estado de partida

- `master` com **15 commits locais** não pushados. Produção (Vercel) não tem nenhum deles.
- Única coisa deste ciclo já em produção: edge function `eloi-gestao` v10.
- **Plano Orçamentos Unificado:** 8 tasks, nenhuma iniciada.
- **Plano P0 Auditoria:** Tasks 1–6 concluídas e commitadas. Task 7 já absorvida pela Task 6 do plano de Orçamentos. Tasks 8–19 pendentes.
- P2, P3, P4: nunca especificados. **Fora deste escopo.**

---

## Conflitos resolvidos

### 1. P0 Task 8 é dissolvida

`painel-orcamentos/index.html` é alvo tanto da P0 Task 8 quanto das Tasks 3–6 do plano de Orçamentos. Rodar os dois em sequência faria o segundo sobrescrever o primeiro, e a regra final seria decidida pela ordem de execução, não por intenção.

| Step da P0 Task 8 | Destino |
|---|---|
| Step 1 — gate do "Criar serviço" exigindo `cliente_id` | → **Task 4b** (nova, no plano de Orçamentos) |
| Step 2 — `linkPublico()` para de anexar `/cliente/` | → **Task 4b** |
| Step 3 — valor negativo na view interna | → absorvido pela **Orçamentos Task 5 Step 3**, que reescreve a mesma linha |
| Step 4 — validação no `salvar()` | → absorvido pela **Orçamentos Task 6 Step 3** |

A P0 Task 8 fica marcada como dissolvida no plano do P0. Ninguém a executa.

### 2. Regra de validação do `salvar()` — decidida

Os dois planos discordavam. Decisão do Wilke: **cliente, título e ao menos um item são todos obrigatórios.**

A Orçamentos Task 6 Step 3 passa a ser:

```js
  const itens = lerItens();
  if(!itens.length){ toast('Adicione ao menos um item.'); return; }
  const clienteVal = document.getElementById('f_cliente').value.trim();
  const tituloVal  = document.getElementById('f_titulo').value.trim();
  if(!clienteVal || !tituloVal){ toast('Preencha cliente e título.'); return; }
```

E `itens: lerItens(),` vira `itens: itens,` no objeto, pra não ler duas vezes.

### 3. `/tmp` não existe no Windows

O plano do P0 usa `/tmp/po-check.js` nos steps de verificação de sintaxe. Substituir pelo diretório de scratchpad da sessão em todos os steps afetados.

---

## Sequência de execução

| Etapa | Conteúdo | Como |
|---|---|---|
| **0** | Push dos 15 commits | Direto. Vercel deploya. |
| **1** | Orçamentos Task 1 — migration + edge fn | **Contexto principal.** Mexe em produção; tem gate financeiro. |
| **2** | Orçamentos Task 2 — módulo de cálculo | Subagent. TDD fechado. |
| **3** | Orçamentos Tasks 3 → 4b → 4 → 5 → 6 | Subagent por task, **estritamente sequencial** — mesmo arquivo. Diff revisado entre elas. |
| **4** | Orçamentos Tasks 7 e 8 | Task 7 subagent; Task 8 (verificação e2e no browser) no contexto principal. |
| — | **Push + conferir em produção.** Fim da frente Orçamentos. | |
| **5** | P0 Tasks 9 e 10 | Dois subagents **em paralelo** — `marca/` e `painel-briefings/`, arquivos independentes. |
| **6** | P0 Tasks 11 → 12 → 13 → 14 → 15 → 16 | Task 11 (`admin.css`) sozinha primeiro; é base das demais. |
| **7** | P0 Tasks 17 → 18 → *(19 gated)* | Task 18 gera a tabela dos 50 serviços e **para**. Task 19 só com aprovação explícita. |

---

## Gates de parada

1. **Orçamentos Task 1 Step 3.** Se `count(*)` ou `sum(valor_total)` divergir do Step 1 depois da migration: parar tudo e reportar. Nada nesta mudança pode alterar valor financeiro de registro existente.
2. **P0 Task 18.** A tabela de renomeio dos 50 serviços vai pro Wilke. Task 19 não roda sem aprovação explícita.

## Restrições permanentes

- `git add` sempre explícito, arquivo por arquivo. **Nunca `git add -A`** — o repo tem WIP local não relacionado.
- Nunca `git commit --amend`. Correção é commit novo.
- Sem build step: assets seguem o padrão IIFE de `periodo.js`/`nav.js`, expostos em `window`.
- Preview: ler `PORTAS.md` na raiz de `ELOI SITES` e usar porta livre. **Não editar `.claude/launch.json`** — é compartilhado entre projetos.
