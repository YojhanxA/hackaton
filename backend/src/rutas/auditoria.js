/* Trazabilidad: bitácora encadenada, verificación y recibos de anclaje en blockchain. */
const express = require('express');
const { z } = require('zod');
const { consultar, transaccion } = require('../db/pool');
const { requerirRol } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');

const r = express.Router();

r.get('/auditoria/eventos', asincrono(async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1), porPagina = Math.min(100, Math.max(5, parseInt(req.query.por_pagina, 10) || 25));
  const w = [], p = [];
  if (req.query.entidad) { p.push(String(req.query.entidad)); w.push('entidad = $' + p.length); }
  if (req.query.entidad_id) { p.push(String(req.query.entidad_id)); w.push('entidad_id = $' + p.length); }
  if (req.query.accion) { p.push(String(req.query.accion)); w.push('accion = $' + p.length); }
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const [d, t] = await Promise.all([
    consultar(`SELECT n, ts, usuario, accion, entidad, entidad_id, datos, prev, hash FROM bitacora${where} ORDER BY n DESC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, p),
    consultar(`SELECT count(*) AS n FROM bitacora${where}`, p)
  ]);
  res.json({ datos: d.rows, total: t.rows[0].n, pagina, por_pagina: porPagina });
}));

r.get('/auditoria/verificar', asincrono(async (_req, res) => {
  res.json(await bitacora.verificar());
}));

r.get('/auditoria/raiz', asincrono(async (req, res) => {
  const n = z.coerce.number().int().positive('n debe ser mayor que 0.').parse(req.query.n);
  const raiz = await bitacora.raizHasta(n);
  if (!raiz) throw new ErrorApp(404, `La bitácora tiene menos de ${n} eventos.`);
  res.json({ n, raiz });
}));

/* ---------- Recibos de anclaje ---------- */
const hex = (len, msg) => z.string().regex(new RegExp(`^0x[0-9a-fA-F]{${len}}$`), msg).transform(s => s.toLowerCase());
const esquemaAnclaje = z.object({
  n_eventos: z.coerce.number().int().positive(),
  raiz: z.string().regex(/^(0x)?[0-9a-f]{64}$/i, 'Raíz inválida.').transform(s => s.replace(/^0x/, '').toLowerCase()),
  red: z.string().trim().min(2).max(60),
  chain_id: z.coerce.number().int().positive(),
  contrato: hex(40, 'Dirección de contrato inválida.'),
  tx_hash: hex(64, 'Hash de transacción inválido.'),
  cuenta: hex(40, 'Cuenta inválida.')
}).strict();

r.get('/auditoria/anclajes', asincrono(async (_req, res) => {
  const { rows } = await consultar(`SELECT a.*, u.nombre AS usuario_nombre FROM anclajes a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 100`);
  // Comprobación local: la raíz guardada debe seguir coincidiendo con la bitácora recalculada
  const out = [];
  for (const a of rows) { const raiz = await bitacora.raizHasta(Number(a.n_eventos)); out.push(Object.assign(a, { coincide_local: raiz === a.raiz })); }
  res.json({ datos: out });
}));

/** Guarda el recibo de un anclaje hecho desde el navegador. Solo acepta la raíz que corresponde a la bitácora. */
r.post('/auditoria/anclajes', requerirRol('editor'), asincrono(async (req, res) => {
  const d = esquemaAnclaje.parse(req.body);
  const raiz = await bitacora.raizHasta(d.n_eventos);
  if (raiz !== d.raiz) throw new ErrorApp(409, 'La huella no corresponde a la bitácora actual: no se registra el anclaje.');
  const fila = await transaccion(async c => {
    const { rows } = await c.query(`INSERT INTO anclajes (n_eventos, raiz, red, chain_id, contrato, tx_hash, cuenta, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.n_eventos, d.raiz, d.red, d.chain_id, d.contrato, d.tx_hash, d.cuenta, req.usuario.id]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'ANCLAJE_BLOCKCHAIN', entidad: 'anclaje', entidadId: rows[0].id, datos: d });
    return rows[0];
  });
  res.status(201).json(fila);
}));

module.exports = r;
