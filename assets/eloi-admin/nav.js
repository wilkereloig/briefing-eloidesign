/* nav.js — navegacao admin compartilhada. Injetado por JS (1 <script> por pagina).
   window.EloiNav = { mount, unmount }. Auth-aware: so injeta se logado.

   Duas formas, uma fonte:
   - >=900px  trilho lateral claro a esquerda (.eloi-nav)
   - <900px   barra de abas fixa no rodape (.eloi-tabs) + topo com marca e Sair

   Deslocamento do conteudo por inline style no body (sobrepoe padding shorthand). */
(function (w, d) {
  var W = 236, BP = 900, TABH = 58, MOUNTED = false, mq = null;

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
  var MARCA = ['/marca/', 'Entregas de Marca', 'M12 3l7 4v6c0 4-3 6-7 8-4-2-7-4-7-8V7z'];
  var TOOLS = [MARCA];

  // Abas != trilho, de proposito. 'Clientes' apontava pro MESMO documento que
  // 'Gestao' (/gestao/#clientes) -- duas abas pro mesmo lugar quebram a premissa
  // da barra, e em /marca/ nenhuma acenderia. Clientes ja e aba DENTRO da Gestao.
  var TABS = PRIMARY.slice(0, 4).concat([[MARCA[0], 'Marca', MARCA[2]]]);

  // So no trilho: no celular sao links para destinos que ja sao abas.
  var QUICK = [
    ['+ Serviço',  '/gestao/'],
    ['+ Orçamento','/painel-orcamentos/'],
    ['+ Cliente',  '/gestao/#clientes']
  ];

  function logged(){ try { return !!(w.EloiAdminAuth && EloiAdminAuth.token()); } catch(e){ return false; } }

  function icon(pathD, sz){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="'+(sz||18)+'" height="'+(sz||18)+'"><path d="'+pathD+'"/></svg>';
  }
  // item ativo: melhor match de pathname; desempate por hash.
  function activeHref(lista){
    var path = location.pathname.replace(/\/+$/,'/') || '/';
    var hash = location.hash;
    var best = '', bestLen = -1;
    lista.forEach(function(it){
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
  function tab(it, active){
    var on = it[0] === active ? ' eloi-tab-on' : '';
    return '<a class="eloi-tab'+on+'" href="'+it[0]+'">'+icon(it[2],21)+'<span>'+it[1]+'</span></a>';
  }

  function styleTag(){
    return '<style id="eloi-nav-style">'
      // ---------- trilho (desktop) ----------
      // Trilho CLARO. A wordmark fica na cor natural (escura) — nenhuma troca de
      // --logo-1/--logo-2 aqui, e por isso o wordmark.svg serve os dois usos sem
      // segunda colorizacao. O trilho branco da 1.09:1 contra o canvas --bg, ou
      // seja: quem separa e a aresta (borda + sombra), nao o preenchimento.
      + '.eloi-nav{position:fixed;top:0;left:0;bottom:0;width:'+W+'px;z-index:900;'
      + 'background:var(--surface,#fff);border-right:1px solid var(--line-strong,#D5C6E9);'
      + 'box-shadow:2px 0 18px rgba(36,0,67,.045);'
      + 'display:flex;flex-direction:column;padding:24px 14px 16px;overflow-y:auto;'
      + 'font-family:carbona-variable,system-ui,sans-serif;color:var(--ink,#240043)}'
      + '.eloi-nav .eloi-nav-logo{height:62px;margin:0 6px 26px}'
      + '.eloi-nav .eloi-nav-logo svg{height:100%;width:auto;display:block}'
      // --muted (6.37:1), nao --muted-2 (3.88:1): rotulo minusculo nao pode
      // ficar no limite. Filete acima faz o trabalho que o espaco vago fazia.
      + '.eloi-nav-sec{font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#6B5685);'
      + 'margin:20px 8px 8px;padding-top:14px;border-top:1px solid var(--line,#E7DEF2);font-weight:600}'
      + '.eloi-nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:var(--r-sm,8px);'
      + 'color:var(--muted,#6B5685);text-decoration:none;font-size:.9rem;line-height:1;transition:background .15s,color .15s}'
      + '.eloi-nav-item svg{flex:0 0 auto;opacity:.75}'
      + '.eloi-nav-item:hover{background:var(--surface-2,#F2ECF9);color:var(--ink,#240043)}'
      + '.eloi-nav-item:hover svg{opacity:1}'
      // Ativo: preenchimento + cor + barra, tres sinais. Nao depende de borda,
      // entao nao esbarra no minimo de 3:1 pra contorno de componente.
      + '.eloi-nav-on,.eloi-nav-on:hover{background:var(--brand-soft,#F0E7FA);color:var(--brand,#5A189A);'
      + 'font-variation-settings:\'wght\' 620;box-shadow:inset 3px 0 0 var(--brand,#5A189A)}'
      + '.eloi-nav-on svg{opacity:1}'
      + '.eloi-nav-spacer{flex:1;min-height:20px}'
      + '.eloi-nav-quick{display:flex;flex-wrap:wrap;gap:6px;margin:4px 4px 10px;padding-top:14px;border-top:1px solid var(--line,#E7DEF2)}'
      + '.eloi-nav-quick a{flex:1 1 auto;text-align:center;font-size:.75rem;padding:8px;border-radius:var(--r-sm,8px);'
      + 'background:var(--surface,#fff);border:1px solid var(--line-strong,#D5C6E9);color:var(--ink-2,#3C0A6B);'
      + 'text-decoration:none;white-space:nowrap;transition:border-color .15s,background .15s}'
      + '.eloi-nav-quick a:hover{border-color:var(--brand,#5A189A);background:var(--brand-soft,#F0E7FA)}'
      // Preenchimento tonal, nao transparente: borda fina + fundo branco +
      // largura total e a assinatura de um <input>, e o Sair estava sendo lido
      // como campo. Fundo --surface-2 devolve a afordancia de botao.
      + '.eloi-nav-out{margin:0 4px;text-align:left;background:var(--surface-2,#F2ECF9);border:1px solid var(--line-strong,#D5C6E9);'
      + 'color:var(--muted,#6B5685);font-family:inherit;font-size:.8rem;padding:10px 12px;border-radius:var(--r-sm,8px);'
      + 'cursor:pointer;display:flex;align-items:center;gap:9px;transition:border-color .15s,color .15s,background .15s}'
      + '.eloi-nav-out svg{flex:0 0 auto}'
      + '.eloi-nav-out:hover{border-color:var(--bad,#BE123C);color:var(--bad,#BE123C);background:var(--bad-soft,#FCE8ED)}'

      // ---------- topo + abas (mobile) ----------
      + '.eloi-nav-bar,.eloi-tabs{display:none;font-family:carbona-variable,system-ui,sans-serif}'
      + '.eloi-nav-bar{position:fixed;top:0;left:0;right:0;z-index:899;'
      + 'align-items:center;justify-content:space-between;gap:12px;'
      + 'height:calc(52px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 14px 0;'
      + 'background:var(--surface,#fff);border-bottom:1px solid var(--line,#E7DEF2)}'
      + '.eloi-nav-bar .eloi-nav-logo{height:34px}'
      + '.eloi-nav-bar .eloi-nav-logo svg{height:100%;width:auto;display:block}'
      + '.eloi-bar-out{display:flex;align-items:center;gap:7px;background:none;border:0;'
      + 'color:var(--muted,#6B5685);font-family:inherit;font-size:.82rem;padding:8px 6px;cursor:pointer;min-height:44px}'
      // Barra de abas: rodape e onde o polegar alcanca. Altura + safe-area
      // (a faixa do gesto de home no iPhone come o ultimo terco sem isso).
      + '.eloi-tabs{position:fixed;left:0;right:0;bottom:0;z-index:900;'
      + 'background:var(--surface,#fff);border-top:1px solid var(--line,#E7DEF2);'
      + 'box-shadow:0 -2px 14px rgba(36,0,67,.06);'
      + 'padding-bottom:env(safe-area-inset-bottom)}'
      + '.eloi-tabs-in{display:flex;align-items:stretch;height:'+TABH+'px}'
      + '.eloi-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'
      + 'text-decoration:none;color:var(--muted,#6B5685);font-size:.66rem;line-height:1;padding:6px 2px;'
      + '-webkit-tap-highlight-color:transparent;transition:color .12s}'
      + '.eloi-tab span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.eloi-tab svg{flex:0 0 auto;opacity:.7;transition:opacity .12s}'
      + '.eloi-tab:active{color:var(--ink,#240043)}'
      // Aba ativa: cor + peso + filete no topo. Tres sinais, nenhum so por cor
      // (daltonismo continua lendo o filete e o peso).
      + '.eloi-tab-on{color:var(--brand,#5A189A);font-variation-settings:\'wght\' 620;'
      + 'box-shadow:inset 0 2px 0 var(--brand,#5A189A)}'
      + '.eloi-tab-on svg{opacity:1}'

      + '@media(max-width:'+(BP-1)+'px){'
      + '.eloi-nav{display:none}'
      + '.eloi-nav-bar{display:flex}'
      + '.eloi-tabs{display:block}}'
      + '</style>';
  }

  function applyPad(){
    if(mq && mq.matches){
      d.body.style.paddingLeft = W + 'px';
      d.body.style.paddingTop = '';
      d.body.style.paddingBottom = '';
    } else {
      d.body.style.paddingLeft = '';
      d.body.style.paddingTop = 'calc(52px + env(safe-area-inset-top))';
      // reserva a barra de abas + a faixa do gesto de home
      d.body.style.paddingBottom = 'calc(' + TABH + 'px + env(safe-area-inset-bottom))';
    }
  }

  function mount(){
    if(MOUNTED || !logged()) return;
    MOUNTED = true;
    var active = activeHref(PRIMARY.concat(TOOLS));
    var activeTab = activeHref(TABS);
    var sairIcon = 'M15 17l5-5-5-5M20 12H9M13 3H6a1 1 0 00-1 1v16a1 1 0 001 1h7';

    var aside = d.createElement('aside');
    aside.className = 'eloi-nav';
    aside.innerHTML =
      '<div class="eloi-nav-logo" id="eloiNavLogo"></div>'
      + PRIMARY.map(function(it){ return link(it, active); }).join('')
      + '<div class="eloi-nav-sec">Ferramentas</div>'
      + TOOLS.map(function(it){ return link(it, active); }).join('')
      + '<div class="eloi-nav-spacer"></div>'
      + '<div class="eloi-nav-quick">' + QUICK.map(function(q){ return '<a href="'+q[1]+'">'+q[0]+'</a>'; }).join('') + '</div>'
      + '<button class="eloi-nav-out" id="eloiNavOut">' + icon(sairIcon) + '<span>Sair</span></button>';

    var bar = d.createElement('div');
    bar.className = 'eloi-nav-bar';
    bar.innerHTML = '<div class="eloi-nav-logo" id="eloiNavLogoBar"></div>'
      + '<button class="eloi-bar-out" id="eloiBarOut">' + icon(sairIcon, 17) + '<span>Sair</span></button>';

    var tabs = d.createElement('nav');
    tabs.className = 'eloi-tabs';
    tabs.setAttribute('aria-label', 'Navegação principal');
    tabs.innerHTML = '<div class="eloi-tabs-in">'
      + TABS.map(function(it){ return tab(it, activeTab); }).join('') + '</div>';

    d.body.insertAdjacentHTML('afterbegin', styleTag());
    d.body.insertBefore(tabs, d.body.firstChild);
    d.body.insertBefore(bar, d.body.firstChild);
    d.body.insertBefore(aside, d.body.firstChild);

    // wordmark
    fetch('/assets/eloi-admin/wordmark.svg').then(function(r){ return r.text(); }).then(function(svg){
      var a = d.getElementById('eloiNavLogo'), b = d.getElementById('eloiNavLogoBar');
      if(a) a.innerHTML = svg; if(b) b.innerHTML = svg;
    }).catch(function(){});

    function sair(){
      try { EloiAdminAuth.logout(); } catch(e){}
      location.href = '/admin/';
    }
    d.getElementById('eloiNavOut').addEventListener('click', sair);
    d.getElementById('eloiBarOut').addEventListener('click', sair);

    mq = w.matchMedia('(min-width:'+BP+'px)');
    (mq.addEventListener ? mq.addEventListener('change', applyPad) : mq.addListener(applyPad));
    applyPad();
  }

  function unmount(){
    if(!MOUNTED) return; MOUNTED = false;
    ['.eloi-nav','.eloi-nav-bar','.eloi-tabs','#eloi-nav-style'].forEach(function(sel){
      var el = d.querySelector(sel); if(el) el.remove();
    });
    d.body.style.paddingLeft = ''; d.body.style.paddingTop = ''; d.body.style.paddingBottom = '';
  }

  w.EloiNav = { mount: mount, unmount: unmount };
  if (d.readyState !== 'loading') { if(logged()) mount(); }
  else d.addEventListener('DOMContentLoaded', function(){ if(logged()) mount(); });
})(window, document);
