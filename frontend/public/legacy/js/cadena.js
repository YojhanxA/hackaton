/* =========================================================
   Traza Educativa · CADENA DE TRAZABILIDAD
   Registro de auditoría encadenado con SHA-256:
   - cada bloque guarda la huella (hash) del anterior;
   - cada día se calcula una raíz Merkle de sus bloques, que en
     producción se ancla en una blockchain pública (OpenTimestamps).
     En esta demo el anclaje es SIMULADO: no sale a la red;
   - las filas de cada archivo de reintegros quedan protegidas
     por una raíz Merkle guardada en el bloque de importación.
   El SHA-256 es real (implementación estándar FIPS 180-4).
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE;

  /* ---------- SHA-256 (síncrono) ---------- */
  const KK = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const enc = new TextEncoder();
  const W = new Uint32Array(64);
  function sha256(texto) {
    const bytes = enc.encode(texto), l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 536870912));
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + KK[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  TE.sha256 = sha256;

  /* ---------- JSON canónico (claves ordenadas) ---------- */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  TE.canon = canon;

  /* ---------- Árbol de Merkle ---------- */
  function merkle(hojas) {
    if (!hojas.length) return { raiz: sha256(''), niveles: [[]] };
    let nivel = hojas.slice(); const niveles = [nivel];
    while (nivel.length > 1) {
      const sig = [];
      for (let i = 0; i < nivel.length; i += 2) sig.push(sha256(nivel[i] + (nivel[i + 1] ?? nivel[i])));
      nivel = sig; niveles.push(nivel);
    }
    return { raiz: nivel[0], niveles };
  }
  function pruebaMerkle(niveles, idx) {
    const ruta = [];
    for (let l = 0; l < niveles.length - 1; l++) {
      const nv = niveles[l], par = idx ^ 1;
      ruta.push({ lado: idx % 2 ? 'izq' : 'der', hash: nv[par] ?? nv[idx] });
      idx = Math.floor(idx / 2);
    }
    return ruta;
  }
  function raizDesdePrueba(hoja, ruta) { let h = hoja; for (const p of ruta) h = p.lado === 'izq' ? sha256(p.hash + h) : sha256(h + p.hash); return h; }

  /* ---------- Bloques ---------- */
  const CERO = '0'.repeat(64);
  const diaBogota = iso => new Date(Date.parse(iso) - 5 * 3600000).toISOString().slice(0, 10);
  const hoyBogota = () => diaBogota(new Date().toISOString());
  const contenido = b => ({ n: b.n, ts: b.ts, actor: b.actor, accion: b.accion, entidad: b.entidad, datos: b.datos, prev: b.prev });
  const hashBloque = b => sha256(canon(contenido(b)));
  TE.reinById = new Map(TE.REIN.map(q => [q.id, q]));
  const filaCanonica = q => ({ id: q.id, placa: q.placa, sede: TE.SED[q.sede].id, elemento: q.elemento, cantidad: q.cantidad, fecha: new Date(q.fecha).toISOString().slice(0, 10), estado: q.estado, motivo: q.motivo });
  const hashFila = q => sha256(canon(filaCanonica(q)));

  const C = (TE.cadena = { bloques: [], lotes: new Map(), anclajes: [], porSede: new Map(), pendientes: new Map(), estado: 'sin-verificar', ultima: null, alteracion: null, respaldo: null });
  TE.ACCIONES = {
    GENESIS: 'Bloque inicial', CARGA_INICIAL: 'Carga inicial', PROPUESTA: 'Propuesta de cambio', APROBACION: 'Aprobación',
    RECHAZO: 'Rechazo', IMPORTACION_REINTEGROS: 'Importación de reintegros'
  };

  function agregar(e) {
    const prev = C.bloques.length ? C.bloques[C.bloques.length - 1].hash : CERO;
    const b = { n: C.bloques.length, ts: new Date(e.ts).toISOString(), actor: e.actor, accion: e.accion, entidad: e.entidad, datos: e.datos, prev };
    b.hash = hashBloque(b);
    C.bloques.push(b);
    if (b.entidad.tipo === 'sede') { if (!C.porSede.has(b.entidad.id)) C.porSede.set(b.entidad.id, []); C.porSede.get(b.entidad.id).push(b.n); }
    if (b.accion === 'PROPUESTA') C.pendientes.set(b.n, b);
    if ((b.accion === 'APROBACION' || b.accion === 'RECHAZO') && b.datos.propuesta != null) C.pendientes.delete(b.datos.propuesta);
    return b;
  }

  function construir() {
    agregar({ ts: TE.T0 - 86400000, actor: { rol: 'Plataforma', id: 'SIS' }, accion: 'GENESIS', entidad: { tipo: 'plataforma', id: 'traza-educativa' },
      datos: { descripcion: 'Bloque inicial de la cadena de trazabilidad de la gestión educativa', algoritmo: 'SHA-256', anclaje: 'Contrato inteligente TrazaAnclaje en red pública (raíz Merkle SHA-256 del historial)' } });
    for (const e of TE.HIST) {
      if (e.accion === 'IMPORTACION_REINTEGROS') {
        const filas = e._lote.ids.map(id => TE.reinById.get(id));
        const mk = merkle(filas.map(hashFila));
        e.datos = { archivo: e._lote.archivo, periodo: e._lote.periodo, registros: filas.length, elementos: d3.sum(filas, q => q.cantidad), raiz_filas: mk.raiz };
        const b = agregar(e);
        C.lotes.set(b.n, { ids: e._lote.ids.slice(), hojas: mk.niveles[0].slice(), niveles: mk.niveles });
      } else {
        if (e._ref) e.datos = Object.assign({ propuesta: e._ref._n }, e.datos);
        const b = agregar(e); e._n = b.n;
      }
    }
    calcularAnclajes();
  }

  function calcularAnclajes() {
    const hoy = hoyBogota();
    const viejos = new Map(C.anclajes.map(a => [a.fecha, a]));
    C.anclajes = d3.groups(C.bloques, b => diaBogota(b.ts)).map(([fecha, bs]) => {
      const previo = viejos.get(fecha);
      if (previo && previo.estado === 'anclado') return previo; // un anclaje publicado no se puede reescribir
      const hojas = bs.map(b => b.hash);
      const mk = merkle(hojas);
      const anclado = fecha < hoy;
      return { fecha, desde: bs[0].n, hasta: bs[bs.length - 1].n, raiz: mk.raiz, estado: anclado ? 'anclado' : 'pendiente',
        recibo: anclado ? 'ots-sim-' + sha256('ots|' + fecha + '|' + mk.raiz).slice(0, 24) : null };
    });
  }
  const anclajeDe = n => C.anclajes.find(a => n >= a.desde && n <= a.hasta);

  /* ---------- Verificación de la cadena ---------- */
  C.verificar = () => {
    const t0 = performance.now(), err = [], errAn = [];
    let prev = CERO;
    for (const b of C.bloques) {
      if (hashBloque(b) !== b.hash) err.push({ n: b.n, tipo: 'contenido', msg: 'El contenido del bloque ya no corresponde a su huella SHA-256.' });
      if (b.prev !== prev) err.push({ n: b.n, tipo: 'enlace', msg: 'El bloque no apunta a la huella del bloque anterior.' });
      prev = b.hash;
    }
    for (const a of C.anclajes) {
      if (a.estado !== 'anclado') continue;
      const raiz = merkle(C.bloques.slice(a.desde, a.hasta + 1).map(b => b.hash)).raiz;
      if (raiz !== a.raiz) errAn.push({ fecha: a.fecha, desde: a.desde, hasta: a.hasta, msg: 'La raíz Merkle recalculada no coincide con la anclada.' });
    }
    return { ok: !err.length && !errAn.length, err, errAn, n: C.bloques.length, ms: performance.now() - t0 };
  };

  /* ---------- Conciliación: base de datos vs. cadena ---------- */
  C.reconstruir = () => {
    const est = new Map(), props = new Map();
    for (const b of C.bloques) {
      if (b.accion === 'CARGA_INICIAL') est.set(b.entidad.id, JSON.parse(JSON.stringify(b.datos)));
      else if (b.accion === 'PROPUESTA') props.set(b.n, b);
      else if (b.accion === 'APROBACION') {
        const p = props.get(b.datos.propuesta); if (!p) continue;
        const e = est.get(p.entidad.id); if (!e) continue;
        for (const [campo, v] of Object.entries(p.datos.cambios)) TE.escribir(e, campo, v.despues);
      }
    }
    return est;
  };
  C.conciliar = () => {
    const est = C.reconstruir(), dif = [], rdif = [];
    for (const s of TE.OF) {
      const e = est.get(s.id), x = TE.X.get(s.i);
      if (!e) { dif.push({ sede: s, campo: '—', cadena: 'sin registro', bd: 'existe' }); continue; }
      for (const c of TE.CAMPOS) { const a = TE.leer(e, c), v = TE.leer(x, c); if (a !== v) dif.push({ sede: s, campo: c, cadena: a, bd: v }); }
    }
    for (const [n, L] of C.lotes) {
      const b = C.bloques[n];
      L.ids.forEach((id, k) => {
        const q = TE.reinById.get(id);
        if (!q) rdif.push({ bloque: n, archivo: b.datos.archivo, id, tipo: 'eliminada', msg: 'La fila certificada ya no existe en la base de datos.' });
        else if (hashFila(q) !== L.hojas[k]) rdif.push({ bloque: n, archivo: b.datos.archivo, id, tipo: 'modificada', msg: 'La fila fue modificada después de certificarse.' });
      });
    }
    return { dif, rdif };
  };

  /* ---------- Auditoría completa ---------- */
  C.auditar = () => {
    const v = C.verificar(), c = C.conciliar();
    C.ultima = { cuando: Date.now(), v, c, ok: v.ok && !c.dif.length && !c.rdif.length };
    C.estado = C.ultima.ok ? 'ok' : 'fallo';
    TE.emit('cadena');
    return C.ultima;
  };

  /* ---------- Verificar un bloque o una fila ---------- */
  C.verificarBloque = n => {
    const b = C.bloques[n]; if (!b) return null;
    const pasos = [];
    const h = hashBloque(b);
    pasos.push({ ok: h === b.hash, t: 'Huella del contenido', d: h === b.hash ? 'SHA-256 recalculado = huella guardada.' : `Recalculado ${TE.corto(h)} ≠ guardado ${TE.corto(b.hash)}.` });
    const prevOk = n === 0 ? b.prev === CERO : b.prev === C.bloques[n - 1].hash;
    pasos.push({ ok: prevOk, t: 'Enlace con el bloque anterior', d: prevOk ? (n === 0 ? 'Es el bloque inicial.' : `Apunta a la huella del bloque #${n - 1}.`) : 'No coincide con la huella del bloque anterior.' });
    const a = anclajeDe(n);
    if (a) {
      const hojas = C.bloques.slice(a.desde, a.hasta + 1).map(x => x.hash);
      const mk = merkle(hojas), ruta = pruebaMerkle(mk.niveles, n - a.desde), raiz = raizDesdePrueba(b.hash, ruta);
      if (a.estado === 'anclado') {
        pasos.push({ ok: raiz === a.raiz, t: 'Prueba Merkle hasta la raíz del día', d: `${ruta.length} pasos desde la huella del bloque hasta la raíz del ${a.fecha}.` });
        pasos.push({ ok: raiz === a.raiz, t: 'Raíz anclada (simulada)', d: raiz === a.raiz ? `Coincide con la raíz publicada · recibo ${a.recibo}` : 'La raíz calculada no coincide con la publicada: el bloque o sus vecinos fueron alterados.' });
      } else pasos.push({ ok: null, t: 'Anclaje del día', d: 'Pendiente: los bloques de hoy se anclan al cierre del día.' });
      return { b, pasos, ok: pasos.every(p => p.ok !== false), anclaje: a, ruta };
    }
    return { b, pasos, ok: pasos.every(p => p.ok !== false) };
  };
  C.verificarFila = id => {
    for (const [n, L] of C.lotes) {
      const k = L.ids.indexOf(id); if (k < 0) continue;
      const q = TE.reinById.get(id), hoja = q ? hashFila(q) : null;
      const ruta = pruebaMerkle(L.niveles, k), raiz = hoja ? raizDesdePrueba(hoja, ruta) : null;
      const vb = C.verificarBloque(n);
      const pasos = [
        { ok: !!q, t: 'La fila existe en la base de datos', d: q ? `${q.elemento} · placa ${q.placa}` : 'La fila fue eliminada de la base de datos.' },
        { ok: hoja === L.hojas[k], t: 'Huella de la fila', d: hoja === L.hojas[k] ? 'Coincide con la certificada al importar el archivo.' : 'La fila cambió después de certificarse.' },
        { ok: raiz === C.bloques[n].datos.raiz_filas, t: 'Prueba Merkle hasta la raíz del archivo', d: `${ruta.length} pasos hasta la raíz guardada en el bloque #${n} (${C.bloques[n].datos.archivo}).` },
        ...vb.pasos
      ];
      return { b: C.bloques[n], fila: q, pasos, ok: pasos.every(p => p.ok !== false) };
    }
    return null;
  };

  /* ---------- Flujo de gobierno: proponer → aprobar/rechazar ---------- */
  function trasEscritura() {
    calcularAnclajes();
    if (!C.alteracion) { const v = C.verificar(); C.estado = v.ok ? 'ok' : 'fallo'; C.ultima = Object.assign(C.ultima || {}, { cuando: Date.now(), v }); }
    TE.emit('cadena');
  }
  C.proponer = (s, tipo, cambios, soporte) => {
    const b = agregar({ ts: Date.now(), actor: { rol: TE.ROLES.rector.t, id: TE.ROLES.rector.id }, accion: 'PROPUESTA', entidad: { tipo: 'sede', id: s.id, nombre: s.sede }, datos: { tipo, cambios, soporte } });
    trasEscritura(); return b;
  };
  C.decidir = (n, aprobar, motivo) => {
    const p = C.pendientes.get(n); if (!p) return null;
    const b = agregar({ ts: Date.now(), actor: { rol: TE.ROLES.sem.t, id: TE.ROLES.sem.id }, accion: aprobar ? 'APROBACION' : 'RECHAZO', entidad: p.entidad,
      datos: aprobar ? { propuesta: n, decision: 'aprobada' } : { propuesta: n, decision: 'rechazada', motivo: motivo || 'Sin soporte suficiente.' } });
    if (aprobar) { const s = TE.sedeById.get(p.entidad.id), x = TE.X.get(s.i); for (const [c, v] of Object.entries(p.datos.cambios)) TE.escribir(x, c, v.despues); TE.emit('datos'); }
    trasEscritura(); return b;
  };

  /* ---------- Pruebas de manipulación (solo demo) ---------- */
  const clonarX = () => new Map([...TE.X].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  function respaldar() {
    if (C.respaldo) return;
    C.respaldo = { bloques: JSON.parse(JSON.stringify(C.bloques)), X: clonarX(), rein: new Map(TE.reinById), pendientes: new Map(C.pendientes) };
  }
  const objetivo = () => {
    const s = TE.OF.filter(q => q.tot > 900).sort((a, b) => TE.semilla('obj' + a.id) - TE.semilla('obj' + b.id))[0];
    return { s, n: C.porSede.get(s.id).find(n => C.bloques[n].accion === 'CARGA_INICIAL') };
  };
  C.alterar = tipo => {
    respaldar();
    let d = '';
    if (tipo === 'bloque' || tipo === 'recalculo') {
      const { s, n } = objetivo(), b = C.bloques[n], antes = b.datos.per.docentes;
      b.datos.per.docentes = antes + 9;
      d = `Se cambió “Docentes” de ${antes} a ${antes + 9} en el bloque #${n} (carga inicial de ${s.sede})`;
      if (tipo === 'recalculo') {
        for (let k = n; k < C.bloques.length; k++) { if (k > n) C.bloques[k].prev = C.bloques[k - 1].hash; C.bloques[k].hash = hashBloque(C.bloques[k]); }
        d += ' y se recalcularon las huellas de todos los bloques siguientes para que la cadena “cuadre”.';
      } else d += ' sin recalcular su huella.';
    } else if (tipo === 'bd_sede') {
      const s = TE.OF.filter(q => TE.met(q).conEst === 'crit' && TE.X.get(q.i).con.contratado > 0).sort((a, b) => b.tot - a.tot)[0];
      const x = TE.X.get(s.i), antes = x.con.medido; x.con.medido = x.con.contratado; x.con.disp = 99.5;
      d = `Se cambió directamente en la base de datos la velocidad medida de ${s.sede} de ${antes} a ${x.con.contratado} Mbps, sin pasar por el flujo de aprobación. En el mapa la sede ya aparece como “adecuada”.`;
      TE.emit('datos');
    } else if (tipo === 'bd_rein') {
      const q = TE.REIN.find(r => r.grupo === 'TIC' && r.elemento === 'Computador portátil' && r.estado === 'Dado de baja');
      TE.reinById.delete(q.id); const x = TE.X.get(q.sede); x.rein = x.rein.filter(r => r.id !== q.id);
      const k = TE.REIN.indexOf(q); TE.REIN.splice(k, 1);
      d = `Se borró de la base de datos el reintegro ${q.id} (${q.elemento}, placa ${q.placa}) de ${TE.SED[q.sede].sede}.`;
      TE.emit('datos');
    }
    C.alteracion = { tipo, d, cuando: Date.now() };
    C.estado = 'pendiente';
    TE.emit('cadena');
    return d;
  };
  C.restaurar = () => {
    if (!C.respaldo) return;
    C.bloques = C.respaldo.bloques;
    TE.X.clear(); for (const [k, v] of C.respaldo.X) TE.X.set(k, v);
    TE.reinById.clear(); for (const [k, v] of C.respaldo.rein) TE.reinById.set(k, v);
    TE.REIN.length = 0; TE.REIN.push(...[...TE.reinById.values()].sort((a, b) => a.fecha - b.fecha || (a.id < b.id ? -1 : 1)));
    for (const s of TE.OF) TE.X.get(s.i).rein = TE.REIN.filter(r => r.sede === s.i);
    C.pendientes = C.respaldo.pendientes;
    C.porSede.clear();
    for (const b of C.bloques) if (b.entidad.tipo === 'sede') { if (!C.porSede.has(b.entidad.id)) C.porSede.set(b.entidad.id, []); C.porSede.get(b.entidad.id).push(b.n); }
    C.respaldo = null; C.alteracion = null;
    calcularAnclajes();
    TE.emit('datos');
    C.auditar();
  };

  /* ---------- Consultas para la interfaz y el asistente ---------- */
  C.historialSede = id => (C.porSede.get(id) || []).map(n => C.bloques[n]).filter(Boolean);
  C.anclajeDe = anclajeDe;
  C.diaBogota = diaBogota;
  C.buscar = q => {
    q = String(q || '').trim(); if (!q) return null;
    if (/^#?\d+$/.test(q)) return { tipo: 'bloque', n: +q.replace('#', '') };
    if (/^[0-9a-f]{6,64}$/i.test(q)) { const b = C.bloques.find(x => x.hash.startsWith(q.toLowerCase())); return b ? { tipo: 'bloque', n: b.n } : null; }
    if (/^R\d{5}$/i.test(q)) return { tipo: 'fila', id: q.toUpperCase() };
    if (/^SEM-\d+$/i.test(q)) { const r = TE.REIN.find(x => x.placa === q.toUpperCase()); return r ? { tipo: 'fila', id: r.id } : null; }
    if (/^S\d{3}$/i.test(q)) return { tipo: 'sede', id: q.toUpperCase() };
    return null;
  };

  /* ---------- Huella para anclar en la blockchain pública ----------
     Raíz Merkle de las huellas RECALCULADAS de los primeros n bloques: si alguien
     cambia el contenido de un bloque (aunque recalcule toda la cadena), la raíz cambia. */
  C.raizHasta = n => merkle(C.bloques.slice(0, n).map(hashBloque)).raiz;

  construir();
  C.base = C.bloques.length; // bloques del historial base (idénticos en cada carga de la demo)
  C.auditar();
})();
