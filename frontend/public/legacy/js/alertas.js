/* =========================================================
   Traza Educativa · ALERTAS AUTOMÁTICAS
   Motor de reglas explicables sobre los datos de las sedes,
   detección de anomalías en reintegros (puntaje z mensual),
   calidad del dato, gobierno e integridad de la cadena.
   Cada alerta dice qué regla la disparó y a qué sedes afecta.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, C = TE.cadena;
  const $ = id => document.getElementById(id);
  const DIA = 86400000;
  const SEV = { crit: { t: 'Crítica', ic: '✕', o: 0 }, alta: { t: 'Alta', ic: '▲', o: 1 }, media: { t: 'Media', ic: '!', o: 2 } };
  TE.SEV = SEV;
  const filtro = { sev: new Set(['crit', 'alta', 'media']), dim: 'all' };

  const porTamano = (a, b) => b.tot - a.tot;
  const item = (s, val) => ({ i: s.i, id: s.id, sede: s.sede, com: s.com, val });

  /* ---------- Reglas ---------- */
  function calcular() {
    const A = [], OF = TE.OF;
    const X = s => TE.X.get(s.i), M = s => TE.met(s);

    if (C.estado === 'fallo' || C.estado === 'pendiente') {
      const u = C.ultima || {}, c = u.c || { dif: [], rdif: [] }, v = u.v || { err: [], errAn: [] };
      A.push({ id: 'INT-1', sev: 'crit', dim: 'Integridad', items: [], ir: 'cadena',
        titulo: C.estado === 'fallo' ? 'La auditoría encontró datos alterados' : 'Hay una alteración que aún no se ha auditado',
        porque: C.estado === 'fallo'
          ? `${TE.plural(v.err.length, 'error', 'errores')} de encadenamiento, ${TE.plural(v.errAn.length, 'raíz anclada', 'raíces ancladas')} que no coinciden y ${TE.plural(c.dif.length + c.rdif.length, 'diferencia', 'diferencias')} entre la base de datos y la cadena. Ningún indicador afectado es confiable hasta restaurar los datos.`
          : 'Se modificaron datos o bloques. Ejecuta la auditoría en Trazabilidad para ver qué cambió.',
        regla: 'Verificación SHA-256 de la cadena, raíces Merkle ancladas y conciliación contra la base de datos' });
    }

    const con1 = OF.filter(s => X(s).con.tipo === 'Sin servicio' || X(s).con.disp < 94).sort(porTamano);
    if (con1.length) A.push({ id: 'CON-1', sev: 'crit', dim: 'Conectividad', titulo: `${TE.plural(con1.length, 'sede', 'sedes')} sin internet o con servicio inestable`,
      porque: `Afecta a ${TE.fmt(d3.sum(con1, s => s.tot))} estudiantes. Sin conexión estable no hay clases con recursos digitales ni reportes oportunos al SIMAT.`,
      regla: 'Enlace “Sin servicio” o disponibilidad mensual menor a 94 %',
      items: con1.map(s => item(s, X(s).con.tipo === 'Sin servicio' ? 'Sin servicio' : `Disponibilidad ${TE.fmt1(X(s).con.disp)} %`)) });

    const con2 = OF.filter(s => !con1.includes(s) && X(s).con.contratado && X(s).con.medido < 0.6 * X(s).con.contratado).sort((a, b) => M(a).cumpl - M(b).cumpl);
    if (con2.length) A.push({ id: 'CON-2', sev: 'alta', dim: 'Conectividad', titulo: `${TE.plural(con2.length, 'sede recibe', 'sedes reciben')} menos del 60 % de la velocidad contratada`,
      porque: 'Es un posible incumplimiento del operador: la Secretaría paga por una velocidad que no llega al aula. Sirve como soporte para exigir compensación.',
      regla: 'Velocidad medida < 60 % de la contratada',
      items: con2.map(s => item(s, `${TE.fmt(X(s).con.medido)} de ${TE.fmt(X(s).con.contratado)} Mbps (${TE.pct(M(s).cumpl)})`)) });

    const tic1 = OF.filter(s => M(s).estEq > 25).sort((a, b) => M(b).estEq - M(a).estEq);
    if (tic1.length) A.push({ id: 'TIC-1', sev: 'alta', dim: 'Infraestructura TIC', titulo: `${TE.plural(tic1.length, 'sede tiene', 'sedes tienen')} más de 25 estudiantes por equipo`,
      porque: 'Con esa proporción un grupo no puede trabajar a la vez en el aula de informática. Son candidatas directas para la próxima dotación.',
      regla: 'Estudiantes matriculados / equipos de cómputo > 25',
      items: tic1.map(s => item(s, `${TE.fmt1(M(s).estEq)} est. por equipo`)) });

    const tic2 = OF.filter(s => X(s).tic.obsoletosPct > 70).sort((a, b) => X(b).tic.obsoletosPct - X(a).tic.obsoletosPct);
    if (tic2.length) A.push({ id: 'TIC-2', sev: 'media', dim: 'Infraestructura TIC', titulo: `${TE.plural(tic2.length, 'sede tiene', 'sedes tienen')} más del 70 % de los equipos obsoletos`,
      porque: 'Anticipa una ola de reintegros y de solicitudes de reposición en los próximos meses.',
      regla: 'Equipos obsoletos > 70 % del inventario',
      items: tic2.map(s => item(s, `${X(s).tic.obsoletosPct} % obsoletos`)) });

    const mob1 = OF.filter(s => M(s).pMalo > 0.3).sort((a, b) => M(b).pMalo - M(a).pMalo);
    if (mob1.length) A.push({ id: 'MOB-1', sev: 'alta', dim: 'Mobiliario', titulo: `${TE.plural(mob1.length, 'sede tiene', 'sedes tienen')} más del 30 % de los pupitres en mal estado`,
      porque: `Suman ${TE.fmt(d3.sum(mob1, s => X(s).mob.malo))} pupitres por reponer. El mobiliario dañado afecta la permanencia y es un riesgo físico para los estudiantes.`,
      regla: 'Pupitres en mal estado / total de pupitres > 30 %',
      items: mob1.map(s => item(s, `${TE.pct(M(s).pMalo)} en mal estado`)) });

    const per1 = OF.filter(s => X(s).per.docentes > 0 && (X(s).per.vacantes >= 3 || M(s).estDoc > 36)).sort((a, b) => X(b).per.vacantes - X(a).per.vacantes || M(b).estDoc - M(a).estDoc);
    if (per1.length) A.push({ id: 'PER-1', sev: 'alta', dim: 'Personal', titulo: `${TE.plural(per1.length, 'sede tiene', 'sedes tienen')} déficit de docentes`,
      porque: `Hay ${TE.fmt(d3.sum(per1, s => X(s).per.vacantes))} vacantes abiertas en estas sedes. Las vacantes prolongadas dejan grupos sin clase o sobrecargan a otros docentes.`,
      regla: '3 o más vacantes, o más de 36 estudiantes por docente',
      items: per1.map(s => item(s, `${TE.plural(X(s).per.vacantes, 'vacante', 'vacantes')} · ${TE.fmt1(M(s).estDoc)} est./docente`)) });

    // Anomalías en reintegros: meses con un número de registros muy por encima de lo habitual en la sede
    const meses = d3.utcMonths(Date.UTC(2025, 0, 1), Date.UTC(2026, 9, 1)).map(d => d.toISOString().slice(0, 7));
    const anom = [];
    for (const s of OF) {
      const rs = X(s).rein; if (rs.length < 8) continue;
      const cnt = d3.rollup(rs, v => v.length, q => new Date(q.fecha).toISOString().slice(0, 7));
      const serie = meses.map(m => cnt.get(m) || 0), media = d3.mean(serie), sd = d3.deviation(serie) || 1;
      const top = d3.maxIndex(serie), z = (serie[top] - media) / sd;
      if (serie[top] >= 8 && z >= 4) {
        const filas = rs.filter(q => new Date(q.fecha).toISOString().slice(0, 7) === meses[top]);
        anom.push(Object.assign(item(s, `${serie[top]} registros en ${new Date(Date.parse(meses[top] + '-15')).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })} (z = ${TE.fmt1(z)})`), { z, fila: filas[0].id, elem: d3.sum(filas, q => q.cantidad) }));
      }
    }
    anom.sort((a, b) => b.z - a.z);
    if (anom.length) A.push({ id: 'REI-1', sev: 'alta', dim: 'Reintegros', titulo: `Reintegros atípicos en ${TE.plural(anom.length, 'sede', 'sedes')}`,
      porque: `Picos de ${anom.map(a => TE.fmt(a.elem)).join(', ')} elementos en un solo mes. Puede ser una baja masiva legítima, un error de carga o una salida irregular de bienes: revisa el soporte del archivo certificado.`,
      regla: 'Registros del mes con puntaje z ≥ 4 frente a la historia de la sede y al menos 8 registros', items: anom, verificar: true });

    const dat1 = OF.filter(s => s.tot > 0 && X(s).per.docentes === 0);
    const lim = TE.CORTE - 548 * DIA;
    const dat2 = OF.filter(s => X(s).mob.fechaInv < lim).sort((a, b) => X(a).mob.fechaInv - X(b).mob.fechaInv);
    if (dat1.length) A.push({ id: 'DAT-1', sev: 'media', dim: 'Calidad del dato', titulo: `${TE.plural(dat1.length, 'sede reporta', 'sedes reportan')} 0 docentes con estudiantes matriculados`,
      porque: 'Es un error de captura, no una sede sin profesores. Mientras no se corrija, los indicadores de personal de la comuna salen sesgados.',
      regla: 'Docentes = 0 y matrícula > 0', items: dat1.map(s => item(s, `${TE.fmt(s.tot)} estudiantes, 0 docentes`)) });
    if (dat2.length) A.push({ id: 'DAT-2', sev: 'media', dim: 'Calidad del dato', titulo: `${TE.plural(dat2.length, 'sede tiene', 'sedes tienen')} el inventario de mobiliario desactualizado`,
      porque: 'Un inventario de más de 18 meses no sirve para planear compras ni para justificar reintegros.',
      regla: 'Último inventario de mobiliario hace más de 18 meses', items: dat2.map(s => item(s, `Inventario del ${TE.fecha(X(s).mob.fechaInv)}`)) });

    const pend = [...C.pendientes.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (pend.length) {
      const dias = b => Math.max(0, Math.floor((Date.now() - Date.parse(b.ts)) / DIA));
      A.push({ id: 'GOB-1', sev: 'media', dim: 'Gobierno del dato', titulo: `${TE.plural(pend.length, 'propuesta espera', 'propuestas esperan')} aprobación`,
        porque: `La más antigua lleva ${TE.plural(dias(pend[0]), 'día', 'días')} sin respuesta. Mientras no se aprueben, los tableros muestran el dato anterior.`,
        regla: 'Propuestas registradas en la cadena sin aprobación ni rechazo',
        items: pend.map(b => { const s = TE.sedeById.get(b.entidad.id); return item(s, `${TE.TIPOS_CAMBIO[b.datos.tipo].t} · hace ${TE.plural(dias(b), 'día', 'días')}`); }) });
    }

    // Priorización territorial: pobreza alta y brecha de conectividad por encima de la ciudad
    const ciudad = OF.filter(s => TE.met(s).conEst !== 'ok').length / OF.length;
    const ipms = TE.COMR.filter(c => c.ipm != null).map(c => c.ipm), med = d3.median(ipms);
    const pri = TE.COMR.filter(c => c.ipm != null && c.ipm >= med).map(c => {
      const ss = OF.filter(s => s.com === c.id), f = ss.length ? ss.filter(s => TE.met(s).conEst !== 'ok').length / ss.length : 0;
      return { c, f, ss };
    }).filter(o => o.f > ciudad).sort((a, b) => b.c.ipm - a.c.ipm);
    if (pri.length) A.push({ id: 'PRI-1', sev: 'alta', dim: 'Territorial', comunas: true,
      titulo: `${TE.plural(pri.length, 'comuna combina', 'comunas combinan')} pobreza alta y brecha de conectividad`,
      porque: `Tienen un IPM igual o superior a la mediana (${TE.fmt1(med)} %) y más sedes con conectividad no adecuada que el promedio de la ciudad (${TE.pct(ciudad)}). Son la primera línea para inversión en conectividad.`,
      regla: 'IPM 2025 ≥ mediana de las comunas y % de sedes con conectividad no adecuada > promedio de la ciudad',
      items: pri.map(o => ({ com: o.c.id, nombre: o.c.name, val: `IPM ${TE.fmt1(o.c.ipm)} % · ${TE.pct(o.f)} no adecuada`, sedes: o.ss.filter(s => TE.met(s).conEst !== 'ok').map(s => s.i) })) });

    A.sort((a, b) => SEV[a.sev].o - SEV[b.sev].o);
    return A;
  }

  /* ---------- Resumen ejecutivo local (sin IA) ---------- */
  function resumenLocal(A) {
    const n = k => A.filter(a => a.sev === k).length;
    const crit = A.filter(a => a.sev === 'crit'), pri = A.find(a => a.id === 'PRI-1'), rei = A.find(a => a.id === 'REI-1'), dat = A.filter(a => a.dim === 'Calidad del dato');
    const p = [];
    p.push(`Con corte al ${TE.fecha(TE.CORTE)} el sistema registra ${TE.plural(A.length, 'alerta activa', 'alertas activas')}: ${TE.plural(n('crit'), 'crítica', 'críticas')}, ${TE.plural(n('alta'), 'alta', 'altas')} y ${TE.plural(n('media'), 'media', 'medias')}.`);
    if (crit.length) p.push(`Lo más urgente: ${crit.map(a => a.titulo.charAt(0).toLowerCase() + a.titulo.slice(1)).join('; ')}.`);
    if (pri) p.push(`En el territorio, ${pri.items.slice(0, 4).map(i => i.nombre).join(', ')}${pri.items.length > 4 ? ' y otras' : ''} concentran pobreza y brecha digital.`);
    if (rei) p.push(`Hay ${TE.plural(rei.items.length, 'pico atípico', 'picos atípicos')} de reintegros que conviene auditar antes de aprobar nuevas bajas.`);
    if (dat.length) p.push(`Calidad del dato: ${dat.map(a => a.titulo.charAt(0).toLowerCase() + a.titulo.slice(1)).join(' y ')}.`);
    return p.join(' ');
  }

  /* ---------- Interfaz ---------- */
  let ultima = [];
  function visible() { const v = $('v-alertas'); return v && !v.hidden; }
  function render() {
    ultima = calcular();
    actualizarContador();
    if (!visible()) return;
    const A = ultima;
    const n = k => A.filter(a => a.sev === k).length;
    $('aSev').innerHTML = Object.entries(SEV).map(([k, v]) => `<button type="button" class="sevbtn sev-${k}" aria-pressed="${filtro.sev.has(k)}" data-sev="${k}"><i aria-hidden="true">${v.ic}</i><span>${v.t}</span><b>${n(k)}</b></button>`).join('');
    $('aSev').querySelectorAll('[data-sev]').forEach(b => b.onclick = () => { const k = b.dataset.sev; filtro.sev.has(k) ? filtro.sev.delete(k) : filtro.sev.add(k); if (!filtro.sev.size) filtro.sev.add(k); render(); });
    const dims = [...new Set(A.map(a => a.dim))];
    const sel = $('aDim'), prev = filtro.dim;
    sel.innerHTML = ''; sel.append(new Option('Todas las dimensiones', 'all'), ...dims.map(d => new Option(d, d)));
    sel.value = dims.includes(prev) ? prev : 'all'; filtro.dim = sel.value;
    sel.onchange = () => { filtro.dim = sel.value; render(); };
    $('aLocal').textContent = resumenLocal(A);

    const vis = A.filter(a => filtro.sev.has(a.sev) && (filtro.dim === 'all' || a.dim === filtro.dim));
    $('aLista').innerHTML = vis.length ? vis.map(a => {
      const sedes = a.comunas ? new Set(a.items.flatMap(i => i.sedes)) : new Set(a.items.map(i => i.i));
      return `<article class="alerta sev-${a.sev}" data-id="${a.id}"><div class="a-txt">
        <header><span class="sev sev-${a.sev}"><i aria-hidden="true">${SEV[a.sev].ic}</i>${SEV[a.sev].t}</span><span class="cod">${a.id}</span><span class="dimt">${TE.esc(a.dim)}</span></header>
        <h3>${TE.esc(a.titulo)}</h3><p>${TE.esc(a.porque)}</p>
        <p class="regla"><b>Regla:</b> ${TE.esc(a.regla)}</p>
        <div class="acc">${a.ir === 'cadena' ? '<button type="button" class="btn pri sm" data-ir="cadena">Ir a Trazabilidad</button>' : sedes.size ? `<button type="button" class="btn sm" data-ver="${a.id}">Ver ${TE.plural(sedes.size, 'sede', 'sedes')} en el mapa</button>` : ''}</div></div>
        ${a.items.length ? `<div class="a-afect"><p class="eyebrow">${a.comunas ? 'Comunas' : 'Sedes afectadas'} · ${TE.fmt(a.items.length)}</p><ul class="afect">${a.items.slice(0, 5).map(it => a.comunas
          ? `<li><button type="button" data-com="${it.com}"><span>${TE.esc(it.nombre)}</span><small>${TE.esc(it.val)}</small></button></li>`
          : `<li><button type="button" data-sede="${it.i}"><span>${TE.esc(it.sede)}<small>${TE.esc(TE.nomCom(it.com))}</small></span><small>${TE.esc(it.val)}</small></button>${a.verificar ? `<button type="button" class="hashbtn" data-fila="${it.fila}" title="Verificar el archivo certificado">Verificar</button>` : ''}</li>`).join('')}</ul>
          ${a.items.length > 5 ? `<p class="m">y ${TE.fmt(a.items.length - 5)} más en el mapa</p>` : ''}</div>` : ''}
      </article>`;
    }).join('') : '<p class="vacio">No hay alertas con estos filtros.</p>';
    const L = $('aLista');
    L.querySelectorAll('[data-sede]').forEach(b => b.onclick = () => { TE.irVista('mapa'); TE.mapa.seleccionar(+b.dataset.sede, true); });
    L.querySelectorAll('[data-com]').forEach(b => b.onclick = () => { TE.irVista('mapa'); TE.mapa.irComuna(b.dataset.com); });
    L.querySelectorAll('[data-fila]').forEach(b => b.onclick = () => TE.irVerificar(b.dataset.fila));
    L.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => TE.irVista('cadena'));
    L.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => verEnMapa(A.find(a => a.id === b.dataset.ver)));
  }
  function verEnMapa(a) {
    const set = a.comunas ? new Set(a.items.flatMap(i => i.sedes)) : new Set(a.items.map(i => i.i));
    const dimMapa = { Conectividad: 'con', 'Infraestructura TIC': 'tic', Mobiliario: 'mob', Personal: 'per', Reintegros: 'rei', Territorial: 'con', 'Calidad del dato': null, 'Gobierno del dato': null }[a.dim];
    if (dimMapa) { TE.estado.dim = dimMapa; const s = $('mDim'); if (s) s.value = dimMapa; }
    TE.irVista('mapa');
    TE.mapa.resaltar(set, `${a.id} · ${a.titulo}`);
  }
  function actualizarContador() {
    const n = ultima.filter(a => a.sev === 'crit').length, el = $('navAlertas');
    if (el) { el.textContent = ultima.length; el.className = 'badge' + (n ? ' crit' : ''); el.title = `${ultima.length} alertas, ${n} críticas`; }
  }

  /* ---------- Resumen con IA (solo si Claude está disponible) ---------- */
  const btnIA = $('aIA'), outIA = $('aIAout');
  let ctl = null;
  TE.on('ia', ok => { btnIA.hidden = !ok; });
  btnIA.onclick = async () => {
    const sample = TE.ia && TE.ia.sample();
    if (!sample) return;
    if (ctl) { ctl.abort(); return; }
    ctl = new AbortController();
    btnIA.textContent = 'Detener'; outIA.hidden = false; outIA.className = 'ia-out pensando'; outIA.textContent = 'Claude está leyendo las alertas…';
    const datos = ultima.map(a => ({ codigo: a.id, severidad: SEV[a.sev].t, dimension: a.dim, titulo: a.titulo, por_que: a.porque, regla: a.regla,
      afectadas: a.items.length, ejemplos: a.items.slice(0, 4).map(i => i.comunas ? i.nombre : `${i.sede || i.nombre} (${TE.nomCom(i.com)}): ${i.val}`) }));
    const prompt = `Eres analista de la Secretaría de Educación de Medellín. Redacta un resumen ejecutivo para un comité directivo a partir de estas alertas automáticas.
Reglas: español claro y sobrio; máximo 180 palabras; un párrafo de diagnóstico y luego exactamente 3 recomendaciones priorizadas, cada una en una línea que empiece por "- ". Usa solo las cifras que aparecen en los datos. Indica una sola vez que conectividad, TIC, mobiliario, personal y reintegros son datos de ejemplo de una demostración. No uses tablas ni títulos.
Corte de los datos: ${TE.fecha(TE.CORTE)}.
Alertas (JSON):
${JSON.stringify(datos)}`;
    try {
      const r = await sample(prompt, { signal: ctl.signal, onText: ({ text }) => { outIA.className = 'ia-out'; outIA.innerHTML = TE.mdLite(text); } });
      outIA.innerHTML = TE.mdLite(r.text) + `<p class="m">Redactado por Claude a partir de las alertas de esta pantalla.${r.truncated ? ' La respuesta se cortó por longitud.' : ''}</p>`;
    } catch (e) {
      if (e && e.code === 'cancelled') { if (!e.text) outIA.hidden = true; }
      else {
        outIA.className = 'ia-out';
        outIA.innerHTML = (e && e.text ? TE.mdLite(e.text) : '') + `<p class="err">${TE.esc(TE.ia.mensajeError(e))}</p>`;
        if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) { btnIA.hidden = true; TE.ia.desactivar(); }
      }
    } finally { ctl = null; btnIA.textContent = 'Redactar con Claude'; }
  };

  TE.alertas = { calcular, render, ultima: () => ultima, verEnMapa };
  TE.on('datos', render);
  TE.on('cadena', render);
})();
