/* pagenav.js — controles de pagina (Voltar / Inicio) para o app instalado.
   Buraco que o display:standalone abriu: sem barra do navegador nao ha botao
   voltar nem URL. Dentro do navegador esses controles ja existem (barra do
   Chrome, gesto do Android, seta do Safari), entao aqui eles NAO aparecem —
   duplicar voltar e a confusao classica de app hibrido.

   Carregar DEPOIS de nav.js: os handlers de DOMContentLoaded disparam na ordem
   de registro, entao a barra do nav ja existe quando este roda e os botoes
   entram nela em vez de criar uma segunda barra. */
(function (w, d) {
  var H = 46;

  function standalone(){
    try {
      return w.matchMedia('(display-mode: standalone)').matches
          || w.matchMedia('(display-mode: fullscreen)').matches
          || w.matchMedia('(display-mode: minimal-ui)').matches
          || w.navigator.standalone === true;   // iOS antigo, antes do media query
    } catch(e){ return false; }
  }

  function icon(pathD){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
      + 'stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">'
      + '<path d="'+pathD+'"/></svg>';
  }
  var IC_VOLTAR = 'M15 18l-6-6 6-6';
  var IC_INICIO = 'M3 11l9-8 9 8M6 9v11h12V9';

  function styleTag(){
    return '<style id="eloi-pagenav-style">'
      + '.eloi-pn{display:flex;align-items:center;gap:4px;flex:0 0 auto}'
      + '.eloi-pn button{display:inline-flex;align-items:center;gap:6px;'
      + 'background:none;border:0;border-radius:var(--r-sm,8px);cursor:pointer;'
      + 'color:var(--muted,#6B5685);font-family:inherit;font-size:.84rem;line-height:1;'
      + 'padding:8px 10px;min-height:44px;-webkit-tap-highlight-color:transparent;'
      + 'transition:background .14s,color .14s}'
      + '.eloi-pn button:hover{background:var(--surface-2,#F2ECF9);color:var(--ink,#240043)}'
      + '.eloi-pn button:active{background:var(--brand-soft,#F0E7FA);color:var(--brand,#5A189A)}'
      // barra propria: so nas paginas sem nav.js (cliente)
      + '.eloi-pn-bar{position:fixed;top:0;left:0;right:0;z-index:920;display:flex;align-items:center;'
      + 'gap:4px;padding:env(safe-area-inset-top) 10px 0;height:calc('+H+'px + env(safe-area-inset-top));'
      + 'background:var(--surface,#fff);border-bottom:1px solid var(--line,#E7DEF2);'
      + 'font-family:carbona-variable,system-ui,sans-serif}'
      // dentro do trilho lateral a barra vira uma linha acima da marca
      + '.eloi-nav .eloi-pn{margin:0 0 14px}'
      + '</style>';
  }

  function botoes(){
    var el = d.createElement('div');
    el.className = 'eloi-pn';
    var html = '';
    // history.length 1 = aba aberta direto nesta pagina: nao ha pra onde voltar
    if (w.history.length > 1) {
      html += '<button type="button" data-pn="voltar" aria-label="Voltar">' + icon(IC_VOLTAR) + '<span>Voltar</span></button>';
    }
    // ja estamos no inicio: o botao seria um recarregar disfarcado
    if (location.pathname !== '/' && location.pathname !== '/index.html') {
      html += '<button type="button" data-pn="inicio" aria-label="Início">' + icon(IC_INICIO) + '</button>';
    }
    if (!html) return null;
    el.innerHTML = html;
    el.addEventListener('click', function(e){
      var b = e.target.closest('[data-pn]'); if(!b) return;
      if (b.dataset.pn === 'voltar') w.history.back();
      else location.href = '/';
    });
    return el;
  }

  function mount(){
    if (!standalone() || d.getElementById('eloi-pagenav-style')) return;
    var grupo = botoes();
    if (!grupo) return;

    d.head.insertAdjacentHTML('beforeend', styleTag());

    // Nas paginas de admin as barras do nav.js ja existem: os botoes entram
    // nelas. Insiro nas DUAS (barra mobile e trilho desktop) porque so uma
    // esta visivel de cada vez — checar visibilidade quebraria ao girar a tela.
    var bar  = d.querySelector('.eloi-nav-bar');
    var rail = d.querySelector('.eloi-nav');
    if (bar || rail) {
      if (bar)  bar.insertBefore(grupo, bar.firstChild);
      if (rail) rail.insertBefore(grupo.cloneNode(true), rail.firstChild);
      if (rail) rail.querySelector('.eloi-pn').addEventListener('click', function(e){
        var b = e.target.closest('[data-pn]'); if(!b) return;
        if (b.dataset.pn === 'voltar') w.history.back(); else location.href = '/';
      });
      return;
    }

    // Paginas de cliente: barra propria. --pagenav-h desloca o que gruda no
    // topo (o progresso do briefing), sem cada pagina precisar saber a altura.
    var barra = d.createElement('div');
    barra.className = 'eloi-pn-bar';
    barra.appendChild(grupo);
    d.body.insertBefore(barra, d.body.firstChild);
    d.documentElement.style.setProperty('--pagenav-h', H + 'px');
    var atual = parseInt(w.getComputedStyle(d.body).paddingTop, 10) || 0;
    d.body.style.paddingTop = 'calc(' + (atual + H) + 'px + env(safe-area-inset-top))';
  }

  if (d.readyState !== 'loading') mount();
  else d.addEventListener('DOMContentLoaded', mount);
})(window, document);
