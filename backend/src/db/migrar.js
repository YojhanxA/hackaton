/* Migraciones versionadas: cada archivo NNN_nombre.sql se aplica una sola vez, en orden,
   dentro de su propia transacción, y queda registrado en la tabla schema_migraciones.
   Uso: npm run migrar */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const { obtenerPool, cerrar } = require('./pool');

const DIR = path.join(__dirname, 'migraciones');
const DIR_SQLITE = path.join(DIR, 'sqlite');

async function migrar({ silencioso = false } = {}) {
  const pool = obtenerPool();
  const cliente = await pool.connect();
  const log = m => { if (!silencioso) console.log(m); };
  try {
    // Evita que dos procesos migren a la vez
    await cliente.query('SELECT pg_advisory_lock(727274)');
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
      version varchar(20) PRIMARY KEY, nombre text NOT NULL, suma_sha256 char(64) NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await cliente.query('SELECT version, suma_sha256 FROM schema_migraciones');
    const aplicadas = new Map(rows.map(r => [r.version, r.suma_sha256]));
    const directorio = config.tipoBaseDatos === 'sqlite' ? DIR_SQLITE : DIR;
    const archivos = fs.readdirSync(directorio).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    let n = 0;
    for (const f of archivos) {
      const version = f.slice(0, 3), sql = fs.readFileSync(path.join(directorio, f), 'utf8');
      const suma = crypto.createHash('sha256').update(sql).digest('hex');
      if (aplicadas.has(version)) {
        if (aplicadas.get(version) !== suma) throw new Error(`La migración ${f} cambió después de aplicarse. Crea una migración nueva en lugar de editarla.`);
        continue;
      }
      log(`Aplicando ${f}…`);
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migraciones (version, nombre, suma_sha256) VALUES ($1, $2, $3)', [version, f, suma]);
        await cliente.query('COMMIT');
        n++;
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falló la migración ${f}: ${e.message}`);
      }
    }
    log(n ? `${n} migración(es) aplicada(s).` : 'La base de datos ya está al día.');
    return n;
  } finally {
    await cliente.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    cliente.release();
  }
}

if (require.main === module) {
  migrar().then(() => cerrar()).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { migrar };
