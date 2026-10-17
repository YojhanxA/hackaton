/* Pruebas de los procesos principales contra una base PostgreSQL REAL de pruebas.
   Requiere: TEST_DATABASE_URL (base vacía o desechable: se borra su esquema público).
   Opcional: TEST_DATABASE_ADMIN_URL (superusuario) para simular una alteración directa de la bitácora.
   El servicio de rutas se reemplaza por un servidor OSRM simulado local para que la prueba sea repetible. */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

if (!process.env.TEST_DATABASE_URL) throw new Error('Define TEST_DATABASE_URL con una base de datos de pruebas.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-123456';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'traza-subidas-'));
process.env.MAX_IMAGE_BYTES = String(300 * 1024);
process.env.DOTENV_PATH = '/dev/null';

/* ---------- OSRM simulado ---------- */
const osrm = http.createServer((req, res) => {
  const coords = decodeURIComponent(req.url.split('/route/v1/driving/')[1].split('?')[0]).split(';').map(p => p.split(',').map(Number));
  const [o, d] = coords;
  res.setHeader('Content-Type', 'application/json');
  if (Math.abs(d[1] - 6.9) < 0.001) return res.end(JSON.stringify({ code: 'NoRoute', message: 'Impossible route' }));
  res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 4321.4, duration: 610.2, geometry: { type: 'LineString', coordinates: [o, [(o[0] + d[0]) / 2, (o[1] + d[1]) / 2 + 0.001], d] },
    legs: [{ steps: [
      { distance: 120, duration: 20, name: 'Avenida San Juan', maneuver: { type: 'depart' } },
      { distance: 2000, duration: 300, name: 'Carrera 65', maneuver: { type: 'turn', modifier: 'right' } },
      { distance: 2200, duration: 290, name: '', maneuver: { type: 'roundabout', exit: 2 } },
      { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive' } }] }] }] }));
});

let request, app, pool, tokens = {};
const auth = rol => ({ Authorization: 'Bearer ' + tokens[rol] });
// PNG mínimo válido de 1×1 (con un byte variable para que cada imagen tenga huella distinta)
const png = (k = 0) => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201', 'hex'), Buffer.from([k]), Buffer.from('0000000049454e44ae426082', 'hex')]);

before(async () => {
  await new Promise(r => osrm.listen(0, '127.0.0.1', r));
  process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end();
  request = require('supertest');
  const { migrar } = require('../src/db/migrar');
  await migrar({ silencioso: true });
  pool = require('../src/db/pool');
  const bcrypt = require('bcryptjs');
  for (const rol of ['admin', 'editor', 'lector']) await pool.consultar('INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1,$2,$3,$4)', [rol + '1', 'Usuario ' + rol, await bcrypt.hash('Clave-de-prueba-' + rol, 4), rol]);
  app = require('../src/app').crearApp();
  for (const rol of ['admin', 'editor', 'lector']) {
    const r = await request(app).post('/api/auth/login').send({ usuario: rol + '1', clave: 'Clave-de-prueba-' + rol });
    assert.equal(r.status, 200); tokens[rol] = r.body.token;
  }
});
after(async () => { osrm.close(); await pool.cerrar(); fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true }); });

const base = { codigo: 'T-001', nombre: 'Institución Educativa Prueba Uno', municipio: 'Medellín', departamento: 'Antioquia', latitud: 6.2701, longitud: -75.5652, sector: 'oficial', comuna: '04 · Aranjuez' };
let inst1, inst2, inst3;

describe('autenticación y permisos', () => {
  test('rechaza credenciales incorrectas sin revelar si el usuario existe', async () => {
    const a = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'mala' });
    const b = await request(app).post('/api/auth/login').send({ usuario: 'nadie', clave: 'mala' });
    assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.body.error, b.body.error);
  });
  test('sin sesión no hay acceso a los datos', async () => {
    assert.equal((await request(app).get('/api/instituciones')).status, 401);
    assert.equal((await request(app).get('/api/instituciones').set('Authorization', 'Bearer xyz')).status, 401);
  });
  test('el lector no puede crear', async () => {
    const r = await request(app).post('/api/instituciones').set(auth('lector')).send(base);
    assert.equal(r.status, 403);
  });
});

describe('instituciones', () => {
  test('valida campos obligatorios y coordenadas', async () => {
    const r = await request(app).post('/api/instituciones').set(auth('editor')).send({ codigo: 'X', nombre: '', municipio: 'Medellín', departamento: 'Antioquia', latitud: 95 });
    assert.equal(r.status, 400);
    const campos = r.body.detalles.map(d => d.campo);
    assert.ok(campos.includes('nombre')); assert.ok(campos.includes('latitud'));
    const r2 = await request(app).post('/api/instituciones').set(auth('editor')).send(Object.assign({}, base, { codigo: 'T-X', longitud: '' }));
    assert.equal(r2.status, 400); assert.match(JSON.stringify(r2.body), /latitud y longitud juntas/);
  });
  test('crea, evita códigos duplicados y busca', async () => {
    const r = await request(app).post('/api/instituciones').set(auth('editor')).send(base);
    assert.equal(r.status, 201); inst1 = r.body;
    assert.equal(inst1.codigo, 'T-001'); assert.equal(inst1.latitud, 6.2701);
    const dup = await request(app).post('/api/instituciones').set(auth('editor')).send(base);
    assert.equal(dup.status, 409); assert.match(dup.body.error, /código/);
    inst2 = (await request(app).post('/api/instituciones').set(auth('editor')).send(Object.assign({}, base, { codigo: 'T-002', nombre: 'Colegio Sin Coordenadas', latitud: null, longitud: null, comuna: '07 · Robledo' }))).body;
    inst3 = (await request(app).post('/api/instituciones').set(auth('editor')).send(Object.assign({}, base, { codigo: 'T-003', nombre: 'Sede Sin Vía', latitud: 6.9, longitud: -75.5, municipio: 'Bello' }))).body;
    const b = await request(app).get('/api/instituciones?q=prueba').set(auth('lector'));
    assert.equal(b.body.total, 1); assert.equal(b.body.datos[0].codigo, 'T-001');
    const m = await request(app).get('/api/instituciones?municipio=Bello').set(auth('lector'));
    assert.equal(m.body.total, 1);
    const sin = await request(app).get('/api/instituciones?con_coordenadas=no').set(auth('lector'));
    assert.equal(sin.body.datos[0].codigo, 'T-002');
    const mapa = await request(app).get('/api/instituciones/mapa').set(auth('lector'));
    assert.equal(mapa.body.datos.length, 2, 'el mapa solo trae instituciones con coordenadas');
  });
  test('editar registra los cambios en la bitácora', async () => {
    const r = await request(app).put('/api/instituciones/' + inst1.id).set(auth('editor')).send(Object.assign({}, base, { telefono: '604 385 5555', estado: 'activo' }));
    assert.equal(r.status, 200); assert.equal(r.body.telefono, '604 385 5555');
    const ev = await request(app).get(`/api/auditoria/eventos?entidad=institucion&entidad_id=${inst1.id}`).set(auth('lector'));
    const upd = ev.body.datos.find(e => e.accion === 'INSTITUCION_ACTUALIZADA');
    assert.deepEqual(upd.datos.cambios.telefono, { antes: null, despues: '604 385 5555' });
  });
});

describe('imágenes', () => {
  let imgs;
  test('carga varias, la primera queda como principal', async () => {
    const r = await request(app).post(`/api/instituciones/${inst1.id}/imagenes`).set(auth('editor'))
      .attach('imagenes', png(1), 'fachada.png').attach('imagenes', png(2), 'aula.png');
    assert.equal(r.status, 201, JSON.stringify(r.body)); imgs = r.body.datos;
    assert.equal(imgs.length, 2); assert.equal(imgs[0].es_principal, true); assert.equal(imgs[1].es_principal, false);
    const f = await request(app).get(imgs[0].url);
    assert.equal(f.status, 200); assert.equal(f.headers['content-type'], 'image/png');
    const d = await request(app).get('/api/instituciones/' + inst1.id).set(auth('lector'));
    assert.equal(d.body.imagen_principal, imgs[0].url); assert.equal(d.body.imagenes.length, 2);
  });
  test('rechaza archivos que no son imágenes, demasiado grandes o repetidos', async () => {
    const falso = await request(app).post(`/api/instituciones/${inst1.id}/imagenes`).set(auth('editor')).attach('imagenes', Buffer.from('<script>alert(1)</script>'), 'foto.jpg');
    assert.equal(falso.status, 400); assert.match(falso.body.error, /no es una imagen/);
    const grande = await request(app).post(`/api/instituciones/${inst1.id}/imagenes`).set(auth('editor')).attach('imagenes', Buffer.concat([png(3), Buffer.alloc(400 * 1024)]), 'grande.png');
    assert.equal(grande.status, 400); assert.match(grande.body.error, /como máximo/);
    const rep = await request(app).post(`/api/instituciones/${inst1.id}/imagenes`).set(auth('editor')).attach('imagenes', png(1), 'otra.png');
    assert.equal(rep.status, 409);
    const archivos = fs.readdirSync(process.env.UPLOAD_DIR);
    assert.equal(archivos.length, 2, 'no quedan archivos huérfanos de cargas fallidas');
    assert.equal((await request(app).get('/api/imagenes/archivo/..%2F..%2Fetc%2Fpasswd')).status, 404);
  });
  test('cambia la principal, reemplaza y elimina', async () => {
    assert.equal((await request(app).patch(`/api/imagenes/${imgs[1].id}/principal`).set(auth('editor'))).status, 200);
    let d = await request(app).get('/api/instituciones/' + inst1.id).set(auth('lector'));
    assert.equal(d.body.imagen_principal, imgs[1].url);
    const rem = await request(app).put(`/api/imagenes/${imgs[0].id}`).set(auth('editor')).attach('imagen', png(9), 'nueva.png');
    assert.equal(rem.status, 200); assert.notEqual(rem.body.archivo, imgs[0].archivo);
    assert.equal((await request(app).get(imgs[0].url)).status, 404, 'el archivo reemplazado se borra');
    assert.equal((await request(app).delete(`/api/imagenes/${imgs[1].id}`).set(auth('editor'))).status, 204);
    d = await request(app).get('/api/instituciones/' + inst1.id).set(auth('lector'));
    assert.equal(d.body.imagenes.length, 1); assert.equal(d.body.imagenes[0].es_principal, true, 'al borrar la principal, otra toma su lugar');
  });
});

describe('reintegros', () => {
  const r0 = { fecha_reintegro: '2026-03-10', placa: 'sem-100001', cantidad: 2, descripcion: 'Computador portátil', referencia_soporte: 'ACTA-1', valor: 3000000, estado: 'realizado' };
  let creado;
  test('valida y crea', async () => {
    const mal = await request(app).post('/api/reintegros').set(auth('editor')).send({ fecha_reintegro: '2099-01-01', cantidad: 0, descripcion: 'x' });
    assert.equal(mal.status, 400);
    const campos = mal.body.detalles.map(d => d.campo);
    for (const c of ['fecha_reintegro', 'cantidad', 'descripcion', 'institucion_id']) assert.ok(campos.includes(c), c);
    const r = await request(app).post('/api/reintegros').set(auth('editor')).send(Object.assign({ institucion_id: inst1.id }, r0));
    assert.equal(r.status, 201); creado = r.body;
    assert.match(creado.codigo, /^RI-\d{6}$/); assert.equal(creado.placa, 'SEM-100001'); assert.equal(creado.valor, 3000000);
  });
  test('no duplica un registro idéntico', async () => {
    const r = await request(app).post('/api/reintegros').set(auth('editor')).send(Object.assign({ institucion_id: inst1.id }, r0, { descripcion: '  computador   PORTÁTIL ' }));
    assert.equal(r.status, 409); assert.match(r.body.error, /idéntico/);
  });
  test('cambia de estado y filtra', async () => {
    const r = await request(app).put('/api/reintegros/' + creado.id).set(auth('editor')).send(Object.assign({ institucion_id: inst1.id }, r0, { estado: 'anulado', observaciones: 'Error de digitación' }));
    assert.equal(r.status, 200); assert.equal(r.body.estado, 'anulado');
    const ev = await request(app).get(`/api/auditoria/eventos?entidad=reintegro&entidad_id=${creado.codigo}`).set(auth('lector'));
    assert.ok(ev.body.datos.some(e => e.accion === 'REINTEGRO_CAMBIO_ESTADO'));
    await request(app).put('/api/reintegros/' + creado.id).set(auth('editor')).send(Object.assign({ institucion_id: inst1.id }, r0));
    const f = await request(app).get('/api/reintegros?estado=realizado&desde=2026-03-01&hasta=2026-03-31').set(auth('lector'));
    assert.equal(f.body.total, 1);
    const g = await request(app).get('/api/reintegros?estado=realizado&desde=2026-04-01').set(auth('lector'));
    assert.equal(g.body.total, 0);
  });
  test('solo el administrador elimina', async () => {
    assert.equal((await request(app).delete('/api/reintegros/' + creado.id).set(auth('editor'))).status, 403);
  });
});

describe('estadísticas y Excel', () => {
  test('los totales coinciden con los datos y no mezclan estados', async () => {
    const lote = [
      ['2026-04-02', 'realizado', 100000, 1], ['2026-04-15', 'realizado', 250000, 3], ['2026-04-20', 'pendiente', 90000, 1], ['2026-05-05', 'rechazado', 50000, 2],
      ['2026-05-06', 'anulado', 70000, 1], ['2026-05-28', 'realizado', null, 4], ['2026-02-10', 'realizado', 400000, 1], ['2026-02-11', 'pendiente', 10000, 1]];
    for (const [k, [fecha, estado, valor, cantidad]] of lote.entries()) {
      const r = await request(app).post('/api/reintegros').set(auth('editor')).send({ institucion_id: k % 2 ? inst1.id : inst3.id, fecha_reintegro: fecha, placa: 'P-' + k, cantidad, descripcion: 'Silla ' + k, valor, estado });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    const res = await request(app).get('/api/informes/resumen?desde=2026-04-01&hasta=2026-05-31').set(auth('lector'));
    assert.equal(res.status, 200);
    const b = res.body;
    assert.equal(b.total_registros, 6);
    assert.equal(b.realizados.n, 3); assert.equal(b.realizados.valor, 350000); assert.equal(b.realizados.elementos, 8);
    assert.equal(b.por_estado.pendiente.n, 1); assert.equal(b.por_estado.rechazado.n, 1); assert.equal(b.por_estado.anulado.n, 1);
    // Verificación cruzada con SQL directo
    const { rows: [sql] } = await pool.consultar("SELECT count(*) FILTER (WHERE estado='realizado') AS n, sum(valor) FILTER (WHERE estado='realizado') AS v FROM reintegros WHERE fecha_reintegro BETWEEN '2026-04-01' AND '2026-05-31'");
    assert.equal(b.realizados.n, sql.n); assert.equal(b.realizados.valor, sql.v);
    assert.deepEqual(b.por_periodo.map(p => [p.periodo, p.realizado, p.total]), [['2026-04', 2, 3], ['2026-05', 1, 3]]);
    // Comparación: 61 días anteriores = 2026-01-30 a 2026-03-31 → 2 realizados (10/03 del bloque anterior y 10/02)
    assert.equal(b.comparacion.dias, 61); assert.equal(b.comparacion.anterior.desde, '2026-01-30'); assert.equal(b.comparacion.anterior.hasta, '2026-03-31');
    assert.equal(b.comparacion.anterior.realizados, 2); assert.equal(b.comparacion.variacion_realizados_pct, 50);
    const porMun = Object.fromEntries(b.por_municipio.map(m => [m.municipio, m.n]));
    assert.deepEqual(porMun, { Bello: 3, 'Medellín': 3 });
  });
  test('el Excel trae detalle y resumen con fechas y números utilizables', async () => {
    const ExcelJS = require('exceljs');
    const r = await request(app).get('/api/informes/reintegros.xlsx?desde=2026-04-01&hasta=2026-05-31&estado=realizado').set(auth('lector')).buffer(true).parse((res, cb) => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => cb(null, Buffer.concat(ch))); });
    assert.equal(r.status, 200); assert.match(r.headers['content-disposition'], /reintegros_2026-04-01_a_2026-05-31\.xlsx/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
    assert.deepEqual(wb.worksheets.map(w => w.name), ['Resumen', 'Detalle']);
    const det = wb.getWorksheet('Detalle');
    assert.equal(det.rowCount - 1, 3, 'tres reintegros realizados en el rango');
    assert.equal(det.getRow(1).getCell(2).value, 'Fecha del reintegro');
    const fila = det.getRow(2);
    assert.ok(fila.getCell(2).value instanceof Date); assert.equal(fila.getCell(2).value.toISOString().slice(0, 10), '2026-04-02');
    assert.equal(typeof fila.getCell(9).value, 'number'); assert.equal(fila.getCell(10).value, 100000);
    assert.equal(r.headers['x-total-filas'], '3');
  });
});

describe('rutas', () => {
  test('una ruta por institución desde el origen, con errores claros', async () => {
    const r = await request(app).get(`/api/rutas?destinos=${inst1.id},${inst2.id},${inst3.id},99999`).set(auth('lector'));
    assert.equal(r.status, 200);
    const [a, b, c, d] = r.body.rutas;
    assert.equal(a.ok, true); assert.equal(a.distancia_m, 4321); assert.equal(a.geometria.length, 3);
    assert.deepEqual(a.geometria[0], [r.body.origen.latitud, r.body.origen.longitud], 'empieza en la Secretaría');
    assert.deepEqual(a.geometria[2], [inst1.latitud, inst1.longitud], 'termina en la institución');
    assert.deepEqual(a.pasos.map(p => p.instruccion), ['Salga por Avenida San Juan', 'Gire a la derecha en Carrera 65', 'En la glorieta, tome la segunda salida', 'Llegue al destino']);
    assert.equal(b.ok, false); assert.match(b.error, /no tiene coordenadas/);
    assert.equal(c.ok, false); assert.match(c.error, /No existe un recorrido/);
    assert.equal(d.ok, false); assert.match(d.error, /no existe/);
  });
  test('limita la cantidad de destinos', async () => {
    const r = await request(app).get('/api/rutas?destinos=' + Array.from({ length: 11 }, (_, k) => k + 1).join(',')).set(auth('lector'));
    assert.equal(r.status, 400);
  });
  test('el origen se configura en un solo lugar y solo el administrador lo cambia', async () => {
    const nuevo = { nombre: 'Secretaría de Educación', direccion: 'Calle 44 # 51-50', latitud: 6.2456, longitud: -75.5708 };
    assert.equal((await request(app).put('/api/configuracion/origen').set(auth('editor')).send(nuevo)).status, 403);
    assert.equal((await request(app).put('/api/configuracion/origen').set(auth('admin')).send(nuevo)).status, 200);
    const r = await request(app).get(`/api/rutas?destinos=${inst1.id}`).set(auth('lector'));
    assert.deepEqual(r.body.rutas[0].geometria[0], [6.2456, -75.5708]);
  });
});

describe('bitácora y anclaje', () => {
  test('la cadena verifica y es de solo inserción', async () => {
    const v = await request(app).get('/api/auditoria/verificar').set(auth('lector'));
    assert.equal(v.body.ok, true); assert.ok(v.body.total >= 15, `eventos: ${v.body.total}`);
    await assert.rejects(pool.consultar("UPDATE bitacora SET usuario = 'otro' WHERE n = 1"), /solo inserción/);
    await assert.rejects(pool.consultar('DELETE FROM bitacora WHERE n = 1'), /solo inserción/);
  });
  test('solo registra anclajes cuya huella corresponde a la bitácora', async () => {
    const n = (await request(app).get('/api/auditoria/verificar').set(auth('lector'))).body.total;
    const { body: { raiz } } = await request(app).get('/api/auditoria/raiz?n=' + n).set(auth('lector'));
    const recibo = { n_eventos: n, raiz, red: 'Prueba', chain_id: 1337, contrato: '0x' + 'a'.repeat(40), tx_hash: '0x' + 'b'.repeat(64), cuenta: '0x' + 'c'.repeat(40) };
    assert.equal((await request(app).post('/api/auditoria/anclajes').set(auth('editor')).send(Object.assign({}, recibo, { raiz: 'f'.repeat(64) }))).status, 409);
    assert.equal((await request(app).post('/api/auditoria/anclajes').set(auth('editor')).send(recibo)).status, 201);
    const l = await request(app).get('/api/auditoria/anclajes').set(auth('lector'));
    assert.equal(l.body.datos[0].coincide_local, true);
  });
  test('detecta una alteración directa en la base de datos', { skip: !process.env.TEST_DATABASE_ADMIN_URL && 'sin TEST_DATABASE_ADMIN_URL' }, async () => {
    const { Client } = require('pg');
    const su = new Client({ connectionString: process.env.TEST_DATABASE_ADMIN_URL }); await su.connect();
    await su.query('ALTER TABLE bitacora DISABLE TRIGGER bitacora_inmutable');
    await su.query(`UPDATE bitacora SET datos = jsonb_set(datos, '{valor}', '1') WHERE accion = 'REINTEGRO_CREADO' AND n = (SELECT min(n) FROM bitacora WHERE accion = 'REINTEGRO_CREADO')`);
    await su.query('ALTER TABLE bitacora ENABLE TRIGGER bitacora_inmutable'); await su.end();
    const v = await request(app).get('/api/auditoria/verificar').set(auth('lector'));
    assert.equal(v.body.ok, false); assert.equal(v.body.errores[0].tipo, 'contenido');
    const l = await request(app).get('/api/auditoria/anclajes').set(auth('lector'));
    assert.equal(l.body.datos[0].coincide_local, false, 'el anclaje ya no coincide con la bitácora alterada');
  });
});
