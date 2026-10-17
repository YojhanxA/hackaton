const express = require('express');
const { z } = require('zod');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');
const { sha256 } = require('../servicios/huellas');
const articulos = require('../servicios/articulos');
const F = require('../servicios/filtrosReintegros');

const r = express.Router();
const id = v => z.coerce.number().int().positive('Identificador inválido.').parse(v);
const vacio = v => (v === '' || v === undefined ? null : v);
const txt = max => z.preprocess(v => (typeof v === 'string' ? vacio(v.trim()) : vacio(v)), z.string().max(max, `Máximo ${max} caracteres.`).nullable());

const esquema = z.object({
  institucion_id: z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  institucion_texto: txt(255),
  fecha_reintegro: z.string({ required_error: 'La fecha es obligatoria.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es obligatoria (AAAA-MM-DD).')
    .refine(s => !isNaN(Date.parse(s + 'T00:00:00Z')), 'Fecha inválida.')
    .refine(s => s <= new Date(Date.now() + 86400000).toISOString().slice(0, 10), 'La fecha no puede estar en el futuro.'),
  placa: z.preprocess(v => (typeof v === 'string' ? vacio(v.trim().toUpperCase()) : vacio(v)), z.string().max(100).nullable()),
  cantidad: z.coerce.number({ invalid_type_error: 'La cantidad debe ser un número.' }).int('La cantidad debe ser un número entero.').min(1, 'La cantidad mínima es 1.').max(100000),
  descripcion: z.string({ required_error: 'La descripción es obligatoria.' }).trim().min(3, 'Describe el elemento reintegrado.').max(2000),
  referencia_soporte: txt(120),
  valor: z.preprocess(v => (v === '' || v == null ? null : Number(String(v).replace(/[^\d.-]/g, ''))), z.number({ invalid_type_error: 'El valor debe ser un número.' }).min(0, 'El valor no puede ser negativo.').max(999999999999).nullable()),
  estado: z.enum(F.ESTADOS, { errorMap: () => ({ message: 'Estado inválido.' }) }).default('pendiente'),
  observaciones: txt(2000)
}).strict().superRefine((d, ctx) => {
  if (!d.institucion_id && !d.institucion_texto) ctx.addIssue({ code: 'custom', path: ['institucion_id'], message: 'Selecciona la institución o escribe su nombre.' });
});
const CAMPOS = Object.keys(esquema._def.schema.shape);

/** Huella anti-duplicados con la MISMA composición que la aplicación de reintegros existente
    (app/importers/processor.py): placa-cantidad-FAMILIA del artículo-fecha-institución.
    Así un reintegro capturado a mano y el mismo reintegro importado desde el Excel se detectan como duplicados. */
const huellaReintegro = ({ placa, cantidad, descripcion, fecha, institucion }) =>
  sha256(`${placa || ''}-${cantidad}-${articulos.familia(descripcion)}-${fecha}-${institucion || ''}`);

async function huella(c, d) {
  let inst = d.institucion_texto || '';
  if (d.institucion_id) {
    const { rows } = await c.query('SELECT nombre FROM instituciones WHERE id = $1', [d.institucion_id]);
    if (!rows.length) throw new ErrorApp(400, 'La institución seleccionada no existe.');
    inst = inst || rows[0].nombre;
  }
  return huellaReintegro({ placa: d.placa, cantidad: d.cantidad, descripcion: d.descripcion, fecha: d.fecha_reintegro, institucion: inst.trim() });
}

const ORDEN = { fecha: 'r.fecha_reintegro DESC, r.id DESC', fecha_asc: 'r.fecha_reintegro, r.id', codigo: 'r.codigo DESC', valor: 'r.valor DESC NULLS LAST, r.id DESC', actualizado: 'r.actualizado_en DESC' };

r.get('/reintegros', asincrono(async (req, res) => {
  const f = F.leerFiltros(req.query);
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1), porPagina = Math.min(100, Math.max(5, parseInt(req.query.por_pagina, 10) || 20));
  const { where, params } = F.construir(f);
  const [datos, total] = await Promise.all([
    consultar(`SELECT ${F.COLUMNAS} ${F.FROM}${where} ORDER BY ${ORDEN[req.query.orden] || ORDEN.fecha} LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, params),
    consultar(`SELECT count(*) AS n ${F.FROM}${where}`, params)
  ]);
  res.json({ datos: datos.rows, total: total.rows[0].n, pagina, por_pagina: porPagina });
}));

r.get('/reintegros/:id', asincrono(async (req, res) => {
  const { rows } = await consultar(`SELECT ${F.COLUMNAS} ${F.FROM} WHERE r.id = $1`, [id(req.params.id)]);
  if (!rows.length) throw new ErrorApp(404, 'El reintegro no existe.');
  res.json(rows[0]);
}));

r.post('/reintegros', requerirRol('editor'), asincrono(async (req, res) => {
  const d = esquema.parse(req.body);
  const fila = await transaccion(async c => {
    const h = await huella(c, d);
    const cols = [...CAMPOS, 'articulo', 'categoria', 'hash_registro', 'creado_por', 'actualizado_por'];
    const vals = [...CAMPOS.map(k => d[k] ?? null), articulos.familia(d.descripcion), articulos.categoria(d.descripcion), h, req.usuario.id, req.usuario.id];
    const { rows } = await c.query(`INSERT INTO reintegros (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'REINTEGRO_CREADO', entidad: 'reintegro', entidadId: rows[0].codigo, datos: Object.assign({ hash_registro: h }, d) });
    return rows[0];
  });
  res.status(201).json(fila);
}));

r.put('/reintegros/:id', requerirRol('editor'), asincrono(async (req, res) => {
  const rid = id(req.params.id), d = esquema.parse(req.body);
  const fila = await transaccion(async c => {
    const { rows: ant } = await c.query('SELECT * FROM reintegros WHERE id = $1 FOR UPDATE', [rid]);
    if (!ant.length) throw new ErrorApp(404, 'El reintegro no existe.');
    const cambios = {};
    for (const k of CAMPOS) { const a = ant[0][k] ?? null, n = d[k] ?? null; if (String(a) !== String(n)) cambios[k] = { antes: a, despues: n }; }
    if (!Object.keys(cambios).length) return ant[0];
    const h = await huella(c, d);
    const n = CAMPOS.length;
    const { rows } = await c.query(`UPDATE reintegros SET ${CAMPOS.map((k, i) => `${k} = $${i + 2}`).join(', ')}, hash_registro = $${n + 2},
      actualizado_por = $${n + 3}, articulo = $${n + 4}, categoria = $${n + 5}, actualizado_en = now() WHERE id = $1 RETURNING *`,
      [rid, ...CAMPOS.map(k => d[k] ?? null), h, req.usuario.id, articulos.familia(d.descripcion), articulos.categoria(d.descripcion)]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: cambios.estado ? 'REINTEGRO_CAMBIO_ESTADO' : 'REINTEGRO_ACTUALIZADO', entidad: 'reintegro', entidadId: rows[0].codigo, datos: { cambios } });
    return rows[0];
  });
  res.json(fila);
}));

/** Borra los reintegros de DEMOSTRACIÓN (referencia DEMO-…). Queda registrado en la bitácora. */
r.delete('/reintegros/demostracion', requerirRol('admin'), asincrono(async (req, res) => {
  const n = await transaccion(async c => {
    const { rows } = await c.query("DELETE FROM reintegros WHERE referencia_soporte LIKE 'DEMO-%' RETURNING codigo");
    if (rows.length) await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'REINTEGROS_DEMO_ELIMINADOS', entidad: 'reintegro', datos: { cantidad: rows.length } });
    return rows.length;
  });
  res.json({ eliminados: n });
}));

r.get('/reintegros-demostracion', asincrono(async (_req, res) => {
  const { rows: [{ n }] } = await consultar("SELECT count(*) AS n FROM reintegros WHERE referencia_soporte LIKE 'DEMO-%'");
  res.json({ n });
}));

r.delete('/reintegros/:id', requerirRol('admin'), asincrono(async (req, res) => {
  const rid = id(req.params.id);
  await transaccion(async c => {
    const { rows } = await c.query('DELETE FROM reintegros WHERE id = $1 RETURNING *', [rid]);
    if (!rows.length) throw new ErrorApp(404, 'El reintegro no existe.');
    const { creado_en, actualizado_en, ...foto } = rows[0];
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'REINTEGRO_ELIMINADO', entidad: 'reintegro', entidadId: rows[0].codigo, datos: { registro: foto } });
  });
  res.status(204).end();
}));

module.exports = r;
module.exports.huellaReintegro = huellaReintegro;
