-- Sub-cliente vira entidade; nota fiscal vira fonte única (1 nota : N serviços).
-- Decisões D-18 e D-22 em docs/DECISIONS.md. Plano em docs/PLANO-OPERACAO-2026-08-28.md §4.
--
-- Estado medido em produção em 2026-09-03, antes de rodar:
--   eloi_servicos 59 · com nf_numero 43 · 42 números distintos (NF 42 cobre 2)
--   eloi_notas_fiscais 0 · sub_cliente 9 textos distintos, todos na F2,
--   zero variação de grafia · soma valor_cents = 7445500
--
-- Idempotente: rodar duas vezes não duplica nada (if not exists / on conflict /
-- not exists). Tudo numa transação; a conferência do fim aborta se o backfill
-- deixar serviço sem vínculo. Nenhuma coluna é removida aqui — o texto
-- `sub_cliente` e o `nf_numero` viram ESPELHO mantido por trigger, porque
-- gestao/index.html, domain/decisoes.ts, dashboard.stats e o portal ainda leem.

begin;

-- ── 1. Sub-cliente ──────────────────────────────────────────────────────────
create table if not exists public.eloi_sub_clientes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.eloi_clientes(id) on delete restrict,
  nome        text not null,
  ativo       boolean not null default true,
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists eloi_sub_clientes_cliente_nome
  on public.eloi_sub_clientes (cliente_id, lower(nome));
alter table public.eloi_sub_clientes enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_sub_clientes;
create policy sem_acesso_anon on public.eloi_sub_clientes
  for all to anon, authenticated using (false) with check (false);
comment on table public.eloi_sub_clientes is
  'Marca/operação atendida por intermédio de um cliente (F2 → Vibra, ASUS...). Não tem portal, senha nem orçamento próprio: o contratante continua sendo o cliente.';

alter table public.eloi_servicos
  add column if not exists sub_cliente_id uuid references public.eloi_sub_clientes(id) on delete restrict;
create index if not exists eloi_servicos_sub_cliente_idx on public.eloi_servicos (sub_cliente_id);

-- ── 2. Nota fiscal 1:N ──────────────────────────────────────────────────────
alter table public.eloi_servicos
  add column if not exists nota_fiscal_id uuid references public.eloi_notas_fiscais(id) on delete set null;
create index if not exists eloi_servicos_nota_fiscal_idx on public.eloi_servicos (nota_fiscal_id);
-- Número da NFS-e é sequência única do emissor (o estúdio), não do cliente.
create unique index if not exists eloi_notas_fiscais_numero_unico
  on public.eloi_notas_fiscais (numero) where numero is not null;

-- ── 3. Backfill sub-clientes ────────────────────────────────────────────────
-- Texto igual ao nome do próprio cliente ("F2 EXPERIENCE" dentro da F2) é
-- trabalho direto, não sub-cliente: fica sem vínculo e o texto é limpo.
insert into public.eloi_sub_clientes (cliente_id, nome)
select distinct s.cliente_id, trim(s.sub_cliente)
from public.eloi_servicos s
join public.eloi_clientes c on c.id = s.cliente_id
where s.sub_cliente is not null and trim(s.sub_cliente) <> ''
  and lower(trim(s.sub_cliente)) <> lower(trim(c.nome))
on conflict (cliente_id, lower(nome)) do nothing;

update public.eloi_servicos s
   set sub_cliente_id = sc.id
  from public.eloi_sub_clientes sc
 where s.sub_cliente_id is null
   and sc.cliente_id = s.cliente_id
   and lower(sc.nome) = lower(trim(s.sub_cliente));

update public.eloi_servicos s
   set sub_cliente = null
  from public.eloi_clientes c
 where c.id = s.cliente_id
   and s.sub_cliente_id is null
   and lower(trim(coalesce(s.sub_cliente, ''))) = lower(trim(c.nome));

-- ── 4. Backfill notas ───────────────────────────────────────────────────────
-- Uma nota por número; valor = soma dos serviços que ela cobre; competência e
-- emissão = a menor competência entre eles (todo serviço com nota tem data).
insert into public.eloi_notas_fiscais (cliente_id, numero, status, valor_cents, competencia, emitida_em)
select s.cliente_id, s.nf_numero, 'emitida', sum(s.valor_cents),
       min(s.data_competencia), min(s.data_competencia)
  from public.eloi_servicos s
 where s.nf_numero is not null and s.nf_numero <> ''
   and not exists (select 1 from public.eloi_notas_fiscais n where n.numero = s.nf_numero)
 group by s.cliente_id, s.nf_numero;

update public.eloi_servicos s
   set nota_fiscal_id = n.id
  from public.eloi_notas_fiscais n
 where s.nota_fiscal_id is null
   and s.nf_numero is not null and s.nf_numero <> ''
   and n.numero = s.nf_numero
   and n.cliente_id = s.cliente_id;

-- ── 5. Espelhos por trigger ─────────────────────────────────────────────────
-- Um campo com dois donos diverge. Dono: sub_cliente_id e nota_fiscal_id.
create or replace function public.eloi_servico_espelhos() returns trigger
language plpgsql as $$
begin
  -- Texto legado sem id (gestao/index.html ainda escreve assim) tenta se
  -- adotar pelo nome. Nome desconhecido fica só no texto — não cria entidade
  -- por trigger.
  if new.sub_cliente_id is null and new.sub_cliente is not null then
    select id into new.sub_cliente_id from public.eloi_sub_clientes
     where cliente_id = new.cliente_id and lower(nome) = lower(trim(new.sub_cliente))
     limit 1;
  end if;
  if new.sub_cliente_id is not null then
    if not exists (select 1 from public.eloi_sub_clientes
                    where id = new.sub_cliente_id and cliente_id = new.cliente_id) then
      raise exception 'sub-cliente % não pertence ao cliente %', new.sub_cliente_id, new.cliente_id;
    end if;
    select nome into new.sub_cliente from public.eloi_sub_clientes where id = new.sub_cliente_id;
  end if;
  -- Com nota vinculada, nf_numero é espelho. Sem nota, o texto legado fica —
  -- FolhaServico ainda tem o campo "Número da NF" até a Fase 2 tirar.
  if new.nota_fiscal_id is not null then
    select numero into new.nf_numero from public.eloi_notas_fiscais where id = new.nota_fiscal_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_eloi_servico_espelhos on public.eloi_servicos;
create trigger trg_eloi_servico_espelhos
  before insert or update on public.eloi_servicos
  for each row execute function public.eloi_servico_espelhos();

create or replace function public.eloi_nota_propaga_numero() returns trigger
language plpgsql as $$
begin
  if new.numero is distinct from old.numero then
    update public.eloi_servicos set nf_numero = new.numero where nota_fiscal_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_eloi_nota_propaga_numero on public.eloi_notas_fiscais;
create trigger trg_eloi_nota_propaga_numero
  after update of numero on public.eloi_notas_fiscais
  for each row execute function public.eloi_nota_propaga_numero();

comment on column public.eloi_servicos.sub_cliente is
  'ESPELHO de sub_cliente_id, mantido por trg_eloi_servico_espelhos. Lido por gestao/index.html. Sai junto com /gestao.';
comment on column public.eloi_servicos.nf_numero is
  'ESPELHO de eloi_notas_fiscais.numero via nota_fiscal_id (trigger). Sem nota vinculada aceita texto legado até FolhaServico perder o campo (Fase 2).';
comment on column public.eloi_notas_fiscais.servico_id is
  'LEGADO 1:1, sempre nulo. Vínculo real é eloi_servicos.nota_fiscal_id (1 nota : N serviços). Condição de saída: drop quando nenhuma edge ler.';

-- ── 6. Conferência — aborta a transação se o backfill ficou incompleto ─────
do $$
declare sem_sub int; sem_nota int; notas int; soma bigint;
begin
  select count(*) into sem_sub from public.eloi_servicos
   where sub_cliente is not null and sub_cliente_id is null;
  select count(*) into sem_nota from public.eloi_servicos
   where nf_numero is not null and nf_numero <> '' and nota_fiscal_id is null;
  select count(*) into notas from public.eloi_notas_fiscais;
  select sum(valor_cents) into soma from public.eloi_servicos;
  if sem_sub <> 0 or sem_nota <> 0 then
    raise exception 'backfill incompleto: % serviço(s) com texto sem sub_cliente_id, % com nf_numero sem nota_fiscal_id', sem_sub, sem_nota;
  end if;
  raise notice 'ok — notas: %, soma valor_cents: % (esperado em 2026-09-03: 42 e 7445500)', notas, soma;
end $$;

commit;
