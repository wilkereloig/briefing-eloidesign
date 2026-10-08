#!/usr/bin/env bash
# Duas baixas simultâneas na mesma linha: a trava de linha serializa; a segunda
# vê o recebido atualizado e é recusada por exceder o total. Nada se perde.
set -uo pipefail
DB="$1"
T=00000000-0000-0000-0000-000000000003
psql -q -d "$DB" -c "update eloi_transacoes set valor_cents=10000 where id='$T'" >/dev/null
antes=$(psql -At -d "$DB" -c "select recebido_cents from eloi_transacoes where id='$T'")
( psql -q -d "$DB" -c "begin; select eloi_liquidar('{\"id\":\"$T\",\"valor_cents\":6000}'); select pg_sleep(1.5); commit;" >/tmp/c1.txt 2>&1 ) &
sleep 0.4
psql -q -d "$DB" -c "select eloi_liquidar('{\"id\":\"$T\",\"valor_cents\":6000}')" >/tmp/c2.txt 2>&1
wait
depois=$(psql -At -d "$DB" -c "select recebido_cents from eloi_transacoes where id='$T'")
soma=$(psql -At -d "$DB" -c "select sum(valor_cents) from eloi_liquidacoes where transacao_id='$T'")
if [ "$depois" = "$((antes+6000))" ] && [ "$soma" = "$depois" ] && grep -q 'excede' /tmp/c2.txt; then
  echo "ok: baixas concorrentes serializadas ($antes → $depois; segunda recusada)"
else
  echo "FALHOU: concorrência antes=$antes depois=$depois soma=$soma"; cat /tmp/c2.txt; exit 1
fi
# Duas gerações de recorrência simultâneas não duplicam.
psql -q -d "$DB" -c "insert into eloi_recorrencias (id,nome,tipo,contexto,valor_cents,periodicidade,dia_cobranca,conta_id,proxima_cobranca) values ('00000000-0000-0000-0000-0000000000f3','Paralela','saida','pessoal',100,'mensal',5,'00000000-0000-0000-0000-0000000000a1','2026-01-05')" >/dev/null
for i in 1 2 3; do psql -q -At -d "$DB" -c "select eloi_gerar_recorrencias(10,'2026-06-01')" >/dev/null & done; wait
n=$(psql -At -d "$DB" -c "select count(*) from eloi_transacoes where recorrencia_id='00000000-0000-0000-0000-0000000000f3'")
d=$(psql -At -d "$DB" -c "select count(*) from (select ocorrencia from eloi_transacoes where recorrencia_id='00000000-0000-0000-0000-0000000000f3' group by 1 having count(*)>1) x")
if [ "$d" = "0" ] && [ "$n" -ge 5 ]; then echo "ok: 3 gerações simultâneas, $n ocorrências, 0 duplicadas"; else echo "FALHOU: recorrência paralela n=$n dup=$d"; exit 1; fi
