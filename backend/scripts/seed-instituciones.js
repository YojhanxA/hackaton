/* Carga las 779 sedes educativas REALES de GeoMedellín (capa Sedes Educativas, vigencia 2024)
   que ya usaba la versión anterior (frontend/public/legacy/js/datos-reales.js).
   No inventa datos: dirección, contacto e imágenes quedan vacíos porque la fuente no los trae.
   Es idempotente: si el código ya existe, no lo vuelve a crear. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transaccion, cerrar } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const bitacora = require('../src/servicios/bitacora');
const { sha256 } = require('../src/servicios/huellas');

const FUENTE = path.join(__dirname, '..', '..', 'frontend', 'public', 'legacy', 'js', 'datos-reales.js');
const CLASES = ['Oficial · sede', 'Oficial · principal', 'No oficial', 'Oficial · confesión religiosa', 'Oficial · régimen especial', 'Cobertura contratada'];
const OFICIAL = new Set([0, 1, 3, 4]);

function leerFuente() {
  const codigo = fs.readFileSync(FUENTE, 'utf8');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(codigo, ctx);
  return { D: ctx.window.EDU_DATA, huella: sha256(codigo) };
}

async function sembrar({ silencioso = false } = {}) {
  const { D, huella } = leerFuente();
  const comunas = new Map(D.C.map(c => [c[0], c[1]])), barrios = new Map(D.B.map(b => [b[0], b[1]]));
  const filas = D.S.map((r, i) => {
    const g = r[7].split('.').map(Number), principal = !r[1];
    return {
      codigo: 'S' + String(i + 1).padStart(3, '0'), nombre: r[1] || D.E[r[0]], institucion: principal ? null : D.E[r[0]],
      sector: OFICIAL.has(r[2]) ? 'oficial' : 'no_oficial', clase: CLASES[r[2]] || null,
      barrio: barrios.get(r[4]) || null, comuna: comunas.get(r[3]) ? `${r[3]} · ${comunas.get(r[3])}` : null,
      municipio: 'Medellín', departamento: 'Antioquia', latitud: r[5] / 1e5, longitud: r[6] / 1e5,
      estudiantes: g.reduce((a, b) => a + b, 0),
      descripcion: `${principal ? 'Sede principal. ' : ''}Fuente: GeoMedellín, capa Sedes Educativas (vigencia 2024). Matrícula de 0° a 11°.`
    };
  });
  const n = await transaccion(async c => {
    let nuevas = 0;
    for (const f of filas) {
      const cols = Object.keys(f);
      const { rows } = await c.query(`INSERT INTO instituciones (${cols.join(',')}) VALUES (${cols.map((_, k) => '$' + (k + 1)).join(',')}) ON CONFLICT (codigo) DO NOTHING RETURNING id`, cols.map(k => f[k]));
      if (rows.length) { nuevas++; await bitacora.registrar(c, { usuario: 'carga-inicial', accion: 'INSTITUCION_IMPORTADA', entidad: 'institucion', entidadId: rows[0].id, datos: Object.assign({ fuente: 'GeoMedellín 2024', huella_fuente: huella }, f) }); }
    }
    return nuevas;
  });
  if (!silencioso) console.log(`${n} instituciones nuevas cargadas (${filas.length - n} ya existían).`);
  return n;
}

if (require.main === module) {
  migrar({ silencioso: true }).then(() => sembrar()).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(cerrar);
}
module.exports = { sembrar };
