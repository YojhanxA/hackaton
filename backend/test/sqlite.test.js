process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'sqlite-test-secret-that-is-long-enough-to-sign-tokens';

const assert = require('node:assert/strict');
const path = require('node:path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { migrar } = require('../src/db/migrar');
const { consultar, transaccion, cerrar } = require('../src/db/pool');
const bitacora = require('../src/servicios/bitacora');
const { crearApp } = require('../src/app');

before(async () => {
  await migrar({ silencioso: true });
});

after(async () => {
  await cerrar();
});

test('migrates idempotently and supports application transactions on SQLite', async () => {
  assert.equal(await migrar({ silencioso: true }), 0);
  const hashClave = await bcrypt.hash('clave-de-prueba', 4);

  const resultado = await transaccion(async c => {
    const { rows: [usuario] } = await c.query(
      'INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1,$2,$3,$4) RETURNING id, activo',
      ['prueba', 'Usuario Prueba', hashClave, 'admin']
    );
    const { rows: [institucion] } = await c.query(
      'INSERT INTO instituciones (codigo, nombre, municipio, departamento) VALUES ($1,$2,$3,$4) RETURNING id',
      ['TEST-1', 'Institución de prueba', 'Medellín', 'Antioquia']
    );
    const { rows: [reintegro] } = await c.query(
      `INSERT INTO reintegros (institucion_id, fecha_reintegro, cantidad, descripcion, hash_registro, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, codigo`,
      [institucion.id, '2026-01-02', 1, 'Prueba SQLite', 'a'.repeat(64), usuario.id]
    );
    await bitacora.registrar(c, {
      usuario: 'prueba', accion: 'PRUEBA', entidad: 'reintegro', entidadId: reintegro.codigo,
      datos: { prueba: true }
    });
    const { rows } = await consultar('SELECT id FROM instituciones WHERE id = $1', [institucion.id]);
    return { usuario, institucion, reintegro, nestedQuery: rows.length };
  });

  assert.equal(resultado.usuario.activo, true);
  assert.equal(resultado.reintegro.codigo, 'RI-000001');
  assert.equal(resultado.nestedQuery, 1);

  const { rows: filtradas } = await consultar(
    'SELECT id FROM instituciones WHERE id = ANY($1)',
    [[resultado.institucion.id]]
  );
  assert.equal(filtradas.length, 1);

  const { rows: bitacoraRows } = await consultar('SELECT datos FROM bitacora');
  assert.deepEqual(bitacoraRows[0].datos, { prueba: true });
  assert.equal((await bitacora.verificar()).ok, true);

  await assert.rejects(transaccion(async c => {
    await c.query(
      'INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1,$2,$3,$4)',
      ['rollback', 'Usuario Rollback', 'hash', 'admin']
    );
    throw new Error('rollback de prueba');
  }), /rollback de prueba/);
  const { rows: revertido } = await consultar('SELECT id FROM usuarios WHERE usuario = $1', ['rollback']);
  assert.equal(revertido.length, 0);

  const app = crearApp();
  const sesion = await request(app)
    .post('/api/auth/login')
    .send({ usuario: 'prueba', clave: 'clave-de-prueba' })
    .expect(200);
  const auth = { Authorization: `Bearer ${sesion.body.token}` };

  const instituciones = await request(app).get('/api/instituciones').set(auth).expect(200);
  assert.equal(instituciones.body.total, 1);
  const panel = await request(app).get('/api/panel').set(auth).expect(200);
  assert.equal(panel.body.instituciones.total, 1);
  const informe = await request(app).get('/api/informes/resumen').set(auth).expect(200);
  assert.equal(informe.body.total_registros, 1);
  assert.ok(informe.body.por_categoria.length >= 2);

  for (const [cantidad, descripcion] of [[44, '44 SILLAS UNIVERSITARIAS'], [31, 'Silla universitaria']]) {
    await request(app).post('/api/reintegros').set(auth).send({
      institucion_id: resultado.institucion.id, institucion_texto: null, fecha_reintegro: '2026-01-02',
      placa: null, cantidad, descripcion, referencia_soporte: null, valor: null, estado: 'realizado', observaciones: null
    }).expect(201);
  }
  const consolidado = await request(app)
    .get(`/api/informes/articulos-institucion?institucion_id=${resultado.institucion.id}&categoria=mobiliario`)
    .set(auth).expect(200);
  assert.equal(consolidado.body.total, 1);
  assert.equal(consolidado.body.datos[0].articulo, 'SILLA');
  assert.equal(consolidado.body.datos[0].registros, 2);
  assert.equal(consolidado.body.datos[0].elementos, 75);

  const archivoEjemplo = path.join(__dirname, '..', '..', 'docs', 'ejemplos', 'acta_reintegro_EJEMPLO.xlsx');
  const previa = await request(app)
    .post('/api/importaciones')
    .set(auth)
    .field('estado', 'pendiente')
    .field('confirmar', 'false')
    .attach('archivo', archivoEjemplo)
    .expect(200);
  assert.equal(previa.body.confirmado, false);
  assert.ok(previa.body.filas > 0);
  assert.ok(previa.body.validos > 0);

  const importada = await request(app)
    .post('/api/importaciones')
    .set(auth)
    .field('estado', 'pendiente')
    .field('confirmar', 'true')
    .attach('archivo', archivoEjemplo)
    .expect(201);
  assert.equal(importada.body.confirmado, true);
  assert.ok(importada.body.insertados > 0);
});
