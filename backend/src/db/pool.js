/* Adaptadores PostgreSQL/SQLite. Las consultas del proyecto usan parámetros ($1, $2…). */
const { Pool, types } = require('pg');
const Database = require('better-sqlite3');
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// NUMERIC (valores en pesos) llega como texto: se convierte a número JS. DATE se deja como 'AAAA-MM-DD'.
types.setTypeParser(1700, v => (v === null ? null : Number(v)));
types.setTypeParser(1082, v => v);
// BIGINT (conteos) a número: los conteos de esta aplicación caben de sobra en un Number.
types.setTypeParser(20, v => (v === null ? null : Number(v)));

let pool = null;
let sqlite = null;
let colaSQLite = Promise.resolve();
const contextoTransaccionSQLite = new AsyncLocalStorage();

function obtenerSQLite() {
  if (!sqlite) {
    if (config.databasePath !== ':memory:') fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    sqlite = new Database(config.databasePath);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
  }
  return sqlite;
}

function enColaSQLite(fn) {
  const siguiente = colaSQLite.then(fn);
  colaSQLite = siguiente.catch(() => {});
  return siguiente;
}

function consultarSQLite(texto, params = []) {
  const sqlOriginal = String(texto).trim();
  if (/^SELECT\s+pg_advisory_(?:xact_)?(?:lock|unlock)\b/i.test(sqlOriginal)) return { rows: [], rowCount: 0 };
  if (/;\s*\S/.test(sqlOriginal) && !params.length) {
    obtenerSQLite().exec(sqlOriginal);
    return { rows: [], rowCount: 0 };
  }

  const arrays = new Map();
  let sql = sqlOriginal
    .replace(/\bbool_or\(([^)]+)\)\s+AS\s+(\w+)/gi, 'MAX(CASE WHEN $1 THEN 1 ELSE 0 END) AS $2')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\s+FOR UPDATE\b/gi, '')
    .replace(/\bnow\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/::(?:date|text|integer|bigint)\b/gi, '');

  sql = sql.replace(/=\s*ANY\(\$(\d+)\)/gi, (_match, index) => {
    const values = params[Number(index) - 1];
    if (!Array.isArray(values)) throw new Error('Se esperaba una lista para el filtro ANY de SQLite.');
    arrays.set(index, values);
    return values.length
      ? `IN (${values.map((_, i) => `__SQLITE_ARRAY_${index}_${i}__`).join(', ')})`
      : 'IN (NULL)';
  });

  const values = [];
  sql = sql.replace(/__SQLITE_ARRAY_(\d+)_(\d+)__|\$(\d+)/g, (_match, arrayIndex, itemIndex, parameterIndex) => {
    if (arrayIndex) values.push(arrays.get(arrayIndex)[Number(itemIndex)]);
    else values.push(params[Number(parameterIndex) - 1]);
    return '?';
  });
  const parametros = values.map(v => typeof v === 'boolean' ? Number(v) : v);

  const db = obtenerSQLite();
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) {
    db.exec(sql);
    return { rows: [], rowCount: 0 };
  }
  const statement = db.prepare(sql);
  const returnsRows = /^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const rows = returnsRows ? statement.all(...parametros) : [];
  const rowCount = returnsRows ? rows.length : statement.run(...parametros).changes;
  for (const row of rows) {
    for (const key of ['activo', 'es_principal', 'hay']) {
      if (Object.prototype.hasOwnProperty.call(row, key)) row[key] = Boolean(row[key]);
    }
    if (typeof row.datos === 'string') row.datos = JSON.parse(row.datos);
    if (typeof row.valor === 'string' && /(?:FROM|INTO)\s+configuracion\b/i.test(sql)) row.valor = JSON.parse(row.valor);
  }
  return { rows, rowCount };
}

function clienteSQLite() {
  return {
    query: async (texto, params = []) => consultarSQLite(texto, params),
    release() {}
  };
}

function obtenerPool() {
  if (config.tipoBaseDatos === 'sqlite') {
    return {
      connect: async () => clienteSQLite(),
      query: (texto, params = []) => enColaSQLite(() => consultarSQLite(texto, params)),
      end: async () => { if (sqlite) { sqlite.close(); sqlite = null; } }
    };
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000
    });
    pool.on('error', err => console.error('[db] error inesperado en el pool:', err.message));
  }
  return pool;
}

const consultar = (texto, params) => {
  const db = obtenerPool();
  if (config.tipoBaseDatos !== 'sqlite') return db.query(texto, params);
  return contextoTransaccionSQLite.getStore()
    ? Promise.resolve(consultarSQLite(texto, params))
    : db.query(texto, params);
};

/** Ejecuta `fn(cliente)` dentro de una transacción. Si algo falla, revierte todo. */
async function transaccion(fn) {
  if (config.tipoBaseDatos === 'sqlite') {
    return enColaSQLite(async () => {
      const cliente = clienteSQLite();
      consultarSQLite('BEGIN IMMEDIATE');
      try {
        const resultado = await contextoTransaccionSQLite.run(true, () => fn(cliente));
        consultarSQLite('COMMIT');
        return resultado;
      } catch (e) {
        consultarSQLite('ROLLBACK');
        throw e;
      }
    });
  }
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

async function cerrar() {
  if (config.tipoBaseDatos === 'sqlite') {
    if (sqlite) { sqlite.close(); sqlite = null; }
  } else if (pool) { await pool.end(); pool = null; }
}

module.exports = { consultar, transaccion, obtenerPool, cerrar };
