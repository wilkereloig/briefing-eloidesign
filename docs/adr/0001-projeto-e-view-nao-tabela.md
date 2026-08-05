# Projeto é uma leitura combinada, não uma tabela nova

O painel novo (sub-projeto 2) introduz "Projeto" como conceito de UI que une `orcamentos` + `eloi_servicos` (via `orcamento_id`, já 1:1 por índice único). Decidimos **não** criar uma tabela `eloi_projetos`: a leitura computa a Etapa a partir de `orcamentos.status` + `eloi_servicos.status_execucao`/`pago` já existentes, sem migração de dados.

Alternativa considerada: tabela própria unificando os dois. Rejeitada porque duplicaria o trigger `trg_eloi_orcamento_aprovado` (que já cria o serviço automaticamente e é a fonte de verdade do vínculo) e arriscaria os dois lados dessincronizarem. Ver termo "Projeto" em `../GLOSSARY.md`.
