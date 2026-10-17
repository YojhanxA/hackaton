/* Preparación al arrancar (pensada para despliegues de un clic como Render):
   1. Completa artículo y categoría en reintegros antiguos.
   2. Si no hay instituciones, carga las 779 sedes reales de GeoMedellín (INICIALIZAR_DATOS=no lo evita).
   3. Si se definen ADMIN_USUARIO y ADMIN_CLAVE y ese usuario no existe, lo crea como administrador.
      Nunca cambia la contraseña de un usuario existente.
   4. Con SEMBRAR_DEMO=si y sin reintegros, crea los reintegros de DEMOSTRACIÓN (marcados DEMO-). */
const bcrypt = require('bcryptjs');
const { consultar, transaccion } = require('./db/pool');
const bitacora = require('./servicios/bitacora');
const { completarArticulos } = require('./servicios/articulos');

async function preparar({ log = console.log } = {}) {
  const n = await completarArticulos(consultar);
  if (n) log(`Artículo y categoría completados en ${n} reintegros.`);

  if (process.env.INICIALIZAR_DATOS !== 'no') {
    const { rows: [{ c }] } = await consultar('SELECT count(*) AS c FROM instituciones');
    if (c === 0) { log('Cargando las sedes educativas de GeoMedellín…'); await require('../scripts/seed-instituciones').sembrar(); }
  }

  const usuario = (process.env.ADMIN_USUARIO || '').trim().toLowerCase(), clave = process.env.ADMIN_CLAVE || '';
  if (usuario && clave) {
    if (!/^[a-z0-9._-]{3,60}$/.test(usuario) || clave.length < 12) log('ADMIN_USUARIO/ADMIN_CLAVE inválidos (usuario de 3 a 60 caracteres y clave de al menos 12): no se creó el administrador.');
    else {
      const hash = await bcrypt.hash(clave, 12);
      await transaccion(async cl => {
        const { rows } = await cl.query(`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ($1, 'Administrador', $2, 'admin') ON CONFLICT (usuario) DO NOTHING RETURNING id`, [usuario, hash]);
        if (rows.length) { await bitacora.registrar(cl, { usuario: 'arranque', accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: rows[0].id, datos: { usuario, rol: 'admin' } }); log(`Administrador “${usuario}” creado.`); }
      });
    }
  }

  if (process.env.SEMBRAR_DEMO === 'si') {
    const { rows: [{ c }] } = await consultar('SELECT count(*) AS c FROM reintegros');
    if (c === 0) await require('../scripts/seed-demo').crear();
  }
}

module.exports = { preparar };
