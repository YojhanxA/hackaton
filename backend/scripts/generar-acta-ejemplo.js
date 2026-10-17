/* Genera docs/ejemplos/acta_reintegro_EJEMPLO.xlsx: un archivo de EJEMPLO con el formato de las actas
   de reintegro (dependencia, día/mes/año, placa, cantidad, artículo) para probar la importación.
   Los datos son ficticios y el archivo lo dice en su primera fila. */
const path = require('path');
const ExcelJS = require('exceljs');

const ACTAS = [
  ['I.E. Guadalupe', 3, 'octubre', 2026, [['70011', 12, 'Silla universitaria en polipropileno'], ['70012', 6, 'Mesa trapezoidal'], ['70013', 2, 'Computador de escritorio Lenovo'], ['70014', 1, 'Video beam Epson']]],
  ['Institución Educativa San Benito', 6, 'octubre', 2026, [['80021', 20, 'Pupitre unipersonal'], ['80022', 1, 'Televisor LED 55"'], ['80023', 3, 'Ventilador de pedestal'], ['80024', 2, 'Estante metálico']]],
  ['Institucion Educativa Concejo De Medellin', 8, 'octubre', 2026, [['90031', 4, 'Computador portátil HP'], ['90032', 1, 'Access point Ubiquiti'], ['90033', 8, 'Silla interlocutora'], ['90034', 1, 'Tablero acrílico']]],
  ['Institucion Educativa Villa De La Candelaria', 9, 'octubre', 2026, [['91041', 2, 'Impresora multifuncional'], ['91042', 10, 'Pupitre bipersonal'], ['91043', 1, 'Archivador de 4 gavetas']]]
];

(async () => {
  const wb = new ExcelJS.Workbook();
  for (const [dep, d, m, a, filas] of ACTAS) {
    const h = wb.addWorksheet(dep.replace(/[^A-Za-z ]/g, '').slice(0, 28));
    h.addRows([
      ['ARCHIVO DE EJEMPLO (datos ficticios) · Acta de reintegro de bienes'],
      ['Dependencia', null, 'Día', 'Mes', 'Año'],
      [dep, null, d, m, a],
      [],
      ['Placa', 'Cantidad', 'Artículo', 'Observación'],
      ...filas.map(f => [...f, 'Para recoger'])
    ]);
    h.getColumn(1).width = 44; h.getColumn(3).width = 40;
    h.getRow(5).font = { bold: true };
  }
  const salida = path.join(__dirname, '..', '..', 'docs', 'ejemplos', 'acta_reintegro_EJEMPLO.xlsx');
  await wb.xlsx.writeFile(salida);
  console.log('Generado', salida);
})();
