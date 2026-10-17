const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { consultar, transaccion } = require('../db/pool');
const { firmar, autenticar, requerirRol } = require('../middleware/auth');
const { ErrorApp, asincrono } = require('../middleware/errores');
const bitacora = require('../servicios/bitacora');

const r = express.Router();
const HASH_FALSO = bcrypt.hashSync('usuario-inexistente', 12);
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' } });

const esquemaLogin = z.object({ usuario: z.string().trim().toLowerCase().min(1).max(60), clave: z.string().min(1).max(128) });

r.post('/auth/login', limiteLogin, asincrono(async (req, res) => {
  const { usuario, clave } = esquemaLogin.parse(req.body);
  const { rows } = await consultar('SELECT id, usuario, nombre, rol, activo, hash_clave FROM usuarios WHERE usuario = $1', [usuario]);
  const u = rows[0];
  // Se compara siempre (incluso si el usuario no existe) para no revelar qué usuarios existen por el tiempo de respuesta.
  const ok = await bcrypt.compare(clave, u ? u.hash_clave : HASH_FALSO);
  if (!u || !ok || !u.activo) throw new ErrorApp(401, 'Usuario o contraseña incorrectos.');
  res.json({ token: firmar(u), usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol } });
}));

r.get('/auth/yo', autenticar, (req, res) => res.json({ usuario: req.usuario }));

/* ---------- Gestión de usuarios (admin) ---------- */
const esquemaUsuario = z.object({
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,60}$/, 'Usa de 3 a 60 caracteres: letras minúsculas, números, punto, guion o guion bajo.'),
  nombre: z.string().trim().min(2, 'Escribe el nombre completo.').max(120),
  clave: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.').max(128),
  rol: z.enum(['admin', 'editor', 'lector'])
});

r.get('/usuarios', autenticar, requerirRol('admin'), asincrono(async (_req, res) => {
  const { rows } = await consultar('SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios ORDER BY usuario');
  res.json({ datos: rows });
}));

r.post('/usuarios', autenticar, requerirRol('admin'), asincrono(async (req, res) => {
  const d = esquemaUsuario.parse(req.body);
  const hash = await bcrypt.hash(d.clave, 12);
  const u = await transaccion(async c => {
    const { rows } = await c.query('INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1,$2,$3,$4) RETURNING id, usuario, nombre, rol, activo', [d.usuario, d.nombre, hash, d.rol]);
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: rows[0].id, datos: { usuario: d.usuario, rol: d.rol } });
    return rows[0];
  });
  res.status(201).json(u);
}));

r.patch('/usuarios/:id', autenticar, requerirRol('admin'), asincrono(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const d = z.object({ rol: z.enum(['admin', 'editor', 'lector']).optional(), activo: z.boolean().optional() }).strict().parse(req.body);
  if (id === req.usuario.id && (d.activo === false || (d.rol && d.rol !== 'admin'))) throw new ErrorApp(400, 'No puedes desactivarte ni quitarte el rol de administrador.');
  const u = await transaccion(async c => {
    const { rows } = await c.query('UPDATE usuarios SET rol = COALESCE($2, rol), activo = COALESCE($3, activo), actualizado_en = now() WHERE id = $1 RETURNING id, usuario, nombre, rol, activo', [id, d.rol ?? null, d.activo ?? null]);
    if (!rows.length) throw new ErrorApp(404, 'El usuario no existe.');
    await bitacora.registrar(c, { usuario: req.usuario.usuario, accion: 'USUARIO_ACTUALIZADO', entidad: 'usuario', entidadId: id, datos: d });
    return rows[0];
  });
  res.json(u);
}));

module.exports = r;
