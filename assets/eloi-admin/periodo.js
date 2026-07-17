/* periodo.js — helper de periodo/formatacao compartilhado (admin).
   Fonte de verdade da semantica: competencia define o mes do servico;
   pagamento define o mes do "recebido". Sem DOM. window.EloiPeriodo.
   ponytail: gestao/index.html ainda tem copia inline destes helpers;
   migrar a Gestao pra consumir este arquivo e follow-up (P1 nao mexe nela). */
(function (w) {
  var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var PALETA_MARCA = ['#E4007C','#9D4EDD','#7B2CBF','#C77DFF','#FF6FB5','#5A189A','#B5179E','#8367C7','#D046A6','#6A4C93','#A663CC','#E85D9E'];

  function criar(){ var n = new Date(); return { ano: n.getFullYear(), mes: n.getMonth() + 1 }; }
  function ymPeriodo(p){ return p.mes ? p.ano + '-' + String(p.mes).padStart(2,'0') : null; }
  function mesDe(s){ return s.data_competencia ? String(s.data_competencia).slice(0,7) : null; }
  function noPeriodo(p, s){
    var m = mesDe(s); if(!m) return false;
    return p.mes ? m === ymPeriodo(p) : m.slice(0,4) === String(p.ano);
  }
  function pagoNoPeriodo(p, s){
    if(!s.pago || !s.data_pagamento) return false;
    var m = String(s.data_pagamento).slice(0,7);
    return p.mes ? m === ymPeriodo(p) : m.slice(0,4) === String(p.ano);
  }
  function anosDisponiveis(servicos){
    var set = new Set();
    (servicos||[]).forEach(function(s){
      if(s.data_competencia) set.add(String(s.data_competencia).slice(0,4));
      if(s.data_pagamento)   set.add(String(s.data_pagamento).slice(0,4));
    });
    return [...set].map(Number).sort(function(a,b){ return a-b; });
  }
  // periodo anterior (pro calculo de variacao). mes null => ano anterior.
  function anterior(p){
    if(!p.mes) return { ano: p.ano - 1, mes: null };
    return p.mes === 1 ? { ano: p.ano - 1, mes: 12 } : { ano: p.ano, mes: p.mes - 1 };
  }

  function brl(cents){ return (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function dataBR(d){ if(!d) return ''; var a=String(d).slice(0,10).split('-'); return a[2]+'/'+a[1]+'/'+a[0]; }
  function corDaMarca(nome){ var h=0, s=String(nome||''); for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return PALETA_MARCA[h%PALETA_MARCA.length]; }

  w.EloiPeriodo = {
    MESES: MESES, PALETA_MARCA: PALETA_MARCA,
    criar: criar, ymPeriodo: ymPeriodo, mesDe: mesDe,
    noPeriodo: noPeriodo, pagoNoPeriodo: pagoNoPeriodo,
    anosDisponiveis: anosDisponiveis, anterior: anterior,
    brl: brl, esc: esc, dataBR: dataBR, corDaMarca: corDaMarca
  };
})(window);
