/* Familias de artículos y clasificación mobiliario / eléctrico.
   Port fiel de app/importers/normalization.py de la aplicación de reintegros existente,
   para que las cifras por objeto y por categoría coincidan entre ambos sistemas. */

const FAMILIAS = [
  ['COMPUTADOR PORTATIL', ['COMPUTADOR PORTATIL', 'PORTATIL', 'LAPTOP']],
  ['BASE PARA MICROFONO', ['BASE MICROFONO', 'BASE PARA MICROFONO']],
  ['SOPORTE PARA TELEVISOR', ['SOPORTE PARA TV', 'SOPORTE PARA T V', 'SOPORTE PARA TELEVISOR']],
  ['SILLA', ['SILLA', 'SILLON', 'SIILLA']],
  ['PUPITRE', ['PUPITRE']],
  ['PUESTO DE TRABAJO', ['PUESTO DE TRABAJO', 'PUESTOS DE TRABAJO']],
  ['BUTACO / TABURETE', ['BUTACO', 'BUTACA', 'TABURETE']],
  ['TABLERO', ['TABLERO']],
  ['MESA', ['MESA', 'MESON']],
  ['ESCRITORIO', ['ESCRITORIO', 'ESCRITORO']],
  ['TABLET', ['TABLET', 'TABLETA']],
  ['ESTANTE', ['ESTANTE', 'ESTANTERIA', 'ESTANTER A']],
  ['ARCHIVADOR', ['ARCHIVADOR', 'ARCHIVO', 'FOLDERAMA', 'PLANOTECA']],
  ['LOCKER', ['LOCKER', 'LOKER']],
  ['COMPUTADOR', ['COMPUTADOR', 'COMPUTADORA', 'EQUIPO DE COMPUTO', 'THIN CLIENT', 'CPU', 'PC ']],
  ['MUEBLE', ['MUEBLE']],
  ['COMODA', ['COMODA']],
  ['VITRINA', ['VITRINA']],
  ['ARMARIO', ['ARMARIO', 'GABINETE']],
  ['BIBLIOTECA', ['BIBLIOTECA']],
  ['ACCES POINT', ['ACCESS POINT', 'ACCES POINT', 'AP TIPO', 'AP UBIQUITI', 'PUNTO DE ACCESO']],
  ['SWITCH', ['SWITCH', 'SWICH', 'SUICHE']],
  ['ROUTER', ['ROUTER']],
  ['IMPRESORA', ['IMPRESORA']],
  ['MICROFONO', ['MICROFONO']],
  ['MICROSCOPIO', ['MICROSCOPIO']],
  ['CAMARA', ['CAMARA']],
  ['TELEVISOR', ['TELEVISOR', 'TV', 'T V']],
  ['VIDEO BEAM / PROYECTOR', ['VIDEO BEAM', 'VIDEOPROYECTOR', 'VIDEO PROYECTOR', 'PROYECTOR']],
  ['PANTALLA DE PROYECCION', ['PANTALLA DE PROYECCION', 'PANTALLA PROYECCION', 'PANTALLA PARA PROYECCION']],
  ['VENTILADOR', ['VENTILADOR']],
  ['PARLANTE / BAFLE', ['PARLANTE', 'BAFLE', 'CABINA ACTIVA', 'CABINA PASIVA']],
  ['AMPLIFICADOR', ['AMPLIFICADOR', 'PLANTA DE AMPLIFICACION']],
  ['GRABADORA', ['GRABADORA', 'RADIOGRABADORA']],
  ['TELEFONO', ['TELEFONO', 'TEL FONO']],
  ['DVD / VHS', ['DVD', 'VHS']],
  ['REGULADOR DE VOLTAJE', ['REGULADOR', 'ACONDICIONADOR DE VOLTAJE', 'FUENTE REGULADORA']],
  ['REFRIGERADOR', ['REFRIGERADOR', 'NEVERA', 'CONGELADOR', 'ENFRIADOR']],
  ['LICUADORA', ['LICUADORA']],
  ['GENERADOR', ['GENERADOR', 'GENERADORE']],
  ['BALANZA', ['BALANZA']],
  ['OSCILOSCOPIO', ['OSCILOSCOPIO', 'OSCILOSCOPIOS']],
  ['CANECAS', ['CANECA', 'CANECAS']],
  ['CARRO', ['CARRO', 'CARRITO']],
  ['CAMILLA', ['CAMILLA', 'CAMILLAS']],
  ['HIDROLAVADORA', ['HIDROLAVADORA']],
  ['BANCADA', ['BANCADA']]
];

const MOBILIARIO = new Set(['SILLA', 'MESA', 'BUTACO / TABURETE', 'ESCRITORIO', 'PUPITRE', 'PUESTO DE TRABAJO', 'TABLERO', 'ESTANTE', 'ARCHIVADOR',
  'LOCKER', 'MUEBLE', 'COMODA', 'VITRINA', 'ARMARIO', 'BIBLIOTECA', 'CANECAS', 'SOPORTE PARA TELEVISOR', 'CARRO', 'CAMILLA', 'BANCADA', 'BASE PARA MICROFONO']);

const PATRONES_MOBILIARIO = ['TOLDO', 'CARTELERA', 'CRISTO DE MADERA', 'ASTAS CON BASE', 'PISCINA', 'PUFF', 'TANDEM', 'TANDEN', 'PANTALLA DE PARED',
  'PANTALLA PARA VIDEO BEAM', 'PANTALLA TRIPODE', 'SOPORTE PARA TV', 'SOPORTE PARA T V', 'SOPORTE DE TV', 'REVISTERO', 'LAVAMANOS', 'ESCALERA', 'PERCHERO',
  'KIT PUNTO ECOLOGICO', 'BASE CABINA', 'MODELO ANATOMICO', 'CUADRO DE ADORNO', 'ESCABILADERO', 'GIMNASIO EN SUPER ESPUMA', 'ATRIL', 'BOTIQUIN', 'RACK',
  'ESQUELETO HUMANO', 'COCHE', 'CABALLETE', 'BUZON', 'GLOBO TERRAQUEO', 'TRIPODE', 'APARATO DIGESTIVO', 'PANTALLA PARA PROYECCION'];

const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const REGEX = FAMILIAS.map(([familia, tokens]) => [familia, tokens.map(t => new RegExp(`(?<![A-Z0-9])${escapar(t.trim())}`))]);
const sinTildes = t => String(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '');

/** Familia del artículo (p. ej. “Silla Rimax azul” → “SILLA”). Igual que normalizar_texto() de la app de reintegros. */
function familia(texto) {
  if (texto == null) return 'SIN DESCRIPCION';
  let t = String(texto).trim();
  if (!t) return 'SIN DESCRIPCION';
  t = sinTildes(t).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'SIN DESCRIPCION';
  for (const [f, regs] of REGEX) if (regs.some(r => r.test(t))) return f;
  return t;
}

/** 'mobiliario' o 'electrico'. Igual que categorizar_articulo(): lo que no es mobiliario se cuenta como eléctrico. */
function categoria(texto) {
  const f = familia(texto);
  if (f === 'COMPUTADOR PORTATIL') return 'electrico';
  if (MOBILIARIO.has(f)) return 'mobiliario';
  const t = sinTildes(String(texto)).toUpperCase();
  if (PATRONES_MOBILIARIO.some(p => t.includes(p))) return 'mobiliario';
  return 'electrico';
}

/** Completa artículo y categoría en registros que aún no los tienen (datos anteriores a la migración 002). */
async function completarArticulos(consultar) {
  const { rows } = await consultar('SELECT id, descripcion FROM reintegros WHERE articulo IS NULL OR categoria IS NULL');
  for (const r of rows) await consultar('UPDATE reintegros SET articulo = $2, categoria = $3 WHERE id = $1', [r.id, familia(r.descripcion), categoria(r.descripcion)]);
  return rows.length;
}

module.exports = { familia, categoria, completarArticulos, FAMILIAS };
