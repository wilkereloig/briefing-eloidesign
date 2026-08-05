# Changelog

## 2026-08-04 — handoff inicial

Primeira entrega do sistema visual documentado para implementação.

**Sistema**
- Tokens extraídos do KV Completo aprovado: cor, tipografia, espaço, forma, movimento, quebras e camadas, em `design-tokens.json`, `variables.css` e `tokens.ts`.
- Escala tipográfica ampliada para cobrir o painel: valor grande, valor, corpo de interface, chip e mensagem, com equivalente mobile em cada nível.
- Paleta organizada por função, com pares aprovados, regras de contraste e proibições registradas.
- Movimento definido com quatro durações e três curvas.

**Iconografia**
- 19 glifos novos sobre as regras existentes: finanças (dinheiro, nota fiscal, caixa, pagamento, gráfico), estados (ok, alerta, erro, info, pendente, notificação), ações (editar, excluir, salvar, upload, baixar) e configuração (configurações, sair, usuário). Total de 59.
- Sprite atualizado e 59 SVGs individuais organizados em 10 pastas por função.

**Design**
- `Gestao Eloi Mobile.dc.html`: versão de toque do painel, redesenhada — barra inferior com botão central de criação, menu em folha, tabela virada em cartão, folhas de criação e de status, e uma tela de referência com esqueleto, vazio, erro, aviso e confirmação de exclusão.

**Documentação**
- `ELOI_DESIGN_SYSTEM.md`, `IMPLEMENTATION_GUIDE.md`, `COMPONENT_INVENTORY.md`, `ICON_GUIDELINES.md`, `RESPONSIVE_GUIDELINES.md`, `MOBILE_APP_GUIDELINES.md` e os quatro arquivos de `prompts/`.

**Limpeza no projeto de design**
- Removidas 12 versões anteriores de KV, site e painel, além do direcionamento de módulos/malha que não foi aprovado. Restaram três arquivos oficiais, mais a versão mobile.

**Ainda pendente**
- Fotografia real no site.
- WhatsApp, e-mail e ano de fundação no site.
- Painel ligado às funções reais (`eloi-gestao`, `orcamentos`, `eloi-financeiro`); os dados dos protótipos são de exemplo.
- Telas de Relatórios, Arquivos e Configurações não têm referência visual — não existem no painel aprovado.
- Binários da fonte oficial, se houver. Hoje o sistema usa Archivo e Manrope do Google Fonts.
