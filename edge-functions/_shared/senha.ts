// Contrato do login do portal (portal-cliente.ts): a senha digitada vira
// replace(/[\s-]/g,"").toUpperCase(); os 4 primeiros chars resolvem o cliente
// (portal_senha_prefix), o resto é conferido contra o hash PBKDF2.
// QUALQUER mudança aqui muda o que o hash significa — não mexer sem regerar senhas.
export function normalizarSenha(raw: string): { prefix: string; secret: string } {
  const norm = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
  return { prefix: norm.slice(0, 4), secret: norm.slice(4) };
}
