/* Reintegros DE DEMOSTRACIÓN para presentar la plataforma sin datos reales.
   Todos llevan la referencia “DEMO-…” y una observación que lo dice. NO lo ejecutes en producción.
   Uso:  npm run seed:demo             (crea 240 reintegros de ejemplo)
         npm run seed:demo -- --borrar (elimina todos los reintegros DEMO-) */
const { transaccion, consultar, cerrar } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const bitacora = require('../src/servicios/bitacora');
const { huellaReintegro } = require('../src/rutas/reintegros');
const articulos = require('../src/servicios/articulos');

const ELEMENTOS = [['Computador de escritorio', 1800000], ['Computador portátil', 2400000], ['Tableta', 900000], ['Video beam', 2100000], ['Impresora', 750000],
  ['Pupitre unipersonal', 180000], ['Silla', 95000], ['Mesa', 260000], ['Tablero', 420000], ['Archivador', 380000],
  ['Televisor', 1500000], ['Access point', 600000], ['Ventilador', 150000], ['Estante metálico', 300000], ['Escritorio', 450000], ['Locker', 500000]];
const ESTADOS = [['realizado', 60], ['pendiente', 22], ['rechazado', 10], ['anulado', 8]];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function crear(cantidad = 240) {
  const { rows: inst } = await consultar("SELECT id, nombre FROM instituciones WHERE sector = 'oficial' AND estado = 'activo' ORDER BY codigo LIMIT 120");
  if (!inst.length) throw new Error('Primero carga las instituciones: npm run seed:instituciones');
  const r = rng(2026), elegir = (pares) => { let x = r() * pares.reduce((s, p) => s + p[1], 0); for (const p of pares) { x -= p[1]; if (x <= 0) return p[0]; } return pares[0][0]; };
  const hoy = new Date(Date.now() - 5 * 3600000);
  let n = 0;
  await transaccion(async c => {
    for (let k = 0; k < cantidad; k++) {
      const i = inst[Math.floor(r() * inst.length)], [elemento, precio] = ELEMENTOS[Math.floor(r() * ELEMENTOS.length)];
      const fecha = new Date(hoy.getTime() - Math.floor(r() * 420) * 86400000).toISOString().slice(0, 10);
      const cantidadE = elemento.startsWith('Pupitre') || elemento === 'Silla' ? 1 + Math.floor(r() * 12) : 1 + Math.floor(r() * 2);
      const d = { institucion_id: i.id, fecha_reintegro: fecha, placa: 'SEM-' + (100000 + Math.floor(r() * 899999)), cantidad: cantidadE,
        descripcion: elemento, referencia_soporte: 'DEMO-' + String(k + 1).padStart(4, '0'), valor: Math.round(precio * cantidadE * (0.4 + r() * 0.5) / 1000) * 1000,
        estado: elegir(ESTADOS), observaciones: 'DATO DE DEMOSTRACIÓN: no corresponde a un reintegro real.' };
      const h = huellaReintegro({ placa: d.placa, cantidad: d.cantidad, descripcion: d.descripcion, fecha: d.fecha_reintegro, institucion: i.nombre });
      d.articulo = articulos.familia(d.descripcion); d.categoria = articulos.categoria(d.descripcion);
      const cols = Object.keys(d);
      const { rows } = await c.query(`INSERT INTO reintegros (${cols.join(',')}, hash_registro) VALUES (${cols.map((_, x) => '$' + (x + 1)).join(',')}, $${cols.length + 1}) ON CONFLICT (hash_registro) DO NOTHING RETURNING codigo`, [...cols.map(x => d[x]), h]);
      if (rows.length) { n++; await bitacora.registrar(c, { usuario: 'seed-demo', accion: 'REINTEGRO_CREADO', entidad: 'reintegro', entidadId: rows[0].codigo, datos: Object.assign({ hash_registro: h, demostracion: true }, d) }); }
    }
  });
  console.log(`${n} reintegros de demostración creados.`);
}

async function borrar() {
  await transaccion(async c => {
    const { rows } = await c.query("DELETE FROM reintegros WHERE referencia_soporte LIKE 'DEMO-%' RETURNING codigo");
    await bitacora.registrar(c, { usuario: 'seed-demo', accion: 'REINTEGROS_DEMO_ELIMINADOS', entidad: 'reintegro', datos: { cantidad: rows.length } });
    console.log(`${rows.length} reintegros de demostración eliminados.`);
  });
}

if (require.main === module) {
  migrar({ silencioso: true }).then(() => (process.argv.includes('--borrar') ? borrar() : crear())).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(cerrar);
}
module.exports = { crear, borrar };
