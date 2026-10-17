/* Rutas desde la Secretaría de Educación hasta una o varias instituciones.
   Cada destino es una ruta independiente desde el mismo origen (no se encadenan entre sí). */
const express = require('express');
const { z } = require('zod');
const { config } = require('../config');
const { consultar } = require('../db/pool');
const { ErrorApp, asincrono } = require('../middleware/errores');
const { calcularRuta, calcularRecorrido } = require('../servicios/osrm');
const { obtenerOrigen } = require('./configuracion');

const r = express.Router();

r.get('/rutas', asincrono(async (req, res) => {
  const ids = z.string({ required_error: 'Selecciona al menos una institución.' }).min(1, 'Selecciona al menos una institución.')
    .transform(s => [...new Set(s.split(',').map(x => Number(x.trim())))])
    .refine(a => a.every(n => Number.isInteger(n) && n > 0), 'Identificadores inválidos.')
    .parse(req.query.destinos);
  if (ids.length > config.maxDestinosPorConsulta) throw new ErrorApp(400, `Selecciona como máximo ${config.maxDestinosPorConsulta} instituciones a la vez.`);
  const origen = await obtenerOrigen();
  const { rows } = await consultar('SELECT id, codigo, nombre, direccion, municipio, latitud, longitud FROM instituciones WHERE id = ANY($1)', [ids]);
  const porId = new Map(rows.map(x => [x.id, x]));
  const rutas = [];
  for (const iid of ids) { // en serie: el servicio público no admite ráfagas
    const inst = porId.get(iid);
    const base = { institucion_id: iid, institucion: inst ? { id: inst.id, codigo: inst.codigo, nombre: inst.nombre, direccion: inst.direccion, municipio: inst.municipio, latitud: inst.latitud, longitud: inst.longitud } : null };
    if (!inst) { rutas.push(Object.assign(base, { ok: false, error: 'La institución no existe.' })); continue; }
    if (inst.latitud == null || inst.longitud == null) { rutas.push(Object.assign(base, { ok: false, error: 'La institución no tiene coordenadas registradas.' })); continue; }
    try {
      const ruta = await calcularRuta({ lat: origen.latitud, lon: origen.longitud }, { lat: inst.latitud, lon: inst.longitud });
      rutas.push(Object.assign(base, { ok: true }, ruta));
    } catch (e) { rutas.push(Object.assign(base, { ok: false, error: e.message })); }
  }
  res.json({ origen, rutas, servicio: { url: config.osrmUrl, perfil: config.osrmPerfil } });
}));

/**
 * Ruta ÓPTIMA de recogida de reintegros: sale de la Secretaría, pasa por todas las sedes elegidas
 * en el orden que minimiza el tiempo (OSRM trip) y vuelve (?regreso=no para terminar en la última sede).
 * Sin ?destinos, usa las sedes con reintegros pendientes (las de más elementos primero, máximo 12).
 */
r.get('/rutas/optima', asincrono(async (req, res) => {
  const max = config.maxParadasRecogida;
  let ids;
  if (req.query.destinos) {
    ids = z.string().transform(s => [...new Set(s.split(',').map(x => Number(x.trim())))])
      .refine(a => a.every(n => Number.isInteger(n) && n > 0), 'Identificadores inválidos.').parse(String(req.query.destinos));
    if (ids.length > max) throw new ErrorApp(400, `La ruta de recogida admite como máximo ${max} sedes.`);
  } else {
    const { rows } = await consultar(`SELECT institucion_id FROM reintegros WHERE estado = 'pendiente' AND institucion_id IS NOT NULL
      GROUP BY institucion_id ORDER BY sum(cantidad) DESC, institucion_id LIMIT ${max}`);
    ids = rows.map(x => x.institucion_id);
  }
  if (!ids.length) throw new ErrorApp(400, 'No hay sedes con reintegros pendientes para planificar la recogida.');
  const origen = await obtenerOrigen();
  const { rows } = await consultar(`SELECT i.id, i.codigo, i.nombre, i.direccion, i.municipio, i.latitud, i.longitud,
      count(r.id) FILTER (WHERE r.estado = 'pendiente') AS n_pendientes, coalesce(sum(r.cantidad) FILTER (WHERE r.estado = 'pendiente'), 0) AS elementos_pendientes
      FROM instituciones i LEFT JOIN reintegros r ON r.institucion_id = i.id WHERE i.id = ANY($1) GROUP BY i.id`, [ids]);
  const porId = new Map(rows.map(x => [x.id, x]));
  const paradas = [], omitidas = [];
  for (const iid of ids) {
    const x = porId.get(iid);
    if (!x) omitidas.push({ institucion_id: iid, motivo: 'La institución no existe.' });
    else if (x.latitud == null) omitidas.push({ institucion_id: iid, nombre: x.nombre, motivo: 'Sin coordenadas registradas.' });
    else paradas.push(x);
  }
  if (!paradas.length) throw new ErrorApp(400, 'Ninguna de las sedes elegidas tiene coordenadas.');
  const regreso = req.query.regreso !== 'no';
  let recorrido;
  try {
    recorrido = await calcularRecorrido({ lat: origen.latitud, lon: origen.longitud }, paradas.map(p => ({ lat: p.latitud, lon: p.longitud })), { regreso });
  } catch (e) { throw new ErrorApp(502, e.message); }
  const visita = recorrido.orden.map((k, n) => Object.assign({ parada: n + 1 }, paradas[k], recorrido.tramos[n] ? { llegada_distancia_m: recorrido.tramos[n].distancia_m, llegada_duracion_s: recorrido.tramos[n].duracion_s } : {}));
  res.json({ origen, paradas: visita, omitidas, distancia_m: recorrido.distancia_m, duracion_s: recorrido.duracion_s, geometria: recorrido.geometria,
    pasos: recorrido.pasos, regreso, regreso_tramo: regreso ? recorrido.tramos[recorrido.tramos.length - 1] : null,
    elementos: visita.reduce((s, p) => s + Number(p.elementos_pendientes), 0), servicio: { url: config.osrmUrl, perfil: config.osrmPerfil, metodo: 'trip' } });
}));

module.exports = r;
