/* Errores con mensajes comprensibles. Nunca se envían al cliente detalles de SQL ni trazas. */
const { ZodError } = require('zod');
const multer = require('multer');
const { config } = require('../config');

class ErrorApp extends Error {
  constructor(estado, mensaje, detalles) { super(mensaje); this.estado = estado; this.detalles = detalles; }
}

const RESTRICCIONES = {
  instituciones_codigo_key: 'Ya existe una institución con ese código.',
  reintegros_hash_registro_key: 'Ya existe un reintegro idéntico (misma placa, cantidad, descripción, fecha e institución).',
  usuarios_usuario_key: 'Ese nombre de usuario ya existe.',
  imagenes_sin_duplicar: 'Esa misma imagen ya está cargada en esta institución.',
  anclajes_tx_hash_key: 'Esa transacción ya está registrada.',
  anclajes_chain_id_contrato_raiz_key: 'Esa huella ya está registrada como anclada en este contrato.',
  coordenadas_completas: 'Indica latitud y longitud juntas, o ninguna de las dos.'
};

function manejadorErrores(err, req, res, _next) {
  if (err instanceof ErrorApp) return res.status(err.estado).json({ error: err.message, detalles: err.detalles });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Revisa los datos enviados.', detalles: err.issues.map(i => ({ campo: i.path.join('.'), mensaje: i.message })) });
  }
  if (err instanceof multer.MulterError) {
    const excel = err.field === 'archivo';
    const m = { LIMIT_FILE_SIZE: excel ? `El Excel puede pesar como máximo ${Math.round(config.maxBytesExcel / 1048576)} MB.` : `Cada imagen puede pesar como máximo ${Math.round(config.maxBytesImagen / 1048576)} MB.`, LIMIT_FILE_COUNT: `Puedes cargar hasta ${config.maxImagenesPorCarga} imágenes a la vez.`, LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado.' }[err.code];
    return res.status(400).json({ error: m || 'No se pudo procesar el archivo.' });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  if (err && err.code === '23505') return res.status(409).json({ error: RESTRICCIONES[err.constraint] || 'El registro ya existe.' });
  if (err && err.code === '23503') return res.status(409).json({ error: 'El registro está relacionado con otro que no existe o que depende de él.' });
  if (err && (err.code === '23514' || err.code === '22003' || err.code === '22007' || err.code === '22P02' || err.code === '22008')) {
    return res.status(400).json({ error: RESTRICCIONES[err.constraint] || 'Algún valor está fuera del rango permitido o tiene un formato inválido.' });
  }
  if (err && err.code === 'P0001') return res.status(409).json({ error: err.message });
  if (err && ['ECONNREFUSED', '57P01', '57P03', '08006', '08001'].includes(err.code)) return res.status(503).json({ error: 'La base de datos no está disponible. Intenta de nuevo en un momento.' });
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
}

/** Envuelve controladores async para que sus errores lleguen al manejador. */
const asincrono = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ErrorApp, manejadorErrores, asincrono };
