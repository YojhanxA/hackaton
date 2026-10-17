/* Estadísticas y exportación a Excel de reintegros. Todo se calcula en la base con los mismos
   filtros de la consulta. Los estados se cuentan por separado: un reintegro pendiente, rechazado
   o anulado NO se cuenta como realizado. */
const ExcelJS = require('exceljs');
const { consultar } = require('../db/pool');
const F = require('./filtrosReintegros');
const { ErrorApp } = require('../middleware/errores');

const ETQ = { pendiente: 'Pendiente', realizado: 'Realizado', rechazado: 'Rechazado', anulado: 'Anulado' };
const CAT = { mobiliario: 'Mobiliario', electrico: 'Eléctrico' };
const MAX_FILAS_EXCEL = 50000;
const DIA = 86400000;

const sumarDias = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);

async function totalesPorEstado(f) {
  const { where, params } = F.construir(f);
  const { rows } = await consultar(`SELECT r.estado, count(*) AS n, coalesce(sum(r.cantidad), 0) AS elementos, coalesce(sum(r.valor), 0) AS valor,
      count(r.valor) AS con_valor ${F.FROM}${where} GROUP BY r.estado`, params);
  const o = {};
  for (const e of F.ESTADOS) o[e] = { n: 0, elementos: 0, valor: 0, con_valor: 0 };
  for (const x of rows) o[x.estado] = { n: x.n, elementos: Number(x.elementos), valor: Number(x.valor), con_valor: x.con_valor };
  return o;
}

async function resumen(f) {
  const { where, params } = F.construir(f);
  const porEstado = await totalesPorEstado(f);
  const [periodo, institucion, municipio, top, articulo, cat] = await Promise.all([
    consultar(`SELECT substr(CAST(r.fecha_reintegro AS TEXT), 1, 7) AS periodo, r.estado, count(*) AS n, coalesce(sum(r.valor), 0) AS valor
      ${F.FROM}${where} GROUP BY 1, 2 ORDER BY 1`, params),
    consultar(`SELECT coalesce(i.nombre, r.institucion_texto, 'Sin institución') AS institucion, r.institucion_id, count(*) AS n,
      count(*) FILTER (WHERE r.estado = 'realizado') AS realizados, coalesce(sum(r.valor) FILTER (WHERE r.estado = 'realizado'), 0) AS valor_realizado
      ${F.FROM}${where} GROUP BY 1, 2 ORDER BY realizados DESC, n DESC, 1 LIMIT 15`, params),
    consultar(`SELECT coalesce(i.municipio, 'Sin institución asociada') AS municipio, count(*) AS n,
      count(*) FILTER (WHERE r.estado = 'realizado') AS realizados, coalesce(sum(r.valor) FILTER (WHERE r.estado = 'realizado'), 0) AS valor_realizado
      ${F.FROM}${where} GROUP BY 1 ORDER BY n DESC, 1`, params),
    // Top 10 de instituciones con más reintegros (registros), con elementos por categoría
    consultar(`SELECT coalesce(i.nombre, r.institucion_texto, 'Sin institución') AS institucion, r.institucion_id, i.codigo AS institucion_codigo,
      count(*) AS n, coalesce(sum(r.cantidad), 0) AS elementos,
      coalesce(sum(r.cantidad) FILTER (WHERE r.categoria = 'mobiliario'), 0) AS mobiliario,
      coalesce(sum(r.cantidad) FILTER (WHERE r.categoria = 'electrico'), 0) AS electrico,
      count(*) FILTER (WHERE r.estado = 'pendiente') AS pendientes
      ${F.FROM}${where} GROUP BY 1, 2, 3 ORDER BY n DESC, elementos DESC, 1 LIMIT 10`, params),
    // Cantidad de cada objeto (familia del artículo)
    consultar(`SELECT coalesce(r.articulo, 'SIN DESCRIPCION') AS articulo, coalesce(r.categoria, 'electrico') AS categoria,
      count(*) AS registros, coalesce(sum(r.cantidad), 0) AS elementos
      ${F.FROM}${where} GROUP BY 1, 2 ORDER BY elementos DESC, registros DESC, 1`, params),
    consultar(`SELECT coalesce(r.categoria, 'electrico') AS categoria, count(*) AS registros, coalesce(sum(r.cantidad), 0) AS elementos
      ${F.FROM}${where} GROUP BY 1`, params)
  ]);
  const mapaPeriodos = new Map();
  for (const x of periodo.rows) {
    if (!mapaPeriodos.has(x.periodo)) mapaPeriodos.set(x.periodo, Object.assign({ periodo: x.periodo, total: 0, valor_realizado: 0 }, Object.fromEntries(F.ESTADOS.map(e => [e, 0]))));
    const p = mapaPeriodos.get(x.periodo); p[x.estado] = x.n; p.total += x.n;
    if (x.estado === 'realizado') p.valor_realizado = Number(x.valor);
  }
  const total = F.ESTADOS.reduce((s, e) => s + porEstado[e].n, 0);

  // Comparación con el período anterior de igual duración (solo si hay fecha inicial y final)
  let comparacion = null;
  if (f.desde && f.hasta) {
    const dias = Math.round((Date.parse(f.hasta) - Date.parse(f.desde)) / DIA) + 1;
    const ant = { desde: sumarDias(f.desde, -dias), hasta: sumarDias(f.desde, -1) };
    const pe = await totalesPorEstado(Object.assign({}, f, ant));
    const actual = { desde: f.desde, hasta: f.hasta, realizados: porEstado.realizado.n, valor_realizado: porEstado.realizado.valor, registros: total };
    const anterior = Object.assign(ant, { realizados: pe.realizado.n, valor_realizado: pe.realizado.valor, registros: F.ESTADOS.reduce((s, e) => s + pe[e].n, 0) });
    const vari = (a, b) => (b === 0 ? null : Math.round((a - b) / b * 1000) / 10);
    comparacion = { dias, actual, anterior, variacion_realizados_pct: vari(actual.realizados, anterior.realizados), variacion_valor_pct: vari(actual.valor_realizado, anterior.valor_realizado) };
  }
  return {
    filtros: f, total_registros: total, por_estado: porEstado,
    realizados: { n: porEstado.realizado.n, elementos: porEstado.realizado.elementos, valor: porEstado.realizado.valor, con_valor: porEstado.realizado.con_valor },
    por_periodo: [...mapaPeriodos.values()],
    por_institucion: institucion.rows.map(x => Object.assign(x, { valor_realizado: Number(x.valor_realizado) })),
    por_municipio: municipio.rows.map(x => Object.assign(x, { valor_realizado: Number(x.valor_realizado) })),
    top_instituciones: top.rows,
    por_articulo: articulo.rows,
    articulos_distintos: articulo.rows.length,
    por_categoria: ['mobiliario', 'electrico'].map(k => Object.assign({ categoria: k, registros: 0, elementos: 0 }, cat.rows.find(x => x.categoria === k))),
    comparacion
  };
}

async function articulosPorInstitucion(f, pagina = 1, porPagina = 20) {
  const { where, params } = F.construir(f);
  const grupo = `coalesce(i.nombre, r.institucion_texto, 'Sin institución'), coalesce(r.articulo, 'SIN DESCRIPCION'), coalesce(r.categoria, 'electrico')`;
  const [datos, total] = await Promise.all([
    consultar(`SELECT coalesce(i.nombre, r.institucion_texto, 'Sin institución') AS institucion, r.institucion_id,
        coalesce(r.articulo, 'SIN DESCRIPCION') AS articulo, coalesce(r.categoria, 'electrico') AS categoria,
        count(*) AS registros, coalesce(sum(r.cantidad), 0) AS elementos
      ${F.FROM}${where} GROUP BY ${grupo}, r.institucion_id
      ORDER BY elementos DESC, registros DESC, institucion, articulo LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, params),
    consultar(`SELECT count(*) AS n FROM (
        SELECT r.institucion_id, ${grupo}
        ${F.FROM}${where} GROUP BY ${grupo}, r.institucion_id
      ) AS articulos_agrupados`, params)
  ]);
  return {
    datos: datos.rows.map(x => Object.assign(x, { registros: Number(x.registros), elementos: Number(x.elementos) })),
    total: Number(total.rows[0].n), pagina, por_pagina: porPagina
  };
}

async function institucionesConReintegros(f = {}) {
  const { where, params } = F.construir(f);
  const { rows } = await consultar(`SELECT r.institucion_id AS id,
      coalesce(i.nombre, r.institucion_texto, 'Sin institución') AS nombre,
      i.codigo, i.municipio, count(*) AS registros, coalesce(sum(r.cantidad), 0) AS elementos
    FROM reintegros r LEFT JOIN instituciones i ON i.id = r.institucion_id
  ${where}
    GROUP BY 1, 2, 3, 4
    ORDER BY nombre`, params);
  return rows.map(x => Object.assign(x, { registros: Number(x.registros), elementos: Number(x.elementos) }));
}

/* ---------- Excel ---------- */
const fechaExcel = iso => (iso ? new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) : null);
const horaBogota = ts => (ts ? new Date(new Date(ts).getTime() - 5 * 3600000) : null); // Excel no maneja zonas: se escribe la hora local
const ENCABEZADO = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }, alignment: { vertical: 'middle', wrapText: true } };
const PESOS = '"$" #,##0';

function tabla(hoja, fila, titulo, columnas, datos) {
  hoja.getCell(fila, 1).value = titulo; hoja.getCell(fila, 1).font = { bold: true, size: 12 };
  fila++;
  columnas.forEach((c, k) => { const cel = hoja.getCell(fila, k + 1); cel.value = c.t; Object.assign(cel, { font: ENCABEZADO.font, fill: ENCABEZADO.fill, alignment: ENCABEZADO.alignment }); });
  for (const d of datos) {
    fila++;
    columnas.forEach((c, k) => { const cel = hoja.getCell(fila, k + 1); cel.value = d[c.k] ?? null; if (c.fmt) cel.numFmt = c.fmt; });
  }
  return fila + 2;
}

async function excel(f) {
  const { where, params } = F.construir(f);
  const { rows: [{ n }] } = await consultar(`SELECT count(*) AS n ${F.FROM}${where}`, params);
  if (n > MAX_FILAS_EXCEL) throw new ErrorApp(400, `La exportación tiene ${n} registros. Filtra para dejar como máximo ${MAX_FILAS_EXCEL}.`);
  const [det, res] = await Promise.all([consultar(`SELECT ${F.COLUMNAS} ${F.FROM}${where} ORDER BY r.fecha_reintegro, r.id`, params), resumen(f)]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Traza Educativa Medellín'; wb.created = new Date();

  // Hoja 1: Resumen
  const h1 = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  h1.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }];
  h1.getCell('A1').value = 'Informe de reintegros'; h1.getCell('A1').font = { bold: true, size: 16 };
  h1.getCell('A2').value = 'Generado'; h1.getCell('B2').value = horaBogota(new Date()); h1.getCell('B2').numFmt = 'dd/mm/yyyy hh:mm';
  const filtrosTxt = [['Fecha inicial', f.desde ? fechaExcel(f.desde) : 'Sin límite'], ['Fecha final', f.hasta ? fechaExcel(f.hasta) : 'Sin límite'],
    ['Estados', f.estado && f.estado.length ? f.estado.map(e => ETQ[e]).join(', ') : 'Todos'], ['Institución (id)', f.institucion_id || 'Todas'],
    ['Municipio', f.municipio || 'Todos'], ['Categoría', CAT[f.categoria] || 'Todas'], ['Objeto', f.articulo || 'Todos'], ['Búsqueda', f.q || '—']];
  let fila = 4;
  h1.getCell(fila, 1).value = 'Filtros aplicados'; h1.getCell(fila, 1).font = { bold: true, size: 12 };
  for (const [k, v] of filtrosTxt) { fila++; h1.getCell(fila, 1).value = k; const c = h1.getCell(fila, 2); c.value = v; if (v instanceof Date) c.numFmt = 'dd/mm/yyyy'; }
  fila += 2;
  fila = tabla(h1, fila, 'Totales por estado', [{ t: 'Estado', k: 'estado' }, { t: 'Registros', k: 'n', fmt: '#,##0' }, { t: 'Elementos', k: 'elementos', fmt: '#,##0' }, { t: 'Valor', k: 'valor', fmt: PESOS }],
    [...F.ESTADOS.map(e => Object.assign({ estado: ETQ[e] }, res.por_estado[e])), { estado: 'Total', n: res.total_registros, elementos: F.ESTADOS.reduce((s, e) => s + res.por_estado[e].elementos, 0), valor: F.ESTADOS.reduce((s, e) => s + res.por_estado[e].valor, 0) }]);
  h1.getCell(fila - 1, 1).value = 'Los reintegros realizados se cuentan aparte: pendientes, rechazados y anulados no suman como realizados.'; h1.getCell(fila - 1, 1).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  if (res.comparacion) {
    const c = res.comparacion;
    fila = tabla(h1, fila, `Comparación con el período anterior (${c.dias} días)`, [{ t: 'Período', k: 'p' }, { t: 'Desde', k: 'desde', fmt: 'dd/mm/yyyy' }, { t: 'Hasta', k: 'hasta', fmt: 'dd/mm/yyyy' }, { t: 'Realizados', k: 'realizados', fmt: '#,##0' }, { t: 'Valor realizado', k: 'valor_realizado', fmt: PESOS }],
      [{ p: 'Actual', desde: fechaExcel(c.actual.desde), hasta: fechaExcel(c.actual.hasta), realizados: c.actual.realizados, valor_realizado: c.actual.valor_realizado },
        { p: 'Anterior', desde: fechaExcel(c.anterior.desde), hasta: fechaExcel(c.anterior.hasta), realizados: c.anterior.realizados, valor_realizado: c.anterior.valor_realizado },
        { p: 'Variación', realizados: c.variacion_realizados_pct == null ? null : c.variacion_realizados_pct / 100, valor_realizado: c.variacion_valor_pct == null ? null : c.variacion_valor_pct / 100 }]);
    h1.getCell(fila - 2, 4).numFmt = '0.0%'; h1.getCell(fila - 2, 5).numFmt = '0.0%'; // fila de variación
  }
  fila = tabla(h1, fila, 'Reintegros por período (mes)', [{ t: 'Mes', k: 'periodo' }, { t: 'Realizados', k: 'realizado', fmt: '#,##0' }, { t: 'Pendientes', k: 'pendiente', fmt: '#,##0' }, { t: 'Rechazados', k: 'rechazado', fmt: '#,##0' }, { t: 'Anulados', k: 'anulado', fmt: '#,##0' }, { t: 'Total', k: 'total', fmt: '#,##0' }, { t: 'Valor realizado', k: 'valor_realizado', fmt: PESOS }], res.por_periodo);
  fila = tabla(h1, fila, 'Por institución (15 con más reintegros realizados)', [{ t: 'Institución', k: 'institucion' }, { t: 'Registros', k: 'n', fmt: '#,##0' }, { t: 'Realizados', k: 'realizados', fmt: '#,##0' }, { t: 'Valor realizado', k: 'valor_realizado', fmt: PESOS }], res.por_institucion);
  fila = tabla(h1, fila, 'Mobiliario frente a eléctrico', [{ t: 'Categoría', k: 'c' }, { t: 'Registros', k: 'registros', fmt: '#,##0' }, { t: 'Elementos', k: 'elementos', fmt: '#,##0' }],
    res.por_categoria.map(x => Object.assign({ c: CAT[x.categoria] }, x)));
  fila = tabla(h1, fila, 'Top 10 de instituciones con más reintegros', [{ t: 'Institución', k: 'institucion' }, { t: 'Registros', k: 'n', fmt: '#,##0' }, { t: 'Elementos', k: 'elementos', fmt: '#,##0' }, { t: 'Mobiliario', k: 'mobiliario', fmt: '#,##0' }, { t: 'Eléctrico', k: 'electrico', fmt: '#,##0' }, { t: 'Pendientes', k: 'pendientes', fmt: '#,##0' }], res.top_instituciones);
  tabla(h1, fila, 'Por municipio', [{ t: 'Municipio', k: 'municipio' }, { t: 'Registros', k: 'n', fmt: '#,##0' }, { t: 'Realizados', k: 'realizados', fmt: '#,##0' }, { t: 'Valor realizado', k: 'valor_realizado', fmt: PESOS }], res.por_municipio);

  // Hoja 2: Por objeto (todas las familias de artículos)
  const h3 = wb.addWorksheet('Por objeto', { views: [{ state: 'frozen', ySplit: 1 }] });
  h3.columns = [{ header: 'Objeto (familia)', key: 'articulo', width: 34 }, { header: 'Categoría', key: 'c', width: 14 }, { header: 'Registros', key: 'registros', width: 12, style: { numFmt: '#,##0' } }, { header: 'Elementos', key: 'elementos', width: 12, style: { numFmt: '#,##0' } }];
  for (const x of res.por_articulo) h3.addRow({ articulo: x.articulo, c: CAT[x.categoria], registros: x.registros, elementos: x.elementos });
  h3.getRow(1).eachCell(c => Object.assign(c, { font: ENCABEZADO.font, fill: ENCABEZADO.fill, alignment: ENCABEZADO.alignment }));

  // Hoja 3: Detalle
  const h2 = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  h2.columns = [
    { header: 'Código', key: 'codigo', width: 12 }, { header: 'Fecha del reintegro', key: 'fecha', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Estado', key: 'estado', width: 12 }, { header: 'Institución', key: 'institucion', width: 40 }, { header: 'Código institución', key: 'inst_codigo', width: 14 },
    { header: 'Municipio', key: 'municipio', width: 14 }, { header: 'Placa', key: 'placa', width: 16 }, { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Objeto (familia)', key: 'articulo', width: 24 }, { header: 'Categoría', key: 'categoria', width: 12 },
    { header: 'Cantidad', key: 'cantidad', width: 10, style: { numFmt: '#,##0' } }, { header: 'Valor', key: 'valor', width: 16, style: { numFmt: PESOS } },
    { header: 'Referencia o soporte', key: 'referencia', width: 22 }, { header: 'Observaciones', key: 'observaciones', width: 36 },
    { header: 'Registrado por', key: 'creado_por', width: 22 }, { header: 'Creado', key: 'creado', width: 17, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
    { header: 'Última actualización', key: 'actualizado', width: 17, style: { numFmt: 'dd/mm/yyyy hh:mm' } }
  ];
  for (const x of det.rows) {
    h2.addRow({ codigo: x.codigo, fecha: fechaExcel(x.fecha_reintegro), estado: ETQ[x.estado], institucion: x.institucion_nombre || x.institucion_texto || '', inst_codigo: x.institucion_codigo || '',
      municipio: x.institucion_municipio || '', placa: x.placa || '', descripcion: x.descripcion, articulo: x.articulo || '', categoria: CAT[x.categoria] || '', cantidad: x.cantidad, valor: x.valor, referencia: x.referencia_soporte || '',
      observaciones: x.observaciones || '', creado_por: x.creado_por_nombre || '', creado: horaBogota(x.creado_en), actualizado: horaBogota(x.actualizado_en) });
  }
  const enc = h2.getRow(1); enc.height = 30;
  enc.eachCell(c => Object.assign(c, { font: ENCABEZADO.font, fill: ENCABEZADO.fill, alignment: ENCABEZADO.alignment }));
  h2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h2.columns.length } };
  return { buffer: await wb.xlsx.writeBuffer(), filas: det.rows.length };
}

module.exports = { resumen, articulosPorInstitucion, institucionesConReintegros, excel, ETQ, CAT };
