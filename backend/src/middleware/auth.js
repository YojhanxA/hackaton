/* Autenticación con JWT y control de acceso por rol.
   admin  → todo, incluida la configuración, usuarios y eliminaciones.
   editor → crear y editar instituciones, imágenes y reintegros.
   lector → solo consulta. */
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { consultar } = require('../db/pool');
const { ErrorApp } = require('./errores');

const NIVEL = { lector: 1, editor: 2, admin: 3 };

function firmar(u) {
  return jwt.sign({ sub: String(u.id), usuario: u.usuario, rol: u.rol }, config.jwtSecreto, { expiresIn: config.jwtDuracion, algorithm: 'HS256' });
}

/** Exige un token válido y un usuario activo. Deja el usuario en req.usuario. */
async function autenticar(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw new ErrorApp(401, 'Inicia sesión para continuar.');
    let datos;
    try { datos = jwt.verify(token, config.jwtSecreto, { algorithms: ['HS256'] }); }
    catch (e) { throw new ErrorApp(401, e.name === 'TokenExpiredError' ? 'Tu sesión expiró. Inicia sesión de nuevo.' : 'La sesión no es válida. Inicia sesión de nuevo.'); }
    const { rows } = await consultar('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = $1', [Number(datos.sub)]);
    if (!rows.length || !rows[0].activo) throw new ErrorApp(401, 'El usuario no existe o está inactivo.');
    req.usuario = rows[0];
    next();
  } catch (e) { next(e); }
}

const requerirRol = rol => (req, _res, next) => {
  if (!req.usuario || NIVEL[req.usuario.rol] < NIVEL[rol]) return next(new ErrorApp(403, `Esta acción requiere el rol ${rol}.`));
  next();
};

module.exports = { firmar, autenticar, requerirRol, NIVEL };
