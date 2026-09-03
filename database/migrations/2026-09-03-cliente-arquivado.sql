-- Arquivar cliente que não trabalha mais aqui.
--
-- Excluir não é opção para cliente com histórico: a FK de `eloi_servicos` é
-- `RESTRICT` de propósito — apagar o cliente levaria junto o rastro de todo
-- serviço, nota e recebimento dele. Mas também não havia como tirá-lo da
-- carteira: cliente encerrado ficava para sempre no topo da lista.
--
-- Arquivar é o meio-termo: some da carteira e dos filtros, o histórico fica
-- inteiro e o dado volta com um clique. Mesma ideia de `eloi_contas.ativa`.

alter table public.eloi_clientes
  add column if not exists arquivado_em timestamptz;

comment on column public.eloi_clientes.arquivado_em is
  'Quando o cliente saiu da carteira. Nulo = ativo. Arquivar não apaga nada: serviços, notas e recebimentos continuam. Desarquivar é limpar a coluna.';
