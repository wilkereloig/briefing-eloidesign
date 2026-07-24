/* rascunho.js — autosave do briefing no aparelho do proprio cliente.
   Antes disso o formulario nao guardava NADA: fechar a aba, ficar sem bateria
   ou o navegador descartar a aba apagava tudo. Um botao de "Inicio" so piorava
   isso, entao o rascunho vem primeiro e o botao fica seguro por construcao.

   Serve /briefing/, /briefing-ecommerce/ e /briefing-solarium/: as tres tem
   #briefingForm, #successOverlay, showStep() e .step[data-step].

   Fica no localStorage do proprio visitante, some ao enviar, e expira sozinho.
   Nada sai do aparelho por aqui. */
(function (w, d) {
  var DIAS = 30;
  var form, KEY;

  function chave(el){
    // radio e checkbox repetem o name; o valor faz parte da identidade
    return /^(radio|checkbox)$/.test(el.type) ? el.name + '\u001f' + el.value : el.name;
  }
  function elegivel(el){
    return el.name && !/^(file|submit|button|reset|image|password)$/.test(el.type);
  }
  function etapaAtual(){
    var s = d.querySelector('.step.active');
    return s ? parseInt(s.dataset.step, 10) || 1 : 1;
  }

  function salvar(){
    var campos = {}, temAlgo = false;
    Array.prototype.forEach.call(form.elements, function(el){
      if (!elegivel(el)) return;
      if (/^(radio|checkbox)$/.test(el.type)) {
        if (el.checked) { campos[chave(el)] = true; temAlgo = true; }
      } else if (el.value) {
        campos[chave(el)] = el.value; temAlgo = true;
      }
    });
    if (!temAlgo) { try { localStorage.removeItem(KEY); } catch(e){} return; }
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), etapa: etapaAtual(), campos: campos }));
    } catch(e){ /* cota cheia ou modo privado: seguir sem rascunho */ }
  }

  function ler(){
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.campos) return null;
      if (Date.now() - (o.t || 0) > DIAS * 864e5) { localStorage.removeItem(KEY); return null; }
      return o;
    } catch(e){ return null; }
  }
  function limpar(){ try { localStorage.removeItem(KEY); } catch(e){} }

  function restaurar(o){
    var n = 0;
    Array.prototype.forEach.call(form.elements, function(el){
      if (!elegivel(el)) return;
      var v = o.campos[chave(el)];
      if (v === undefined) return;
      if (/^(radio|checkbox)$/.test(el.type)) el.checked = true;
      else el.value = v;
      n++;
      // a pagina tem logica pendurada nesses eventos (campos "outro", contadores):
      // setar .value sozinho nao dispara nada
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (o.etapa > 1 && typeof w.showStep === 'function') {
      try { w.showStep(o.etapa, 'next'); } catch(e){}
    }
    return n;
  }

  function banner(o, restaurados){
    var total = d.querySelectorAll('.step[data-step]').length;
    var el = d.createElement('div');
    el.className = 'eloi-rasc';
    el.innerHTML = '<div><strong>Retomamos de onde você parou</strong>'
      + '<span>Etapa ' + o.etapa + ' de ' + total + ' · ' + restaurados + ' resposta'
      + (restaurados === 1 ? '' : 's') + ' recuperada' + (restaurados === 1 ? '' : 's') + '</span></div>'
      + '<button type="button">Começar do zero</button>';
    el.querySelector('button').addEventListener('click', function(){
      limpar();
      location.reload();
    });
    var alvo = d.querySelector('.progress-wrap');
    if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(el, alvo.nextSibling);
    else d.body.insertBefore(el, d.body.firstChild);
  }

  function estilo(){
    return '<style id="eloi-rascunho-style">'
      + '.eloi-rasc{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;'
      + 'max-width:760px;margin:16px auto 0;padding:12px 18px;'
      + 'background:var(--brand-soft,#F0E7FA);border:1px solid var(--line-strong,#D5C6E9);'
      + 'border-radius:var(--r-sm,8px);font-family:var(--font,inherit);font-size:.86rem;color:var(--ink,#240043)}'
      + '.eloi-rasc strong{display:block;font-variation-settings:\'wght\' 620}'
      + '.eloi-rasc span{color:var(--muted,#6B5685);font-size:.8rem}'
      + '.eloi-rasc button{background:none;border:1px solid var(--line-strong,#D5C6E9);border-radius:var(--r-sm,8px);'
      + 'color:var(--muted,#6B5685);font-family:inherit;font-size:.78rem;padding:8px 14px;min-height:38px;cursor:pointer;'
      + 'transition:border-color .15s,color .15s}'
      + '.eloi-rasc button:hover{border-color:var(--brand,#5A189A);color:var(--brand,#5A189A)}'
      + '@media(max-width:600px){.eloi-rasc{margin:12px 16px 0}}'
      + '</style>';
  }

  function init(){
    form = d.getElementById('briefingForm');
    if (!form) return;
    KEY = 'eloi_rascunho_' + location.pathname;

    d.head.insertAdjacentHTML('beforeend', estilo());

    var o = ler();
    if (o) {
      var n = restaurar(o);
      if (n) banner(o, n); else limpar();
    }

    var timer;
    form.addEventListener('input',  agenda);
    form.addEventListener('change', agenda);
    function agenda(){ clearTimeout(timer); timer = setTimeout(salvar, 400); }

    // Avancar/voltar etapa nao dispara input: guarda a etapa tambem.
    d.addEventListener('click', function(e){
      if (e.target.closest('.btn-next,.btn-back')) setTimeout(salvar, 60);
    });

    // Enviado com sucesso -> o rascunho perdeu a razao de existir. O overlay
    // ganhando .show e o unico sinal comum as tres paginas.
    var ov = d.getElementById('successOverlay');
    if (ov) new MutationObserver(function(){
      if (ov.classList.contains('show')) limpar();
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }

  if (d.readyState !== 'loading') init();
  else d.addEventListener('DOMContentLoaded', init);
})(window, document);
