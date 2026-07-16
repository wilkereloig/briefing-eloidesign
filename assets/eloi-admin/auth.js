const FN_ADMIN_AUTH = "https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/admin-auth";
const EA_KEY = "eloi_admin_token";

window.EloiAdminAuth = {
  token() { return localStorage.getItem(EA_KEY); },
  async login(password) {
    let r, d;
    try {
      r = await fetch(FN_ADMIN_AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", password }) });
      d = await r.json();
    } catch (_) {
      const e = new Error("erro de conexão"); e.status = 0; throw e;
    }
    if (!r.ok) { const e = new Error(r.status === 401 ? "senha inválida" : (d?.error || "erro do servidor")); e.status = r.status; throw e; }
    localStorage.setItem(EA_KEY, d.token);
  },
  logout() {
    const t = this.token();
    localStorage.removeItem(EA_KEY);
    if (t) fetch(FN_ADMIN_AUTH, { method: "POST", body: JSON.stringify({ action: "logout", token: t }) });
  },
  async call(fnUrl, body) {
    const r = await fetch(fnUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, token: this.token() }) });
    if (r.status === 401) { this.logout(); location.reload(); throw new Error("sessão expirada"); }
    return r.json();
  },
};
