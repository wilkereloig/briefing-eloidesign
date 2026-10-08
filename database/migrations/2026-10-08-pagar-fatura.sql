-- 2026-10-08 · Pagamento de fatura atômico (edge eloi-financas, action
-- transacoes.pagar_fatura).
--
-- A edge calcula o plano (quem quita quanto — planejarPagamentoFatura em
-- edge-functions/_shared/financas.ts, com teste) e chama esta função UMA vez.
-- Aqui só se grava, numa transação: a transferência conta -> cartão e as baixas
-- das compras/estornos do cartão. Qualquer erro desfaz tudo — nunca sobra
-- transferência sem baixa nem baixa sem transferência.
--
-- Trava otimista: cada baixa só é aplicada se a linha AINDA tiver o
-- recebido_cents que a edge leu e continuar em aberto. Se outro pagamento
-- mexeu nela no meio, a função aborta com 'fatura mudou…' e a edge devolve 409.
--
-- ⚠️ Aplicar ANTES de publicar a edge eloi-financas: sem a função, a action
-- responde erro (sem gravar nada).

create or replace function public.eloi_pagar_fatura(p_transferencia jsonb, p_baixas jsonb)
returns setof public.eloi_transacoes
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_transf public.eloi_transacoes;
  v_baixa jsonb;
  v_linha public.eloi_transacoes;
  v_n int;
begin
  insert into public.eloi_transacoes (
    tipo, contexto, status, descricao, valor_cents, recebido_cents,
    conta_id, conta_destino_id, categoria_id,
    data_competencia, data_vencimento, data_liquidacao, origem
  )
  select r.tipo, r.contexto, r.status, r.descricao, r.valor_cents, r.recebido_cents,
         r.conta_id, r.conta_destino_id, null,
         r.data_competencia, r.data_vencimento, r.data_liquidacao, r.origem
    from jsonb_populate_record(null::public.eloi_transacoes, p_transferencia) r
  returning * into v_transf;

  for v_baixa in select * from jsonb_array_elements(coalesce(p_baixas, '[]'::jsonb)) loop
    v_linha := jsonb_populate_record(null::public.eloi_transacoes, v_baixa);
    update public.eloi_transacoes t
       set recebido_cents  = v_linha.recebido_cents,
           status          = v_linha.status,
           data_liquidacao = v_linha.data_liquidacao,
           updated_at      = now()
     where t.id = v_linha.id
       and t.conta_id = v_transf.conta_destino_id
       and t.recebido_cents = (v_baixa->>'recebido_anterior')::bigint
       and t.status not in ('realizado', 'cancelado')
       and v_linha.recebido_cents <= t.valor_cents;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'fatura mudou durante o pagamento (transacao %)', v_linha.id;
    end if;
  end loop;

  return next v_transf;
end;
$$;

-- Só a edge (service_role) chama. anon/authenticated nunca.
revoke all on function public.eloi_pagar_fatura(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.eloi_pagar_fatura(jsonb, jsonb) to service_role;
