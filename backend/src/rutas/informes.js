const express = require('express');
const { consultar } = require('../db/pool');
const { asincrono } = require('../middleware/errores');
const informes = require('../servicios/informes');
const F = require('../servicios/filtrosReintegros');

const r = express.Router();

r.get('/informes/instituciones', asincrono(async (req, res) => {
  res.json({ datos: await informes.institucionesConReintegros(F.leerFiltros(req.query)) });
}));

r.get('/informes/resumen', asincrono(async (req, res) => {
  res.json(await informes.resumen(F.leerFiltros(req.query)));
}));

r.get('/informes/articulos-institucion', asincrono(async (req, res) => {
  const f = F.leerFiltros(req.query);
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = Math.min(100, Math.max(5, parseInt(req.query.por_pagina, 10) || 20));
  res.json(await informes.articulosPorInstitucion(f, pagina, porPagina));
}));

r.get('/informes/reintegros.xlsx', asincrono(async (req, res) => {
  const f = F.leerFiltros(req.query);
  const { buffer, filas } = await informes.excel(f);
  const sufijo = [f.desde, f.hasta].filter(Boolean).join('_a_') || new Date().toISOString().slice(0, 10);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="reintegros_${sufijo}.xlsx"`,
    'X-Total-Filas': String(filas),
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Total-Filas'
  });
  res.send(Buffer.from(buffer));
}));

/** Indicadores del panel principal. */
r.get('/panel', asincrono(async (_req, res) => {
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); // fecha en Bogotá
  const iniMes = hoy.slice(0, 8) + '01';
  const d = new Date(iniMes + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
  const iniMesAnt = d.toISOString().slice(0, 10);
  const desdeDoceMeses = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1 - 11, 1)).toISOString().slice(0, 10);
  const [inst, rein, meses, recientes, bit] = await Promise.all([
    consultar(`SELECT count(*) AS total, count(*) FILTER (WHERE estado = 'activo') AS activas, count(*) FILTER (WHERE latitud IS NOT NULL) AS con_coordenadas,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM institucion_imagenes im WHERE im.institucion_id = instituciones.id)) AS con_imagenes,
      coalesce(sum(estudiantes), 0) AS estudiantes FROM instituciones`),
    consultar(`SELECT count(*) AS total,
      count(*) FILTER (WHERE estado = 'realizado') AS realizados, count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
      count(*) FILTER (WHERE estado = 'rechazado') AS rechazados, count(*) FILTER (WHERE estado = 'anulado') AS anulados,
      coalesce(sum(valor) FILTER (WHERE estado = 'realizado'), 0) AS valor_realizado,
      count(*) FILTER (WHERE estado = 'realizado' AND fecha_reintegro >= $1) AS realizados_mes,
      count(*) FILTER (WHERE estado = 'realizado' AND fecha_reintegro >= $2 AND fecha_reintegro < $1) AS realizados_mes_anterior
      FROM reintegros`, [iniMes, iniMesAnt]),
    consultar(`SELECT substr(CAST(fecha_reintegro AS TEXT), 1, 7) AS periodo, estado, count(*) AS n FROM reintegros
      WHERE fecha_reintegro >= $1 GROUP BY 1, 2 ORDER BY 1`, [desdeDoceMeses]),
    consultar(`SELECT ${F.COLUMNAS} ${F.FROM} ORDER BY r.actualizado_en DESC LIMIT 6`),
    consultar('SELECT count(*) AS n, max(ts) AS ultimo FROM bitacora')
  ]);
  const porMes = new Map();
  for (const x of meses.rows) { if (!porMes.has(x.periodo)) porMes.set(x.periodo, Object.fromEntries([['periodo', x.periodo], ...F.ESTADOS.map(e => [e, 0])])); porMes.get(x.periodo)[x.estado] = x.n; }
  res.json({
    instituciones: inst.rows[0], reintegros: Object.assign(rein.rows[0], { valor_realizado: Number(rein.rows[0].valor_realizado) }),
    por_mes: [...porMes.values()], recientes: recientes.rows, bitacora: bit.rows[0], fecha_corte: hoy
  });
}));

module.exports = r;
