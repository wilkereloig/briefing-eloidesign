-- db/orcamento-auto-servico.sql
-- Fase 2 do painel unificado: orçamento aprovado vira serviço AUTOMATICAMENTE,
-- no banco — atômico, idempotente e imune a chamadas simultâneas (índice único
-- parcial eloi_servicos_orcamento_id_uidx já garante 1 orçamento = 1 serviço).
-- Também bloqueia enviar/aprovar orçamento sem cliente_id (defesa além do front
-- e da edge function). Aditivo e idempotente; não altera dados existentes.

-- Guarda: orçamento só sai de rascunho com cliente cadastrado vinculado.
create or replace function public.eloi_orcamento_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('enviado','aprovado') and new.cliente_id is null then
    raise exception 'orçamento não pode ser % sem cliente_id', new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_eloi_orcamento_guard on public.orcamentos;
create trigger trg_eloi_orcamento_guard
  before insert or update on public.orcamentos
  for each row execute function public.eloi_orcamento_guard();

-- Aprovou → cria o serviço. AFTER pra só rodar se a linha realmente persistiu.
-- ON CONFLICT no índice único parcial = idempotente sob concorrência: a segunda
-- transação simultânea simplesmente não insere nada.
create or replace function public.eloi_orcamento_aprovado_cria_servico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aprovado'
     and (tg_op = 'INSERT' or old.status is distinct from 'aprovado') then
    insert into public.eloi_servicos
      (cliente_id, orcamento_id, descricao, valor_cents, status_execucao, pago)
    values
      (new.cliente_id, new.id, coalesce(nullif(trim(new.titulo), ''), 'Serviço'),
       round(coalesce(new.valor_total, 0) * 100)::bigint, 'aguardando_inicio', false)
    on conflict (orcamento_id) where orcamento_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_eloi_orcamento_aprovado on public.orcamentos;
create trigger trg_eloi_orcamento_aprovado
  after insert or update on public.orcamentos
  for each row execute function public.eloi_orcamento_aprovado_cria_servico();

-- Funções internas de trigger: ninguém chama direto.
revoke all on function public.eloi_orcamento_guard() from public, anon, authenticated;
revoke all on function public.eloi_orcamento_aprovado_cria_servico() from public, anon, authenticated;
