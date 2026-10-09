// Briefing ABERTO (sem token de link): a linha que a edge briefing-submit grava
// em `briefings` ou `ecommerce_briefings`. Até 2026-10-09 as páginas gravavam
// direto pelo REST com a chave pública (política de INSERT anônimo, sem limite
// por IP). Agora passam pela edge, com o mesmo throttle do caminho com token.
// Regra pura para ser testável sem rede (_tests/briefing.test.ts).

export type Formulario = "briefing" | "ecommerce";

// Colunas próprias de `briefings` (o resto vai só no `raw`). Coluna fora da
// lista nunca vem do corpo: chave desconhecida derrubaria o insert inteiro.
const COLUNAS_BRIEFING = [
  "nome", "email", "whatsapp", "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9",
  "q10_descricao", "q10_link", "q11_cores", "q11_texto", "q12", "q13", "q14", "q15",
  "q16", "q17", "q18", "q18_outro",
] as const;

/** Tamanho máximo do `raw` serializado: um briefing real tem poucos KB. */
export const MAX_RAW_BYTES = 100_000;
const MAX_CAMPO = 5_000;

const texto = (v: unknown) => (v == null || v === "" ? null : String(v).slice(0, MAX_CAMPO));

export function linhaBriefingAberto(
  formulario: unknown, raw: unknown, empresa?: unknown,
): { tabela: string; linha: Record<string, unknown> } | { erro: string } {
  if (formulario !== "briefing" && formulario !== "ecommerce") return { erro: "formulario invalido" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { erro: "raw obrigatorio" };
  if (JSON.stringify(raw).length > MAX_RAW_BYTES) return { erro: "briefing grande demais" };
  const r = raw as Record<string, unknown>;
  if (formulario === "briefing") {
    const linha: Record<string, unknown> = { raw: r };
    for (const c of COLUNAS_BRIEFING) if (r[c] !== undefined) linha[c] = texto(r[c]);
    return { tabela: "briefings", linha };
  }
  return {
    tabela: "ecommerce_briefings",
    linha: {
      nome: texto(r.nome), email: texto(r.email), whatsapp: texto(r.whatsapp),
      empresa: texto(empresa ?? r.ec_empresa ?? r.nome), raw: r,
    },
  };
}
