/* ============================================================
   Portão de acesso — entrega de marca atrás do login do portal
   ------------------------------------------------------------
   A página de entrega é estática (Vercel), então o portão é
   client-side: reusa a MESMA sessão do portal (mesmo origin,
   sessionStorage 'eloi_portal_token'). Sem token válido →
   redireciona pro /portal/?next=<esta-página>, que devolve o
   cliente pra cá depois do login (mesma aba = token persiste).

   Perímetro de UX, não cofre: os arquivos ainda são acessíveis
   por URL direta se alguém souber o caminho (arte-final aprovada
   não é dado sensível — NF/CPF seguem por signed URL no portal).
   Pra fechar de verdade: migrar pro bucket privado eloi-entregas.

   Fail-open em erro de rede (≠401): um soluço do Supabase não
   deve trancar o cliente fora da própria marca.
   ============================================================ */
(function () {
  var KEY = 'eloi_portal_token';
  var FN  = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/portal-cliente';
  var t   = sessionStorage.getItem(KEY);

  function toLogin() {
    location.replace('/portal/?next=' + encodeURIComponent(location.pathname));
  }

  if (!t) { toLogin(); return; }

  // esconde a página até validar (evita flash de conteúdo pra quem não passou)
  var de = document.documentElement;
  de.style.visibility = 'hidden';

  fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'me', token: t })
  }).then(function (r) {
    if (r.status === 401) { sessionStorage.removeItem(KEY); toLogin(); return; }
    de.style.visibility = '';   // ok — ou erro ≠401: fail-open
  }).catch(function () {
    de.style.visibility = '';   // rede caiu: não tranca o cliente
  });
})();
