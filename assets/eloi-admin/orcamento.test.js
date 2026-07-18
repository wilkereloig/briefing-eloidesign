const assert = require('assert');
global.window = {};
require('./orcamento.js');
const O = global.window.EloiOrcamento;

let r = O.calcular({itens:[{nome:'a',valor:100},{nome:'b',valor:50}], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 150);
assert.strictEqual(r.total, 150);
assert.strictEqual(r.ajustes.length, 0, 'multiplicador neutro nao gera linha de ajuste');

r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'media', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.total, 140);
assert.strictEqual(r.ajustes.length, 1);
assert.strictEqual(r.ajustes[0].valor, 40);

r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'media', urgencia:'expressa', desconto_pct:10});
assert.strictEqual(r.total, 163.8);
assert.strictEqual(r.ajustes.length, 3);

r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:100});
assert.strictEqual(r.total, 0);

r = O.calcular({itens:[], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 0);
assert.strictEqual(r.total, 0);

r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'inexistente', urgencia:null, desconto_pct:null});
assert.strictEqual(r.total, 100);

r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:-50});
assert.strictEqual(r.total, 100);
r = O.calcular({itens:[{nome:'a',valor:100}], complexidade:'simples', urgencia:'normal', desconto_pct:999});
assert.strictEqual(r.total, 0);

r = O.calcular({itens:[{nome:'a',valor:33.333}], complexidade:'simples', urgencia:'normal', desconto_pct:0});
assert.strictEqual(r.base, 33.33);

console.log('OK');
