// IP de quem chamou, para throttle. Fonte única — antes cada function tinha a
// sua, e portal-cliente.ts errava.
//
// `X-Forwarded-For` é uma lista onde cada proxy ACRESCENTA ao fim. O começo é
// o que o cliente mandou — texto livre, que um atacante rotaciona para nunca
// acumular tentativa no mesmo "IP". O ÚLTIMO elemento é o que a borda da
// Supabase escreveu e o cliente não alcança.
export function ipDaRequisicao(headers: Headers): string {
  const cadeia = (headers.get("x-forwarded-for") ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  return cadeia.at(-1) || "unknown";
}
