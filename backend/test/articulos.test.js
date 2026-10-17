const assert = require('node:assert/strict');
const { test } = require('node:test');
const { categoria, familia } = require('../src/servicios/articulos');

test('normalizes descriptions to the configured article families', () => {
  assert.equal(familia(null), 'SIN DESCRIPCION');
  assert.equal(familia('  SÍLLA Rimax  '), 'SILLA');
  assert.equal(familia('Portátil Lenovo'), 'COMPUTADOR PORTATIL');
  assert.equal(familia('Computador de escritorio'), 'ESCRITORIO');
  assert.equal(familia('Equipo de cómputo'), 'COMPUTADOR');
  assert.equal(familia('Artículo sin familia'), 'ARTICULO SIN FAMILIA');
});

test('classifies normalized article families and furniture patterns', () => {
  assert.equal(categoria('Portátil Lenovo'), 'electrico');
  assert.equal(categoria('Computador de escritorio'), 'mobiliario');
  assert.equal(categoria('Silla universitaria'), 'mobiliario');
  assert.equal(categoria('Microscopio'), 'electrico');
  assert.equal(categoria('Cristo de madera'), 'mobiliario');
});
