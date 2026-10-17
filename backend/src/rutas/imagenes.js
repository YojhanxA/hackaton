const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const { config } = require('../config');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol, autenticar } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');
const almacen = require('../servicios/almacenamiento');

const r = express.Router();
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxBytesImagen, files: config.maxImagenesPorCarga } });
const id = v => z.coerce.number().int().positive('Identificador inválido.').parse(v);
const urlImagen = a => `/api/imagenes/archivo/${a}`;

/** Valida cada archivo por su firma real y calcula su huella. */
function validarArchivos(files) {
  if (!files || !files.length) throw new ErrorApp(400, 'Selecciona al menos una imagen.');
  return files.map(f => {
    const mime = almacen.detectarTipo(f.buffer);
    if (!mime) throw new ErrorApp(400, `“${f.originalname}” no es una imagen JPG, PNG o WebP válida.`);
    return { buffer: f.buffer, mime, nombre: String(f.originalname || 'imagen').slice(0, 255), tamano: f.size, sha256: crypto.createHash('sha256').update(f.buffer).digest('hex') };
  });
}

/* Archivo público: los nombres son aleatorios (UUID) y solo se sirven imágenes registradas. */
r.get('/imagenes/archivo/:archivo', asincrono(async (req, res) => {
  const a = String(req.params.archivo);
  if (!almacen.NOMBRE_VALIDO.test(a)) throw new ErrorApp(404, 'La imagen no existe.');
  const { rows } = await consultar('SELECT tipo_mime FROM institucion_imagenes WHERE archivo = $1', [a]);
  if (!rows.length) throw new ErrorApp(404, 'La imagen no existe.');
  res.set({ 'Content-Type': rows[0].tipo_mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  if (!(await almacen.enviar(a, res))) { res.removeHeader('Cache-Control'); throw new ErrorApp(404, 'La imagen no existe.'); }
}));

r.post('/instituciones/:id/imagenes', autenticar, requerirRol('editor'), subida.array('imagenes', config.maxImagenesPorCarga), asincrono(async (req, res) => {
  const iid = id(req.params.id), archivos = validarArchivos(req.files);
  const principalIdx = req.body.principal != null && req.body.principal !== '' ? Number(req.body.principal) : null;
  const guardados = [];
  try {
    for (const a of archivos) guardados.push(await almacen.guardar(a.buffer, a.mime));
    const filas = await transaccion(async c => {
      const { rows: inst } = await c.query('SELECT id FROM instituciones WHERE id = $1 FOR UPDATE', [iid]);
      if (!inst.length) throw new ErrorApp(404, 'La institución no existe.');
      const { rows: [{ hay, maxorden }] } = await c.query('SELECT bool_or(es_principal) AS hay, coalesce(max(orden), -1) AS maxorden FROM institucion_imagenes WHERE institucion_id = $1', [iid]);
      const nuevaPrincipal = Number.isInteger(principalIdx) && principalIdx >= 0 && principalIdx < archivos.length ? principalIdx : (hay ? -1 : 0);
      if (nuevaPrincipal >= 0 && hay) await c.query('UPDATE institucion_imagenes SET es_principal = false WHERE institucion_id = $1 AND es_principal', [iid]);
      const out = [];
      for (let k = 0; k < archivos.length; k++) {
        const a = archivos[k];
        const { rows } = await c.query(`INSERT INTO institucion_imagenes (institucion_id, archivo, nombre_original, tipo_mime, tamano_bytes, sha256, es_principal, orden, creado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, archivo, nombre_original, tipo_mime, tamano_bytes, es_principal, orden, creado_en`,
          [iid, guardados[k], a.nombre, a.mime, a.tamano, a.sha256, k === nuevaPrincipal, Number(maxorden) + 1 + k, req.usuario.id]);
        out.push(rows[0]);
      }
      await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'IMAGENES_CARGADAS', entidad: 'institucion', entidadId: iid,
        datos: { imagenes: out.map((x, k) => ({ id: x.id, sha256: archivos[k].sha256, bytes: archivos[k].tamano, principal: x.es_principal })) } });
      await c.query('UPDATE instituciones SET actualizado_en = now() WHERE id = $1', [iid]);
      return out;
    });
    res.status(201).json({ datos: filas.map(x => Object.assign(x, { url: urlImagen(x.archivo) })) });
  } catch (e) {
    await Promise.all(guardados.map(g => almacen.eliminar(g).catch(() => {}))); // no deja archivos huérfanos
    throw e;
  }
}));

r.patch('/imagenes/:id/principal', autenticar, requerirRol('editor'), asincrono(async (req, res) => {
  const im = id(req.params.id);
  await transaccion(async c => {
    const { rows } = await c.query('SELECT institucion_id, es_principal FROM institucion_imagenes WHERE id = $1 FOR UPDATE', [im]);
    if (!rows.length) throw new ErrorApp(404, 'La imagen no existe.');
    if (rows[0].es_principal) return;
    await c.query('UPDATE institucion_imagenes SET es_principal = false WHERE institucion_id = $1 AND es_principal', [rows[0].institucion_id]);
    await c.query('UPDATE institucion_imagenes SET es_principal = true WHERE id = $1', [im]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'IMAGEN_PRINCIPAL', entidad: 'institucion', entidadId: rows[0].institucion_id, datos: { imagen_id: im } });
  });
  res.json({ ok: true });
}));

/** Reemplaza el archivo de una imagen conservando su posición y si es principal. */
r.put('/imagenes/:id', autenticar, requerirRol('editor'), subida.single('imagen'), asincrono(async (req, res) => {
  const im = id(req.params.id), [a] = validarArchivos(req.file ? [req.file] : []);
  const nuevo = await almacen.guardar(a.buffer, a.mime);
  let viejo;
  try {
    const fila = await transaccion(async c => {
      const { rows } = await c.query('SELECT * FROM institucion_imagenes WHERE id = $1 FOR UPDATE', [im]);
      if (!rows.length) throw new ErrorApp(404, 'La imagen no existe.');
      viejo = rows[0].archivo;
      const { rows: n } = await c.query(`UPDATE institucion_imagenes SET archivo = $2, nombre_original = $3, tipo_mime = $4, tamano_bytes = $5, sha256 = $6
        WHERE id = $1 RETURNING id, archivo, nombre_original, tipo_mime, tamano_bytes, es_principal, orden, creado_en`, [im, nuevo, a.nombre, a.mime, a.tamano, a.sha256]);
      await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'IMAGEN_REEMPLAZADA', entidad: 'institucion', entidadId: rows[0].institucion_id,
        datos: { imagen_id: im, sha256_antes: rows[0].sha256, sha256_despues: a.sha256 } });
      return n[0];
    });
    await almacen.eliminar(viejo).catch(() => {});
    res.json(Object.assign(fila, { url: urlImagen(fila.archivo) }));
  } catch (e) { await almacen.eliminar(nuevo).catch(() => {}); throw e; }
}));

r.delete('/imagenes/:id', autenticar, requerirRol('editor'), asincrono(async (req, res) => {
  const im = id(req.params.id);
  const archivo = await transaccion(async c => {
    const { rows } = await c.query('SELECT * FROM institucion_imagenes WHERE id = $1 FOR UPDATE', [im]);
    if (!rows.length) throw new ErrorApp(404, 'La imagen no existe.');
    const f = rows[0];
    await c.query('DELETE FROM institucion_imagenes WHERE id = $1', [im]);
    if (f.es_principal) { // la siguiente imagen pasa a ser la principal
      await c.query(`UPDATE institucion_imagenes SET es_principal = true WHERE id = (
        SELECT id FROM institucion_imagenes WHERE institucion_id = $1 ORDER BY orden, id LIMIT 1)`, [f.institucion_id]);
    }
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'IMAGEN_ELIMINADA', entidad: 'institucion', entidadId: f.institucion_id, datos: { imagen_id: im, sha256: f.sha256 } });
    return f.archivo;
  });
  await almacen.eliminar(archivo).catch(() => {});
  res.status(204).end();
}));

module.exports = r;
