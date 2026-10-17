/* Parámetros del sistema. El origen de las rutas (Secretaría de Educación) se guarda en PostgreSQL
   y es el único lugar de donde lo leen el mapa y el cálculo de rutas. */
const express = require('express');
const { z } = require('zod');
const { config } = require('../config');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol } = require('../middleware/auth');
const { asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');

const r = express.Router();

async function obtenerOrigen() {
  const { rows } = await consultar("SELECT valor FROM configuracion WHERE clave = 'origen_rutas'");
  return rows.length ? rows[0].valor : config.origenPorDefecto;
}

const esquemaOrigen = z.object({
  nombre: z.string().trim().min(3, 'Escribe el nombre del origen.').max(120),
  direccion: z.string().trim().min(5, 'Escribe la dirección.').max(200),
  latitud: z.coerce.number({ invalid_type_error: 'Latitud inválida.' }).min(-90).max(90),
  longitud: z.coerce.number({ invalid_type_error: 'Longitud inválida.' }).min(-180).max(180)
}).strict().refine(d => !(d.latitud === 0 && d.longitud === 0), { message: 'Las coordenadas 0, 0 no son válidas.', path: ['latitud'] });

r.get('/configuracion', asincrono(async (_req, res) => {
  res.json({
    origen: await obtenerOrigen(),
    mapa: { tiles: config.tilesUrl, atribucion: config.tilesAtribucion },
    rutas: { servicio: config.osrmUrl, perfil: config.osrmPerfil, max_destinos: config.maxDestinosPorConsulta, servidor_publico: /router\.project-osrm\.org/.test(config.osrmUrl) },
    imagenes: { max_bytes: config.maxBytesImagen, max_por_carga: config.maxImagenesPorCarga, tipos: ['image/jpeg', 'image/png', 'image/webp'] }
  });
}));

r.put('/configuracion/origen', requerirRol('admin'), asincrono(async (req, res) => {
  const d = esquemaOrigen.parse(req.body);
  await transaccion(async c => {
    const antes = await obtenerOrigen();
    await c.query(`INSERT INTO configuracion (clave, valor, actualizado_por) VALUES ('origen_rutas', $1, $2)
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`, [JSON.stringify(d), req.usuario.id]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'CONFIGURACION_ORIGEN', entidad: 'configuracion', entidadId: 'origen_rutas', datos: { antes, despues: d } });
  });
  res.json(d);
}));

module.exports = r;
module.exports.obtenerOrigen = obtenerOrigen;
