/* Importación de los Excel de reintegros de la Secretaría.
   Dos pasos: primero una vista previa (no escribe nada) y luego la confirmación, que inserta todo
   en una sola transacción y deja UN evento en la bitácora con la raíz Merkle de las huellas de las filas.
   Así el archivo completo queda certificado sin llenar la bitácora con miles de eventos. */
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const { config } = require('../config');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');
const { raizMerkle } = require('../servicios/huellas');
const importador = require('../servicios/importador');
const F = require('../servicios/filtrosReintegros');

const r = express.Router();
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxBytesExcel, files: 1 } });
const MAX_DETALLES = 500;
const LOTE = 500;

const esquema = z.object({
  estado: z.enum(F.ESTADOS, { errorMap: () => ({ message: 'Estado inválido.' }) }).default('realizado'),
  fecha_por_defecto: z.preprocess(v => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha por defecto inválida (AAAA-MM-DD).').optional()),
  confirmar: z.preprocess(v => v === true || v === 'true' || v === '1', z.boolean())
});

r.get('/importaciones', asincrono(async (_req, res) => {
  const { rows } = await consultar(`SELECT im.*, u.nombre AS usuario_nombre FROM importaciones im LEFT JOIN usuarios u ON u.id = im.usuario_id ORDER BY im.id DESC LIMIT 50`);
  res.json({ datos: rows });
}));

r.post('/importaciones', requerirRol('editor'), subida.single('archivo'), asincrono(async (req, res) => {
  if (!req.file) throw new ErrorApp(400, 'Selecciona un archivo de Excel (.xlsx).');
  const nombre = String(req.file.originalname || 'reintegros.xlsx').slice(0, 255);
  if (!/\.xlsx$/i.test(nombre)) throw new ErrorApp(400, /\.xls$/i.test(nombre) ? 'El formato .xls (Excel 97-2003) no es compatible: ábrelo en Excel y guárdalo como .xlsx.' : 'Solo se admiten archivos .xlsx.');
  const p = esquema.parse(req.body || {});
  const huellaArchivo = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

  const { rows: instituciones } = await consultar('SELECT id, nombre, institucion FROM instituciones');
  let resultado;
  try {
    resultado = await importador.procesar(req.file.buffer, {
      instituciones, fechaPorDefecto: p.fecha_por_defecto, nombreArchivo: nombre, maxFilas: config.maxFilasImportacion,
      existe: async hashes => new Set(hashes.length ? (await consultar('SELECT hash_registro FROM reintegros WHERE hash_registro = ANY($1)', [hashes])).rows.map(x => x.hash_registro) : []),
      placasExistentes: async placas => new Set(placas.length ? (await consultar(`SELECT lower(r.placa) || '|' || lower(trim(coalesce(r.institucion_texto, i.nombre, ''))) AS k
        FROM reintegros r LEFT JOIN instituciones i ON i.id = r.institucion_id WHERE lower(r.placa) = ANY($1)`, [placas])).rows.map(x => x.k) : [])
    });
  } catch (e) { if (e.status) throw new ErrorApp(e.status, e.message); throw e; }

  const { rows: previas } = await consultar('SELECT id, archivo, creado_en FROM importaciones WHERE sha256 = $1 ORDER BY id', [huellaArchivo]);
  const resumen = {
    archivo: nombre, sha256: huellaArchivo, estado_asignado: p.estado, hojas: resultado.hojas, filas: resultado.filas, validos: resultado.validos,
    duplicados: resultado.duplicados, omitidas: resultado.omitidas, errores: resultado.errores, advertencias: resultado.advertencias,
    fecha_heredada: resultado.fecha_heredada, fecha_archivo: resultado.fecha_archivo, fecha_por_defecto: resultado.fecha_por_defecto,
    asociados: resultado.registros.filter(x => x.institucion_id).length,
    por_categoria: resultado.registros.reduce((o, x) => { o[x.categoria] += x.cantidad; return o; }, { mobiliario: 0, electrico: 0 }),
    importado_antes: previas.length ? previas : null,
    detalles: resultado.detalles.slice(0, MAX_DETALLES), detalles_total: resultado.detalles.length
  };
  if (!p.confirmar) return res.json(Object.assign({ confirmado: false }, resumen));
  if (!resultado.registros.length) throw new ErrorApp(400, 'El archivo no tiene filas nuevas para importar.');

  const salida = await transaccion(async c => {
    const raiz = raizMerkle(resultado.registros.map(x => x.hash_registro));
    const { rows: [imp] } = await c.query(`INSERT INTO importaciones (archivo, sha256, estado_asignado, filas, validos, duplicados, omitidas, raiz_filas, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [nombre, huellaArchivo, p.estado, resultado.filas, resultado.validos, resultado.duplicados, resultado.omitidas + resultado.errores, raiz, req.usuario.id]);
    const cols = ['institucion_id', 'institucion_texto', 'fecha_reintegro', 'placa', 'cantidad', 'descripcion', 'referencia_soporte', 'estado', 'articulo', 'categoria', 'hash_registro', 'importacion_id', 'creado_por', 'actualizado_por'];
    let insertados = 0;
    for (let k = 0; k < resultado.registros.length; k += LOTE) {
      const lote = resultado.registros.slice(k, k + LOTE), vals = [];
      const filas = lote.map(x => {
        const v = [x.institucion_id, x.institucion_texto, x.fecha_reintegro, x.placa, x.cantidad, x.descripcion, x.referencia_soporte, p.estado, x.articulo, x.categoria, x.hash_registro, imp.id, req.usuario.id, req.usuario.id];
        const base = vals.length; vals.push(...v);
        return '(' + v.map((_, j) => '$' + (base + j + 1)).join(',') + ')';
      });
      // ON CONFLICT: si otra persona registró la misma huella entre la vista previa y la confirmación, no se duplica
      const q = await c.query(`INSERT INTO reintegros (${cols.join(',')}) VALUES ${filas.join(',')} ON CONFLICT (hash_registro) DO NOTHING`, vals);
      insertados += q.rowCount;
    }
    if (insertados !== resultado.registros.length) await c.query('UPDATE importaciones SET validos = $2, duplicados = duplicados + $3 WHERE id = $1', [imp.id, insertados, resultado.registros.length - insertados]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'IMPORTACION_REINTEGROS', entidad: 'importacion', entidadId: imp.id,
      datos: { archivo: nombre, sha256: huellaArchivo, estado: p.estado, filas: resultado.filas, insertados, duplicados: resultado.duplicados, omitidas: resultado.omitidas + resultado.errores, raiz_filas: raiz } });
    return { importacion: Object.assign(imp, { validos: insertados }), insertados, raiz };
  });
  res.status(201).json(Object.assign({ confirmado: true }, resumen, salida));
}));

module.exports = r;
