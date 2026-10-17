/* Huellas SHA-256, JSON canónico y árbol de Merkle.
   Mismo algoritmo que la versión del navegador (public/legacy/js/cadena.js) y que verifica el contrato:
   raíz = SHA-256(hexIzq + hexDer) por niveles; un nodo impar se combina consigo mismo. */
const crypto = require('crypto');

const sha256 = texto => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

function raizMerkle(hojas) {
  if (!hojas.length) return sha256('');
  let nivel = hojas.slice();
  while (nivel.length > 1) {
    const sig = [];
    for (let i = 0; i < nivel.length; i += 2) sig.push(sha256(nivel[i] + (nivel[i + 1] ?? nivel[i])));
    nivel = sig;
  }
  return nivel[0];
}

/** Normaliza texto como la aplicación de reintegros existente: minúsculas, sin tildes, espacios simples. */
const normalizarTexto = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

module.exports = { sha256, canon, raizMerkle, normalizarTexto };
