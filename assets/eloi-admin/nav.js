/* nav.js — sidebar admin compartilhado. Injetado por JS (1 <script> por pagina).
   window.EloiNav = { mount, unmount }. Auth-aware: so injeta se logado.
   Deslocamento do conteudo por inline style no body (sobrepoe padding shorthand). */
(function (w, d) {
  var W = 236, BP = 900, MOUNTED = false, mq = null;

  // rota, label, href (icone = SVG minimalista inline)
  var PRIMARY = [
    ['/admin/',                'Painel',              'M3 12l9-8 9 8M5 10v10h14V10'],
    ['/gestao/',               'Gestão',              'M4 19V9m6 10V5m6 14v-7'],
    ['/painel-briefings/',     'Briefings',           'M8 4h8v3H8zM6 7h12v13H6z'],
    ['/painel-orcamentos/',    'Orçamentos',          'M7 4h10v16H7zM10 8h4M10 12h4M10 16h3'],
    // Era 'Portal do Cliente', mas leva pra aba clientes da Gestao -- nao pro portal
    // (/portal/, que e do cliente e pede senha dele). Preview do portal fica na
    // propria lista de clientes, onde existe um cliente pra previsualizar.
    ['/gestao/#clientes',      'Clientes',            'M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0']
  ];
  var TOOLS = [
    ['/marca/', 'Entregas de Marca', 'M12 3l7 4v6c0 4-3 6-7 8-4-2-7-4-7-8V7z']
  ];
  var QUICK = [
    ['+ Serviço',  '/gestao/'],
    ['+ Orçamento','/painel-orcamentos/'],
    ['+ Cliente',  '/gestao/#clientes']
  ];

  function logged(){ try { return !!(w.EloiAdminAuth && EloiAdminAuth.token()); } catch(e){ return false; } }

  function icon(pathD){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="'+pathD+'"/></svg>';
  }
  // item ativo: melhor match de pathname; desempate por hash.
  function activeHref(){
    var path = location.pathname.replace(/\/+$/,'/') || '/';
    var hash = location.hash;
    var best = '', bestLen = -1;
    PRIMARY.concat(TOOLS).forEach(function(it){
      var href = it[0], hp = href.split('#')[0], hh = href.indexOf('#')>=0 ? '#'+href.split('#')[1] : '';
      if(path === hp || path.indexOf(hp) === 0){
        var score = hp.length + (hh && hh === hash ? 100 : 0) - (hh && hh !== hash ? 50 : 0);
        if(score > bestLen){ bestLen = score; best = href; }
      }
    });
    return best;
  }

  function link(it, active){
    var on = it[0] === active ? ' eloi-nav-on' : '';
    return '<a class="eloi-nav-item'+on+'" href="'+it[0]+'">'+icon(it[2])+'<span>'+it[1]+'</span></a>';
  }

  function styleTag(){
    return '<style id="eloi-nav-style">'
      // Trilho escuro sobre tela clara. --logo-1/--logo-2 recolorem a wordmark
      // injetada (os fills da SVG sao var()), sem precisar de um 2o arquivo aqui.
      + '.eloi-nav,.eloi-nav-bar{--logo-1:#E0AAFF;--logo-2:#C77DFF}'
      + '.eloi-nav{position:fixed;top:0;left:0;bottom:0;width:'+W+'px;z-index:900;'
      + 'background:#1A0033;border-right:1px solid rgba(224,170,255,.14);'
      + 'display:flex;flex-direction:column;padding:22px 14px 16px;overflow-y:auto;'
      + 'font-family:carbona-variable,system-ui,sans-serif;color:#EFE6F8;transition:transform .25s ease}'
      + '.eloi-nav .eloi-nav-logo{height:58px;margin:0 6px 24px}'
      + '.eloi-nav .eloi-nav-logo svg{height:100%;width:auto;display:block}'
      + '.eloi-nav-sec{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#A992C4;margin:18px 8px 6px;font-weight:600}'
      + '.eloi-nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;'
      + 'color:#D9C8EC;text-decoration:none;font-size:.9rem;line-height:1;transition:background .15s,color .15s}'
      + '.eloi-nav-item svg{flex:0 0 auto;opacity:.8}'
      + '.eloi-nav-item:hover{background:rgba(224,170,255,.1);color:#fff}'
      + '.eloi-nav-on{background:rgba(224,170,255,.15);color:#fff;box-shadow:inset 3px 0 0 #C77DFF}'
      + '.eloi-nav-on svg{opacity:1}'
      + '.eloi-nav-spacer{flex:1;min-height:20px}'
      + '.eloi-nav-quick{display:flex;flex-wrap:wrap;gap:6px;margin:4px 4px 10px}'
      + '.eloi-nav-quick a{flex:1 1 auto;text-align:center;font-size:.74rem;padding:7px 8px;border-radius:8px;'
      + 'background:rgba(224,170,255,.08);border:1px solid rgba(224,170,255,.18);color:#D9C8EC;text-decoration:none;white-space:nowrap}'
      + '.eloi-nav-quick a:hover{border-color:#C77DFF;color:#fff}'
      + '.eloi-nav-out{margin:0 4px;text-align:left;background:transparent;border:1px solid rgba(224,170,255,.2);color:#C77DFF;'
      + 'font-family:inherit;font-size:.8rem;padding:9px 12px;border-radius:9px;cursor:pointer;transition:border-color .15s,color .15s}'
      + '.eloi-nav-out:hover{border-color:#C77DFF;color:#fff}'
      + '.eloi-nav-bar{position:fixed;top:0;left:0;right:0;height:52px;z-index:899;display:none;'
      + 'align-items:center;gap:12px;padding:0 14px;background:#1A0033;border-bottom:1px solid rgba(224,170,255,.14);'
      + 'font-family:carbona-variable,system-ui,sans-serif}'
      + '.eloi-nav-burger{background:none;border:none;color:#E0AAFF;cursor:pointer;padding:6px;display:flex}'
      + '.eloi-nav-bar .eloi-nav-logo{height:34px;margin:0}'
      + '.eloi-nav-bar .eloi-nav-logo svg{height:100%;width:auto;display:block}'
      + '.eloi-nav-scrim{position:fixed;inset:0;z-index:898;background:rgba(26,0,51,.55);display:none}'
      + '@media(max-width:'+(BP-1)+'px){'
      + '.eloi-nav{transform:translateX(-100%);box-shadow:0 0 40px rgba(0,0,0,.5)}'
      + 'body.eloi-nav-open .eloi-nav{transform:translateX(0)}'
      + 'body.eloi-nav-open .eloi-nav-scrim{display:block}'
      + '.eloi-nav-bar{display:flex}}'
      + '</style>';
  }

  function applyPad(){
    if(mq && mq.matches){ d.body.style.paddingLeft = W + 'px'; d.body.style.paddingTop = ''; d.body.classList.remove('eloi-nav-open'); }
    else { d.body.style.paddingLeft = ''; d.body.style.paddingTop = '52px'; }
  }
  function toggle(open){
    if(open === undefined) open = !d.body.classList.contains('eloi-nav-open');
    d.body.classList.toggle('eloi-nav-open', open);
  }

  function mount(){
    if(MOUNTED || !logged()) return;
    MOUNTED = true;
    var active = activeHref();
    var burger = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

    var aside = d.createElement('aside');
    aside.className = 'eloi-nav';
    aside.innerHTML =
      '<div class="eloi-nav-logo" id="eloiNavLogo"></div>'
      + PRIMARY.map(function(it){ return link(it, active); }).join('')
      + '<div class="eloi-nav-sec">Ferramentas</div>'
      + TOOLS.map(function(it){ return link(it, active); }).join('')
      + '<div class="eloi-nav-spacer"></div>'
      + '<div class="eloi-nav-quick">' + QUICK.map(function(q){ return '<a href="'+q[1]+'">'+q[0]+'</a>'; }).join('') + '</div>'
      + '<button class="eloi-nav-out" id="eloiNavOut">Sair</button>';

    var bar = d.createElement('div');
    bar.className = 'eloi-nav-bar';
    bar.innerHTML = '<button class="eloi-nav-burger" id="eloiNavBurger">'+burger+'</button><div class="eloi-nav-logo" id="eloiNavLogoBar"></div>';

    var scrim = d.createElement('div');
    scrim.className = 'eloi-nav-scrim';

    d.body.insertAdjacentHTML('afterbegin', styleTag());
    d.body.insertBefore(scrim, d.body.firstChild);
    d.body.insertBefore(bar, d.body.firstChild);
    d.body.insertBefore(aside, d.body.firstChild);

    // wordmark
    fetch('/assets/eloi-admin/wordmark.svg').then(function(r){ return r.text(); }).then(function(svg){
      var a = d.getElementById('eloiNavLogo'), b = d.getElementById('eloiNavLogoBar');
      if(a) a.innerHTML = svg; if(b) b.innerHTML = svg;
    }).catch(function(){});

    d.getElementById('eloiNavBurger').addEventListener('click', function(){ toggle(); });
    scrim.addEventListener('click', function(){ toggle(false); });
    d.getElementById('eloiNavOut').addEventListener('click', function(){
      try { EloiAdminAuth.logout(); } catch(e){}
      location.href = '/admin/';
    });
    aside.addEventListener('click', function(e){ if(e.target.closest('a')) toggle(false); });

    mq = w.matchMedia('(min-width:'+BP+'px)');
    (mq.addEventListener ? mq.addEventListener('change', applyPad) : mq.addListener(applyPad));
    applyPad();
  }

  function unmount(){
    if(!MOUNTED) return; MOUNTED = false;
    ['.eloi-nav','.eloi-nav-bar','.eloi-nav-scrim','#eloi-nav-style'].forEach(function(sel){
      var el = d.querySelector(sel); if(el) el.remove();
    });
    d.body.style.paddingLeft = ''; d.body.style.paddingTop = ''; d.body.classList.remove('eloi-nav-open');
  }

  w.EloiNav = { mount: mount, unmount: unmount };
  if (d.readyState !== 'loading') { if(logged()) mount(); }
  else d.addEventListener('DOMContentLoaded', function(){ if(logged()) mount(); });
})(window, document);
