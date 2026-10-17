/* Almacenamiento de imágenes administrado por el backend.
   PostgreSQL guarda los metadatos en institucion_imagenes. El contenido va según ALMACENAMIENTO:
   - 'disco' (por defecto): archivos en UPLOAD_DIR. Requiere disco persistente en producción.
   - 'postgres': binario en la tabla imagen_contenidos. Útil en servicios con disco efímero
     (p. ej. el plan gratuito de Render). Nunca se guarda Base64 en los registros de instituciones.
   Para S3 o Supabase Storage basta con otro adaptador con las mismas tres funciones. */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const { consultar } = require('../db/pool');

const TIPOS = {
  'image/jpeg': { ext: '.jpg', firma: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', firma: b => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: '.webp', firma: b => b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' }
};
const NOMBRE_VALIDO = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Tipo REAL por la firma del archivo (no confía en la extensión ni en el navegador). */
function detectarTipo(buffer) {
  for (const [mime, t] of Object.entries(TIPOS)) if (t.firma(buffer)) return mime;
  return null;
}
const nuevoNombre = mime => crypto.randomUUID() + TIPOS[mime].ext;
const ruta = a => (NOMBRE_VALIDO.test(a) ? path.join(config.dirSubidas, a) : null); // impide ../../

const disco = {
  async guardar(buffer, mime) {
    await fsp.mkdir(config.dirSubidas, { recursive: true });
    const archivo = nuevoNombre(mime);
    await fsp.writeFile(path.join(config.dirSubidas, archivo), buffer, { flag: 'wx' });
    return archivo;
  },
  async enviar(archivo, res) {
    const r = ruta(archivo);
    if (!r || !fs.existsSync(r)) return false;
    const f = fs.createReadStream(r); f.on('error', () => res.destroy()); f.pipe(res);
    return true;
  },
  async eliminar(archivo) { const r = ruta(archivo); if (r) await fsp.unlink(r).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
};

const postgres = {
  async guardar(buffer, mime) {
    const archivo = nuevoNombre(mime);
    await consultar('INSERT INTO imagen_contenidos (archivo, datos) VALUES ($1, $2)', [archivo, buffer]);
    return archivo;
  },
  async enviar(archivo, res) {
    if (!NOMBRE_VALIDO.test(archivo)) return false;
    const { rows } = await consultar('SELECT datos FROM imagen_contenidos WHERE archivo = $1', [archivo]);
    if (!rows.length) return false;
    res.end(rows[0].datos);
    return true;
  },
  async eliminar(archivo) { await consultar('DELETE FROM imagen_contenidos WHERE archivo = $1', [archivo]); }
};

const adaptador = () => (config.almacenamiento === 'postgres' ? postgres : disco);

module.exports = {
  detectarTipo, TIPOS, NOMBRE_VALIDO,
  guardar: (b, m) => adaptador().guardar(b, m),
  enviar: (a, res) => adaptador().enviar(a, res),
  eliminar: a => adaptador().eliminar(a)
};
