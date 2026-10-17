/* =========================================================
   Traza Educativa · ASISTENTE
   Dos motores:
   1. Claude (cuando la página corre dentro de Claude): consulta
      los datos con herramientas de la página y nunca inventa cifras.
   2. Motor local de reglas (siempre disponible, p. ej. en GitHub
      Pages): reconoce intenciones frecuentes y responde con datos.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, C = TE.cadena, E = TE.estado;
  const $ = id => document.getElementById(id);
  const log = $('chatLog'), form = $('chatForm'), inp = $('chatIn'), motorEl = $('chatMotor'), stopBtn = $('chatStop'), sendBtn = $('chatSend');
  let sample = null, conHerr = false, maxHerr = 0, comprobando = true, ctl = null, ocupado = false;
  const turnos = [];

  /* ---------- Texto con formato mínimo (negritas y viñetas) ---------- */
  TE.mdLite = txt => {
    const lineas = TE.esc(String(txt || '').trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
    let html = '', lista = null;
    const cerrar = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (const l of lineas) {
      const ul = l.match(/^\s*[-•*]\s+(.*)$/), ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) { const t = ul ? 'ul' : 'ol'; if (lista !== t) { cerrar(); html += `<${t}>`; lista = t; } html += `<li>${(ul || ol)[1]}</li>`; }
      else if (!l.trim()) cerrar();
      else { cerrar(); html += `<p>${l.replace(/^#+\s*/, '')}</p>`; }
    }
    cerrar(); return html;
  };

  /* ---------- Resolución de comunas y sedes ---------- */
  const ALIAS = { '06': ['12 de octubre'], '08': ['villahermosa'], '10': ['candelaria', 'el centro'], '11': ['laureles', 'estadio'], '12': ['america'], '14': ['poblado'], '50': ['palmitas'], '80': ['san antonio', 'prado'] };
  const NOMBRES = TE.COMR.flatMap(c => [[TE.norm(c.name), c.id], ...(ALIAS[c.id] || []).map(a => [a, c.id])]).sort((a, b) => b[0].length - a[0].length);
  function comunaEn(texto) {
    const t = TE.norm(texto);
    const m = t.match(/\bcomuna\s*(?:n[uú]mero\s*)?(\d{1,2})\b/);
    if (m) { const id = m[1].padStart(2, '0'); if (TE.comById.has(id)) return id; }
    if (/^\d{1,2}$/.test(t.trim())) { const id = t.trim().padStart(2, '0'); if (TE.comById.has(id)) return id; }
    for (const [n, id] of NOMBRES) if (new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(t)) return id;
    return null;
  }
  const NCOM = new Set(NOMBRES.map(n => n[0]));
  const NSED = TE.SED.map(s => [TE.norm(s.sede), s]).filter(([n]) => n.length >= 10 && !NCOM.has(n)).sort((a, b) => b[0].length - a[0].length);
  function sedeEn(texto) {
    const m = String(texto).match(/\bS\d{3}\b/i); if (m) return TE.sedeById.get(m[0].toUpperCase()) || null;
    const t = TE.norm(texto);
    for (const [n, s] of NSED) if (t.includes(n)) return s;
    return null;
  }
  function buscarSede(q) {
    const s = sedeEn(q); if (s) return s;
    const t = TE.norm(q).trim(); if (t.length < 4) return null;
    return TE.SED.find(x => TE.norm(x.sede).includes(t)) || TE.SED.find(x => TE.norm(x.ieName).includes(t)) || null;
  }
  const DIMS = [['con', /conect|internet|wifi|wi-fi|velocidad|banda ancha|\bred\b|mbps/], ['tic', /equipo|computador|portatil|tablet|\btic\b|tecnolog|informatica/],
    ['mob', /mobiliario|pupitre|silla|mesa|mueble/], ['per', /docente|personal|vacante|profesor|maestro|rector/], ['rei', /reintegr|baja|devoluc|devolv/],
    ['mat', /matricul|estudiantes|alumnos|cupos/], ['ipm', /pobreza|ipm|vulnerab/]];
  const dimEn = t => (DIMS.find(([, re]) => re.test(TE.norm(t))) || [])[0] || null;

  /* ---------- Datos que comparten ambos motores ---------- */
  function fichaCorta(s) {
    const x = TE.X.get(s.i), m = x && TE.met(s), E2 = e => TE.ESTADOS[e].t;
    const o = { id: s.id, sede: s.sede, institucion: s.ieName, comuna: `${s.com} · ${TE.nomCom(s.com)}`, barrio: TE.nomBar(s.bar), estudiantes: s.tot, sector: s.of ? 'oficial' : 'no oficial' };
    if (!x) return o;
    return Object.assign(o, {
      conectividad: { estado: E2(m.conEst), enlace: x.con.tipo, medido_mbps: x.con.medido, contratado_mbps: x.con.contratado, disponibilidad_pct: x.con.disp },
      tic: { estado: E2(m.ticEst), equipos: x.tic.equipos, est_por_equipo: m.estEq && +m.estEq.toFixed(1), obsoletos_pct: x.tic.obsoletosPct },
      mobiliario: { estado: E2(m.mobEst), pct_mal_estado: +(m.pMalo * 100).toFixed(1), pupitres_malos: x.mob.malo },
      personal: { estado: E2(m.perEst), docentes: x.per.docentes, vacantes: x.per.vacantes, est_por_docente: m.estDoc && +m.estDoc.toFixed(1) },
      reintegros_12m: m.rein12
    });
  }
  function resumenTerritorial(cid) {
    const k = TE.tablero.indicadores(cid || 'all'), of = TE.OF.filter(s => !cid || s.com === cid);
    const cnt = key => { const o = { adecuado: 0, limitado: 0, critico: 0 }; for (const s of of) o[{ ok: 'adecuado', lim: 'limitado', crit: 'critico' }[TE.met(s)[key]]]++; return o; };
    const r = {
      territorio: cid ? `${cid} · ${TE.nomCom(cid)}` : 'Medellín (16 comunas y 5 corregimientos)',
      poblacion_2025: cid ? TE.comById.get(cid).pop : d3.sum(TE.COMR, c => c.pop), ipm_2025_pct: cid ? TE.comById.get(cid).ipm : null,
      sedes: k.sedes, sedes_oficiales: k.of, estudiantes: k.est, estudiantes_en_oficiales: k.estOf,
      datos_de_ejemplo: {
        conectividad: cnt('conEst'), tic: Object.assign(cnt('ticEst'), { est_por_equipo: k.estEq && +k.estEq.toFixed(1) }),
        mobiliario: Object.assign(cnt('mobEst'), { pct_pupitres_mal_estado: k.malo != null ? +(k.malo * 100).toFixed(1) : null }),
        personal: Object.assign(cnt('perEst'), { est_por_docente: k.estDoc && +k.estDoc.toFixed(1), vacantes: k.vac }), elementos_reintegrados_12m: k.rein
      },
      propuestas_pendientes: [...C.pendientes.values()].filter(b => of.some(s => s.id === b.entidad.id)).length
    };
    if (!cid) r.por_comuna = TE.COMR.map(c => { const i = TE.tablero.indicadores(c.id); return { id: c.id, nombre: c.name, ipm: c.ipm, pct_conect_no_adecuada: i.conNo != null ? Math.round(i.conNo * 100) : null, est_por_equipo: i.estEq && +i.estEq.toFixed(1), pct_pupitres_malos: i.malo != null ? +(i.malo * 100).toFixed(1) : null, est_por_docente: i.estDoc && +i.estDoc.toFixed(1), reintegros_12m: i.rein }; });
    return r;
  }
  function detalleBloque(b) {
    const d = b.datos || {};
    if (b.accion === 'PROPUESTA') return `${TE.TIPOS_CAMBIO[d.tipo].t}: ${Object.entries(d.cambios).map(([k, v]) => `${TE.ETQ_CAMPO[k]} ${v.antes} → ${v.despues}`).join('; ')} (soporte: ${d.soporte})`;
    if (b.accion === 'APROBACION') return `Aprueba la propuesta del bloque #${d.propuesta}`;
    if (b.accion === 'RECHAZO') return `Rechaza la propuesta del bloque #${d.propuesta}: ${d.motivo}`;
    if (b.accion === 'CARGA_INICIAL') return 'Inventario inicial de la sede en la plataforma';
    return '';
  }
  function historial(s) {
    const h = C.historialSede(s.id);
    return { sede: s.sede, id: s.id, total_bloques: h.length,
      bloques: h.slice(-10).map(b => ({ bloque: b.n, fecha: TE.fechaHora(b.ts), accion: TE.ACCIONES[b.accion], actor: `${b.actor.rol} (${b.actor.id})`, detalle: detalleBloque(b), huella: b.hash.slice(0, 16) })),
      ultimo_bloque_verificado: h.length ? C.verificarBloque(h[h.length - 1].n).ok : null };
  }
  function integridad() {
    const a = C.auditar();
    return { integra: a.ok, bloques: a.v.n, verificacion_ms: Math.round(a.v.ms), errores_encadenamiento: a.v.err.length, raices_ancladas_que_no_coinciden: a.v.errAn.length,
      diferencias_bd_vs_cadena: a.c.dif.length, filas_de_reintegro_alteradas: a.c.rdif.length,
      ejemplos: [...a.v.err.slice(0, 2).map(e => `Bloque #${e.n}: ${e.msg}`), ...a.c.dif.slice(0, 2).map(d => `${d.sede.sede}: ${TE.ETQ_CAMPO[d.campo] || d.campo} certificado ${d.cadena}, en base de datos ${d.bd}`), ...a.c.rdif.slice(0, 2).map(d => `${d.id} (${d.archivo}): ${d.msg}`)],
      anclaje: 'La huella del historial se ancla con un contrato inteligente en una red de prueba desde la vista Trazabilidad; las raíces diarias automáticas son simuladas' };
  }
  const alertasCompactas = () => TE.alertas.calcular().map(a => ({ codigo: a.id, severidad: TE.SEV[a.sev].t, dimension: a.dim, titulo: a.titulo, afectadas: a.items.length,
    ejemplos: a.items.slice(0, 4).map(i => i.nombre ? `${i.nombre}: ${i.val}` : `${i.sede} [${i.id}] (${TE.nomCom(i.com)}): ${i.val}`) }));

  function sedesPorDim(dk, cid, n = 5) {
    const D = TE.DIM[dk], base = (dk === 'mat' ? TE.SED : TE.OF).filter(s => !cid || s.com === cid);
    const sev = s => D.est ? { crit: 0, lim: 1, ok: 2 }[D.est(s)] : 0;
    const val = s => D.v(s) ?? (D.dir === 1 ? Infinity : -Infinity);
    return base.slice().sort((a, b) => sev(a) - sev(b) || D.dir * (val(b) - val(a))).slice(0, n);
  }

  /* ---------- Herramientas para Claude ---------- */
  let resalte = null;
  const DIMK = { conectividad: 'con', tic: 'tic', mobiliario: 'mob', personal: 'per', reintegros: 'rei', matricula: 'mat' };
  const HERR = [
    { name: 'buscar_sedes', description: 'Lista sedes educativas con sus indicadores. Filtra por comuna, por texto del nombre y por estado en una dimensión; ordena de peor a mejor (o al revés). Devuelve el total y hasta 12 sedes con conectividad, TIC, mobiliario, personal y reintegros.',
      inputSchema: { type: 'object', properties: {
        comuna: { type: 'string', description: 'Código (01-16, 50, 60, 70, 80, 90) o nombre de la comuna o corregimiento' },
        dimension: { type: 'string', enum: ['conectividad', 'tic', 'mobiliario', 'personal', 'reintegros', 'matricula'], description: 'Dimensión para filtrar y ordenar. Por defecto conectividad' },
        estado: { type: 'string', enum: ['adecuado', 'limitado', 'critico'] },
        orden: { type: 'string', enum: ['peor', 'mejor'] }, texto: { type: 'string', description: 'Parte del nombre de la sede o institución' },
        limite: { type: 'number', description: 'Máximo 12' } } },
      execute(i) {
        const dk = DIMK[TE.norm(i.dimension || 'conectividad')] || 'con', D = TE.DIM[dk];
        let cid = null; if (i.comuna) { cid = comunaEn(String(i.comuna)); if (!cid) throw new Error(`No reconozco la comuna “${i.comuna}”. Usa el código o el nombre.`); }
        let ss = sedesPorDim(dk, cid, 9999);
        if (i.texto) { const t = TE.norm(i.texto); ss = ss.filter(s => TE.norm(s.sede + ' ' + s.ieName).includes(t)); }
        if (i.estado && D.est) { const e = { adecuado: 'ok', limitado: 'lim', critico: 'crit' }[TE.norm(i.estado)]; if (e) ss = ss.filter(s => D.est(s) === e); }
        if (i.orden === 'mejor') ss.reverse();
        return { dimension: D.t, dato_de_ejemplo: !D.real, total: ss.length, sedes: ss.slice(0, Math.min(12, Number(i.limite) || 8)).map(fichaCorta) };
      } },
    { name: 'resumen_territorial', description: 'Indicadores agregados de una comuna o corregimiento (población, IPM, sedes, estudiantes, estados de conectividad, TIC, mobiliario y personal, reintegros, propuestas pendientes). Sin comuna devuelve la ciudad y una fila por comuna.',
      inputSchema: { type: 'object', properties: { comuna: { type: 'string', description: 'Código o nombre. Omitir para toda la ciudad' } } },
      execute(i) { let cid = null; if (i.comuna) { cid = comunaEn(String(i.comuna)); if (!cid) throw new Error(`No reconozco la comuna “${i.comuna}”.`); } return resumenTerritorial(cid); } },
    { name: 'historial_sede', description: 'Historial certificado de una sede en la cadena de trazabilidad: quién propuso, aprobó o rechazó cada cambio, cuándo y con qué huella SHA-256. Recibe el código (S123) o el nombre.',
      inputSchema: { type: 'object', properties: { sede: { type: 'string' } }, required: ['sede'] },
      execute(i) { const s = buscarSede(String(i.sede || '')); if (!s) throw new Error(`No encontré la sede “${i.sede}”. Usa buscar_sedes para obtener su código.`); return historial(s); } },
    { name: 'verificar_integridad', description: 'Ejecuta la auditoría completa: recalcula las huellas de todos los bloques, compara las raíces Merkle ancladas y concilia la base de datos con la cadena. Devuelve si la información está íntegra y qué se alteró.',
      execute: () => integridad() },
    { name: 'listar_alertas', description: 'Alertas automáticas activas (conectividad, TIC, mobiliario, personal, reintegros atípicos, calidad del dato, gobierno, priorización territorial) con severidad y ejemplos de sedes afectadas.',
      execute: () => alertasCompactas() },
    { name: 'mostrar_en_mapa', description: 'Resalta sedes en el mapa territorial para que el usuario las vea. Úsala cuando menciones sedes concretas. Recibe los códigos de sede (S123).',
      inputSchema: { type: 'object', properties: { sedes: { type: 'array', items: { type: 'string' } }, titulo: { type: 'string', description: 'Qué representan, en pocas palabras' } }, required: ['sedes'] },
      execute(i) {
        const set = new Set((Array.isArray(i.sedes) ? i.sedes : []).map(id => TE.sedeById.get(String(id).toUpperCase())).filter(Boolean).map(s => s.i));
        if (!set.size) throw new Error('Ningún código de sede es válido.');
        resalte = { set, titulo: String(i.titulo || 'Sedes señaladas por el asistente').slice(0, 80) };
        TE.mapa.resaltar(set, resalte.titulo);
        return { resaltadas: set.size };
      } }
  ];
  const NOMBRE_HERR = { buscar_sedes: 'Buscando sedes', resumen_territorial: 'Calculando indicadores', historial_sede: 'Leyendo el historial certificado', verificar_integridad: 'Auditando la cadena', listar_alertas: 'Revisando alertas', mostrar_en_mapa: 'Resaltando en el mapa' };

  const reglas = () => `Eres el asistente de “Traza Educativa Medellín”, una plataforma de demostración para la Secretaría de Educación de Medellín. Respondes en español, de forma clara y breve (máximo 160 palabras salvo que pidan detalle), con cifras concretas.
- Oficiales: sedes educativas, matrícula de 0° a 11°, límites, población 2025 e IPM 2025. De ejemplo (inventados para la demo): conectividad, TIC, mobiliario, personal y reintegros. Cuando uses datos de ejemplo, dilo una vez.
- ${conHerr ? 'Usa las herramientas para obtener cualquier cifra. Nunca inventes datos, sedes ni códigos.' : 'Usa solo los datos incluidos en este mensaje. Nunca inventes datos, sedes ni códigos.'}
${conHerr ? '- Cuando hables de sedes concretas, llama mostrar_en_mapa con sus códigos.\n' : ''}- Personal: solo hay cifras agregadas. No tienes ni pidas datos personales de docentes o estudiantes (Ley 1581 de 2012).
- La trazabilidad usa una cadena de bloques SHA-256 real con raíces Merkle. La huella del historial se ancla con un contrato inteligente en ${(window.TRAZA_RED || {}).nombre || 'una red de prueba'} (red de prueba) desde la vista Trazabilidad; las raíces diarias automáticas son simuladas.
- Formato: párrafos cortos y viñetas que empiecen con "- ". Sin tablas ni títulos.
Rol del usuario en la demo: ${TE.ROLES[E.rol].t}. Corte de los datos: ${TE.fecha(TE.CORTE)}.`;

  /* ---------- Motor local de reglas ---------- */
  const NOMD = { con: 'conectividad', tic: 'infraestructura TIC', mob: 'mobiliario', per: 'situación de personal' };
  function lista(ss, fn) { return ss.map(s => `- **${s.sede}** (${TE.nomCom(s.com)}): ${fn(s)}`).join('\n'); }
  function local(q) {
    const t = TE.norm(q), cid = comunaEn(q), s = sedeEn(q), dk = dimEn(q);
    const donde = cid ? `en ${TE.nomCom(cid)}` : 'en la ciudad';
    if (/\bintegr|\balter|manipul|cadena|blockchain|\bhash|huella|confiable|confiar|adulter|verific/.test(t) && !/historial/.test(t) && !s) {
      const r = integridad();
      return { texto: r.integra
        ? `La auditoría acaba de verificar los ${TE.fmt(r.bloques)} bloques en ${TE.fmt(r.verificacion_ms)} ms: **la información está íntegra**.\n- Cada huella SHA-256 coincide con su contenido y con el bloque anterior.\n- Las raíces Merkle diarias coinciden con las ancladas (anclaje simulado en la demo).\n- La base de datos coincide con lo certificado en la cadena.`
        : `**La auditoría encontró alteraciones.**\n- Errores de encadenamiento: ${r.errores_encadenamiento}\n- Raíces ancladas que no coinciden: ${r.raices_ancladas_que_no_coinciden}\n- Diferencias entre la base de datos y la cadena: ${r.diferencias_bd_vs_cadena}\n- Filas de reintegro alteradas: ${r.filas_de_reintegro_alteradas}\n${r.ejemplos.map(e => '- ' + e).join('\n')}\nRevisa el detalle en Trazabilidad.` };
    }
    if (s && /histor|quien|cambi|modific|aprob|propuest/.test(t)) {
      const h = historial(s);
      return { texto: `**${s.sede}** tiene ${TE.plural(h.total_bloques, 'bloque certificado', 'bloques certificados')}. Los más recientes:\n${h.bloques.slice(-5).reverse().map(b => `- #${b.bloque} · ${b.fecha} · ${b.accion} por ${b.actor}${b.detalle ? ': ' + b.detalle : ''}`).join('\n')}\nEl último bloque ${h.ultimo_bloque_verificado ? 'se verificó sin errores' : 'no pasó la verificación'}.`, sedes: new Set([s.i]), titulo: s.sede };
    }
    if (s) {
      const f = fichaCorta(s);
      if (!f.conectividad) return { texto: `**${s.sede}** (${f.comuna}, ${f.barrio}) es una sede no oficial con ${TE.fmt(s.tot)} estudiantes. La Secretaría no administra su infraestructura, así que solo hay matrícula.`, sedes: new Set([s.i]), titulo: s.sede };
      return { texto: `**${s.sede}** (${f.comuna}, ${f.barrio}), ${TE.fmt(s.tot)} estudiantes. Datos de ejemplo:\n- Conectividad: ${f.conectividad.estado.toLowerCase()}, ${f.conectividad.enlace}, ${TE.fmt(f.conectividad.medido_mbps)} de ${TE.fmt(f.conectividad.contratado_mbps)} Mbps.\n- TIC: ${f.tic.estado.toLowerCase()}, ${TE.fmt1(f.tic.est_por_equipo)} estudiantes por equipo.\n- Mobiliario: ${f.mobiliario.estado.toLowerCase()}, ${TE.fmt1(f.mobiliario.pct_mal_estado)} % de pupitres en mal estado.\n- Personal: ${f.personal.estado.toLowerCase()}, ${f.personal.docentes} docentes y ${f.personal.vacantes} vacantes.`, sedes: new Set([s.i]), titulo: s.sede };
    }
    if (/anomal|atipic|pico|raro|sospech|irregular/.test(t)) {
      const a = TE.alertas.calcular().find(x => x.id === 'REI-1');
      if (!a) return { texto: 'No hay picos atípicos de reintegros con la regla actual (puntaje z ≥ 4 y al menos 8 registros en un mes).' };
      return { texto: `Encontré ${TE.plural(a.items.length, 'sede', 'sedes')} con reintegros atípicos (datos de ejemplo):\n${a.items.map(i => `- **${i.sede}** (${TE.nomCom(i.com)}): ${i.val}`).join('\n')}\n${a.porque}`, sedes: new Set(a.items.map(i => i.i)), titulo: 'Reintegros atípicos' };
    }
    if (/prioriz|priorid|invert|urgente|alerta|atender primero|focaliz/.test(t)) {
      if (dk && dk !== 'mat' && dk !== 'ipm' && dk !== 'rei') {
        const D = TE.DIM[dk], filas = TE.COMR.map(c => ({ c, v: D.vc(c.id) })).filter(f => f.v != null).sort((a, b) => b.v - a.v).slice(0, 5);
        return { texto: `Para ${NOMD[dk]}, las comunas con peor indicador (${D.ley.toLowerCase()}, datos de ejemplo) son:\n${filas.map(f => `- **${f.c.name}**: ${D.fmtC(f.v)} · IPM ${f.c.ipm != null ? TE.fmt1(f.c.ipm) + ' %' : 's. d.'}`).join('\n')}\nCruza esta lista con la pobreza (IPM) para decidir dónde invertir primero.`,
          sedes: new Set(TE.OF.filter(s => filas.some(f => f.c.id === s.com) && D.est && D.est(s) !== 'ok').map(s => s.i)), titulo: `${D.t}: comunas prioritarias` };
      }
      const A = TE.alertas.calcular().slice(0, 5);
      return { texto: `Las alertas más importantes ahora:\n${A.map(a => `- **${TE.SEV[a.sev].t} · ${a.titulo}.** ${a.porque.split('. ')[0]}.`).join('\n')}\nEl detalle y las reglas están en Alertas.` };
    }
    if (dk === 'ipm') {
      const c = TE.COMR.filter(c => c.ipm != null).sort((a, b) => b.ipm - a.ipm).slice(0, 5);
      return { texto: `Comunas con más pobreza multidimensional (IPM 2025, dato oficial):\n${c.map(x => `- **${x.name}**: ${TE.fmt1(x.ipm)} % de las personas`).join('\n')}` };
    }
    if (dk) {
      const D = TE.DIM[dk], ss = sedesPorDim(dk, cid, 5);
      if (!ss.length) return { texto: `No hay sedes oficiales ${donde}.` };
      const titulo = dk === 'mat' ? `Sedes con más estudiantes ${donde}` : dk === 'rei' ? `Sedes con más reintegros ${donde}` : `Sedes con peor ${NOMD[dk]} ${donde}`;
      return { texto: `${titulo}${D.real ? '' : ' (datos de ejemplo)'}:\n${lista(ss, x => (D.est ? TE.ESTADOS[D.est(x)].t.toLowerCase() + ', ' : '') + D.fmtV(D.v(x)))}`, sedes: new Set(ss.map(x => x.i)), titulo };
    }
    if (cid || /resum|situac|como esta|panorama|general|ciudad|medellin/.test(t)) {
      const r = resumenTerritorial(cid), d = r.datos_de_ejemplo;
      return { texto: `**${r.territorio}**: ${TE.fmt(r.poblacion_2025)} habitantes${r.ipm_2025_pct != null ? `, IPM ${TE.fmt1(r.ipm_2025_pct)} %` : ''}; ${TE.fmt(r.sedes)} sedes (${TE.fmt(r.sedes_oficiales)} oficiales) y ${TE.fmt(r.estudiantes)} estudiantes.\nEn las sedes oficiales (datos de ejemplo):\n- Conectividad: ${d.conectividad.critico} críticas y ${d.conectividad.limitado} limitadas.\n- TIC: ${TE.fmt1(d.tic.est_por_equipo)} estudiantes por equipo.\n- Mobiliario: ${TE.fmt1(d.mobiliario.pct_pupitres_mal_estado)} % de pupitres en mal estado.\n- Personal: ${TE.fmt1(d.personal.est_por_docente)} estudiantes por docente y ${d.personal.vacantes} vacantes.\n- Reintegros: ${TE.fmt(d.elementos_reintegrados_12m)} elementos en 12 meses.${r.propuestas_pendientes ? `\nHay ${TE.plural(r.propuestas_pendientes, 'propuesta pendiente', 'propuestas pendientes')} de aprobación.` : ''}`,
        sedes: cid ? new Set(TE.OF.filter(s => s.com === cid && TE.met(s).conEst === 'crit').map(s => s.i)) : null, titulo: cid ? `Conectividad crítica en ${TE.nomCom(cid)}` : null };
    }
    return { texto: 'No identifiqué la pregunta. Puedo responder sobre:\n- Una comuna o corregimiento (“resume Robledo”, “comuna 1”).\n- Sedes con peor conectividad, equipos, mobiliario o personal.\n- Reintegros atípicos y alertas prioritarias.\n- El historial certificado de una sede (“historial de S205”).\n- La integridad de los datos (“¿alguien alteró la información?”).' };
  }

  /* ---------- Interfaz del chat ---------- */
  function burbuja(rol, html) {
    const d = document.createElement('div'); d.className = 'msg ' + rol;
    d.innerHTML = `<div class="cuerpo">${html}</div>`; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function pie(b, motor, res) {
    const p = document.createElement('div'); p.className = 'pie';
    p.innerHTML = `<span class="motor-tag ${motor === 'claude' ? 'ia' : ''}">${motor === 'claude' ? 'Claude' : 'Motor local'}</span>`;
    if (res && res.set && res.set.size) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn sm'; btn.textContent = `Ver ${TE.plural(res.set.size, 'sede', 'sedes')} en el mapa`;
      btn.onclick = () => { TE.irVista('mapa'); TE.mapa.resaltar(res.set, res.titulo); };
      p.appendChild(btn);
    }
    b.appendChild(p);
  }
  function responderLocal(q, nota) {
    const r = local(q);
    const b = burbuja('bot', (nota ? `<p class="nota-motor">${TE.esc(nota)}</p>` : '') + TE.mdLite(r.texto));
    const res = r.sedes && r.sedes.size ? { set: r.sedes, titulo: r.titulo || 'Sedes señaladas por el asistente' } : null;
    if (res) TE.mapa.resaltar(res.set, res.titulo);
    pie(b, 'local', res);
  }
  function mensajeError(e) {
    const c = e && e.code;
    return ({ rate_limited: 'Se alcanzó el límite de uso de Claude por ahora. Intenta más tarde.', not_granted: 'No se dio permiso a esta página para usar Claude.',
      sampling_disabled: 'Claude no está disponible para esta cuenta.', session_expired: 'La sesión expiró: vuelve a iniciar sesión en Claude.',
      refused: 'Claude no respondió esa solicitud. Reformúlala.', prompt_too_large: 'La consulta quedó demasiado grande. Haz una pregunta más concreta.',
      empty_completion: 'Claude no devolvió texto. Prueba con una pregunta más concreta.' })[c] || 'Falló la conexión con Claude. Intenta de nuevo.';
  }
  const PERMANENTE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

  async function responderClaude(q) {
    const b = burbuja('bot', '<p class="pensando">Pensando…</p>');
    const cuerpo = b.querySelector('.cuerpo'), pasos = document.createElement('ul'); pasos.className = 'pasos';
    resalte = null; ctl = new AbortController();
    const herr = conHerr ? HERR.slice(0, maxHerr || HERR.length).map(h => Object.assign({}, h, {
      execute: (i, cx) => { const li = document.createElement('li'); li.textContent = NOMBRE_HERR[h.name] + '…'; pasos.appendChild(li); if (!pasos.isConnected) b.insertBefore(pasos, cuerpo); return h.execute(i || {}, cx); }
    })) : null;
    const contexto = conHerr ? '' : `\n\nDatos disponibles (JSON):\nResumen: ${JSON.stringify(resumenTerritorial(comunaEn(q)))}\nAlertas: ${JSON.stringify(alertasCompactas())}`;
    turnos.push({ role: 'user', content: q });
    while (turnos.length > 12) turnos.shift();
    const entrada = [{ role: 'user', content: reglas() + contexto }, ...turnos];
    try {
      const opts = { signal: ctl.signal, modelTier: 'quick', onText: ({ text }) => { cuerpo.innerHTML = TE.mdLite(text); log.scrollTop = log.scrollHeight; } };
      if (herr) opts.tools = herr; else opts.cache = false;
      const r = await sample(entrada, opts);
      cuerpo.innerHTML = TE.mdLite(r.text) + (r.truncated ? '<p class="m">La respuesta se cortó por longitud.</p>' : '');
      turnos.push({ role: 'assistant', content: r.text });
      pie(b, 'claude', resalte);
    } catch (e) {
      turnos.pop();
      if (e && e.code === 'cancelled') { cuerpo.innerHTML = e.text ? TE.mdLite(e.text) + '<p class="m">Detenido.</p>' : '<p class="m">Detenido.</p>'; return; }
      if (e && e.code === 'tools_unavailable') { conHerr = false; pintarMotor(); }
      if (e && PERMANENTE.includes(e.code)) desactivar();
      b.remove();
      responderLocal(q, mensajeError(e) + ' Respondo con el motor local.');
    } finally { ctl = null; }
  }

  async function enviar(q) {
    q = q.trim(); if (!q || ocupado) return;
    ocupado = true; inp.value = ''; sendBtn.disabled = true; stopBtn.hidden = !sample;
    burbuja('user', `<p>${TE.esc(q)}</p>`);
    try { if (sample) await responderClaude(q); else responderLocal(q); }
    finally { ocupado = false; sendBtn.disabled = false; stopBtn.hidden = true; inp.focus(); }
  }
  form.onsubmit = e => { e.preventDefault(); enviar(inp.value); };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(inp.value); } };
  stopBtn.onclick = () => { if (ctl) ctl.abort(); };
  const SUG = ['¿Qué sedes de la comuna 1 tienen peor conectividad?', 'Resume la situación de Robledo', '¿Hay reintegros atípicos?', '¿Qué comunas priorizar para dotación TIC?', '¿Alguien alteró la información?', '¿Quién modificó los datos de la sede S205?'];
  $('chatSug').innerHTML = SUG.map(s => `<button type="button" class="chip">${TE.esc(s)}</button>`).join('');
  $('chatSug').querySelectorAll('.chip').forEach(b => b.onclick = () => enviar(b.textContent));
  $('chatLimpiar').onclick = () => { if (ctl) ctl.abort(); turnos.length = 0; log.innerHTML = ''; bienvenida(); };

  function pintarMotor() {
    motorEl.className = 'motor ' + (sample ? 'ia' : 'local');
    motorEl.innerHTML = comprobando ? '<i aria-hidden="true"></i>Comprobando si Claude está disponible…'
      : sample ? `<i aria-hidden="true"></i>Claude${conHerr ? ' · consulta los datos con herramientas' : ' · con un resumen de los datos'}`
      : '<i aria-hidden="true"></i>Motor local de reglas · Claude no está disponible aquí';
  }
  function desactivar() { sample = null; pintarMotor(); TE.emit('ia', false); }
  function bienvenida() {
    const b = burbuja('bot', TE.mdLite(`Hola. Consulto los datos de la plataforma: sedes, indicadores por comuna, alertas, reintegros e historial certificado.\n- Las sedes que mencione se resaltan en el mapa.\n- Conectividad, TIC, mobiliario, personal y reintegros son datos de ejemplo.\n- No manejo datos personales: solo cifras agregadas.`));
    b.classList.add('intro');
  }

  TE.ia = { sample: () => sample, desactivar, mensajeError };
  bienvenida(); pintarMotor();
  (async () => {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const s = await window.claude.use('sample');
        if (typeof s === 'function') {
          sample = s;
          const L = await s.limits().catch(() => null);
          conHerr = !!(L && L.tools); maxHerr = L && L.tools ? L.tools.maxCount : 0;
        }
      }
    } catch (e) { sample = null; }
    comprobando = false; pintarMotor(); TE.emit('ia', !!sample);
  })();
})();
