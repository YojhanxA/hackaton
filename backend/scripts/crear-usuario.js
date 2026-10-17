/* Crea (o actualiza la contraseña de) un usuario.
   Uso: npm run crear-usuario -- --usuario admin --nombre "Administrador" --rol admin
   La contraseña se pide por consola (o se toma de la variable NUEVA_CLAVE). */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { transaccion, cerrar } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const bitacora = require('../src/servicios/bitacora');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : undefined; };
const preguntar = q => new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a); }); });

(async () => {
  const usuario = (arg('usuario') || '').toLowerCase(), nombre = arg('nombre') || usuario, rol = arg('rol') || 'admin';
  if (!/^[a-z0-9._-]{3,60}$/.test(usuario)) throw new Error('Indica --usuario (3 a 60 caracteres: minúsculas, números, punto, guion).');
  if (!['admin', 'editor', 'lector'].includes(rol)) throw new Error('--rol debe ser admin, editor o lector.');
  const clave = process.env.NUEVA_CLAVE || await preguntar('Contraseña (mínimo 12 caracteres): ');
  if (!clave || clave.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
  await migrar({ silencioso: true });
  const hash = await bcrypt.hash(clave, 12);
  await transaccion(async c => {
    const { rows } = await c.query(`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1,$2,$3,$4)
      ON CONFLICT (usuario) DO UPDATE SET hash_clave = EXCLUDED.hash_clave, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, activo = true, actualizado_en = now()
      RETURNING id, (xmax = 0) AS nuevo`, [usuario, nombre, hash, rol]);
    await bitacora.registrar(c, { usuario: 'consola', accion: rows[0].nuevo ? 'USUARIO_CREADO' : 'USUARIO_CLAVE_CAMBIADA', entidad: 'usuario', entidadId: rows[0].id, datos: { usuario, rol } });
    console.log(rows[0].nuevo ? `Usuario “${usuario}” creado con rol ${rol}.` : `Usuario “${usuario}” actualizado.`);
  });
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(cerrar);
