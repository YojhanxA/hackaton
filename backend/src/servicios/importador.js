/* Lectura de los Excel de reintegros que entrega la Secretaría.
   Port de app/importers/excel_parser.py, row_parser.py y processor.py de la aplicación de reintegros
   existente, para que un mismo archivo dé el mismo resultado en los dos sistemas:
   - En cada hoja busca la fila de encabezado: la primera con al menos 3 de placa / cantidad / artículo / fecha.
   - Fecha del acta: etiquetas "día / mes / año" con los valores en la fila siguiente, o una celda "fecha".
   - Si el acta no tiene fecha, acepta una fecha completa en el nombre del archivo.
   - Institución: el valor debajo de la etiqueta "dependencia".
   - Si una hoja no tiene fecha, hereda la fecha más común entre las hojas (si no hay empate).
   - Huella: placa-cantidad-familia-fecha-institución (la misma que usa la creación manual).
   Diferencias deliberadas: solo .xlsx (exceljs no lee el formato binario .xls de Excel 97-2003)
   y una fecha por defecto opcional para filas sin fecha, porque aquí la fecha es obligatoria. */
const ExcelJS = require('exceljs');
const { familia, categoria } = require('./articulos');
const { sha256, normalizarTexto } = require('./huellas');

const sinTildes = v => String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '');
const busqueda = v => sinTildes(v).toLowerCase();
const sinComillas = t => t.replace(/^['"]+|['"]+$/g, '');
const vacio = v => v == null || (typeof v === 'string' && !v.trim());

/** Valor plano de una celda de exceljs (fórmulas, texto enriquecido, hipervínculos). */
function plano(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plano(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return String(v.text);
    return null; // errores (#N/A, #REF!) y valores no reconocidos
  }
  return v;
}

/** Texto como lo vería pandas: los números enteros sin decimales. */
const texto = v => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const iso = (a, m, d) => {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null;
};

/** Igual que _normalizar_fecha: Date, número de serie de Excel o texto dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd. */
function normalizarFecha(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return isNaN(f) || f.getUTCFullYear() > 9999 ? null : f.toISOString().slice(0, 10);
  }
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/^\s*fecha\s*:?\s*/i, '');
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  return null;
}

/** Extrae fechas completas del nombre del archivo; admite formatos numéricos y meses en español. */
function fechaDeNombreArchivo(nombre) {
  const t = sinTildes(String(nombre || '').replace(/\.[^.]+$/, '')).toLowerCase();
  let m = t.match(/(?:^|[^\d])(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?=$|[^\d])/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = t.match(/(?:^|[^\d])(\d{1,2})[-_./\s]+(\d{1,2})[-_./\s]+(\d{4})(?=$|[^\d])/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  const meses = Object.keys(MESES).join('|');
  m = t.match(new RegExp(`(?:^|\\b)(\\d{1,2})\\s*(?:de\\s*)?(${meses})\\s*(?:de\\s*)?(\\d{4})(?=$|\\b)`));
  if (m) return iso(+m[3], MESES[m[2]], +m[1]);

  m = t.match(new RegExp(`(?:^|\\b)(${meses})\\s+(\\d{1,2})\\s+(?:de\\s+)?(\\d{4})(?=$|\\b)`));
  if (m) return iso(+m[3], MESES[m[1]], +m[2]);
  return null;
}

function numeroFecha(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  const t = String(v).trim();
  return /^\d{1,4}$/.test(t) ? parseInt(t, 10) : null;
}

/** _extraer_fecha_desde_hoja */
function fechaDeHoja(filas, h) {
  const ini = Math.max(0, h - 20), fin = Math.min(filas.length, h + 5);
  for (let i = ini; i < fin; i++) {
    const et = (filas[i] || []).map(v => busqueda(v).trim());
    const di = et.findIndex(x => x.includes('dia')), me = et.findIndex(x => x.includes('mes'));
    const an = et.findIndex(x => x.includes('ano') || x.includes('anio') || x.includes('year'));
    if (di < 0 || me < 0 || an < 0 || i + 1 >= filas.length) continue;
    const val = filas[i + 1] || [];
    const d = numeroFecha(val[di]);
    let m = numeroFecha(val[me]);
    if (m == null && val[me] != null) m = MESES[busqueda(val[me]).trim().replace(/\.$/, '')] ?? null;
    let a = numeroFecha(val[an]);
    if (a != null && a >= 0 && a <= 99) a += 2000;
    if (d == null || m == null || a == null || d < 1 || d > 31 || m < 1 || m > 12 || a < 1900 || a > 2100) continue;
    const f = iso(a, m, d);
    if (f) return f;
  }
  for (let i = ini; i < h; i++) {
    const fila = filas[i] || [];
    for (let c = 0; c < fila.length; c++) {
      if (!busqueda(fila[c]).includes('fecha')) continue;
      const cand = [fila[c], fila[c + 1]];
      if (i + 1 < h) cand.push((filas[i + 1] || [])[c], (filas[i + 1] || [])[c + 1]);
      for (const x of cand) { const f = normalizarFecha(x); if (f) return f; }
    }
  }
  return null;
}

/** _extraer_institucion_desde_hoja: el primer valor debajo de la etiqueta "dependencia". */
function institucionDeHoja(filas, h) {
  for (let i = 0; i < h; i++) {
    const fila = filas[i] || [];
    for (let c = 0; c < fila.length; c++) {
      if (!busqueda(fila[c]).trim().includes('dependencia')) continue;
      for (let j = i + 1; j < h; j++) {
        const v = (filas[j] || [])[c];
        if (vacio(v)) continue;
        const t = texto(v).replace(/\s+/g, ' ').trim();
        if (t && !['nan', 'none', 'dependencia'].includes(t.toLowerCase())) return t;
      }
    }
  }
  return null;
}

const ES_DESC = t => ['articulo', 'artículo', 'descripcion', 'desc', 'elemento', 'bien'].some(k => t.includes(k));

function filaEncabezado(filas) {
  for (let i = 0; i < filas.length; i++) {
    const hits = new Set();
    for (const v of filas[i] || []) {
      const t = sinComillas(texto(v)).toLowerCase();
      if (!t) continue;
      if (t.includes('placa')) hits.add('placa');
      if (t.includes('cant')) hits.add('cantidad');
      if (ES_DESC(t)) hits.add('articulo');
      if (t.includes('fecha')) hits.add('fecha');
    }
    if (hits.size >= 3) return i;
  }
  return -1;
}

const ETIQUETAS = new Set(['', 'placa', 'cantidad', 'cant', 'articulo', 'descripcion', 'desc', 'fecha', 'nan', 'none']);
const ETIQ_DESC = new Set(['articulo', 'artículo', 'descripcion', 'desc', 'cantidad', 'cant', 'placa', 'fecha', 'nan', 'none', '']);
const TOKENS = ['placa', 'cantidad', 'articulo', 'descripcion', 'fecha'];
const ERROR_CANTIDAD = 'La cantidad debe ser un entero mayor que cero.';

function cantidad(v) {
  let n;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v)) throw new Error(ERROR_CANTIDAD);
    n = v;
  } else {
    const t = String(v).trim();
    if (/^\d+$/.test(t)) n = parseInt(t, 10);
    else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(t)) n = parseInt(t.replace(/[.,]/g, ''), 10);
    else throw new Error(ERROR_CANTIDAD);
  }
  if (n <= 0 || n > 100000) throw new Error(ERROR_CANTIDAD);
  return n;
}
const limpiarPlaca = p => (p.endsWith('.0') ? p.slice(0, -2) : p);

/** parse_import_row: devuelve { fila } o { omitida: motivo }. */
function leerFila(valores, col) {
  const placa = texto(valores[col.placa]), desc = texto(valores[col.desc]), cant = texto(valores[col.cant]);
  if (['placa', 'nan', 'none', ''].includes(placa.toLowerCase())) return { omitida: 'La fila no contiene una placa válida.', desc };
  if (ETIQ_DESC.has(desc.toLowerCase())) return { omitida: 'La fila no contiene una descripción de artículo.', desc };
  if (['', 'nan', 'none'].includes(cant.toLowerCase())) return { omitida: 'La fila no contiene una cantidad.', desc };
  const p = sinComillas(placa).toLowerCase(), d = sinComillas(desc).toLowerCase(), q = sinComillas(cant).toLowerCase();
  if (TOKENS.some(t => p.includes(t) || d.includes(t) || q.includes(t))) return { omitida: 'La fila parece contener etiquetas del encabezado.', desc };
  return { fila: { placa: limpiarPlaca(placa).slice(0, 100), cantidad: cantidad(valores[col.cant]), descripcion: (desc || 'Sin descripcion').slice(0, 2000) } };
}

/** Lee el libro y devuelve las hojas con su tabla (equivale a _normalizar_fila_excel). */
async function leerHojas(buffer, maxFilas) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) {
    const err = new Error('No se pudo leer el archivo. Debe ser un Excel .xlsx válido (si es .xls, ábrelo en Excel y guárdalo como .xlsx).');
    err.status = 400; throw err;
  }
  const hojas = [];
  let total = 0;
  wb.eachSheet(ws => {
    const filas = [];
    const nCol = Math.min(ws.columnCount, 60);
    for (let r = 1; r <= ws.rowCount; r++) {
      const fila = ws.getRow(r), v = [];
      for (let c = 1; c <= nCol; c++) {
        const cel = fila.getCell(c);
        v.push(cel.isMerged && cel.master !== cel ? null : plano(cel.value)); // como pandas: solo la celda principal de una combinación
      }
      filas.push(v);
    }
    total += filas.length;
    if (total > maxFilas + 1000) { const e = new Error(`El archivo supera ${maxFilas.toLocaleString('es-CO')} filas. Divídelo en varios archivos.`); e.status = 400; throw e; }
    const h = filaEncabezado(filas);
    if (h < 0) return;
    const encabezado = filas[h].map(v => sinComillas(texto(v)));
    const cols = encabezado.map((t, k) => ({ t: t.toLowerCase(), k })).filter(x => x.t);
    const col = {
      placa: cols.find(x => x.t.includes('placa'))?.k, cant: cols.find(x => x.t.includes('cant'))?.k,
      desc: cols.find(x => ES_DESC(x.t))?.k, fecha: cols.find(x => x.t.includes('fecha'))?.k
    };
    const datos = [];
    for (let i = h + 1; i < filas.length; i++) {
      const v = filas[i];
      if (cols.every(x => ETIQUETAS.has(sinComillas(texto(v[x.k])).toLowerCase()))) continue; // filas vacías o encabezados repetidos
      datos.push({ n: i + 1, v });
    }
    if (datos.length) hojas.push({ nombre: ws.name, col, datos, fecha: fechaDeHoja(filas, h), institucion: institucionDeHoja(filas, h) });
  });
  return hojas;
}

/* ---------- Asociación con el catálogo de instituciones ---------- */
const PREFIJOS = /^(institucion educativa|inst educativa|i e|ie|centro educativo|c e|ce|colegio|sede|escuela)\s+/;
const claveInst = t => normalizarTexto(t).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(PREFIJOS, '').trim();

function asociador(instituciones) {
  // Primero por el nombre de la sede; el nombre de la institución principal (campo "institucion" de las
  // sedes secundarias) solo se usa si no hay coincidencia por nombre, porque lo comparten varias sedes.
  const indice = campo => {
    const m = new Map();
    for (const i of instituciones) {
      const k = i[campo] && claveInst(i[campo]);
      if (!k) continue;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(i.id);
    }
    return m;
  };
  const porNombre = indice('nombre'), porInstitucion = indice('institucion');
  const cache = new Map();
  return texto => {
    if (!texto) return null;
    if (cache.has(texto)) return cache.get(texto);
    const k = claveInst(texto);
    const a = porNombre.get(k), b = porInstitucion.get(k);
    const id = a && a.size === 1 ? [...a][0] : !a && b && b.size === 1 ? [...b][0] : null; // solo si la coincidencia es única
    cache.set(texto, id);
    return id;
  };
}

/**
 * Procesa el archivo sin escribir nada. Devuelve el resumen, el detalle por fila y los registros válidos.
 * @param existe(hashes) → Set de huellas que ya están en la base de datos.
 * @param placasExistentes(placas) → Set de "placa|institución" ya registradas (para advertir).
 */
async function procesar(buffer, { instituciones, existe, placasExistentes, fechaPorDefecto, nombreArchivo, maxFilas }) {
  const hojas = await leerHojas(buffer, maxFilas);
  const r = { hojas: hojas.length, filas: 0, validos: 0, duplicados: 0, omitidas: 0, errores: 0, advertencias: 0, fecha_heredada: 0, fecha_archivo: 0, fecha_por_defecto: 0, detalles: [], registros: [] };
  if (!hojas.length) {
    r.errores = 1;
    r.detalles.push({ fila: '-', estado: 'Error', desc: 'No se encontró una tabla con columnas de placa, cantidad y artículo.', motivo: 'Verifica el encabezado de la hoja e inténtalo de nuevo.' });
    return r;
  }
  // Fecha heredada: la más común entre hojas, solo si no hay empate
  const cuenta = new Map();
  for (const h of hojas) if (h.fecha) cuenta.set(h.fecha, (cuenta.get(h.fecha) || 0) + 1);
  let heredada = null;
  if (cuenta.size) { const max = Math.max(...cuenta.values()); const top = [...cuenta].filter(([, n]) => n === max); if (top.length === 1) heredada = top[0][0]; }

  const asociar = asociador(instituciones);
  const fechaArchivo = fechaDeNombreArchivo(nombreArchivo);
  const candidatos = [];
  for (const h of hojas) {
    r.filas += h.datos.length;
    if (h.col.placa == null || h.col.cant == null || h.col.desc == null) {
      for (const d of h.datos) { r.omitidas++; r.detalles.push({ fila: `${h.nombre}:${d.n}`, estado: 'Omitida', desc: '', motivo: 'No se reconocieron las columnas obligatorias de la hoja.' }); }
      continue;
    }
    const institucionId = asociar(h.institucion);
    for (const d of h.datos) {
      const ref = `${h.nombre}:${d.n}`;
      let leida;
      try { leida = leerFila(d.v, h.col); } catch (e) { r.errores++; r.detalles.push({ fila: ref, estado: 'Error', desc: texto(d.v[h.col.desc]), motivo: e.message }); continue; }
      if (leida.omitida) { r.omitidas++; r.detalles.push({ fila: ref, estado: 'Omitida', desc: leida.desc, motivo: leida.omitida }); continue; }
      let fecha = h.fecha, origen = 'acta';
      if (!fecha) { fecha = h.col.fecha != null ? normalizarFecha(d.v[h.col.fecha]) : null; origen = 'fila'; }
      if (!fecha && heredada) { fecha = heredada; origen = 'heredada'; }
      if (!fecha && fechaArchivo) { fecha = fechaArchivo; origen = 'archivo'; }
      if (!fecha && fechaPorDefecto) { fecha = fechaPorDefecto; origen = 'por_defecto'; }
      if (!fecha) { r.omitidas++; r.detalles.push({ fila: ref, estado: 'Omitida', desc: leida.fila.descripcion, motivo: 'La fila no tiene fecha. Indica una fecha por defecto para importarla.' }); continue; }
      const f = leida.fila;
      const hash = sha256(`${f.placa}-${f.cantidad}-${familia(f.descripcion)}-${fecha}-${h.institucion || ''}`);
      candidatos.push({ ref, origen, hash, registro: {
        placa: f.placa.toUpperCase(), cantidad: f.cantidad, descripcion: f.descripcion, articulo: familia(f.descripcion), categoria: categoria(f.descripcion),
        fecha_reintegro: fecha, institucion_texto: h.institucion ? h.institucion.slice(0, 255) : null, institucion_id: institucionId,
        referencia_soporte: `${h.nombre}:${d.n}`.slice(0, 120)
      } });
    }
  }
  const enBase = await existe(candidatos.map(c => c.hash));
  const placas = await placasExistentes([...new Set(candidatos.map(c => c.registro.placa.toLowerCase()))]);
  const vistos = new Set();
  for (const c of candidatos) {
    const g = c.registro;
    if (vistos.has(c.hash) || enBase.has(c.hash)) { r.duplicados++; r.detalles.push({ fila: c.ref, estado: 'Duplicado', desc: g.descripcion, motivo: vistos.has(c.hash) ? 'Repetida dentro del archivo.' : 'Ya está registrada.' }); continue; }
    vistos.add(c.hash);
    const adv = [];
    if (placas.has(`${g.placa.toLowerCase()}|${(g.institucion_texto || '').trim().toLowerCase()}`)) adv.push('La placa ya aparece para esta institución en otro registro; verifica si corresponde a otra entrega.');
    if (!g.institucion_id) adv.push(g.institucion_texto ? 'La dependencia no coincide con una institución del catálogo: queda como texto.' : 'El archivo no indica la dependencia (institución).');
    if (c.origen === 'heredada') r.fecha_heredada++;
    if (c.origen === 'archivo') r.fecha_archivo++;
    if (c.origen === 'por_defecto') r.fecha_por_defecto++;
    r.advertencias += adv.length;
    r.validos++;
    r.registros.push(Object.assign({ hash_registro: c.hash }, g));
    r.detalles.push(Object.assign({ fila: c.ref, estado: 'Ok', desc: g.descripcion, articulo: g.articulo, categoria: g.categoria, fecha: g.fecha_reintegro, institucion: g.institucion_texto }, adv.length ? { advertencia: adv.join(' ') } : {}));
  }
  return r;
}

module.exports = { procesar, leerHojas, normalizarFecha, fechaDeNombreArchivo, filaEncabezado, claveInst };
