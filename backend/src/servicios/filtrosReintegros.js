/* Filtros comunes de reintegros: los usan la consulta, las estadísticas y la exportación,
   para que lo que se ve en pantalla y lo que sale en el Excel sea exactamente lo mismo. */
const { z } = require('zod');
const { ErrorApp } = require('../middleware/errores');

const ESTADOS = ['pendiente', 'realizado', 'rechazado', 'anulado'];
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.').refine(s => !isNaN(Date.parse(s + 'T00:00:00Z')), 'Fecha inválida.');

const esquemaFiltros = z.object({
  desde: fecha.optional(), hasta: fecha.optional(),
  estado: z.string().optional().transform(s => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []))
    .refine(a => a.every(e => ESTADOS.includes(e)), 'Estado inválido.'),
  institucion_id: z.coerce.number().int().positive().optional(),
  municipio: z.string().trim().max(100).optional(),
  categoria: z.enum(['mobiliario', 'electrico'], { errorMap: () => ({ message: 'Categoría inválida.' }) }).optional(),
  articulo: z.string().trim().max(120).optional(),
  importacion_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).optional()
}).passthrough();

function leerFiltros(query) {
  const limpio = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
  const f = esquemaFiltros.parse(limpio);
  if (f.desde && f.hasta && f.desde > f.hasta) throw new ErrorApp(400, 'La fecha inicial no puede ser posterior a la final.');
  return f;
}

/** Devuelve { where, params } para la consulta con alias r (reintegros) e i (instituciones, LEFT JOIN). */
function construir(f, params = []) {
  const w = [];
  const add = (sql, v) => { params.push(v); w.push(sql.replace('?', '$' + params.length)); };
  if (f.desde) add('r.fecha_reintegro >= ?', f.desde);
  if (f.hasta) add('r.fecha_reintegro <= ?', f.hasta);
  if (f.estado && f.estado.length) add('r.estado = ANY(?)', f.estado);
  if (f.institucion_id) add('r.institucion_id = ?', f.institucion_id);
  if (f.municipio) add('i.municipio = ?', f.municipio);
  if (f.categoria) add('r.categoria = ?', f.categoria);
  if (f.articulo) add('r.articulo = ?', f.articulo);
  if (f.importacion_id) add('r.importacion_id = ?', f.importacion_id);
  if (f.q) {
    params.push('%' + f.q + '%'); const k = '$' + params.length;
    w.push(`(r.codigo ILIKE ${k} OR r.placa ILIKE ${k} OR r.descripcion ILIKE ${k} OR r.referencia_soporte ILIKE ${k} OR r.institucion_texto ILIKE ${k} OR i.nombre ILIKE ${k})`);
  }
  return { where: w.length ? ' WHERE ' + w.join(' AND ') : '', params };
}

const FROM = 'FROM reintegros r LEFT JOIN instituciones i ON i.id = r.institucion_id LEFT JOIN usuarios u ON u.id = r.creado_por LEFT JOIN usuarios ua ON ua.id = r.actualizado_por';
const COLUMNAS = `r.*, i.nombre AS institucion_nombre, i.codigo AS institucion_codigo, i.municipio AS institucion_municipio,
  u.nombre AS creado_por_nombre, ua.nombre AS actualizado_por_nombre`;

module.exports = { leerFiltros, construir, FROM, COLUMNAS, ESTADOS };
