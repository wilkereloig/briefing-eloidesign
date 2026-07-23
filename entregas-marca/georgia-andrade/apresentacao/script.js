/* GEORGIA ANDRADE — apresentação · ELOI Design
   Escala 16:9, navegação, tela cheia, PDF, injeção de logos, traço do símbolo. */
(function () {
  'use strict';

  var stage    = document.getElementById('stage');
  var slides   = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total    = slides.length;
  var counter  = document.getElementById('counter');
  var progress = document.getElementById('progress');
  var hint     = document.getElementById('hint');
  var i = 0;

  /* ---- Escala / letterbox (mantém 16:9 em qualquer viewport) ---- */
  function fit() {
    var w = window.innerWidth  || document.documentElement.clientWidth  || 1920;
    var h = window.innerHeight || document.documentElement.clientHeight || 1080;
    var s = Math.min(w / 1920, h / 1080);
    if (!isFinite(s) || s <= 0) s = 1;
    stage.style.setProperty('--scale', s);
  }
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  requestAnimationFrame(fit);
  fit();

  /* ---- Injeção dos SVGs de logo (currentColor recolore por contexto) ---- */
  var map = {
    'simbolo':  'assets/logo/simbolo-solido.svg',
    'wordmark': 'assets/logo/wordmark.svg',
    'lockup-h': 'assets/logo/lockup-horizontal.svg',
    'lockup-v': 'assets/logo/lockup-empilhado.svg',
    'completa': 'assets/logo/logo-completa.svg'
  };
  var cache = {};
  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(map[name]).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      });
    }
    return cache[name];
  }
  function injectAll() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-logo]'));
    return Promise.all(els.map(function (el) {
      var name = el.getAttribute('data-logo');
      if (!map[name]) return null;
      return load(name).then(function (svg) {
        el.innerHTML = svg;
        if (el.hasAttribute('data-draw')) {
          var p = el.querySelector('path');
          if (p) { p.setAttribute('pathLength', '1'); el.classList.add('draw'); }
        }
      }).catch(function (e) {
        console.warn('Falha ao carregar logo "' + name + '" (sirva por http, não file://).', e);
      });
    })).then(function () { playDraw(slides[i]); });
  }

  /* ---- Reproduz o traço do símbolo ao entrar no slide ---- */
  function playDraw(slide) {
    if (!slide) return;
    var marks = slide.querySelectorAll('.mark-draw.draw');
    Array.prototype.forEach.call(marks, function (el) {
      el.classList.remove('play');
      void el.offsetWidth;          /* reinicia a animação */
      el.classList.add('play');
    });
  }

  /* ---- Navegação ---- */
  function render() {
    for (var n = 0; n < total; n++) {
      slides[n].classList.toggle('is-active', n === i);
      slides[n].classList.toggle('is-prev', n < i);
    }
    counter.textContent = pad(i + 1) + ' / ' + pad(total);
    progress.style.transform = 'scaleX(' + (total > 1 ? i / (total - 1) : 1) + ')';
    playDraw(slides[i]);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function go(n) { i = Math.max(0, Math.min(total - 1, n)); render(); }
  function next() { if (i < total - 1) go(i + 1); }
  function prev() { if (i > 0) go(i - 1); }

  document.getElementById('next').addEventListener('click', function () { next(); hideHint(); });
  document.getElementById('prev').addEventListener('click', function () { prev(); hideHint(); });
  document.getElementById('pdf').addEventListener('click', function () { window.print(); });
  document.getElementById('full').addEventListener('click', toggleFull);

  function toggleFull() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); next(); hideHint(); }
    else if (k === 'ArrowLeft' || k === 'PageUp')            { e.preventDefault(); prev(); hideHint(); }
    else if (k === 'Home')                                   { e.preventDefault(); go(0); }
    else if (k === 'End')                                    { e.preventDefault(); go(total - 1); }
    else if (k === 'f' || k === 'F')                         { toggleFull(); }
    else if (k === 'p' || k === 'P')                         { e.preventDefault(); window.print(); }
  });

  /* Toque: swipe horizontal */
  var x0 = null;
  document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); hideHint(); }
    x0 = null;
  }, { passive: true });

  var hinted = false;
  function hideHint() { if (!hinted && hint) { hinted = true; hint.classList.add('hide'); } }
  setTimeout(function () { if (hint) hint.classList.add('hide'); }, 6000);

  /* ---- Self-checks ---- */
  console.assert(total === 18, 'Esperado 18 slides, obtido ' + total);

  injectAll();
  render();

  /* Ir direto a um slide via #N (ex.: index.html#16) */
  function fromHash() {
    var n = parseInt((location.hash || '').replace('#', ''), 10);
    if (n >= 1 && n <= total) go(n - 1);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
