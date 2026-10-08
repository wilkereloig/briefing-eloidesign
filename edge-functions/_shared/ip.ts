// IP de quem chamou, para throttle. Fonte única — antes cada function tinha a
// sua, e portal-cliente.ts errava.
//
// Ordem (2026-10-08): `cf-connecting-ip` → `x-real-ip` → último do
// `X-Forwarded-For`.
//
// Toda requisição a *.supabase.co passa pela Cloudflare antes da Supabase. A
// Cloudflare escreve `CF-Connecting-IP` com o IP de quem abriu a conexão com
// ela (um IP só, ao contrário do XFF, ao qual ela só ACRESCENTA) e recomenda
// lê-lo no lugar do XFF:
// https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip
// A doc não diz com todas as letras que valor vindo do cliente é descartado —
// é o comportamento observado, não contrato. Se um dia deixar de ser, o pior
// caso é o throttle por IP virar contornável (o limite global segura), nunca o
// lockout coletivo de antes.
// Conferido nos logs deste projeto (function_edge_logs, 2026-10-08): os dois
// headers chegam na function e trazem o IP real do provedor do usuário,
// iguais entre si. Relato de usuário que viu o mesmo, com XFF forjado à frente:
// https://github.com/orgs/supabase/discussions/34647
//
// Por que NÃO o último do XFF (o que se usava até aqui): depois da Cloudflare
// a requisição atravessa o AWS Global Accelerator da Supabase, e é o IP DELE
// (99.82.164.x / 13.248.114.x em portal_login_ip_attempts) que fecha a
// cadeia. Contar tentativa por esse "IP" juntava o mundo inteiro em meia dúzia
// de baldes: cinco senhas erradas de qualquer lugar trancavam o login de todos.
// O primeiro do XFF também não serve — é texto livre do cliente.
//
// O fallback para o último do XFF só existe para o caso de a Supabase mudar o
// caminho da borda; se isso acontecer, o throttle volta a ser grosso (por
// proxy), mas nunca passa a confiar em valor escolhido pelo cliente.
export function ipDaRequisicao(headers: Headers): string {
  const direto = headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim();
  if (direto) return direto;
  const cadeia = (headers.get("x-forwarded-for") ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  return cadeia.at(-1) || "unknown";
}
