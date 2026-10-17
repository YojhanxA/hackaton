const assert = require('node:assert/strict');
const { test } = require('node:test');
const ExcelJS = require('exceljs');
const { fechaDeNombreArchivo, procesar } = require('../src/servicios/importador');

test('extracts complete dates from common filename formats', () => {
  assert.equal(fechaDeNombreArchivo('ACTA_REINTEGRO_15-03-2026.xlsx'), '2026-03-15');
  assert.equal(fechaDeNombreArchivo('reintegro_2026.03.15.xlsx'), '2026-03-15');
  assert.equal(fechaDeNombreArchivo('Reintegro 15 de marzo de 2026.xlsx'), '2026-03-15');
  assert.equal(fechaDeNombreArchivo('Reintegro marzo 15 de 2026.xlsx'), '2026-03-15');
  assert.equal(fechaDeNombreArchivo('Reintegro marzo 2026.xlsx'), null);
  assert.equal(fechaDeNombreArchivo('Acta 31-02-2026.xlsx'), null);
});

test('uses filename date when the worksheet has no date', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Acta');
  sheet.addRow(['DEPENDENCIA', 'Institución de prueba']);
  sheet.addRow(['PLACA', 'CANTIDAD', 'ARTICULO']);
  sheet.addRow(['PL-001', 1, 'Silla de prueba']);
  const buffer = await workbook.xlsx.writeBuffer();
  const resultado = await procesar(buffer, {
    instituciones: [],
    existe: async () => new Set(),
    placasExistentes: async () => new Set(),
    nombreArchivo: 'ACTA_15-03-2026.xlsx',
    maxFilas: 20000
  });

  assert.equal(resultado.validos, 1);
  assert.equal(resultado.fecha_archivo, 1);
  assert.equal(resultado.registros[0].fecha_reintegro, '2026-03-15');
});

test('prefers the worksheet date to the date in the filename', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Acta');
  sheet.addRow(['FECHA', '12/04/2026']);
  sheet.addRow(['PLACA', 'CANTIDAD', 'ARTICULO']);
  sheet.addRow(['PL-001', 1, 'Silla de prueba']);
  const buffer = await workbook.xlsx.writeBuffer();
  const resultado = await procesar(buffer, {
    instituciones: [],
    existe: async () => new Set(),
    placasExistentes: async () => new Set(),
    nombreArchivo: 'ACTA_15-03-2026.xlsx',
    maxFilas: 20000
  });

  assert.equal(resultado.validos, 1);
  assert.equal(resultado.fecha_archivo, 0);
  assert.equal(resultado.registros[0].fecha_reintegro, '2026-04-12');
});
