/* Cálculo de orçamento — compartilhado entre /painel-orcamentos/ e /orcamento/ (view do cliente).
   A regra de multiplicador vive AQUI e só aqui. Nunca gravar linha de ajuste em `itens`. */
(function(){
  var COMPLEX = [
    {key:'simples', label:'Simples', m:1.0},
    {key:'media',   label:'Média',   m:1.4},
    {key:'alta',    label:'Alta',    m:1.8}
  ];
  var URGENCIA = [
    {key:'normal',   label:'Normal',           m:1.0},
    {key:'expressa', label:'Expressa (curto)', m:1.3}
  ];

  function r2(n){ return Math.round((Number(n)||0)*100)/100; }

  function multiplicadorDe(lista, key){
    for(var i=0;i<lista.length;i++){ if(lista[i].key===key) return lista[i]; }
    return lista[0];
  }

  function calcular(o){
    o = o || {};
    var itens = Array.isArray(o.itens) ? o.itens : [];
    var c = multiplicadorDe(COMPLEX, o.complexidade);
    var u = multiplicadorDe(URGENCIA, o.urgencia);
    var d = Math.min(100, Math.max(0, Number(o.desconto_pct) || 0));

    var base = r2(itens.reduce(function(a,it){ return a + r2(it && it.valor); }, 0));
    var afterC = base * c.m;
    var afterU = afterC * u.m;
    var afterD = afterU * (1 - d/100);

    var ajustes = [];
    if(c.m !== 1) ajustes.push({nome:'Complexidade '+c.label+' (×'+c.m+')', valor:r2(afterC-base)});
    if(u.m !== 1) ajustes.push({nome:'Urgência '+u.label+' (×'+u.m+')',     valor:r2(afterU-afterC)});
    if(d > 0)     ajustes.push({nome:'Desconto '+d+'%',                      valor:r2(afterD-afterU)});

    return { base: base, ajustes: ajustes, total: r2(afterD) };
  }

  window.EloiOrcamento = {
    COMPLEX: COMPLEX,
    URGENCIA: URGENCIA,
    multiplicadorDe: multiplicadorDe,
    calcular: calcular
  };
})();
