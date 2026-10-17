/* =========================================================
   Traza Educativa · DATOS DE EJEMPLO
   Genera, de forma reproducible (misma semilla = mismos datos),
   conectividad, infraestructura TIC, mobiliario, personal y
   reintegros para las sedes OFICIALES, más el historial de
   eventos que alimenta la cadena de trazabilidad.
   Ninguna cifra de este archivo es real: sustitúyalo por las
   fuentes oficiales cuando estén disponibles.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE;
  const DIA = 86400000;
  const dia = (y, m, d) => Date.UTC(y, m, d, 13); // 8:00 a. m. en Bogotá
  const T0 = dia(2025, 1, 3);                      // inicio de la plataforma (3 feb 2025)
  const CORTE = Date.UTC(2026, 9, 13, 22);         // corte de la demo (13 oct 2026, 5 p. m.)
  TE.CORTE = CORTE;
  TE.HACE12M = CORTE - 365 * DIA;

  const ipmMax = d3.max(TE.COMR, c => c.ipm || 0);
  const vulDe = s => { const c = TE.comById.get(s.com); return c && c.ipm != null ? c.ipm / ipmMax : 0.4; };
  const esRural = s => !!(TE.comById.get(s.com) || {}).rural;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const pickW = (r, pares) => { const t = d3.sum(pares, p => p[1]); let x = r() * t; for (const p of pares) { x -= p[1]; if (x <= 0) return p[0]; } return pares[pares.length - 1][0]; };
  const enHorario = (r, t) => t + Math.floor(r() * 9) * 3600000 + Math.floor(r() * 60) * 60000 + Math.floor(r() * 60) * 1000;

  /* ---------- Estado actual de cada sede oficial ---------- */
  TE.X = new Map();
  for (const s of TE.OF) {
    const r = TE.rng(TE.semilla('x' + s.id)), vul = vulDe(s), rural = esRural(s), tam = Math.min(1, s.tot / 1500);
    const p = r();
    const tipo = rural
      ? (p < 0.22 ? 'Fibra' : p < 0.55 ? 'Radioenlace' : p < 0.88 ? 'Satelital' : 'Sin servicio')
      : (p < 0.70 - 0.18 * vul ? 'Fibra' : p < 0.92 ? 'Radioenlace' : p < 0.975 ? 'Satelital' : 'Sin servicio');
    const rango = { Fibra: [200, 600], Radioenlace: [40, 150], Satelital: [10, 30], 'Sin servicio': [0, 0] }[tipo];
    const contratado = tipo === 'Sin servicio' ? 0 : Math.round((rango[0] + (rango[1] - rango[0]) * (0.3 * r() + 0.7 * tam)) / 10) * 10;
    const medido = Math.round(contratado * TE.clamp(0.55 + r() * 0.5 - 0.12 * vul, 0.15, 1.02));
    const disp = tipo === 'Sin servicio' ? 0 : Math.round((99.9 - Math.pow(r(), 2) * 6 - (tipo === 'Satelital' ? 2.5 : 0)) * 10) / 10;
    const operador = tipo === 'Sin servicio' ? '—' : pick(r, ['Operador A', 'Operador B', 'Operador C']);

    const ratio = 3 + r() * 12 + vul * 8 + (rural ? 3 : 0) + (r() < 0.06 ? 12 : 0);
    const equipos = Math.max(rural ? 4 : 8, Math.round(s.tot / ratio));
    const obsoletosPct = Math.round(TE.clamp(0.08 + r() * 0.5 + vul * 0.12 + (r() < 0.08 ? 0.25 : 0), 0.05, 0.92) * 100);
    const portatiles = Math.round(equipos * (0.2 + r() * 0.3)), tabletas = Math.round(equipos * (0.1 + r() * 0.25));

    const pupitres = Math.max(20, Math.round(s.tot * (0.45 + r() * 0.25)));
    const pM = TE.clamp(0.02 + Math.pow(r(), 2) * 0.32 + vul * 0.1, 0.01, 0.6), pR = 0.12 + r() * 0.2;
    const malo = Math.round(pupitres * pM), regular = Math.round(pupitres * pR), bueno = pupitres - malo - regular;
    const fechaInv = r() < 0.045 ? dia(2024, Math.floor(r() * 12), 1 + Math.floor(r() * 27)) : dia(2025, 10, 1) + Math.floor(r() * 320) * DIA;

    const estDoc = 22 + r() * 11 + vul * 5;
    const docentes = s.tot > 0 ? Math.max(2, Math.round(s.tot / estDoc)) : 0;
    const directivos = s.principal ? Math.max(1, Math.round(docentes / 20)) : (r() < 0.5 ? 1 : 0);
    const admin = s.principal ? 2 + Math.round(s.tot / 400) : Math.round(r() * 2);
    const apoyo = 2 + Math.round(s.tot / 180);
    const vacantes = r() < 0.72 ? 0 : 1 + Math.floor(Math.pow(r(), 2) * 4);

    TE.X.set(s.i, {
      con: { tipo, contratado, medido, disp, operador },
      tic: { equipos, portatiles, tabletas, obsoletosPct },
      mob: { bueno, regular, malo, fechaInv },
      per: { docentes, directivos, admin, apoyo, vacantes },
      rein: []
    });
  }
  // Errores de captura intencionales, para que la auditoría de calidad los encuentre
  TE.OF.filter(s => s.tot > 200).sort((a, b) => TE.semilla('dq' + a.id) - TE.semilla('dq' + b.id)).slice(0, 3)
    .forEach(s => { TE.X.get(s.i).per.docentes = 0; });

  /* ---------- Reintegros ---------- */
  const TIPOS = [['Computador de escritorio', 'TIC', 14], ['Computador portátil', 'TIC', 12], ['Tableta', 'TIC', 10], ['Video beam', 'TIC', 5], ['Impresora', 'TIC', 3], ['Punto de acceso Wi-Fi', 'TIC', 3],
    ['Pupitre unipersonal', 'Mobiliario', 22], ['Silla', 'Mobiliario', 12], ['Mesa', 'Mobiliario', 8], ['Tablero', 'Mobiliario', 4], ['Archivador', 'Mobiliario', 3]];
  const R0 = dia(2025, 0, 10), R1 = dia(2026, 8, 28);
  const picos = new Set(TE.OF.filter(s => s.tot > 400).sort((a, b) => TE.semilla('pk' + a.id) - TE.semilla('pk' + b.id)).slice(0, 3).map(s => s.i));
  TE.REIN = [];
  let nRein = 0;
  for (const s of TE.OF) {
    const r = TE.rng(TE.semilla('re' + s.id)), x = TE.X.get(s.i);
    const lam = x.tic.equipos * 0.035 + (x.mob.bueno + x.mob.regular + x.mob.malo) * 0.004;
    const n = Math.round(lam * (0.4 + r() * 1.2));
    const add = f => {
      const tp = pickW(r, TIPOS.map(t => [t, t[2]])), tic = tp[1] === 'TIC';
      const cantidad = tic ? (r() < 0.8 ? 1 : 2 + Math.floor(r() * 3)) : 1 + Math.floor(r() * (tp[0] === 'Pupitre unipersonal' ? 30 : 8));
      const estado = f > CORTE - 60 * DIA ? (r() < 0.6 ? 'En revisión' : 'Reasignado') : pickW(r, [['Dado de baja', 55], ['Reasignado', 30], ['En revisión', 15]]);
      const motivo = tic ? pickW(r, [['Obsolescencia', 55], ['Daño irreparable', 35], ['Excedente', 10]]) : pickW(r, [['Daño irreparable', 60], ['Deterioro', 30], ['Excedente', 10]]);
      x.rein.push({ id: 'R' + String(++nRein).padStart(5, '0'), placa: 'SEM-' + String(100000 + Math.floor(r() * 899999)), sede: s.i, elemento: tp[0], grupo: tp[1], cantidad, fecha: f, estado, motivo });
    };
    for (let k = 0; k < n; k++) add(R0 + Math.floor(r() * (R1 - R0) / DIA) * DIA);
    if (picos.has(s.i)) { const mes = dia(2026, 2 + Math.floor(r() * 5), 2); const m = 22 + Math.floor(r() * 10); for (let k = 0; k < m; k++) add(mes + Math.floor(r() * 24) * DIA); }
    x.rein.sort((a, b) => a.fecha - b.fecha);
    TE.REIN.push(...x.rein);
  }
  TE.REIN.sort((a, b) => a.fecha - b.fecha || (a.id < b.id ? -1 : 1));

  /* ---------- Métricas derivadas por sede ---------- */
  TE.met = s => {
    const x = TE.X.get(s.i); if (!x) return null;
    const c = x.con, t = x.tic, m = x.mob, p = x.per, pup = m.bueno + m.regular + m.malo;
    const conEst = c.tipo === 'Sin servicio' || c.medido < 20 || c.disp < 94 ? 'crit' : (c.medido < 0.6 * c.contratado || c.medido < 80 || c.disp < 97.5 ? 'lim' : 'ok');
    const estEq = t.equipos ? s.tot / t.equipos : null;
    const ticEst = estEq == null || estEq > 25 || t.obsoletosPct > 70 ? 'crit' : (estEq > 12 || t.obsoletosPct > 50 ? 'lim' : 'ok');
    const pMalo = pup ? m.malo / pup : 0;
    const mobEst = pMalo > 0.3 ? 'crit' : pMalo > 0.15 ? 'lim' : 'ok';
    const estDoc = p.docentes ? s.tot / p.docentes : null;
    const perEst = estDoc == null || p.vacantes >= 3 || estDoc > 36 ? 'crit' : (p.vacantes >= 1 || estDoc > 32 ? 'lim' : 'ok');
    const rein12 = d3.sum(x.rein.filter(q => q.fecha >= TE.HACE12M), q => q.cantidad);
    return { conEst, cumpl: c.contratado ? c.medido / c.contratado : 0, estEq, ticEst, pup, pMalo, mobEst, estDoc, perEst, rein12, reinN: x.rein.length };
  };

  /* ---------- Dimensiones de análisis ---------- */
  const sedesDe = com => TE.SED.filter(s => com === 'all' || s.com === com);
  const ofDe = com => TE.OF.filter(s => com === 'all' || s.com === com);
  const fracNoOk = (com, k) => { const ss = ofDe(com); return ss.length ? ss.filter(s => TE.met(s)[k] !== 'ok').length / ss.length : null; };
  TE.ESTADOS = { ok: { t: 'Adecuado', ic: '✓' }, lim: { t: 'Limitado', ic: '!' }, crit: { t: 'Crítico', ic: '✕' } };
  TE.DIM = {
    mat: { t: 'Matrícula', real: true, ley: 'Estudiantes matriculados (0° a 11°)', alto: 'más estudiantes',
      vc: c => d3.sum(sedesDe(c), s => s.tot), fmtC: TE.fmt,
      v: s => s.tot, fmtV: v => TE.fmt(v) + ' est.', dir: 1, est: null },
    ipm: { t: 'Pobreza multidimensional', real: true, ley: 'IPM 2025, % de personas', alto: 'más pobreza',
      vc: c => c === 'all' ? null : ((TE.comById.get(c) || {}).ipm ?? null) / 100, fmtC: v => TE.pct(v, 1),
      v: s => ((TE.comById.get(s.com) || {}).ipm ?? 0) / 100, fmtV: v => TE.pct(v, 1), dir: 1, est: null, soloComuna: true },
    con: { t: 'Conectividad', real: false, ley: '% de sedes oficiales con conexión limitada o crítica', alto: 'peor conectividad',
      vc: c => fracNoOk(c, 'conEst'), fmtC: v => TE.pct(v),
      v: s => TE.X.get(s.i).con.medido, fmtV: v => TE.fmt(v) + ' Mbps medidos', dir: -1, est: s => TE.met(s).conEst },
    tic: { t: 'Infraestructura TIC', real: false, ley: 'Estudiantes por equipo de cómputo', alto: 'más estudiantes por equipo',
      vc: c => { const ss = ofDe(c); const e = d3.sum(ss, s => TE.X.get(s.i).tic.equipos); return e ? d3.sum(ss, s => s.tot) / e : null; }, fmtC: v => TE.fmt1(v),
      v: s => TE.met(s).estEq, fmtV: v => TE.fmt1(v) + ' est. por equipo', dir: 1, est: s => TE.met(s).ticEst },
    mob: { t: 'Mobiliario', real: false, ley: '% de pupitres en mal estado', alto: 'más mobiliario dañado',
      vc: c => { const ss = ofDe(c); const t = d3.sum(ss, s => TE.met(s).pup); return t ? d3.sum(ss, s => TE.X.get(s.i).mob.malo) / t : null; }, fmtC: v => TE.pct(v),
      v: s => TE.met(s).pMalo, fmtV: v => TE.pct(v) + ' en mal estado', dir: 1, est: s => TE.met(s).mobEst },
    rei: { t: 'Reintegros', real: false, ley: 'Elementos reintegrados en los últimos 12 meses', alto: 'más elementos reintegrados',
      vc: c => d3.sum(ofDe(c), s => TE.met(s).rein12), fmtC: TE.fmt,
      v: s => TE.met(s).rein12, fmtV: v => TE.fmt(v) + ' elementos (12 meses)', dir: 1, est: null },
    per: { t: 'Personal', real: false, ley: 'Estudiantes por docente', alto: 'más estudiantes por docente',
      vc: c => { const ss = ofDe(c); const d = d3.sum(ss, s => TE.X.get(s.i).per.docentes); return d ? d3.sum(ss, s => s.tot) / d : null; }, fmtC: v => TE.fmt1(v),
      v: s => TE.met(s).estDoc, fmtV: v => v == null ? 'sin docentes registrados' : TE.fmt1(v) + ' est. por docente', dir: 1, est: s => TE.met(s).perEst }
  };
  TE.DIM_ORDEN = ['con', 'tic', 'mob', 'per', 'rei', 'mat', 'ipm'];

  /* ---------- Historial de eventos para la cadena ---------- */
  // Campos certificados: los que la cadena protege y la conciliación compara.
  TE.CAMPOS = ['con.tipo', 'con.contratado', 'con.medido', 'con.disp', 'tic.equipos', 'tic.obsoletosPct', 'mob.bueno', 'mob.regular', 'mob.malo', 'per.docentes', 'per.vacantes'];
  TE.TIPOS_CAMBIO = {
    MEDICION_CONECTIVIDAD: { t: 'Medición de conectividad', campos: ['con.medido', 'con.disp'] },
    INSPECCION_MOBILIARIO: { t: 'Inspección de mobiliario', campos: ['mob.bueno', 'mob.regular', 'mob.malo'] },
    DOTACION_TIC: { t: 'Dotación TIC', campos: ['tic.equipos', 'tic.obsoletosPct'] },
    NOVEDAD_PERSONAL: { t: 'Novedad de personal', campos: ['per.docentes', 'per.vacantes'] }
  };
  TE.ETQ_CAMPO = {
    'con.tipo': 'Tipo de enlace', 'con.contratado': 'Velocidad contratada (Mbps)', 'con.medido': 'Velocidad medida (Mbps)', 'con.disp': 'Disponibilidad (%)',
    'tic.equipos': 'Equipos de cómputo', 'tic.obsoletosPct': 'Equipos obsoletos (%)', 'mob.bueno': 'Pupitres en buen estado', 'mob.regular': 'Pupitres en estado regular',
    'mob.malo': 'Pupitres en mal estado', 'per.docentes': 'Docentes', 'per.vacantes': 'Vacantes'
  };
  TE.leer = (x, campo) => { const [g, f] = campo.split('.'); return x[g][f]; };
  TE.escribir = (x, campo, v) => { const [g, f] = campo.split('.'); x[g][f] = v; };
  const snapshot = x => { const o = {}; for (const c of TE.CAMPOS) { const [g, f] = c.split('.'); (o[g] = o[g] || {})[f] = x[g][f]; } return o; };
  const rector = s => 'RS-' + (TE.semilla('rs' + s.ie) % 65536).toString(16).toUpperCase().padStart(4, '0');
  const PROF = ['PS-01', 'PS-02', 'PS-03', 'PS-04', 'PS-05', 'PS-06'];

  const generar = {
    MEDICION_CONECTIVIDAD: (x, r) => x.con.tipo === 'Sin servicio' ? null
      : { 'con.medido': [Math.round(x.con.contratado * TE.clamp(0.3 + r() * 0.6, 0.1, 1)), x.con.medido], 'con.disp': [Math.round((x.con.disp - 0.5 - r() * 3) * 10) / 10, x.con.disp] },
    INSPECCION_MOBILIARIO: (x, r) => { const d = Math.min(x.mob.malo, Math.max(1, Math.round(x.mob.bueno * (0.04 + r() * 0.12)))); return { 'mob.bueno': [x.mob.bueno + d, x.mob.bueno], 'mob.malo': [x.mob.malo - d, x.mob.malo] }; },
    DOTACION_TIC: (x, r) => { const n = Math.max(2, Math.round(x.tic.equipos * (0.1 + r() * 0.3))); if (x.tic.equipos - n < 1) return null; return { 'tic.equipos': [x.tic.equipos - n, x.tic.equipos], 'tic.obsoletosPct': [Math.min(95, x.tic.obsoletosPct + 5 + Math.round(r() * 15)), x.tic.obsoletosPct] }; },
    NOVEDAD_PERSONAL: (x, r) => { const d = 1 + Math.floor(r() * 2); if (x.per.docentes - d < 1) return null; return { 'per.docentes': [x.per.docentes - d, x.per.docentes], 'per.vacantes': [x.per.vacantes + d, x.per.vacantes] }; }
  };
  const nuevoValor = {
    MEDICION_CONECTIVIDAD: (x, r) => x.con.tipo === 'Sin servicio' ? null : { 'con.medido': [x.con.medido, Math.round(x.con.contratado * (0.75 + r() * 0.25))], 'con.disp': [x.con.disp, Math.min(99.9, Math.round((x.con.disp + 0.4 + r()) * 10) / 10)] },
    INSPECCION_MOBILIARIO: (x, r) => { const d = Math.max(1, Math.round(x.mob.malo * (0.2 + r() * 0.3))); return { 'mob.malo': [x.mob.malo, x.mob.malo - d], 'mob.bueno': [x.mob.bueno, x.mob.bueno + d] }; },
    NOVEDAD_PERSONAL: (x, r) => x.per.vacantes < 1 ? null : { 'per.docentes': [x.per.docentes, x.per.docentes + 1], 'per.vacantes': [x.per.vacantes, x.per.vacantes - 1] }
  };
  const aObjeto = c => Object.fromEntries(Object.entries(c).map(([k, [a, d]]) => [k, { antes: a, despues: d }]));

  const ev = []; // {ts, actor, accion, entidad, datos, _ref?}
  const inicial = new Map(TE.OF.map(s => [s.i, snapshot(TE.X.get(s.i))]));
  for (const s of TE.OF) {
    const r = TE.rng(TE.semilla('h' + s.id)), x = TE.X.get(s.i);
    const kinds = Object.keys(generar);
    for (let k = kinds.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
    const nUpd = r() < 0.45 ? (r() < 0.33 ? 2 : 1) : 0;
    for (let k = 0; k < nUpd; k++) {
      const tipo = kinds[k], cambios = generar[tipo](x, r); if (!cambios) continue;
      for (const [campo, [antes]] of Object.entries(cambios)) TE.escribir(inicial.get(s.i), campo, antes);
      const tp = enHorario(r, T0 + (40 + Math.floor(r() * 560)) * DIA);
      const prop = { ts: tp, actor: { rol: 'Rector/a de sede', id: rector(s) }, accion: 'PROPUESTA', entidad: { tipo: 'sede', id: s.id, nombre: s.sede },
        datos: { tipo, cambios: aObjeto(cambios), soporte: (tipo === 'MEDICION_CONECTIVIDAD' ? 'Acta de medición ' : tipo === 'INSPECCION_MOBILIARIO' ? 'Informe de inspección ' : tipo === 'DOTACION_TIC' ? 'Acta de entrega ' : 'Resolución de nombramiento ') + (1000 + Math.floor(r() * 9000)) } };
      ev.push(prop);
      ev.push({ ts: enHorario(r, dia(2025, 0, 1) + Math.floor((tp - dia(2025, 0, 1)) / DIA + 1 + Math.floor(r() * 5)) * DIA), actor: { rol: 'Profesional SEM', id: pick(r, PROF) }, accion: 'APROBACION', entidad: prop.entidad, datos: { decision: 'aprobada' }, _ref: prop });
    }
    if (r() < 0.035 && x.con.tipo !== 'Sin servicio') { // propuesta rechazada por fuera de rango
      const tp = enHorario(r, T0 + (60 + Math.floor(r() * 500)) * DIA);
      const prop = { ts: tp, actor: { rol: 'Rector/a de sede', id: rector(s) }, accion: 'PROPUESTA', entidad: { tipo: 'sede', id: s.id, nombre: s.sede },
        datos: { tipo: 'MEDICION_CONECTIVIDAD', cambios: { 'con.medido': { antes: x.con.medido, despues: Math.round(x.con.contratado * 1.8) } }, soporte: 'Captura de pantalla de prueba de velocidad' } };
      ev.push(prop);
      ev.push({ ts: tp + (1 + Math.floor(r() * 3)) * DIA, actor: { rol: 'Profesional SEM', id: pick(r, PROF) }, accion: 'RECHAZO', entidad: prop.entidad, datos: { decision: 'rechazada', motivo: 'La velocidad reportada supera la contratada. Se solicita acta de medición del operador.' }, _ref: prop });
    }
  }
  // Propuestas recientes aún sin aprobar (para probar el flujo con el rol de Profesional SEM)
  TE.OF.filter(s => s.tot > 300).sort((a, b) => TE.semilla('pd' + a.id) - TE.semilla('pd' + b.id)).slice(0, 7).forEach((s, k) => {
    const r = TE.rng(TE.semilla('pp' + s.id)), x = TE.X.get(s.i);
    const tipo = ['MEDICION_CONECTIVIDAD', 'INSPECCION_MOBILIARIO', 'NOVEDAD_PERSONAL'][k % 3];
    const c = nuevoValor[tipo](x, r) || nuevoValor.INSPECCION_MOBILIARIO(x, r);
    const tipoF = c['con.medido'] ? 'MEDICION_CONECTIVIDAD' : c['per.docentes'] ? 'NOVEDAD_PERSONAL' : 'INSPECCION_MOBILIARIO';
    ev.push({ ts: enHorario(r, CORTE - (6 - k % 6) * DIA - 9 * 3600000), actor: { rol: 'Rector/a de sede', id: rector(s) }, accion: 'PROPUESTA', entidad: { tipo: 'sede', id: s.id, nombre: s.sede },
      datos: { tipo: tipoF, cambios: aObjeto(c), soporte: 'Soporte ' + (2000 + Math.floor(r() * 7000)) } });
  });
  // Carga inicial (migración de inventarios a la plataforma)
  TE.OF.slice().sort((a, b) => +a.com - +b.com || a.i - b.i).forEach((s, k) => {
    ev.push({ ts: T0 + Math.floor(k / 30) * DIA + (k % 30) * 15 * 60000, actor: { rol: 'Sistema de importación', id: 'SIS-IMP' }, accion: 'CARGA_INICIAL', entidad: { tipo: 'sede', id: s.id, nombre: s.sede }, datos: inicial.get(s.i) });
  });
  // Importaciones mensuales de reintegros (un bloque por archivo; cada fila queda protegida por su raíz Merkle)
  TE.LOTES = d3.groups(TE.REIN, q => new Date(q.fecha).toISOString().slice(0, 7)).map(([periodo, filas]) => {
    const [y, m] = periodo.split('-').map(Number);
    return { periodo, archivo: `Reintegros_${periodo}.xlsx`, ids: filas.map(q => q.id), ts: Date.UTC(y, m, 5, 14, 30) };
  });
  TE.LOTES.forEach(l => ev.push({ ts: l.ts, actor: { rol: 'Almacén SEM', id: 'AL-01' }, accion: 'IMPORTACION_REINTEGROS', entidad: { tipo: 'archivo', id: l.archivo }, datos: { periodo: l.periodo }, _lote: l }));

  ev.sort((a, b) => a.ts - b.ts);
  TE.HIST = ev;
  TE.T0 = T0;
})();
