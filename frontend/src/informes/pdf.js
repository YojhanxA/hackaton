/* Reporte en PDF de reintegros, generado en el navegador con jsPDF + jspdf-autotable.
   Usa exactamente los datos del resumen que se ve en pantalla (mismos filtros) y, si se filtró por una
   institución, agrega su ficha. Al final imprime la huella SHA-256 de los datos del informe y el último
   anclaje de la bitácora en blockchain, para que cualquiera pueda comprobar de dónde salieron las cifras.
   Las librerías se cargan solo al pulsar el botón (no pesan en la carga inicial). */
import { api } from '../api/cliente';
import { ESTADOS_REINTEGRO } from '../config';
import { cop, fecha, fechaHora, num } from '../formato';

const CAT = { mobiliario: { t: 'Mobiliario', rgb: [42, 120, 214] }, electrico: { t: 'Eléctrico', rgb: [235, 104, 52] } };
const TINTA = [21, 25, 34], TENUE = [107, 114, 130], LINEA = [215, 219, 227], ACENTO = [90, 67, 201], AZUL_OSCURO = [31, 58, 95];
const M = 15; // margen en mm

function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
async function sha256(texto) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const recortar = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || '');

/**
 * @param r       respuesta de /informes/resumen
 * @param filtros filtros aplicados (los mismos de la pantalla)
 */
export async function generarPdf(r, filtros) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const [institucion, anclajes] = await Promise.all([
    filtros.institucion_id ? api.get('/instituciones/' + filtros.institucion_id).catch(() => null) : null,
    api.get('/auditoria/anclajes').catch(() => null)
  ]);
  const huella = await sha256(canon({ filtros: r.filtros, resumen: r }));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = 0;

  const nuevaPagina = alto => { if (y + alto > H - 22) { doc.addPage(); y = M + 4; } };
  const titulo = t => { nuevaPagina(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...TINTA); doc.text(t, M, y); y += 2; doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 6; };
  const nota = t => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...TENUE); const l = doc.splitTextToSize(t, W - 2 * M); nuevaPagina(l.length * 3.8); doc.text(l, M, y); y += l.length * 3.8 + 2; };
  const tabla = (head, body, opciones = {}) => {
    autoTable(doc, Object.assign({
      startY: y, head: [head], body, margin: { left: M, right: M, bottom: 22 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TINTA, lineColor: LINEA, lineWidth: 0.2 },
      headStyles: { fillColor: AZUL_OSCURO, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 248, 250] }
    }, opciones));
    y = doc.lastAutoTable.finalY + 8;
  };
  /** Barras horizontales dibujadas como vectores (se ven nítidas al imprimir). */
  const barras = (filas, { color = () => ACENTO, ancho = W - 2 * M } = {}) => {
    const et = 62, valW = 18, pista = ancho - et - valW - 4, max = Math.max(1, ...filas.map(f => f.valor)), h = 5.2;
    for (const f of filas) {
      nuevaPagina(h + 1.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(...TINTA);
      doc.text(recortar(f.etiqueta, 44), M, y + 3.6);
      doc.setFillColor(...color(f));
      doc.roundedRect(M + et, y + 0.6, Math.max(0.8, pista * f.valor / max), h - 1.2, 0.8, 0.8, 'F');
      doc.setFont('helvetica', 'bold'); doc.text(num(f.valor), W - M, y + 3.6, { align: 'right' });
      y += h + 1.4;
    }
    y += 4;
  };

  /* ---------- Encabezado ---------- */
  doc.setFillColor(...AZUL_OSCURO); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Informe de reintegros', M, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text('Secretaría de Educación de Medellín · Traza Educativa', M, 21);
  doc.text('Generado: ' + fechaHora(new Date().toISOString()), W - M, 21, { align: 'right' });
  y = 38;

  const f = r.filtros || {};
  const filtrosTxt = [
    `Fechas: ${f.desde ? fecha(f.desde) : 'sin límite'} a ${f.hasta ? fecha(f.hasta) : 'sin límite'}`,
    `Estados: ${f.estado && f.estado.length ? f.estado.map(e => ESTADOS_REINTEGRO[e].t).join(', ') : 'todos'}`,
    f.municipio ? `Municipio: ${f.municipio}` : null, f.categoria ? `Categoría: ${CAT[f.categoria].t}` : null,
    f.articulo ? `Objeto: ${f.articulo}` : null, institucion ? `Institución: ${institucion.nombre}` : null, f.q ? `Búsqueda: “${f.q}”` : null
  ].filter(Boolean).join('   ·   ');
  nota('Filtros aplicados — ' + filtrosTxt);

  /* ---------- Cifras clave ---------- */
  const elementos = Object.values(r.por_estado).reduce((s, e) => s + e.elementos, 0);
  const cat = Object.fromEntries(r.por_categoria.map(c => [c.categoria, c]));
  const kpis = [
    ['Registros', num(r.total_registros)], ['Elementos', num(elementos)], ['Realizados', num(r.realizados.n)],
    ['Pendientes', num(r.por_estado.pendiente.n)], ['Mobiliario', num(cat.mobiliario.elementos)], ['Eléctrico', num(cat.electrico.elementos)]
  ];
  const kw = (W - 2 * M - 5 * 3) / 6;
  kpis.forEach(([t, v], k) => {
    const x = M + k * (kw + 3);
    doc.setDrawColor(...LINEA); doc.setFillColor(250, 250, 252); doc.roundedRect(x, y, kw, 17, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TENUE); doc.text(t.toUpperCase(), x + 2.5, y + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TINTA); doc.text(v, x + 2.5, y + 13);
  });
  y += 24;
  nota(`Valor de los reintegros realizados: ${cop(r.realizados.valor)}. Los pendientes, rechazados y anulados se cuentan aparte y no suman como realizados.`);

  /* ---------- Institución (si se filtró por una) ---------- */
  if (institucion) {
    titulo('Información de la institución');
    tabla(['Dato', 'Valor'], [
      ['Nombre', institucion.nombre], ['Código', institucion.codigo], ['Institución principal', institucion.institucion || '—'],
      ['Sector', institucion.sector === 'oficial' ? 'Oficial' : institucion.sector === 'no_oficial' ? 'No oficial' : '—'],
      ['Dirección', institucion.direccion || '—'], ['Barrio / comuna', [institucion.barrio, institucion.comuna].filter(Boolean).join(' · ') || '—'],
      ['Municipio', `${institucion.municipio}, ${institucion.departamento}`], ['Estudiantes (matrícula)', num(institucion.estudiantes)],
      ['Coordenadas', institucion.latitud != null ? `${institucion.latitud}, ${institucion.longitud}` : 'Sin coordenadas'],
      ['Reintegros (sin anulados)', `${num(institucion.reintegros.n)} registros · ${num(institucion.reintegros.elementos)} elementos · ${num(institucion.reintegros.pendientes)} pendientes`]
    ], { columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' } } });
  }

  /* ---------- Mobiliario frente a eléctrico ---------- */
  titulo('Mobiliario frente a eléctrico');
  const totalCat = cat.mobiliario.elementos + cat.electrico.elementos;
  if (totalCat > 0) {
    const ancho = W - 2 * M, wM = ancho * cat.mobiliario.elementos / totalCat;
    doc.setFillColor(...CAT.mobiliario.rgb); doc.rect(M, y, Math.max(0, wM - 0.5), 7, 'F');
    doc.setFillColor(...CAT.electrico.rgb); doc.rect(M + wM + 0.5, y, Math.max(0, ancho - wM - 0.5), 7, 'F');
    y += 12;
  }
  const pct = v => (totalCat ? (Math.round(v / totalCat * 1000) / 10).toLocaleString('es-CO') + ' %' : '—');
  tabla(['Categoría', 'Registros', 'Elementos', '% de elementos'], ['mobiliario', 'electrico'].map(k => [CAT[k].t, num(cat[k].registros), num(cat[k].elementos), pct(cat[k].elementos)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didDrawCell: d => { if (d.section === 'body' && d.column.index === 0) { const k = d.row.index ? 'electrico' : 'mobiliario'; doc.setFillColor(...CAT[k].rgb); doc.rect(d.cell.x + d.cell.width - 5, d.cell.y + d.cell.height / 2 - 1.5, 3, 3, 'F'); } } });

  /* ---------- Top 10 instituciones ---------- */
  titulo('Top 10 de instituciones con más reintegros');
  barras(r.top_instituciones.map(x => ({ etiqueta: x.institucion, valor: x.n })));
  tabla(['#', 'Institución', 'Registros', 'Elementos', 'Mobiliario', 'Eléctrico', 'Pendientes'],
    r.top_instituciones.map((x, k) => [k + 1, recortar(x.institucion, 60), num(x.n), num(x.elementos), num(x.mobiliario), num(x.electrico), num(x.pendientes)]),
    { columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });

  /* ---------- Objetos ---------- */
  titulo('Lo que más se reintegra (elementos por objeto)');
  const top = r.por_articulo.slice(0, 15);
  barras(top.map(x => ({ etiqueta: x.articulo, valor: x.elementos, categoria: x.categoria })), { color: x => CAT[x.categoria]?.rgb || ACENTO });
  nota('Color de la barra: azul = mobiliario, naranja = eléctrico.');
  tabla(['Objeto (familia)', 'Categoría', 'Registros', 'Elementos'], r.por_articulo.slice(0, 40).map(x => [x.articulo, CAT[x.categoria]?.t || '—', num(x.registros), num(x.elementos)]),
    { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } } });
  if (r.por_articulo.length > 40) nota(`Se muestran 40 de ${num(r.por_articulo.length)} objetos distintos. El Excel trae la lista completa (hoja “Por objeto”).`);

  /* ---------- Estados y municipios ---------- */
  titulo('Por estado');
  tabla(['Estado', 'Registros', 'Elementos', 'Valor'], Object.keys(ESTADOS_REINTEGRO).map(e => [ESTADOS_REINTEGRO[e].t, num(r.por_estado[e].n), num(r.por_estado[e].elementos), cop(r.por_estado[e].valor)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  titulo('Por municipio');
  tabla(['Municipio', 'Registros', 'Realizados', 'Valor realizado'], r.por_municipio.map(x => [x.municipio, num(x.n), num(x.realizados), cop(x.valor_realizado)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });

  /* ---------- Trazabilidad ---------- */
  titulo('Trazabilidad');
  const anc = anclajes && anclajes.datos && anclajes.datos[0];
  nota(`Huella SHA-256 de los datos de este informe: ${huella}`);
  nota(anc
    ? `Último anclaje de la bitácora en blockchain: ${num(anc.n_eventos)} eventos, raíz ${anc.raiz}, red ${anc.red} (chain id ${anc.chain_id}), contrato ${anc.contrato}, transacción ${anc.tx_hash} (${fechaHora(anc.creado_en)}). ${anc.coincide_local ? 'La bitácora actual sigue coincidiendo con esa raíz.' : 'ATENCIÓN: la bitácora actual ya no coincide con esa raíz.'}`
    : 'La bitácora todavía no se ha anclado en blockchain. Hazlo desde el módulo Trazabilidad.');

  /* ---------- Pie de página ---------- */
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINEA); doc.line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TENUE);
    doc.text('Traza Educativa Medellín · Datos: reintegros de la Secretaría de Educación; sedes de GeoMedellín.', M, H - 9);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 9, { align: 'right' });
  }
  const sufijo = [f.desde, f.hasta].filter(Boolean).join('_a_') || new Date().toISOString().slice(0, 10);
  doc.save(`informe_reintegros_${sufijo}.pdf`);
  return { paginas, huella };
}
