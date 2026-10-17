/* Bitácora encadenada. Cada cambio de datos se registra DENTRO de la misma transacción que lo produce:
   si el cambio se revierte, el evento también. Un candado consultivo serializa la escritura para que
   cada evento apunte siempre a la huella del anterior. */
const { sha256, canon, raizMerkle } = require('./huellas');
const { consultar } = require('../db/pool');

const CERO = '0'.repeat(64);
const contenido = e => ({ n: Number(e.n), ts: new Date(e.ts).toISOString(), usuario: e.usuario, accion: e.accion, entidad: e.entidad, entidad_id: e.entidad_id ?? null, datos: e.datos, prev: e.prev });
const huellaEvento = e => sha256(canon(contenido(e)));

/** Registra un evento. `cliente` debe ser el cliente de la transacción en curso. */
async function registrar(cliente, { usuario, accion, entidad, entidadId = null, datos = {} }) {
  await cliente.query('SELECT pg_advisory_xact_lock(727275)');
  const { rows } = await cliente.query('SELECT n, hash FROM bitacora ORDER BY n DESC LIMIT 1');
  const n = rows.length ? Number(rows[0].n) + 1 : 0;
  const prev = rows.length ? rows[0].hash : CERO;
  const ev = { n, ts: new Date().toISOString(), usuario: usuario || 'sistema', accion, entidad, entidad_id: entidadId == null ? null : String(entidadId), datos: JSON.parse(JSON.stringify(datos)), prev };
  ev.hash = huellaEvento(ev);
  await cliente.query('INSERT INTO bitacora (n, ts, usuario, accion, entidad, entidad_id, datos, prev, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ev.n, ev.ts, ev.usuario, ev.accion, ev.entidad, ev.entidad_id, JSON.stringify(ev.datos), ev.prev, ev.hash]);
  return ev;
}

/** Recalcula toda la cadena. Devuelve errores de contenido y de enlace, y la raíz Merkle. */
async function verificar() {
  const t0 = Date.now();
  const { rows } = await consultar('SELECT n, ts, usuario, accion, entidad, entidad_id, datos, prev, hash FROM bitacora ORDER BY n');
  const errores = [], recalculadas = [];
  let prev = CERO;
  rows.forEach((e, i) => {
    const h = huellaEvento(e);
    recalculadas.push(h);
    if (Number(e.n) !== i) errores.push({ n: Number(e.n), tipo: 'secuencia', mensaje: `Falta el evento #${i}: la numeración salta.` });
    if (h !== e.hash) errores.push({ n: Number(e.n), tipo: 'contenido', mensaje: 'El contenido del evento ya no corresponde a su huella SHA-256.' });
    if (e.prev !== prev) errores.push({ n: Number(e.n), tipo: 'enlace', mensaje: 'El evento no apunta a la huella del evento anterior.' });
    prev = e.hash;
  });
  return { ok: !errores.length, total: rows.length, errores: errores.slice(0, 50), n_errores: errores.length, raiz: raizMerkle(recalculadas), ms: Date.now() - t0 };
}

/** Raíz Merkle de las huellas RECALCULADAS de los primeros n eventos. */
async function raizHasta(n) {
  const { rows } = await consultar('SELECT n, ts, usuario, accion, entidad, entidad_id, datos, prev, hash FROM bitacora WHERE n < $1 ORDER BY n', [n]);
  if (rows.length < n) return null;
  return raizMerkle(rows.map(huellaEvento));
}

module.exports = { registrar, verificar, raizHasta, huellaEvento, CERO };
