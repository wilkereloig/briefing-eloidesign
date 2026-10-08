-- 2026-10-09 · Natureza das categorias e perspectivas financeiras no banco.
--
-- Etapa 3 (docs/EVOLUCAO-FINANCEIRO.md). Aditivo.
--
-- NATUREZA diz se a categoria mede o negócio/a vida (operacional) ou só move
-- dinheiro de lugar:
--   operacional  receita/despesa do dia a dia (padrão — é como tudo era tratado)
--   financeira   juros, tarifas, IOF, rendimentos
--   divida       parcela de empréstimo, rotativo, parcelamento de fatura
--                (principal + juros juntos: o banco não separa na linha)
--   patrimonial  empréstimo recebido, aporte, retirada, pró-labore,
--                distribuição — entra/sai dinheiro mas não é resultado
-- Só as categorias-PADRÃO cujo nome já declara a natureza são classificadas
-- aqui. Nenhuma outra é "adivinhada": continuam operacionais (comportamento
-- atual) e aparecem em eloi_revisao_natureza para o dono confirmar.

set search_path = pg_catalog, public;

alter table public.eloi_categorias add column if not exists natureza text not null default 'operacional';
alter table public.eloi_categorias drop constraint if exists eloi_categorias_natureza_check;
alter table public.eloi_categorias add constraint eloi_categorias_natureza_check
  check (natureza in ('operacional', 'financeira', 'divida', 'patrimonial'));
-- Quem decidiu: 'regra_nome_padrao' (esta migração) | 'dono' (tela) | null (padrão).
alter table public.eloi_categorias add column if not exists natureza_definida_por text;

update public.eloi_categorias set natureza = v.natureza, natureza_definida_por = 'regra_nome_padrao'
  from (values
    ('Empréstimos recebidos',     'entrada', 'patrimonial'),
    ('Pró-labore',                'entrada', 'patrimonial'),
    ('Distribuição de lucro',     'entrada', 'patrimonial'),
    ('Rendimentos',               'entrada', 'financeira'),
    ('Juros, tarifas e encargos', 'saida',   'financeira'),
    ('Empréstimos e dívidas',     'saida',   'divida'),
    -- criadas em 2026-10-09 na revisão dos lançamentos (decisão delegada pelo dono)
    ('Dinheiro de outras contas', 'entrada', 'patrimonial')
  ) as v(nome, tipo, natureza)
 where eloi_categorias.nome = v.nome and eloi_categorias.tipo::text = v.tipo
   and eloi_categorias.natureza_definida_por is null;

-- Confirmadas pelo dono em 2026-10-09: gasto/ganho do dia a dia. "Rateio da
-- casa" = ajuda nas despesas da casa (operacional). "Outros" e "Outras
-- entradas" NÃO entram aqui: misturam naturezas e são revisadas lançamento a
-- lançamento.
update public.eloi_categorias set natureza = 'operacional', natureza_definida_por = 'dono'
 where nome in ('Alimentação', 'Moradia', 'Saúde', 'Transporte', 'Lazer', 'Assinaturas', 'Viagens',
                'Cuidados pessoais', 'Compras', 'Projetos', 'Rateio da casa', 'Estornos e devoluções')
   and natureza_definida_por is null;

-- Categorias que o dono ainda não confirmou, com uso — fila de revisão.
create or replace view public.eloi_revisao_natureza with (security_invoker = true) as
select c.id, c.nome, c.contexto, c.tipo, c.natureza, c.natureza_definida_por,
       (select count(*) from public.eloi_transacoes t where t.categoria_id = c.id) lancamentos
  from public.eloi_categorias c
 where c.natureza_definida_por is distinct from 'dono';

-- ── Caixa realizado: dinheiro que andou, na data em que andou ─────────────────
-- Fonte: eloi_liquidacoes (data e conta de cada pagamento). Transferência entre
-- contas do MESMO contexto é neutra e não aparece; entre contextos diferentes
-- aparece como 'entre_contextos' nos dois lados (sai de um, entra no outro) e
-- soma zero no consolidado. Legado com precisao='legado_acumulado' cai inteiro
-- na data da última liquidação conhecida — a coluna `aproximado` conta quanto.
create or replace function public.eloi_caixa_realizado(p_de date, p_ate date, p_contexto public.eloi_contexto default null)
returns table (mes text, contexto public.eloi_contexto, natureza text, entradas_cents bigint, saidas_cents bigint, aproximado_cents bigint)
language sql stable security invoker set search_path = pg_catalog, public as $$
  with l as (
    select l.data, l.valor_cents, l.precisao, t.tipo, t.contexto tctx, t.origem,
           co.contexto ctx_origem, cd.contexto ctx_destino, cat.natureza
      from public.eloi_liquidacoes l
      join public.eloi_transacoes t on t.id = l.transacao_id
      left join public.eloi_contas co on co.id = t.conta_id
      left join public.eloi_contas cd on cd.id = t.conta_destino_id
      left join public.eloi_categorias cat on cat.id = t.categoria_id
     where t.status <> 'cancelado' and l.data between p_de and p_ate
  ), mov as (
    select to_char(data, 'YYYY-MM') mes, tctx ctx,
           case when origem = 'ajuste' then 'ajuste' else coalesce(natureza, 'operacional') end nat,
           case when tipo = 'entrada' then valor_cents else 0 end e,
           case when tipo = 'saida' then valor_cents else 0 end s,
           case when precisao = 'legado_acumulado' then abs(valor_cents) else 0 end ap
      from l where tipo in ('entrada', 'saida')
    union all
    select to_char(data, 'YYYY-MM'), ctx_origem, 'entre_contextos', 0, valor_cents,
           case when precisao = 'legado_acumulado' then abs(valor_cents) else 0 end
      from l where tipo = 'transferencia' and ctx_origem is distinct from ctx_destino
    union all
    select to_char(data, 'YYYY-MM'), ctx_destino, 'entre_contextos', valor_cents, 0,
           case when precisao = 'legado_acumulado' then abs(valor_cents) else 0 end
      from l where tipo = 'transferencia' and ctx_origem is distinct from ctx_destino
  )
  select mes, ctx, nat, sum(e)::bigint, sum(s)::bigint, sum(ap)::bigint
    from mov where p_contexto is null or ctx = p_contexto
   group by 1, 2, 3 order by 1, 2, 3
$$;

-- ── Resultado por competência: o que foi contratado/comprado no mês ──────────
-- Valor ORIGINAL (valor_cents) de entradas e saídas não canceladas, pela
-- competência (cai no vencimento quando não há competência, como
-- competenciaDe() do domínio). Pago ou não, conta no mês a que pertence:
-- compra no cartão é despesa no mês da compra, não no mês em que a fatura foi paga.
create or replace function public.eloi_resultado_competencia(p_de date, p_ate date, p_contexto public.eloi_contexto default null)
returns table (mes text, contexto public.eloi_contexto, natureza text, receitas_cents bigint, despesas_cents bigint, em_aberto_cents bigint)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select to_char(coalesce(t.data_competencia, t.data_vencimento, t.data_liquidacao), 'YYYY-MM'),
         t.contexto,
         case when t.origem = 'ajuste' then 'ajuste' else coalesce(c.natureza, 'operacional') end,
         sum(case when t.tipo = 'entrada' then t.valor_cents else 0 end)::bigint,
         sum(case when t.tipo = 'saida' then t.valor_cents else 0 end)::bigint,
         sum(t.valor_cents - t.recebido_cents)::bigint
    from public.eloi_transacoes t
    left join public.eloi_categorias c on c.id = t.categoria_id
   where t.tipo in ('entrada', 'saida') and t.status <> 'cancelado'
     and coalesce(t.data_competencia, t.data_vencimento, t.data_liquidacao) between p_de and p_ate
     and (p_contexto is null or t.contexto = p_contexto)
   group by 1, 2, 3 order by 1, 2, 3
$$;

-- ── Obrigações em aberto: o que falta pagar/receber, por situação ────────────
create or replace function public.eloi_obrigacoes_abertas(p_contexto public.eloi_contexto default null, p_hoje date default null)
returns table (contexto public.eloi_contexto, tipo public.eloi_tipo_mov, situacao text, quantidade bigint, falta_cents bigint)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select t.contexto, t.tipo,
         case when t.data_vencimento is null then 'sem_vencimento'
              when t.data_vencimento < coalesce(p_hoje, public.eloi_hoje()) then 'atrasado'
              when t.data_vencimento <= coalesce(p_hoje, public.eloi_hoje()) + 7 then 'ate_7_dias'
              when t.data_vencimento <= coalesce(p_hoje, public.eloi_hoje()) + 30 then 'ate_30_dias'
              else 'depois' end,
         count(*), sum(t.valor_cents - t.recebido_cents)::bigint
    from public.eloi_transacoes t
   where t.tipo in ('entrada', 'saida') and t.status in ('previsto', 'pendente', 'parcial', 'vencido')
     and (p_contexto is null or t.contexto = p_contexto)
   group by 1, 2, 3 order by 1, 2, 3
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'eloi_caixa_realizado(date, date, eloi_contexto)', 'eloi_resultado_competencia(date, date, eloi_contexto)',
    'eloi_obrigacoes_abertas(eloi_contexto, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on public.eloi_revisao_natureza from anon, authenticated;
