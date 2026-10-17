const express = require('express');
const { z } = require('zod');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');
const almacen = require('../servicios/almacenamiento');

const r = express.Router();

/* ---------- Validación ---------- */
const vacioANull = v => (v === '' || v === undefined ? null : v);
const texto = (max, msg) => z.preprocess(v => (typeof v === 'string' ? vacioANull(v.trim()) : vacioANull(v)), z.string().max(max, msg || `Máximo ${max} caracteres.`).nullable());
const numero = (min, max, msg) => z.preprocess(v => (v === '' || v === null || v === undefined ? null : Number(v)), z.number({ invalid_type_error: msg }).min(min, msg).max(max, msg).nullable());

const esquema = z.object({
  codigo: z.string({ required_error: 'El código es obligatorio.' }).trim().toUpperCase().min(1, 'El código es obligatorio.').max(40).regex(/^[A-Z0-9._-]+$/, 'El código solo admite letras, números, punto, guion y guion bajo.'),
  nombre: z.string({ required_error: 'El nombre es obligatorio.' }).trim().min(2, 'El nombre es obligatorio.').max(200),
  institucion: texto(200),
  sector: z.preprocess(vacioANull, z.enum(['oficial', 'no_oficial']).nullable()),
  clase: texto(60),
  direccion: texto(200),
  barrio: texto(120),
  comuna: texto(120),
  municipio: z.string({ required_error: 'El municipio es obligatorio.' }).trim().min(2, 'El municipio es obligatorio.').max(100),
  departamento: z.string({ required_error: 'El departamento es obligatorio.' }).trim().min(2, 'El departamento es obligatorio.').max(100),
  latitud: numero(-90, 90, 'La latitud debe estar entre -90 y 90.'),
  longitud: numero(-180, 180, 'La longitud debe estar entre -180 y 180.'),
  contacto_nombre: texto(120),
  telefono: z.preprocess(v => (typeof v === 'string' ? vacioANull(v.trim()) : vacioANull(v)), z.string().max(40).regex(/^[0-9+()\s-]{7,40}$/, 'Teléfono inválido: usa solo números, espacios, +, ( ) y guiones.').nullable()),
  correo: z.preprocess(v => (typeof v === 'string' ? vacioANull(v.trim().toLowerCase()) : vacioANull(v)), z.string().email('Correo electrónico inválido.').max(120).nullable()),
  descripcion: texto(4000),
  estudiantes: z.preprocess(v => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int('Debe ser un número entero.').min(0).max(100000).nullable()),
  estado: z.enum(['activo', 'inactivo']).default('activo')
}).strict().superRefine((d, ctx) => {
  if ((d.latitud == null) !== (d.longitud == null)) ctx.addIssue({ code: 'custom', path: ['longitud'], message: 'Indica latitud y longitud juntas, o ninguna de las dos.' });
  if (d.latitud === 0 && d.longitud === 0) ctx.addIssue({ code: 'custom', path: ['latitud'], message: 'Las coordenadas 0, 0 no son válidas.' });
});
const CAMPOS = Object.keys(esquema._def.schema.shape);
const id = v => z.coerce.number({ invalid_type_error: 'Identificador inválido.' }).int().positive('Identificador inválido.').parse(v);

/* ---------- Consultas ---------- */
const SELECT = `SELECT i.*,
  (SELECT archivo FROM institucion_imagenes im WHERE im.institucion_id = i.id AND im.es_principal) AS imagen_principal,
  (SELECT count(*) FROM institucion_imagenes im WHERE im.institucion_id = i.id) AS n_imagenes
  FROM instituciones i`;
const urlImagen = a => (a ? `/api/imagenes/archivo/${a}` : null);
const presentar = f => Object.assign({}, f, { imagen_principal: urlImagen(f.imagen_principal) });

function filtros(q) {
  const w = [], p = [];
  const add = (cond, val) => { p.push(val); w.push(cond.replace('?', '$' + p.length)); };
  if (q.q) { p.push('%' + String(q.q).trim() + '%'); const k = '$' + p.length; w.push(`(i.nombre ILIKE ${k} OR i.codigo ILIKE ${k} OR i.institucion ILIKE ${k} OR i.barrio ILIKE ${k} OR i.direccion ILIKE ${k})`); }
  if (q.municipio) add('i.municipio = ?', String(q.municipio));
  if (q.comuna) add('i.comuna = ?', String(q.comuna));
  if (q.estado) add('i.estado = ?', String(q.estado));
  if (q.sector) add('i.sector = ?', String(q.sector));
  if (q.con_coordenadas === 'si') w.push('i.latitud IS NOT NULL');
  if (q.con_coordenadas === 'no') w.push('i.latitud IS NULL');
  if (q.con_imagenes === 'si') w.push('EXISTS (SELECT 1 FROM institucion_imagenes im WHERE im.institucion_id = i.id)');
  if (q.con_imagenes === 'no') w.push('NOT EXISTS (SELECT 1 FROM institucion_imagenes im WHERE im.institucion_id = i.id)');
  return { where: w.length ? ' WHERE ' + w.join(' AND ') : '', params: p };
}
const ORDEN = { nombre: 'i.nombre', codigo: 'i.codigo', municipio: 'i.municipio, i.nombre', comuna: 'i.comuna, i.nombre', estudiantes: 'i.estudiantes DESC NULLS LAST', actualizado: 'i.actualizado_en DESC' };

r.get('/instituciones', asincrono(async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = Math.min(100, Math.max(5, parseInt(req.query.por_pagina, 10) || 20));
  const { where, params } = filtros(req.query);
  const orden = ORDEN[req.query.orden] || ORDEN.nombre;
  const [datos, total] = await Promise.all([
    consultar(`${SELECT}${where} ORDER BY ${orden}, i.id LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, params),
    consultar(`SELECT count(*) AS n FROM instituciones i${where}`, params)
  ]);
  res.json({ datos: datos.rows.map(presentar), total: total.rows[0].n, pagina, por_pagina: porPagina });
}));

r.get('/instituciones/filtros', asincrono(async (_req, res) => {
  const [m, c] = await Promise.all([
    consultar('SELECT DISTINCT municipio FROM instituciones ORDER BY municipio'),
    consultar('SELECT DISTINCT comuna FROM instituciones WHERE comuna IS NOT NULL ORDER BY comuna')
  ]);
  res.json({ municipios: m.rows.map(x => x.municipio), comunas: c.rows.map(x => x.comuna) });
}));

/** Lista mínima para selectores (todas las instituciones, activas primero). */
r.get('/instituciones/opciones', asincrono(async (_req, res) => {
  const { rows } = await consultar("SELECT id, codigo, nombre, municipio, estado FROM instituciones ORDER BY estado = 'inactivo', nombre");
  res.json({ datos: rows });
}));

/** Datos livianos para pintar todos los marcadores del mapa, con el conteo de reintegros de cada sede
    (visor de reintegros: el tamaño del marcador depende de la cantidad). ?reintegros=con|pendientes filtra. */
r.get('/instituciones/mapa', asincrono(async (req, res) => {
  const { where, params } = filtros(Object.assign({ estado: 'activo' }, req.query, { con_coordenadas: 'si' }));
  const extra = req.query.reintegros === 'pendientes' ? ' AND coalesce(rz.n_pendientes, 0) > 0' : req.query.reintegros === 'con' ? ' AND coalesce(rz.n, 0) > 0' : '';
  const { rows } = await consultar(`SELECT i.id, i.codigo, i.nombre, i.institucion, i.direccion, i.barrio, i.comuna, i.municipio, i.departamento, i.sector, i.estudiantes, i.estado,
      i.latitud, i.longitud, (SELECT archivo FROM institucion_imagenes im WHERE im.institucion_id = i.id AND im.es_principal) AS imagen_principal,
      (SELECT count(*) FROM institucion_imagenes im WHERE im.institucion_id = i.id) AS n_imagenes,
      coalesce(rz.n, 0) AS n_reintegros, coalesce(rz.elementos, 0) AS elementos, coalesce(rz.n_pendientes, 0) AS n_pendientes,
      coalesce(rz.elementos_pendientes, 0) AS elementos_pendientes, coalesce(rz.mobiliario, 0) AS mobiliario, coalesce(rz.electrico, 0) AS electrico
      FROM instituciones i
      LEFT JOIN (SELECT institucion_id, count(*) AS n, sum(cantidad) AS elementos, count(*) FILTER (WHERE estado = 'pendiente') AS n_pendientes,
          coalesce(sum(cantidad) FILTER (WHERE estado = 'pendiente'), 0) AS elementos_pendientes,
          coalesce(sum(cantidad) FILTER (WHERE categoria = 'mobiliario'), 0) AS mobiliario, coalesce(sum(cantidad) FILTER (WHERE categoria = 'electrico'), 0) AS electrico
        FROM reintegros WHERE estado <> 'anulado' AND institucion_id IS NOT NULL GROUP BY institucion_id) rz ON rz.institucion_id = i.id
      ${where}${where ? extra : extra.replace(' AND', ' WHERE')} ORDER BY i.nombre`, params);
  res.json({ datos: rows.map(presentar) });
}));

r.get('/instituciones/:id', asincrono(async (req, res) => {
  const { rows } = await consultar(`${SELECT} WHERE i.id = $1`, [id(req.params.id)]);
  if (!rows.length) throw new ErrorApp(404, 'La institución no existe.');
  const iid = rows[0].id;
  const [im, rz, art] = await Promise.all([
    consultar('SELECT id, archivo, nombre_original, tipo_mime, tamano_bytes, es_principal, orden, creado_en FROM institucion_imagenes WHERE institucion_id = $1 ORDER BY es_principal DESC, orden, id', [iid]),
    consultar(`SELECT count(*) AS n, coalesce(sum(cantidad), 0) AS elementos,
        count(*) FILTER (WHERE estado = 'realizado') AS realizados, count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
        coalesce(sum(cantidad) FILTER (WHERE estado = 'pendiente'), 0) AS elementos_pendientes,
        coalesce(sum(cantidad) FILTER (WHERE categoria = 'mobiliario'), 0) AS mobiliario, coalesce(sum(cantidad) FILTER (WHERE categoria = 'electrico'), 0) AS electrico,
        max(fecha_reintegro) AS ultimo FROM reintegros WHERE institucion_id = $1 AND estado <> 'anulado'`, [iid]),
    consultar(`SELECT coalesce(articulo, 'SIN DESCRIPCION') AS articulo, categoria, coalesce(sum(cantidad), 0) AS elementos FROM reintegros
        WHERE institucion_id = $1 AND estado <> 'anulado' GROUP BY 1, 2 ORDER BY elementos DESC, 1 LIMIT 8`, [iid])
  ]);
  res.json(Object.assign(presentar(rows[0]), {
    imagenes: im.rows.map(x => Object.assign(x, { url: urlImagen(x.archivo) })),
    reintegros: Object.assign(rz.rows[0], { por_articulo: art.rows })
  }));
}));

r.post('/instituciones', requerirRol('editor'), asincrono(async (req, res) => {
  const d = esquema.parse(req.body);
  const fila = await transaccion(async c => {
    const cols = CAMPOS, vals = cols.map(k => d[k] ?? null);
    const { rows } = await c.query(`INSERT INTO instituciones (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'INSTITUCION_CREADA', entidad: 'institucion', entidadId: rows[0].id, datos: d });
    return rows[0];
  });
  res.status(201).json(presentar(fila));
}));

r.put('/instituciones/:id', requerirRol('editor'), asincrono(async (req, res) => {
  const iid = id(req.params.id), d = esquema.parse(req.body);
  const fila = await transaccion(async c => {
    const { rows: ant } = await c.query('SELECT * FROM instituciones WHERE id = $1 FOR UPDATE', [iid]);
    if (!ant.length) throw new ErrorApp(404, 'La institución no existe.');
    const cambios = {};
    for (const k of CAMPOS) { const a = ant[0][k] ?? null, n = d[k] ?? null; if (String(a) !== String(n)) cambios[k] = { antes: a, despues: n }; }
    if (!Object.keys(cambios).length) return ant[0];
    const sets = CAMPOS.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await c.query(`UPDATE instituciones SET ${sets}, actualizado_en = now() WHERE id = $1 RETURNING *`, [iid, ...CAMPOS.map(k => d[k] ?? null)]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'INSTITUCION_ACTUALIZADA', entidad: 'institucion', entidadId: iid, datos: { cambios } });
    return rows[0];
  });
  res.json(presentar(fila));
}));

r.delete('/instituciones/:id', requerirRol('admin'), asincrono(async (req, res) => {
  const iid = id(req.params.id);
  const archivos = await transaccion(async c => {
    const { rows } = await c.query('SELECT * FROM instituciones WHERE id = $1 FOR UPDATE', [iid]);
    if (!rows.length) throw new ErrorApp(404, 'La institución no existe.');
    const im = await c.query('SELECT archivo, sha256 FROM institucion_imagenes WHERE institucion_id = $1', [iid]);
    const rein = await c.query('SELECT count(*) AS n FROM reintegros WHERE institucion_id = $1', [iid]);
    await c.query('DELETE FROM instituciones WHERE id = $1', [iid]); // imágenes en cascada; reintegros quedan sin institución (SET NULL)
    const { creado_en, actualizado_en, ...foto } = rows[0];
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'INSTITUCION_ELIMINADA', entidad: 'institucion', entidadId: iid,
      datos: { registro: foto, imagenes_eliminadas: im.rows.map(x => x.sha256), reintegros_desvinculados: rein.rows[0].n } });
    return im.rows.map(x => x.archivo);
  });
  await Promise.all(archivos.map(a => almacen.eliminar(a).catch(() => {}))); // los archivos se borran después de confirmar en la base
  res.status(204).end();
}));

module.exports = r;
